/**
 * API Client — same exported surface as the FastAPI version.
 * Internally uses Supabase JS client + TypeScript business logic.
 * Views don't need to change.
 */

import { supabase } from "./lib/supabase";
import { compressImage } from "./lib/comprobante";
import {
  getCotizacionDolar,
  calcularResumen,
  calcularHistorial,
  calcularProyeccion,
} from "./lib/finance";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function uid(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  return user.id;
}

function ok<T>(data: T | null, error: { message: string } | null, fallback?: T): T {
  if (error) throw new Error(error.message);
  return (data ?? fallback) as T;
}

let _dolarCache: { rate: number; ts: number } | null = null;
async function getDolarRate(): Promise<number> {
  if (_dolarCache && Date.now() - _dolarCache.ts < 3_600_000) return _dolarCache.rate;
  const rate = await getCotizacionDolar();
  _dolarCache = { rate, ts: Date.now() };
  return rate;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GastoMensual {
  id: number;
  mes: number;
  anio: number;
  nombre: string;
  monto: number;
  categoria: string;
  moneda: string;
  nota?: string | null;
  fecha?: string | null;       // día del gasto (YYYY-MM-DD)
  tarjeta_id?: number | null;  // tarjeta/medio con que se pagó
  verificado?: boolean;        // conciliado contra el resumen
  medio?: string | null;       // ej: 'transferencia'
  comprobante_url?: string | null; // ruta del comprobante en Storage
}
export type GastoMensualCreate = Omit<GastoMensual, "id">;

export interface GastoFijo {
  id: number;
  nombre: string;
  monto: number;
  activo: number;
  moneda: string;
  mes: number;
  anio: number;
  grupo_id: number;
  categoria: string;
  nota?: string | null;
}
export type GastoFijoCreate = Omit<GastoFijo, "id" | "grupo_id">;

export interface Ingresos {
  id: number;
  mes: number;
  anio: number;
  sueldo: number;
  otros: number;
}
export interface IngresosCreate { sueldo: number; otros: number; }

export interface Tarjeta {
  id: number;
  nombre: string;
  tipo: string;
  ultimos_4: string;
  activa: number;
}
export type TarjetaCreate = Omit<Tarjeta, "id">;

export interface Cuota {
  id: number;
  nombre: string;
  monto_cuota: number;
  cuota_actual: number;
  total_cuotas: number;
  mes_inicio: number;
  anio_inicio: number;
  activa: number;
  moneda: string;
  tarjeta_id: number | null;
  categoria: string;
  nota?: string | null;
  comprobante_url?: string | null;
}
export type CuotaCreate = Omit<Cuota, "id">;

export interface MetaAhorro {
  id: number;
  nombre: string;
  objetivo: number;
  acumulado: number;
  fecha_limite: string | null;
  prioridad: number;
  activa: number;
  tasa_rendimiento: number;
  tipo: string;              // 'meta' | 'inversion'
  aporte_mensual: number;    // aporte mensual estimado (para inversiones)
}
export type MetaAhorroCreate = Omit<MetaAhorro, "id">;

export interface Resumen {
  mes: number;
  anio: number;
  ingresos: number;
  sueldo: number;
  otros: number;
  gastos_fijos: number;
  gastos_mensuales: number;
  cuotas: number;
  total_gastos: number;
  balance: number;
  dolar_rate: number;
}

export interface ResumenMes extends Resumen { label: string; }

export interface DolarResponse { venta: number; cache_age_seconds: number | null; }

export interface Categoria {
  id: number;
  nombre: string;
  color: string;
  activa: number;
}
export type CategoriaCreate = Omit<Categoria, "id" | "activa">;

export interface CategoriaBreakdown {
  categoria: string;
  color: string;
  total: number;
}

export interface CuotaProyectada {
  id: number;
  nombre: string;
  monto_ars: number;
  numero_cuota: number;
  total_cuotas: number;
}
export interface ProyeccionMes {
  mes: number;
  anio: number;
  label: string;
  total_ars: number;
  cuotas: CuotaProyectada[];
}

// ─── Dólar ───────────────────────────────────────────────────────────────────

export const dolarApi = {
  get: async (): Promise<DolarResponse> => ({
    venta: await getDolarRate(),
    cache_age_seconds: null,
  }),
};

// ─── Resumen ─────────────────────────────────────────────────────────────────

export const resumenApi = {
  get: async (anio: number, mes: number): Promise<Resumen> => {
    const dolarRate = await getDolarRate();
    const [ingRes, fijRes, menRes, cuoRes, pauRes] = await Promise.all([
      supabase.from("ingresos").select("*").eq("mes", mes).eq("anio", anio).maybeSingle(),
      supabase.from("gastos_fijos").select("*"),
      supabase.from("gastos_mensuales").select("*").eq("mes", mes).eq("anio", anio),
      supabase.from("cuotas").select("*").eq("activa", 1),
      supabase.from("cuotas_pausadas").select("cuota_id").eq("mes", mes).eq("anio", anio),
    ]);
    return calcularResumen(
      anio, mes,
      ingRes.data,
      ok(fijRes.data, fijRes.error, []),
      ok(menRes.data, menRes.error, []),
      ok(cuoRes.data, cuoRes.error, []),
      new Set((pauRes.data ?? []).map((p: { cuota_id: number }) => p.cuota_id)),
      dolarRate,
    );
  },

  clonar: async (anio: number, mes: number) => {
    const userId = await uid();
    const prevM = mes > 1 ? mes - 1 : 12;
    const prevY = mes > 1 ? anio : anio - 1;
    const { data, error } = await supabase
      .from("gastos_mensuales")
      .select("nombre, monto, categoria, moneda")
      .eq("mes", prevM).eq("anio", prevY);
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error(`No hay gastos en ${prevM}/${prevY}`);
    const rows = data.map((g) => ({ ...g, mes, anio, user_id: userId }));
    const { error: e2 } = await supabase.from("gastos_mensuales").insert(rows);
    if (e2) throw new Error(e2.message);
    return { clonados: rows.length, origen: { mes: prevM, anio: prevY }, destino: { mes, anio }, pre_existing: 0 };
  },
};

// ─── Gastos Mensuales ─────────────────────────────────────────────────────────

const GASTO_COLS = "id, mes, anio, nombre, monto, categoria, moneda, nota, fecha, tarjeta_id, verificado, medio, comprobante_url";

// Subida/lectura/borrado de comprobantes en Storage.
export const comprobantesApi = {
  signedUrl: async (path: string): Promise<string | null> => {
    const { data, error } = await supabase.storage.from("comprobantes").createSignedUrl(path, 120);
    if (error) return null;
    return data?.signedUrl ?? null;
  },

  // Sube un archivo (comprime si es imagen) y devuelve su ruta en Storage.
  upload: async (file: File): Promise<string> => {
    const userId = await uid();
    const isImage = file.type.startsWith("image/");
    let body: Blob = file;
    let ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    let contentType = file.type || "application/octet-stream";
    if (isImage) {
      body = await compressImage(file);
      ext = "jpg";
      contentType = "image/jpeg";
    }
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const { error } = await supabase.storage.from("comprobantes").upload(path, body, { contentType, upsert: false });
    if (error) throw new Error(error.message);
    return path;
  },

  remove: async (path: string) => {
    await supabase.storage.from("comprobantes").remove([path]);
  },
};

export const gastosApi = {
  list: async (anio: number, mes: number): Promise<GastoMensual[]> => {
    const { data, error } = await supabase
      .from("gastos_mensuales").select(GASTO_COLS)
      .eq("mes", mes).eq("anio", anio).order("fecha", { ascending: true }).order("id");
    return ok(data, error, []);
  },

  create: async (body: GastoMensualCreate): Promise<GastoMensual> => {
    const { data, error } = await supabase
      .from("gastos_mensuales").insert({ ...body, user_id: await uid() }).select(GASTO_COLS).single();
    return ok(data, error);
  },

  // Inserción masiva (usado por el importador de resúmenes).
  createMany: async (bodies: GastoMensualCreate[]): Promise<number> => {
    if (!bodies.length) return 0;
    const userId = await uid();
    const rows = bodies.map((b) => ({ ...b, user_id: userId }));
    const { error } = await supabase.from("gastos_mensuales").insert(rows);
    if (error) throw new Error(error.message);
    return rows.length;
  },

  update: async (id: number, body: Partial<GastoMensualCreate>): Promise<GastoMensual> => {
    const { data, error } = await supabase
      .from("gastos_mensuales").update(body).eq("id", id).select(GASTO_COLS).single();
    return ok(data, error);
  },

  // Marca varios gastos como verificados (conciliados) de una.
  marcarVerificados: async (ids: number[]) => {
    if (!ids.length) return;
    const { error } = await supabase.from("gastos_mensuales").update({ verificado: true }).in("id", ids);
    if (error) throw new Error(error.message);
  },

  delete: async (id: number) => {
    const { error } = await supabase.from("gastos_mensuales").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return { deleted: true };
  },
};

// ─── Gastos Fijos ─────────────────────────────────────────────────────────────

export const fijosApi = {
  list: async (anio: number, mes: number): Promise<GastoFijo[]> => {
    const { data, error } = await supabase
      .from("gastos_fijos").select("id, nombre, monto, activo, moneda, mes, anio, grupo_id, categoria, nota");
    const all = ok(data, error, []) as GastoFijo[];
    // Temporal filtering in TypeScript (mirrors the SQL subquery from FastAPI)
    const { getActiveFijosForMonth } = await import("./lib/finance");
    return getActiveFijosForMonth(all, anio, mes);
  },

  create: async (body: GastoFijoCreate): Promise<GastoFijo> => {
    const userId = await uid();
    // Insert with temp grupo_id, then update to the new row's id
    const { data, error } = await supabase
      .from("gastos_fijos")
      .insert({ ...body, user_id: userId, grupo_id: 0 })
      .select("id, nombre, monto, activo, moneda, mes, anio, grupo_id, categoria, nota")
      .single();
    const row = ok(data, error) as GastoFijo;
    await supabase.from("gastos_fijos").update({ grupo_id: row.id }).eq("id", row.id);
    return { ...row, grupo_id: row.id };
  },

  update: async (id: number, body: GastoFijoCreate): Promise<GastoFijo> => {
    const { data: existing, error: fetchErr } = await supabase
      .from("gastos_fijos").select("id, grupo_id, mes, anio").eq("id", id).single();
    if (fetchErr) throw new Error(fetchErr.message);

    const existingPeriodo = existing.anio * 12 + existing.mes;
    const nuevoPeriodo    = body.anio  * 12 + body.mes;
    const userId = await uid();

    if (nuevoPeriodo <= existingPeriodo) {
      // Same or earlier month → update in-place
      const { data, error } = await supabase
        .from("gastos_fijos").update(body).eq("id", id)
        .select("id, nombre, monto, activo, moneda, mes, anio, grupo_id, categoria, nota").single();
      return ok(data, error);
    } else {
      // Future month → new version, history preserved
      const { data, error } = await supabase
        .from("gastos_fijos")
        .insert({ ...body, user_id: userId, grupo_id: existing.grupo_id })
        .select("id, nombre, monto, activo, moneda, mes, anio, grupo_id, categoria, nota").single();
      return ok(data, error);
    }
  },

  delete: async (id: number) => {
    const { data, error } = await supabase
      .from("gastos_fijos").select("grupo_id").eq("id", id).single();
    if (error) throw new Error(error.message);
    const { error: delErr } = await supabase
      .from("gastos_fijos").delete().eq("grupo_id", data.grupo_id);
    if (delErr) throw new Error(delErr.message);
    return { deleted: true };
  },
};

// ─── Ingresos ─────────────────────────────────────────────────────────────────

export const ingresosApi = {
  get: async (anio: number, mes: number): Promise<Ingresos> => {
    const { data, error } = await supabase
      .from("ingresos").select("*").eq("mes", mes).eq("anio", anio).maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? { id: 0, mes, anio, sueldo: 0, otros: 0 };
  },

  upsert: async (anio: number, mes: number, body: IngresosCreate): Promise<Ingresos> => {
    const userId = await uid();
    const { data, error } = await supabase
      .from("ingresos")
      .upsert({ ...body, mes, anio, user_id: userId }, { onConflict: "user_id,mes,anio" })
      .select("*").single();
    return ok(data, error);
  },

  delete: async (anio: number, mes: number) => {
    const { error } = await supabase
      .from("ingresos").delete().eq("mes", mes).eq("anio", anio);
    if (error) throw new Error(error.message);
    return { deleted: true };
  },
};

// ─── Tarjetas ─────────────────────────────────────────────────────────────────

export const tarjetasApi = {
  list: async (): Promise<Tarjeta[]> => {
    const { data, error } = await supabase
      .from("tarjetas").select("id, nombre, tipo, ultimos_4, activa").order("nombre");
    return ok(data, error, []);
  },

  get: async (id: number): Promise<Tarjeta> => {
    const { data, error } = await supabase
      .from("tarjetas").select("id, nombre, tipo, ultimos_4, activa").eq("id", id).single();
    return ok(data, error);
  },

  create: async (body: TarjetaCreate): Promise<Tarjeta> => {
    const { data, error } = await supabase
      .from("tarjetas").insert({ ...body, user_id: await uid() })
      .select("id, nombre, tipo, ultimos_4, activa").single();
    return ok(data, error);
  },

  update: async (id: number, body: TarjetaCreate): Promise<Tarjeta> => {
    const { data, error } = await supabase
      .from("tarjetas").update(body).eq("id", id)
      .select("id, nombre, tipo, ultimos_4, activa").single();
    return ok(data, error);
  },

  delete: async (id: number) => {
    const { error } = await supabase.from("tarjetas").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return { deleted: true };
  },
};

// ─── Cuotas ───────────────────────────────────────────────────────────────────

const CUOTA_COLS = "id, nombre, monto_cuota, cuota_actual, total_cuotas, mes_inicio, anio_inicio, activa, moneda, tarjeta_id, categoria, nota, comprobante_url";

export const cuotasApi = {
  list: async (): Promise<Cuota[]> => {
    const { data, error } = await supabase.from("cuotas").select(CUOTA_COLS).order("id");
    return ok(data, error, []);
  },

  get: async (id: number): Promise<Cuota> => {
    const { data, error } = await supabase.from("cuotas").select(CUOTA_COLS).eq("id", id).single();
    return ok(data, error);
  },

  create: async (body: CuotaCreate): Promise<Cuota> => {
    const { data, error } = await supabase
      .from("cuotas").insert({ ...body, user_id: await uid() }).select(CUOTA_COLS).single();
    return ok(data, error);
  },

  update: async (id: number, body: CuotaCreate): Promise<Cuota> => {
    const { data, error } = await supabase
      .from("cuotas").update(body).eq("id", id).select(CUOTA_COLS).single();
    return ok(data, error);
  },

  delete: async (id: number) => {
    const { error } = await supabase.from("cuotas").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return { deleted: true };
  },

  pausar: async (id: number, anio: number, mes: number) => {
    const { error } = await supabase
      .from("cuotas_pausadas")
      .insert({ cuota_id: id, mes, anio, user_id: await uid() });
    if (error) throw new Error(error.message);
    return { paused: true };
  },

  reactivar: async (id: number, anio: number, mes: number) => {
    const { error } = await supabase
      .from("cuotas_pausadas").delete().eq("cuota_id", id).eq("mes", mes).eq("anio", anio);
    if (error) throw new Error(error.message);
    return { paused: false };
  },
};

// ─── Metas de Ahorro ──────────────────────────────────────────────────────────

const META_COLS = "id, nombre, objetivo, acumulado, fecha_limite, prioridad, activa, tasa_rendimiento, tipo, aporte_mensual";

export const metasApi = {
  list: async (): Promise<MetaAhorro[]> => {
    const { data, error } = await supabase
      .from("metas_ahorro").select(META_COLS).order("prioridad", { ascending: false });
    return ok(data, error, []);
  },

  get: async (id: number): Promise<MetaAhorro> => {
    const { data, error } = await supabase.from("metas_ahorro").select(META_COLS).eq("id", id).single();
    return ok(data, error);
  },

  create: async (body: MetaAhorroCreate): Promise<MetaAhorro> => {
    const { data, error } = await supabase
      .from("metas_ahorro").insert({ ...body, user_id: await uid() }).select(META_COLS).single();
    return ok(data, error);
  },

  update: async (id: number, body: MetaAhorroCreate): Promise<MetaAhorro> => {
    const { data, error } = await supabase
      .from("metas_ahorro").update(body).eq("id", id).select(META_COLS).single();
    return ok(data, error);
  },

  delete: async (id: number) => {
    const { error } = await supabase.from("metas_ahorro").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return { deleted: true };
  },

  depositar: async (id: number, monto: number, fecha?: string) => {
    const userId = await uid();
    const fechaFinal = fecha ?? new Date().toISOString().split("T")[0];
    const { error: e1 } = await supabase
      .from("depositos_ahorro")
      .insert({ meta_id: id, monto, fecha: fechaFinal, user_id: userId });
    if (e1) throw new Error(e1.message);
    const { data, error: e2 } = await supabase.rpc("incrementar_acumulado", {
      p_meta_id: id, p_monto: monto,
    });
    // fallback if RPC not available: manual update
    if (e2) {
      const { data: meta } = await supabase.from("metas_ahorro").select("acumulado").eq("id", id).single();
      await supabase.from("metas_ahorro").update({ acumulado: (meta?.acumulado ?? 0) + monto }).eq("id", id);
    }
    return { deposito: { monto, fecha: fechaFinal }, meta: data };
  },
};

// ─── Categorías ───────────────────────────────────────────────────────────────

export const categoriasApi = {
  list: async (): Promise<Categoria[]> => {
    const { data, error } = await supabase
      .from("categorias").select("id, nombre, color, activa").eq("activa", 1).order("nombre");
    return ok(data, error, []);
  },

  create: async (body: CategoriaCreate): Promise<Categoria> => {
    const { data, error } = await supabase
      .from("categorias")
      .insert({ ...body, user_id: await uid() })
      .select("id, nombre, color, activa").single();
    return ok(data, error);
  },

  update: async (id: number, body: CategoriaCreate): Promise<Categoria> => {
    const { data, error } = await supabase
      .from("categorias").update(body).eq("id", id).select("id, nombre, color, activa").single();
    return ok(data, error);
  },

  delete: async (id: number) => {
    const { error } = await supabase.from("categorias").update({ activa: 0 }).eq("id", id);
    if (error) throw new Error(error.message);
    return { deleted: true };
  },
};

// ─── Historial ────────────────────────────────────────────────────────────────

export const historialApi = {
  get: async (meses: number): Promise<ResumenMes[]> => {
    const dolarRate = await getDolarRate();
    const [fijRes, ingRes, menRes, cuoRes, pauRes] = await Promise.all([
      supabase.from("gastos_fijos").select("id, nombre, monto, activo, moneda, mes, anio, grupo_id, categoria, nota"),
      supabase.from("ingresos").select("id, mes, anio, sueldo, otros"),
      supabase.from("gastos_mensuales").select("id, mes, anio, nombre, monto, categoria, moneda, nota"),
      supabase.from("cuotas").select("id, nombre, monto_cuota, cuota_actual, total_cuotas, mes_inicio, anio_inicio, activa, moneda, tarjeta_id, categoria").eq("activa", 1),
      supabase.from("cuotas_pausadas").select("cuota_id, mes, anio"),
    ]);
    return calcularHistorial(
      meses,
      ok(fijRes.data, fijRes.error, []),
      ok(ingRes.data, ingRes.error, []),
      ok(menRes.data, menRes.error, []),
      ok(cuoRes.data, cuoRes.error, []),
      ok(pauRes.data, pauRes.error, []),
      dolarRate,
    );
  },
};

// ─── Proyección ───────────────────────────────────────────────────────────────

export const proyeccionApi = {
  get: async (meses: number): Promise<ProyeccionMes[]> => {
    const dolarRate = await getDolarRate();
    const { data, error } = await supabase
      .from("cuotas").select(CUOTA_COLS).eq("activa", 1);
    return calcularProyeccion(ok(data, error, []), dolarRate, meses);
  },
};

// ─── Desglose por Categoría ───────────────────────────────────────────────────

export const resumenCategoriasApi = {
  get: async (anio: number, mes: number): Promise<CategoriaBreakdown[]> => {
    const dolarRate = await getDolarRate();

    const [catRes, menRes, fijRes, cuoRes, pauRes] = await Promise.all([
      supabase.from("categorias").select("nombre, color").eq("activa", 1),
      supabase.from("gastos_mensuales").select("categoria, monto, moneda").eq("mes", mes).eq("anio", anio),
      supabase.from("gastos_fijos").select("id, nombre, monto, activo, moneda, mes, anio, grupo_id, categoria, nota"),
      supabase.from("cuotas").select("id, monto_cuota, moneda, total_cuotas, mes_inicio, anio_inicio, activa, categoria").eq("activa", 1),
      supabase.from("cuotas_pausadas").select("cuota_id").eq("mes", mes).eq("anio", anio),
    ]);

    // Map de categoria → color
    const colorMap = new Map<string, string>(
      (catRes.data ?? []).map((c: { nombre: string; color: string }) => [c.nombre, c.color])
    );

    const pausedIds = new Set<number>(
      (pauRes.data ?? []).map((p: { cuota_id: number }) => p.cuota_id)
    );

    const totals = new Map<string, number>();
    const toArs = (monto: number, moneda: string) => moneda === "USD" ? monto * dolarRate : monto;

    // Gastos mensuales
    for (const g of ok(menRes.data, menRes.error, []) as { categoria: string; monto: number; moneda: string }[]) {
      const cat = g.categoria || "Sin categoría";
      totals.set(cat, (totals.get(cat) ?? 0) + toArs(g.monto, g.moneda));
    }

    // Gastos fijos (activos para el mes)
    const { getActiveFijosForMonth } = await import("./lib/finance");
    const activeFijos = getActiveFijosForMonth(ok(fijRes.data, fijRes.error, []) as GastoFijo[], anio, mes);
    for (const g of activeFijos) {
      if (!g.activo) continue;
      const cat = g.categoria || "Sin categoría";
      totals.set(cat, (totals.get(cat) ?? 0) + toArs(g.monto, g.moneda));
    }

    // Cuotas activas para el mes
    const mesIdx = anio * 12 + mes;
    for (const c of ok(cuoRes.data, cuoRes.error, []) as { id: number; monto_cuota: number; moneda: string; total_cuotas: number; mes_inicio: number; anio_inicio: number; activa: number; categoria: string }[]) {
      if (pausedIds.has(c.id)) continue;
      const inicio = c.anio_inicio * 12 + c.mes_inicio;
      const fin    = inicio + c.total_cuotas - 1;
      if (mesIdx < inicio || mesIdx > fin) continue;
      const cat = c.categoria || "Sin categoría";
      totals.set(cat, (totals.get(cat) ?? 0) + toArs(c.monto_cuota, c.moneda));
    }

    const FALLBACK_COLORS: Record<string, string> = {
      "Sin categoría": "#6b7280",
    };

    return Array.from(totals.entries())
      .map(([categoria, total]) => ({
        categoria,
        color: colorMap.get(categoria) ?? FALLBACK_COLORS[categoria] ?? "#6366f1",
        total,
      }))
      .filter((b) => b.total > 0)
      .sort((a, b) => b.total - a.total);
  },
};

// ─── Presupuesto (% del sueldo) ───────────────────────────────────────────────

export interface Presupuesto {
  pct_ahorro: number;
  pct_cuotas: number;
  pct_gastos: number;
}

const PRESUPUESTO_DEFAULT: Presupuesto = { pct_ahorro: 20, pct_cuotas: 30, pct_gastos: 50 };

export const presupuestoApi = {
  get: async (): Promise<Presupuesto> => {
    // Si la tabla todavía no existe (migración sin correr) o hay error, usamos
    // los valores por defecto en vez de romper el Dashboard.
    const { data, error } = await supabase
      .from("presupuesto").select("pct_ahorro, pct_cuotas, pct_gastos").maybeSingle();
    if (error) return PRESUPUESTO_DEFAULT;
    return data ?? PRESUPUESTO_DEFAULT;
  },

  upsert: async (body: Presupuesto): Promise<Presupuesto> => {
    const { data, error } = await supabase
      .from("presupuesto")
      .upsert({ ...body, user_id: await uid() }, { onConflict: "user_id" })
      .select("pct_ahorro, pct_cuotas, pct_gastos").single();
    return ok(data, error);
  },
};

// Ahorro depositado en metas durante un mes (usado como "ahorro usado" del presupuesto).
export const ahorroMesApi = {
  get: async (anio: number, mes: number): Promise<number> => {
    const start = `${anio}-${String(mes).padStart(2, "0")}-01`;
    const nextM = mes === 12 ? 1 : mes + 1;
    const nextY = mes === 12 ? anio + 1 : anio;
    const end = `${nextY}-${String(nextM).padStart(2, "0")}-01`;
    const { data, error } = await supabase
      .from("depositos_ahorro").select("monto, fecha").gte("fecha", start).lt("fecha", end);
    if (error) return 0;
    return (data ?? []).reduce((s: number, d: { monto: number }) => s + d.monto, 0);
  },
};
