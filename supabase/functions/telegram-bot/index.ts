// ============================================================
// Telegram Bot — carga rápida de gastos / ingresos / cuotas
// Supabase Edge Function (Deno). Recibe el webhook de Telegram,
// parsea comandos e inserta en tu base como TU usuario.
//
// Seguridad: solo responde al ALLOWED_CHAT_ID (whitelist) — usa la
// service_role key (saltea RLS), así que es imprescindible.
//
// Deploy:  supabase functions deploy telegram-bot --no-verify-jwt
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_TOKEN         = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const ALLOWED_CHAT_ID   = Deno.env.get("TELEGRAM_ALLOWED_CHAT_ID") ?? "";
const APP_USER_ID       = Deno.env.get("APP_USER_ID")!;
const WEBHOOK_SECRET    = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MESES_FULL = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

type Result = { ok: boolean; text: string; short: string; undo?: { code: "g" | "c"; id: number } };

// ── Helpers de fecha / número ─────────────────────────────────
function nowAR(): { mes: number; anio: number } {
  const d = new Date(Date.now() - 3 * 3600 * 1000);
  return { mes: d.getUTCMonth() + 1, anio: d.getUTCFullYear() };
}
function todayAR(): string {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().split("T")[0];
}
function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}
function parseMonto(tok: string): number | null {
  let t = tok.toLowerCase().trim();
  let mult = 1;
  if (t.endsWith("mil")) { mult = 1000; t = t.slice(0, -3); }
  else if (t.endsWith("k")) { mult = 1000; t = t.slice(0, -1); }
  if (!/^[\d.,]+$/.test(t) || t === "") return null;
  t = t.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(t);
  if (isNaN(n)) return null;
  return n * mult;
}
const isNumeric = (t: string) => parseMonto(t) !== null;

