// ============================================================
// Telegram Bot — carga rápida de gastos / ingresos / cuotas
// Supabase Edge Function (Deno). Recibe el webhook de Telegram,
// parsea comandos simples e inserta en tu base como TU usuario.
//
// Seguridad:
//  - Solo responde al ALLOWED_CHAT_ID (whitelist). Como usa la
//    service_role key (saltea RLS), esto es imprescindible.
//  - Opcional: valida el header secreto de Telegram (WEBHOOK_SECRET).
//
// Deploy:  supabase functions deploy telegram-bot --no-verify-jwt
// Ver README.md de esta carpeta para el setup completo.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// — Secrets / env —
const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_TOKEN         = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const ALLOWED_CHAT_ID   = Deno.env.get("TELEGRAM_ALLOWED_CHAT_ID") ?? "";
const APP_USER_ID       = Deno.env.get("APP_USER_ID")!;              // tu UUID de auth.users
const WEBHOOK_SECRET    = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

// Fecha en horario de Argentina (UTC-3) para no equivocar el mes cerca de fin de mes.
function nowAR(): { mes: number; anio: number } {
  const d = new Date(Date.now() - 3 * 3600 * 1000);
  return { mes: d.getUTCMonth() + 1, anio: d.getUTCFullYear() };
}

// Fecha de hoy en Argentina como YYYY-MM-DD (para el campo `fecha` del gasto).
function todayAR(): string {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().split("T")[0];
}

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// Parsea "8000", "8.000", "12.500,50", "12k", "12mil" → número (ARS).
function parseMonto(tok: string): number | null {
  let t = tok.toLowerCase().trim();
  let mult = 1;
  if (t.endsWith("mil")) { mult = 1000; t = t.slice(0, -3); }
  else if (t.endsWith("k")) { mult = 1000; t = t.slice(0, -1); }
  if (!/^[\d.,]+$/.test(t) || t === "") return null;
  // formato AR: punto = miles, coma = decimales
  t = t.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(t);
  if (isNaN(n)) return null;
  return n * mult;
}

function isNumeric(tok: string): boolean {
  return parseMonto(tok) !== null;
}

