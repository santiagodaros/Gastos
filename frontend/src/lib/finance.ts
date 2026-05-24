/**
 * Business logic — replaces FastAPI endpoints.
 * Pure TypeScript functions: no side effects, no Supabase calls.
 */

import type {
  GastoFijo, GastoMensual, Ingresos, Cuota,
  Resumen, ResumenMes, ProyeccionMes, CuotaProyectada,
} from "../api_client";

// ─── Currency ────────────────────────────────────────────────────────────────

export function pesificar(monto: number, moneda: string, dolarRate: number): number {
  return moneda === "USD" ? monto * dolarRate : monto;
}

// ─── Dólar rate (external API) ───────────────────────────────────────────────

let _cache: { rate: number; ts: number } | null = null;
const TTL = 3_600_000; // 1 hour

export async function getCotizacionDolar(): Promise<number> {
  if (_cache && Date.now() - _cache.ts < TTL) return _cache.rate;
  try {
    const res = await fetch("https://dolarapi.com/v1/dolares/oficial");
    if (!res.ok) throw new Error("status " + res.status);
    const data = await res.json();
    const rate = (data.venta as number) ?? 1000;
    _cache = { rate, ts: Date.now() };
    return rate;
  } catch {
    return _cache?.rate ?? 1000;
  }
}

// ─── Gastos Fijos — temporal model ───────────────────────────────────────────

/**
 * Given all gastos_fijos rows, returns the active ones for a specific month.
 * For each grupo_id, picks the latest version where vigente_desde <= (anio, mes).
 */
export function getActiveFijosForMonth(
  fijos: GastoFijo[],
  anio: number,
  mes: number
): GastoFijo[] {
  const periodo = anio * 12 + mes;
  const grupos = new Map<number, GastoFijo>();

  for (const fijo of fijos) {
    const fijoPeriodo = fijo.anio * 12 + fijo.mes;
    if (fijoPeriodo > periodo) continue;

    const current = grupos.get(fijo.grupo_id);
    if (!current || fijoPeriodo > current.anio * 12 + current.mes) {
      grupos.set(fijo.grupo_id, fijo);
    }
  }

  return [...grupos.values()].filter((f) => f.activo === 1);
}

// ─── Cuotas ──────────────────────────────────────────────────────────────────

function cuotaEnMes(c: Cuota, anio: number, mes: number): number {
  const n =
    c.cuota_actual + (anio - c.anio_inicio) * 12 + (mes - c.mes_inicio);
  if (n < 1 || n > c.total_cuotas) return 0;
  return c.monto_cuota;
}

// ─── Resumen ─────────────────────────────────────────────────────────────────

export function calcularResumen(
  anio: number,
  mes: number,
  ingresos: Ingresos | null,
  allFijos: GastoFijo[],
  mensuales: GastoMensual[],
  cuotas: Cuota[],
  pausadas: Set<number>,
  dolarRate: number
): Resumen {
  const sueldo = ingresos?.sueldo ?? 0;
  const otros  = ingresos?.otros  ?? 0;
  const ing    = sueldo + otros;

  const fijosDelMes = getActiveFijosForMonth(allFijos, anio, mes);
  const fij = fijosDelMes.reduce(
    (s, f) => s + pesificar(f.monto, f.moneda, dolarRate), 0
  );

  const men = mensuales.reduce(
    (s, g) => s + pesificar(g.monto, g.moneda, dolarRate), 0
  );

  const cuo = cuotas.reduce((s, c) => {
    if (pausadas.has(c.id)) return s;
    const m = cuotaEnMes(c, anio, mes);
    return s + pesificar(m, c.moneda, dolarRate);
  }, 0);

  const total = fij + men + cuo;
  return {
    mes, anio,
    ingresos: ing, sueldo, otros,
    gastos_fijos: fij, gastos_mensuales: men, cuotas: cuo,
    total_gastos: total, balance: ing - total,
    dolar_rate: dolarRate,
  };
}

// ─── Historial ───────────────────────────────────────────────────────────────

const MONTH_LABELS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

export function calcularHistorial(
  meses: number,
  allFijos: GastoFijo[],
  allIngresos: Ingresos[],
  allMensuales: GastoMensual[],
  allCuotas: Cuota[],
  allPausadas: { cuota_id: number; mes: number; anio: number }[],
  dolarRate: number
): ResumenMes[] {
  const today = new Date();
  const result: ResumenMes[] = [];

  for (let i = meses - 1; i >= 0; i--) {
    // Go back i months from today (0-indexed month arithmetic)
    const totalM = today.getFullYear() * 12 + today.getMonth() - i;
    const y = Math.floor(totalM / 12);
    const m = (totalM % 12) + 1;

    const ingresos  = allIngresos.find((ing) => ing.mes === m && ing.anio === y) ?? null;
    const mensuales = allMensuales.filter((g) => g.mes === m && g.anio === y);
    const pausadas  = new Set(
      allPausadas.filter((p) => p.mes === m && p.anio === y).map((p) => p.cuota_id)
    );

    const resumen = calcularResumen(y, m, ingresos, allFijos, mensuales, allCuotas, pausadas, dolarRate);
    result.push({ ...resumen, label: `${MONTH_LABELS[m - 1]} ${y}` });
  }

  return result;
}

// ─── Proyección ──────────────────────────────────────────────────────────────

export function calcularProyeccion(
  cuotas: Cuota[],
  dolarRate: number,
  meses: number
): ProyeccionMes[] {
  const today = new Date();
  const result: ProyeccionMes[] = [];

  for (let i = 0; i < meses; i++) {
    const totalM = today.getFullYear() * 12 + today.getMonth() + i;
    const y = Math.floor(totalM / 12);
    const m = (totalM % 12) + 1;

    const cuotasDelMes: CuotaProyectada[] = [];
    let totalArs = 0;

    for (const c of cuotas) {
      const numero = y * 12 + m - (c.anio_inicio * 12 + c.mes_inicio) + 1;
      if (numero >= 1 && numero <= c.total_cuotas) {
        const montoArs = c.moneda === "USD" ? c.monto_cuota * dolarRate : c.monto_cuota;
        totalArs += montoArs;
        cuotasDelMes.push({
          id: c.id,
          nombre: c.nombre,
          monto_ars: Math.round(montoArs * 100) / 100,
          numero_cuota: numero,
          total_cuotas: c.total_cuotas,
        });
      }
    }

    result.push({
      mes: m, anio: y,
      label: `${MONTH_LABELS[m - 1]} ${y}`,
      total_ars: Math.round(totalArs * 100) / 100,
      cuotas: cuotasDelMes,
    });
  }

  return result;
}