const fmtArs = (n: number) =>
  n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const fmtMonto = (n: number, moneda: string) =>
  moneda === "USD" ? `U$D ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : fmtArs(n);

// Detecta y saca el token de moneda (usd / dólares).
const MONEDA_TOKENS = new Set(["usd", "u$s", "u$d", "us$", "dolar", "dolares"]);
function extractMoneda(words: string[]): { moneda: "ARS" | "USD"; words: string[] } {
  let moneda: "ARS" | "USD" = "ARS";
  const kept: string[] = [];
  for (const w of words) {
    if (MONEDA_TOKENS.has(norm(w))) moneda = "USD";
    else kept.push(w);
  }
  return { moneda, words: kept };
}

// ── Categorías: match exacto → sinónimos → parcial ────────────
const SINONIMOS: Record<string, string> = {
  nafta: "Transporte", combustible: "Transporte", uber: "Transporte", cabify: "Transporte", didi: "Transporte",
  sube: "Transporte", subte: "Transporte", colectivo: "Transporte", peaje: "Transporte", estacionamiento: "Transporte",
  ypf: "Transporte", shell: "Transporte", axion: "Transporte", taxi: "Transporte",
  super: "Supermercado", supermercado: "Supermercado", coto: "Supermercado", dia: "Supermercado", carrefour: "Supermercado",
  jumbo: "Supermercado", vea: "Supermercado", chino: "Supermercado", verduleria: "Supermercado", almacen: "Supermercado", kiosco: "Supermercado",
  delivery: "Comida", pedidosya: "Comida", rappi: "Comida", mcdonalds: "Comida", burger: "Comida", resto: "Comida",
  restaurante: "Comida", bar: "Comida", cafe: "Comida", comida: "Comida", pizza: "Comida",
  farmacia: "Salud", farmacity: "Salud", medico: "Salud", remedios: "Salud", dentista: "Salud",
  luz: "Servicios", gas: "Servicios", agua: "Servicios", internet: "Servicios", telefono: "Servicios",
  edenor: "Servicios", edesur: "Servicios", metrogas: "Servicios",
  expensas: "Hogar", alquiler: "Hogar", ferreteria: "Hogar",
  netflix: "Suscripciones", spotify: "Suscripciones", disney: "Suscripciones", hbo: "Suscripciones",
  youtube: "Suscripciones", claude: "Suscripciones", chatgpt: "Suscripciones", anthropic: "Suscripciones",
  ropa: "Ropa", zara: "Ropa", indumentaria: "Ropa", kevingston: "Ropa",
};

function matchCategoria(words: string[], cats: { nombre: string; n: string }[]): { categoria: string; usedIndex: number } {
  for (let i = 0; i < words.length; i++) {
    const wn = norm(words[i]);
    if (!wn) continue;
    // 1. exacto
    let hit = cats.find((c) => c.n === wn);
    if (hit) return { categoria: hit.nombre, usedIndex: i };
    // 2. sinónimo → si esa categoría existe en las del usuario
    const target = SINONIMOS[wn];
    if (target) {
      const h2 = cats.find((c) => c.n === norm(target));
      if (h2) return { categoria: h2.nombre, usedIndex: i };
    }
    // 3. parcial (palabra ≥ 4 letras)
    if (wn.length >= 4) {
      const h3 = cats.find((c) => c.n.length >= 4 && (c.n.includes(wn) || wn.includes(c.n)));
      if (h3) return { categoria: h3.nombre, usedIndex: i };
    }
  }
  return { categoria: "Otros", usedIndex: -1 };
}

async function loadCategorias(): Promise<{ nombre: string; n: string }[]> {
  const { data } = await db.from("categorias").select("nombre").eq("user_id", APP_USER_ID).eq("activa", 1);
  return (data ?? []).map((c: { nombre: string }) => ({ nombre: c.nombre, n: norm(c.nombre) }));
}

// ── Telegram API ──────────────────────────────────────────────
async function sendMessage(chatId: number | string, text: string, replyMarkup?: unknown) {
  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: "HTML" };
  if (replyMarkup) body.reply_markup = replyMarkup;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
async function answerCallback(id: string, text?: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: id, text }),
  });
}
async function editMessageText(chatId: number, messageId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: "HTML" }),
  });
}
const undoKb = (code: "g" | "c", id: number) => ({ inline_keyboard: [[{ text: "↩️ Deshacer", callback_data: `u:${code}:${id}` }]] });

async function notificar(titulo: string, detalle: string | null, refTabla: string | null, refId: number | null) {
  await db.from("notificaciones").insert({ user_id: APP_USER_ID, titulo, detalle, ref_tabla: refTabla, ref_id: refId });
}

// Borra un registro cargado (gasto/cuota) + su comprobante + su notificación.
async function borrarRegistro(tabla: string, id: number) {
  if (tabla === "gastos_mensuales" || tabla === "cuotas") {
    const { data } = await db.from(tabla).select("comprobante_url").eq("id", id).maybeSingle();
    if (data?.comprobante_url) await db.storage.from("comprobantes").remove([data.comprobante_url]);
    await db.from(tabla).delete().eq("id", id);
  }
  await db.from("notificaciones").delete().eq("ref_tabla", tabla).eq("ref_id", id).eq("user_id", APP_USER_ID);
}

const HELP = `<b>Bot de Gastos — comandos</b>

💸 <b>Gasto</b>
<code>nafta 8000</code>
<code>12500 super compra del finde</code>
<code>apple 20 usd</code>  (en dólares)
Detecta la categoría sola (sinónimos: nafta→Transporte, super→Supermercado…).

📝 <b>Varios de una</b> (una carga por línea):
<code>nafta 8000
super 12500
delivery 4200</code>

💰 <b>Ingreso</b>  <code>ingreso sueldo 500000</code>
🧾 <b>Cuota</b>  <code>cuota heladera 15000 12</code>
📎 <b>Ticket</b>  foto/PDF con el monto en el epígrafe (<code>transferencia 50000 alquiler</code> lo marca como transferencia)

📊 <b>Consultas</b>
<code>/mes</code> — resumen del mes
<code>/hoy</code> — lo cargado hoy
<code>/cuotas</code> — cuotas vigentes
<code>/ultimo</code> — último movimiento
<code>/ayuda</code> — este mensaje