async function sendMessage(chatId: number | string, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

const HELP = `<b>Carga rápida — comandos</b>

💸 <b>Gasto</b>
<code>nafta 8000</code>
<code>12500 super compra del finde</code>
(el bot detecta la categoría entre tus categorías)

💰 <b>Ingreso</b>
<code>ingreso sueldo 500000</code>
<code>ingreso otros 30000</code>

🧾 <b>Cuota</b>
<code>cuota heladera 15000 12</code>
(nombre, monto por cuota, total de cuotas)

📎 <b>Transferencia</b>
Mandá la foto o PDF del comprobante con el monto en el epígrafe:
<code>50000 alquiler</code>

Formatos de monto: <code>8000</code>, <code>8.000</code>, <code>12k</code>, <code>12500,50</code>`;

// ── Handlers de datos ─────────────────────────────────────────

async function loadCategorias(): Promise<{ nombre: string; n: string }[]> {
  const { data } = await db.from("categorias")
    .select("nombre").eq("user_id", APP_USER_ID).eq("activa", 1);
  return (data ?? []).map((c: { nombre: string }) => ({ nombre: c.nombre, n: norm(c.nombre) }));
}

async function handleGasto(tokens: string[], chatId: number) {
  const { mes, anio } = nowAR();
  // separar el primer token numérico (monto) del resto (categoría + detalle)
  let monto: number | null = null;
  const words: string[] = [];
  for (const t of tokens) {
    if (monto === null && isNumeric(t)) monto = parseMonto(t);
    else words.push(t);
  }
  if (monto === null || monto <= 0) {
    await sendMessage(chatId, "⚠️ No encontré el monto. Ej: <code>nafta 8000</code>");
    return;
  }

  // matchear una categoría entre las palabras
  const cats = await loadCategorias();
  let categoria = "Otros";
  let catWordIdx = -1;
  for (let i = 0; i < words.length; i++) {
    const hit = cats.find((c) => c.n === norm(words[i]));
    if (hit) { categoria = hit.nombre; catWordIdx = i; break; }
  }
  const detalle = words.filter((_, i) => i !== catWordIdx).join(" ").trim();
  const nombre = detalle || categoria;

  const { error } = await db.from("gastos_mensuales").insert({
    user_id: APP_USER_ID, mes, anio, nombre, monto, categoria, moneda: "ARS", fecha: todayAR(),
  });
  if (error) { await sendMessage(chatId, `❌ Error: ${error.message}`); return; }

  const montoFmt = monto.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
  await sendMessage(chatId, `✅ <b>Gasto</b> ${montoFmt} · ${categoria} · ${nombre} · ${MONTHS[mes-1]} ${anio}`);
}

async function handleIngreso(tokens: string[], chatId: number) {
  const { mes, anio } = nowAR();
  // ingreso [sueldo|otros] <monto>
  let campo: "sueldo" | "otros" = "sueldo";
  let monto: number | null = null;
  for (const t of tokens) {
    const tn = norm(t);
    if (tn === "sueldo") campo = "sueldo";
    else if (tn === "otros" || tn === "otro") campo = "otros";
    else if (monto === null && isNumeric(t)) monto = parseMonto(t);
  }
  if (monto === null || monto < 0) {
    await sendMessage(chatId, "⚠️ Ej: <code>ingreso sueldo 500000</code>");
    return;
  }

  // upsert: leo lo existente del mes y actualizo solo el campo indicado
  const { data: existing } = await db.from("ingresos")
    .select("sueldo, otros").eq("user_id", APP_USER_ID).eq("mes", mes).eq("anio", anio).maybeSingle();

  const row = {
    user_id: APP_USER_ID, mes, anio,
    sueldo: existing?.sueldo ?? 0,
    otros: existing?.otros ?? 0,
    [campo]: monto,
  };
  const { error } = await db.from("ingresos").upsert(row, { onConflict: "user_id,mes,anio" });
  if (error) { await sendMessage(chatId, `❌ Error: ${error.message}`); return; }

  const montoFmt = monto.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
  await sendMessage(chatId, `✅ <b>Ingreso</b> (${campo}) ${montoFmt} · ${MONTHS[mes-1]} ${anio}`);
}

async function handleCuota(tokens: string[], chatId: number) {
  const { mes, anio } = nowAR();
  // cuota <nombre...> <monto> <total>  → los dos últimos numéricos son monto y total
  const nums = tokens.filter(isNumeric);
  if (nums.length < 2) {
    await sendMessage(chatId, "⚠️ Ej: <code>cuota heladera 15000 12</code>");
    return;
  }
  const total = Math.round(parseMonto(nums[nums.length - 1])!);
  const monto = parseMonto(nums[nums.length - 2])!;
  // nombre = tokens que no son esos dos últimos numéricos
  const lastTwo = new Set([nums[nums.length - 1], nums[nums.length - 2]]);
  let removed = 0;
  const nombre = tokens.filter((t) => {
    if (removed < 2 && lastTwo.has(t) && isNumeric(t)) { removed++; return false; }
    return true;
  }).join(" ").trim();

  if (!nombre) { await sendMessage(chatId, "⚠️ Falta el nombre. Ej: <code>cuota heladera 15000 12</code>"); return; }
  if (monto <= 0 || total <= 0) { await sendMessage(chatId, "⚠️ Monto y total deben ser > 0."); return; }

  const { error } = await db.from("cuotas").insert({
    user_id: APP_USER_ID, nombre, monto_cuota: monto, cuota_actual: 1, total_cuotas: total,
    mes_inicio: mes, anio_inicio: anio, activa: 1, moneda: "ARS",
    categoria: "Sin categoría", tarjeta_id: null,
  });
  if (error) { await sendMessage(chatId, `❌ Error: ${error.message}`); return; }

  const montoFmt = monto.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
  await sendMessage(chatId, `✅ <b>Cuota</b> ${nombre} · ${montoFmt} × ${total} · desde ${MONTHS[mes-1]} ${anio}`);
}

// ── Comprobantes de transferencia (foto/PDF) ──────────────────

// Descarga el archivo de Telegram y lo sube al bucket privado 'comprobantes'.
async function uploadComprobante(fileId: string, mime?: string): Promise<string | null> {
  const info = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`).then((r) => r.json());
  const filePath: string | undefined = info?.result?.file_path;
  if (!filePath) return null;
  const bytes = new Uint8Array(await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`).then((r) => r.arrayBuffer()));
  const ext = (filePath.split(".").pop() || "jpg").toLowerCase();
  const contentType = mime || (ext === "pdf" ? "application/pdf" : "image/jpeg");
  const path = `${APP_USER_ID}/${Date.now()}.${ext}`;
  const { error } = await db.storage.from("comprobantes").upload(path, bytes, { contentType, upsert: false });
  if (error) return null;
  return path;
}