Cada carga trae un botón ↩️ Deshacer.`;

// ── Cores de carga (devuelven Result, no envían) ──────────────
async function cargarGasto(tokens: string[]): Promise<Result> {
  const { mes, anio } = nowAR();
  let monto: number | null = null;
  const rest: string[] = [];
  for (const t of tokens) {
    if (monto === null && isNumeric(t)) monto = parseMonto(t);
    else rest.push(t);
  }
  const { moneda, words } = extractMoneda(rest);
  if (monto === null || monto <= 0) return { ok: false, text: "⚠️ No encontré el monto. Ej: <code>nafta 8000</code>", short: "sin monto" };

  const cats = await loadCategorias();
  const { categoria, usedIndex } = matchCategoria(words, cats);
  const detalle = words.filter((_, i) => i !== usedIndex).join(" ").trim();
  const nombre = detalle || categoria;

  const { data, error } = await db.from("gastos_mensuales").insert({
    user_id: APP_USER_ID, mes, anio, nombre, monto, categoria, moneda, fecha: todayAR(),
  }).select("id").single();
  if (error) return { ok: false, text: `❌ ${error.message}`, short: `error: ${nombre}` };

  const mf = fmtMonto(monto, moneda);
  await notificar("Gasto por Telegram", `${nombre} · ${mf} · ${categoria}`, "gastos_mensuales", data?.id ?? null);
  return {
    ok: true,
    text: `✅ <b>Gasto</b> ${mf} · ${categoria} · ${nombre} · ${MONTHS[mes - 1]} ${anio}`,
    short: `${nombre} · ${mf} · ${categoria}`,
    undo: { code: "g", id: data!.id },
  };
}

async function cargarIngreso(tokens: string[]): Promise<Result> {
  const { mes, anio } = nowAR();
  let campo: "sueldo" | "otros" = "sueldo";
  let monto: number | null = null;
  for (const t of tokens) {
    const tn = norm(t);
    if (tn === "sueldo") campo = "sueldo";
    else if (tn === "otros" || tn === "otro") campo = "otros";
    else if (monto === null && isNumeric(t)) monto = parseMonto(t);
  }
  if (monto === null || monto < 0) return { ok: false, text: "⚠️ Ej: <code>ingreso sueldo 500000</code>", short: "sin monto" };

  const { data: existing } = await db.from("ingresos")
    .select("sueldo, otros").eq("user_id", APP_USER_ID).eq("mes", mes).eq("anio", anio).maybeSingle();
  const row = { user_id: APP_USER_ID, mes, anio, sueldo: existing?.sueldo ?? 0, otros: existing?.otros ?? 0, [campo]: monto };
  const { data, error } = await db.from("ingresos").upsert(row, { onConflict: "user_id,mes,anio" }).select("id").single();
  if (error) return { ok: false, text: `❌ ${error.message}`, short: "error ingreso" };

  const mf = fmtArs(monto);
  await notificar("Ingreso por Telegram", `${campo} · ${mf}`, "ingresos", data?.id ?? null);
  return { ok: true, text: `✅ <b>Ingreso</b> (${campo}) ${mf} · ${MONTHS[mes - 1]} ${anio}`, short: `Ingreso ${campo} ${mf}` };
}

async function cargarCuota(tokens: string[]): Promise<Result> {
  const { mes, anio } = nowAR();
  const { moneda, words } = extractMoneda(tokens);
  const nums = words.filter(isNumeric);
  if (nums.length < 2) return { ok: false, text: "⚠️ Ej: <code>cuota heladera 15000 12</code>", short: "cuota inválida" };
  const total = Math.round(parseMonto(nums[nums.length - 1])!);
  const monto = parseMonto(nums[nums.length - 2])!;
  const lastTwo = new Set([nums[nums.length - 1], nums[nums.length - 2]]);
  let removed = 0;
  const nombre = words.filter((t) => {
    if (removed < 2 && lastTwo.has(t) && isNumeric(t)) { removed++; return false; }
    return true;
  }).join(" ").trim();
  if (!nombre) return { ok: false, text: "⚠️ Falta el nombre. Ej: <code>cuota heladera 15000 12</code>", short: "sin nombre" };
  if (monto <= 0 || total <= 0) return { ok: false, text: "⚠️ Monto y total deben ser > 0.", short: "cuota inválida" };

  const { data, error } = await db.from("cuotas").insert({
    user_id: APP_USER_ID, nombre, monto_cuota: monto, cuota_actual: 1, total_cuotas: total,
    mes_inicio: mes, anio_inicio: anio, activa: 1, moneda, categoria: "Sin categoría", tarjeta_id: null,
  }).select("id").single();
  if (error) return { ok: false, text: `❌ ${error.message}`, short: `error: ${nombre}` };

  const mf = fmtMonto(monto, moneda);
  await notificar("Cuota por Telegram", `${nombre} · ${mf} × ${total}`, "cuotas", data?.id ?? null);
  return {
    ok: true,
    text: `✅ <b>Cuota</b> ${nombre} · ${mf} × ${total} · desde ${MONTHS[mes - 1]} ${anio}`,
    short: `Cuota ${nombre} ${mf}×${total}`,
    undo: { code: "c", id: data!.id },
  };
}

// Envía el Result (con botón Deshacer si corresponde).
async function responder(chatId: number, r: Result) {
  await sendMessage(chatId, r.text, r.ok && r.undo ? undoKb(r.undo.code, r.undo.id) : undefined);
}

// ── Comprobantes (foto/PDF) ───────────────────────────────────
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
  let tokens: string[] = caption.split(/\s+/);
  let medio: string | null = null;
  if (tokens.length && (norm(tokens[0]) === "transferencia" || norm(tokens[0]) === "transf")) {
    medio = "transferencia";
    tokens = tokens.slice(1);
  }
  let monto: number | null = null;
  const rest: string[] = [];
  for (const t of tokens) {
    if (monto === null && isNumeric(t)) monto = parseMonto(t);
    else rest.push(t);
  }
  const { moneda, words } = extractMoneda(rest);
  if (monto === null || monto <= 0) {
    await sendMessage(chatId, "⚠️ No encontré el monto en el epígrafe. Ej: <code>50000 alquiler</code>");
    return;
  }

  const cats = await loadCategorias();
  const { categoria, usedIndex } = matchCategoria(words, cats);
  const detalle = words.filter((_, i) => i !== usedIndex).join(" ").trim();
  const nombre = detalle || categoria;

  const fileId: string | undefined = msg.photo?.[msg.photo.length - 1]?.file_id ?? msg.document?.file_id;
  const comprobante = fileId ? await uploadComprobante(fileId, msg.document?.mime_type) : null;

  const { data, error } = await db.from("gastos_mensuales").insert({
    user_id: APP_USER_ID, mes, anio, nombre, monto, categoria, moneda, fecha: todayAR(), medio, comprobante_url: comprobante,
  }).select("id").single();
  if (error) { await sendMessage(chatId, `❌ Error: ${error.message}`); return; }

  const mf = fmtMonto(monto, moneda);
  const tipoLabel = medio === "transferencia" ? "Transferencia" : "Gasto";
  await notificar(`${tipoLabel} por Telegram`, `${nombre} · ${mf} · ${categoria}${comprobante ? " · 📎" : ""}`, "gastos_mensuales", data?.id ?? null);
  await sendMessage(
    chatId,
    `✅ <b>${tipoLabel}</b> ${mf} · ${categoria} · ${nombre} · ${MONTHS[mes - 1]} ${anio}${comprobante ? " · 📎 comprobante guardado" : ""}`,
    data?.id ? undoKb("g", data.id) : undefined,
  );
}

// ── Consultas ─────────────────────────────────────────────────
async function dolarRate(): Promise<number> {
  try {
    const r = await fetch("https://dolarapi.com/v1/dolares/oficial").then((r) => r.json());
    return (r?.venta as number) ?? 1000;
  } catch { return 1000; }
}
const pesify = (n: number, moneda: string, rate: number) => (moneda === "USD" ? n * rate : n);

async function fijosDelMes(anio: number, mes: number) {
  const { data } = await db.from("gastos_fijos")
    .select("monto, moneda, activo, mes, anio, grupo_id").eq("user_id", APP_USER_ID);
  const periodo = anio * 12 + mes;
  const grupos = new Map<number, any>();
  for (const f of data ?? []) {
    if (f.anio * 12 + f.mes > periodo) continue;
    const cur = grupos.get(f.grupo_id);
    if (!cur || f.anio * 12 + f.mes > cur.anio * 12 + cur.mes) grupos.set(f.grupo_id, f);
  }
  return [...grupos.values()].filter((f) => f.activo === 1);
}

async function resumenMes(anio: number, mes: number) {
  const rate = await dolarRate();
  const { data: ing } = await db.from("ingresos")
    .select("sueldo, otros").eq("user_id", APP_USER_ID).eq("mes", mes).eq("anio", anio).maybeSingle();
  const sueldo = ing?.sueldo ?? 0;
  const ingresos = sueldo + (ing?.otros ?? 0);

  const { data: men } = await db.from("gastos_mensuales")
    .select("monto, moneda").eq("user_id", APP_USER_ID).eq("mes", mes).eq("anio", anio);
  const mensuales = (men ?? []).reduce((s, g: any) => s + pesify(g.monto, g.moneda, rate), 0);

  const fijos = (await fijosDelMes(anio, mes)).reduce((s, f: any) => s + pesify(f.monto, f.moneda, rate), 0);

  const { data: cuotas } = await db.from("cuotas")
    .select("id, monto_cuota, moneda, cuota_actual, total_cuotas, mes_inicio, anio_inicio")
    .eq("user_id", APP_USER_ID).eq("activa", 1);
  const { data: pausadas } = await db.from("cuotas_pausadas")
    .select("cuota_id").eq("user_id", APP_USER_ID).eq("mes", mes).eq("anio", anio);
  const paused = new Set((pausadas ?? []).map((p: any) => p.cuota_id));
  let cuo = 0;
  for (const c of cuotas ?? []) {
    if (paused.has(c.id)) continue;
    const n = c.cuota_actual + (anio - c.anio_inicio) * 12 + (mes - c.mes_inicio);
    if (n < 1 || n > c.total_cuotas) continue;
    cuo += pesify(c.monto_cuota, c.moneda, rate);
  }

  const total = mensuales + fijos + cuo;
  return { ingresos, sueldo, mensuales, fijos, cuotas: cuo, total, balance: ingresos - total };
}

async function handleMes(chatId: number) {
  const { mes, anio } = nowAR();
  const r = await resumenMes(anio, mes);
  let txt = `📊 <b>${MESES_FULL[mes - 1]} ${anio}</b>\n`;
  txt += `Ingresos: <b>${fmtArs(r.ingresos)}</b>\n`;
  txt += `Gastos: <b>${fmtArs(r.total)}</b>\n`;
  txt += `  ·  fijos ${fmtArs(r.fijos)} · mensuales ${fmtArs(r.mensuales)} · cuotas ${fmtArs(r.cuotas)}\n`;
  txt += `Balance: <b>${fmtArs(r.balance)}</b>`;
  if (r.sueldo > 0) txt += `\n💰 Del sueldo te ${r.sueldo - r.total >= 0 ? "queda" : "excediste"}: <b>${fmtArs(Math.abs(r.sueldo - r.total))}</b>`;
  await sendMessage(chatId, txt);
}

async function handleHoy(chatId: number) {
  const hoy = todayAR();
  const { data } = await db.from("gastos_mensuales")
    .select("nombre, monto, moneda").eq("user_id", APP_USER_ID).eq("fecha", hoy).order("id");
  if (!data || data.length === 0) { await sendMessage(chatId, "🗓️ Hoy no cargaste nada."); return; }
  const totalArs = data.reduce((s: number, g: any) => s + (g.moneda === "USD" ? 0 : g.monto), 0);
  const lineas = data.map((g: any) => `• ${g.nombre} · ${fmtMonto(g.monto, g.moneda)}`).join("\n");
  await sendMessage(chatId, `🗓️ <b>Hoy</b> (${data.length})\n${lineas}\n\nTotal ARS: <b>${fmtArs(totalArs)}</b>`);
}

async function handleUltimo(chatId: number) {
  const { data } = await db.from("gastos_mensuales")
    .select("id, nombre, monto, moneda, categoria, fecha").eq("user_id", APP_USER_ID)
    .order("id", { ascending: false }).limit(1).maybeSingle();
  if (!data) { await sendMessage(chatId, "No hay movimientos cargados."); return; }
  const [y, m, d] = String(data.fecha ?? "").split("-");
  const fechaTxt = d ? `${d}/${m}` : "";
  await sendMessage(
    chatId,
    `🕓 <b>Último</b>: ${data.nombre} · ${fmtMonto(data.monto, data.moneda)} · ${data.categoria}${fechaTxt ? ` · ${fechaTxt}` : ""}`,
    undoKb("g", data.id),
  );
}

async function handleCuotas(chatId: number) {
  const { mes, anio } = nowAR();
  const { data } = await db.from("cuotas")
    .select("nombre, monto_cuota, moneda, cuota_actual, total_cuotas, mes_inicio, anio_inicio, tarjeta_id")
    .eq("user_id", APP_USER_ID).eq("activa", 1);
  const { data: tarjetas } = await db.from("tarjetas").select("id, nombre").eq("user_id", APP_USER_ID);
  const tName = new Map((tarjetas ?? []).map((t: any) => [t.id, t.nombre]));

  const vig: any[] = [];
  for (const c of data ?? []) {
    const n = c.cuota_actual + (anio - c.anio_inicio) * 12 + (mes - c.mes_inicio);
    if (n > c.total_cuotas) continue; // ya terminó
    vig.push({ ...c, actual: Math.min(Math.max(n, 1), c.total_cuotas) });
  }
  if (vig.length === 0) { await sendMessage(chatId, "🧾 No tenés cuotas vigentes 🎉"); return; }

  const totalArs = vig.reduce((s, c) => s + (c.moneda === "USD" ? 0 : c.monto_cuota), 0);
  const lineas = vig.map((c) => {
    const t = c.tarjeta_id ? ` · 💳 ${tName.get(c.tarjeta_id) ?? ""}` : "";
    return `• ${c.nombre} · ${fmtMonto(c.monto_cuota, c.moneda)} · ${c.actual}/${c.total_cuotas}${t}`;
  }).join("\n");
  await sendMessage(chatId, `🧾 <b>Cuotas vigentes</b> (${vig.length})\n${lineas}\n\nEste mes ARS: <b>${fmtArs(totalArs)}</b>`);
}

// ── Carga múltiple (una por línea) ────────────────────────────
async function handleMulti(lines: string[], chatId: number) {
  const out: string[] = [];
  for (const line of lines) {
    const toks = line.split(/\s+/);
    const f = norm(toks[0] ?? "");
    let r: Result;
    if (f === "ingreso" || f === "ingresos") r = await cargarIngreso(toks.slice(1));
    else if (f === "cuota") r = await cargarCuota(toks.slice(1));
    else r = await cargarGasto(toks);
    out.push(`${r.ok ? "✅" : "⚠️"} ${r.short}`);
  }
  await sendMessage(chatId, `<b>Cargas (${lines.length})</b>\n${out.join("\n")}`);
}

// ── Alertas proactivas (cron diario) ─────────────────────────
async function getPresupuesto() {
  const { data } = await db.from("presupuesto")
    .select("pct_ahorro, pct_cuotas, pct_gastos").eq("user_id", APP_USER_ID).maybeSingle();
  return data ?? { pct_ahorro: 20, pct_cuotas: 30, pct_gastos: 50 };
}

// ¿Ya mandamos esta alerta? (dedup vía la tabla notificaciones)
async function yaAlertado(refTabla: string, refId: number): Promise<boolean> {
  const { data } = await db.from("notificaciones")
    .select("id").eq("user_id", APP_USER_ID).eq("ref_tabla", refTabla).eq("ref_id", refId).maybeSingle();
  return !!data;
}

async function runDailyChecks() {
  if (!ALLOWED_CHAT_ID) return;
  const chatId = ALLOWED_CHAT_ID;
  const d = new Date(Date.now() - 3 * 3600 * 1000);
  const day = d.getUTCDate();
  const mes = d.getUTCMonth() + 1;
  const anio = d.getUTCFullYear();

  // 1) El día 1: resumen del mes que cerró.
  if (day === 1) {
    const pm = mes === 1 ? 12 : mes - 1;
    const py = mes === 1 ? anio - 1 : anio;
    const r = await resumenMes(py, pm);
    let txt = `📅 <b>Cerró ${MESES_FULL[pm - 1]} ${py}</b>\n`;
    txt += `Ingresos: <b>${fmtArs(r.ingresos)}</b>\n`;
    txt += `Gastos: <b>${fmtArs(r.total)}</b> (fijos ${fmtArs(r.fijos)} · mensuales ${fmtArs(r.mensuales)} · cuotas ${fmtArs(r.cuotas)})\n`;
    txt += `Balance: <b>${fmtArs(r.balance)}</b>`;
    await sendMessage(chatId, txt);
  }

  // 2) Presupuesto de gastos: aviso una vez al mes al cruzar el 90%.
  const r = await resumenMes(anio, mes);
  const presu = await getPresupuesto();
  const budget = (presu.pct_gastos / 100) * r.sueldo;
  const usado = r.fijos + r.mensuales; // "gastos" = fijos + mensuales (las cuotas van aparte)
  if (budget > 0 && usado >= budget * 0.9) {
    const refId = anio * 100 + mes;
    if (!(await yaAlertado("alerta_presupuesto", refId))) {
      const pct = Math.round((usado / budget) * 100);
      const rest = budget - usado;
      const linea = rest >= 0
        ? `Te queda <b>${fmtArs(rest)}</b> del presupuesto de gastos.`
        : `Te <b>excediste ${fmtArs(-rest)}</b> del presupuesto de gastos.`;
      await sendMessage(chatId, `⚠️ <b>Presupuesto de gastos al ${pct}%</b>\nUsaste ${fmtArs(usado)} de ${fmtArs(budget)}.\n${linea}`);
      await notificar("⚠️ Presupuesto de gastos", `Al ${pct}% en ${MESES_FULL[mes - 1]}`, "alerta_presupuesto", refId);
    }
  }
}

// ── Entry point ───────────────────────────────────────────────
Deno.serve(async (req) => {
  // Disparador de cron (pg_cron/pg_net): /telegram-bot?task=cron&secret=...
  const url = new URL(req.url);
  if (url.searchParams.get("task") === "cron") {
    if (WEBHOOK_SECRET && url.searchParams.get("secret") !== WEBHOOK_SECRET) {
      return new Response("forbidden", { status: 401 });
    }
    try { await runDailyChecks(); } catch (e) { console.error("cron:", (e as Error).message); }
    return new Response("ok");
  }

  if (WEBHOOK_SECRET) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== WEBHOOK_SECRET) return new Response("forbidden", { status: 401 });
  }

  let update: any;
  try { update = await req.json(); } catch { return new Response("ok"); }

  // ── Callback de botones (Deshacer) ──
  if (update?.callback_query) {
    const cq = update.callback_query;
    const fromId = cq.from?.id;
    if (ALLOWED_CHAT_ID && String(fromId) !== ALLOWED_CHAT_ID) { await answerCallback(cq.id, "🚫"); return new Response("ok"); }
    const [action, code, idStr] = String(cq.data ?? "").split(":");
    if (action === "u" && idStr) {
      const tabla = code === "c" ? "cuotas" : "gastos_mensuales";
      try {
        await borrarRegistro(tabla, parseInt(idStr));
        await answerCallback(cq.id, "Deshecho ✓");
        if (cq.message?.chat?.id && cq.message?.message_id) {
          await editMessageText(cq.message.chat.id, cq.message.message_id, "🗑️ <i>Deshecho y eliminado.</i>");
        }
      } catch (e) {
        await answerCallback(cq.id, "Error: " + (e as Error).message);
      }
    } else {
      await answerCallback(cq.id);
    }
    return new Response("ok");
  }

  const msg = update?.message ?? update?.edited_message;
  const chatId: number | undefined = msg?.chat?.id;
  if (!chatId) return new Response("ok");

  const text: string = (msg?.text ?? "").trim();
  const photo = msg?.photo?.[msg.photo.length - 1];
  const doc = msg?.document;
  const first = text ? norm(text.split(/\s+/)[0]) : "";

  if (first === "/id") { await sendMessage(chatId, `Tu chat_id es: <code>${chatId}</code>`); return new Response("ok"); }
  if (first === "/start" || first === "/help" || first === "/ayuda") { await sendMessage(chatId, HELP); return new Response("ok"); }

  if (ALLOWED_CHAT_ID && String(chatId) !== ALLOWED_CHAT_ID) { await sendMessage(chatId, "🚫 Bot privado."); return new Response("ok"); }

  try {
    if (photo || doc) {
      await handleComprobante(msg, chatId);
    } else if (!text) {
      return new Response("ok");
    } else if (first === "/mes") {
      await handleMes(chatId);
    } else if (first === "/hoy") {
      await handleHoy(chatId);
    } else if (first === "/cuotas") {
      await handleCuotas(chatId);
    } else if (first === "/ultimo") {
      await handleUltimo(chatId);
    } else {
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length > 1) {
        await handleMulti(lines, chatId);
      } else {
        const toks = text.split(/\s+/);
        if (first === "ingreso" || first === "ingresos") await responder(chatId, await cargarIngreso(toks.slice(1)));
        else if (first === "cuota") await responder(chatId, await cargarCuota(toks.slice(1)));
        else await responder(chatId, await cargarGasto(toks));
      }
    }
  } catch (e) {
    await sendMessage(chatId, `❌ Error inesperado: ${(e as Error).message}`);
  }

  return new Response("ok");
});