async function handleComprobante(msg: any, chatId: number) {
  const { mes, anio } = nowAR();
  const caption = (msg.caption ?? "").trim();
  if (!caption) {
    await sendMessage(chatId, "📎 Recibí el comprobante. Reenvialo con el monto en el epígrafe, ej: <code>50000 alquiler</code>");
    return;
  }

  // Parseo del epígrafe (igual que un gasto): monto + categoría + detalle.
  const tokens: string[] = caption.split(/\s+/);
  let monto: number | null = null;
  const words: string[] = [];
  for (const t of tokens) {
    if (monto === null && isNumeric(t)) monto = parseMonto(t);
    else words.push(t);
  }
  if (monto === null || monto <= 0) {
    await sendMessage(chatId, "⚠️ No encontré el monto en el epígrafe. Ej: <code>50000 alquiler</code>");
    return;
  }

  const cats = await loadCategorias();
  let categoria = "Otros";
  let catIdx = -1;
  for (let i = 0; i < words.length; i++) {
    const hit = cats.find((c) => c.n === norm(words[i]));
    if (hit) { categoria = hit.nombre; catIdx = i; break; }
  }
  const detalle = words.filter((_, i) => i !== catIdx).join(" ").trim();
  const nombre = detalle || categoria;

  // Subir el comprobante (si falla, igual cargamos el gasto).
  const fileId: string | undefined = msg.photo?.[msg.photo.length - 1]?.file_id ?? msg.document?.file_id;
  const comprobante = fileId ? await uploadComprobante(fileId, msg.document?.mime_type) : null;

  const { error } = await db.from("gastos_mensuales").insert({
    user_id: APP_USER_ID, mes, anio, nombre, monto, categoria, moneda: "ARS",
    fecha: todayAR(), medio: "transferencia", comprobante_url: comprobante,
  });
  if (error) { await sendMessage(chatId, `❌ Error: ${error.message}`); return; }

  const montoFmt = monto.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
  await sendMessage(chatId, `✅ <b>Transferencia</b> ${montoFmt} · ${categoria} · ${nombre} · ${MONTHS[mes - 1]} ${anio}${comprobante ? " · 📎 comprobante guardado" : ""}`);
}

// ── Entry point ───────────────────────────────────────────────

Deno.serve(async (req) => {
  // Validación opcional del secreto de Telegram
  if (WEBHOOK_SECRET) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== WEBHOOK_SECRET) return new Response("forbidden", { status: 401 });
  }

  let update: any;
  try { update = await req.json(); } catch { return new Response("ok"); }

  const msg = update?.message ?? update?.edited_message;
  const chatId: number | undefined = msg?.chat?.id;
  if (!chatId) return new Response("ok");

  const text: string = (msg?.text ?? "").trim();
  const photo = msg?.photo?.[msg.photo.length - 1];
  const doc = msg?.document;
  const first = text ? norm(text.split(/\s+/)[0]) : "";

  // /id y /start funcionan siempre (ayudan al setup, no escriben datos)
  if (first === "/id") {
    await sendMessage(chatId, `Tu chat_id es: <code>${chatId}</code>`);
    return new Response("ok");
  }
  if (first === "/start" || first === "/help" || first === "/ayuda") {
    await sendMessage(chatId, HELP);
    return new Response("ok");
  }

  // A partir de acá, solo el chat autorizado
  if (ALLOWED_CHAT_ID && String(chatId) !== ALLOWED_CHAT_ID) {
    await sendMessage(chatId, "🚫 Bot privado.");
    return new Response("ok");
  }

  try {
    if (photo || doc) {
      // Comprobante de transferencia (foto o PDF) con el monto en el epígrafe.
      await handleComprobante(msg, chatId);
    } else if (!text) {
      return new Response("ok");
    } else if (first === "ingreso" || first === "ingresos") {
      await handleIngreso(text.split(/\s+/).slice(1), chatId);
    } else if (first === "cuota") {
      await handleCuota(text.split(/\s+/).slice(1), chatId);
    } else {
      await handleGasto(text.split(/\s+/), chatId);
    }
  } catch (e) {
    await sendMessage(chatId, `❌ Error inesperado: ${(e as Error).message}`);
  }

  return new Response("ok");
});
