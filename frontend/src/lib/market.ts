/**
 * Cotizaciones de mercado para la cartera de Metas.
 * APIs públicas, sin key, con CORS abierto:
 *  - data912.com        → acciones, CEDEARs, ONs y bonos AR (precio en vivo, ~15 min delay)
 *  - argentinadatos.com → VCP diario de FCI (CAFCI)
 *  - coingecko.com      → crypto (USD)
 */

export type TipoPosicion =
  | "fci" | "accion" | "cedear" | "bono" | "on" | "crypto" | "plazo_fijo" | "otro";

export const TIPOS_POSICION: { value: TipoPosicion; label: string; hint: string }[] = [
  { value: "fci",        label: "FCI",         hint: "Nombre exacto del fondo" },
  { value: "accion",     label: "Acción",      hint: "Ej: GGAL, YPFD" },
  { value: "cedear",     label: "CEDEAR",      hint: "Ej: AAPL, SPY" },
  { value: "bono",       label: "Bono",        hint: "Ej: AL30, GD30, S31O6" },
  { value: "on",         label: "ON",          hint: "Ej: YMCID, PN35O" },
  { value: "crypto",     label: "Crypto",      hint: "ID de CoinGecko: bitcoin, ethereum" },
  { value: "plazo_fijo", label: "Plazo fijo",  hint: "Sin cotización (valor manual)" },
  { value: "otro",       label: "Otro",        hint: "Sin cotización (valor manual)" },
];

/** Bonos y ONs cotizan cada 100 de valor nominal. */
export function factorNominal(tipo: string): number {
  return tipo === "bono" || tipo === "on" ? 0.01 : 1;
}

export interface Cotizacion {
  precio: number;
  /** variación diaria en %, si la fuente la informa */
  cambioDia?: number;
}

const TTL = 5 * 60_000;
const cache = new Map<string, { ts: number; data: Map<string, Cotizacion> }>();

async function cached(key: string, load: () => Promise<Map<string, Cotizacion>>) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL) return hit.data;
  try {
    const data = await load();
    cache.set(key, { ts: Date.now(), data });
    return data;
  } catch {
    // si falla la red devolvemos lo último que tengamos (aunque esté vencido)
    return hit?.data ?? new Map<string, Cotizacion>();
  }
}

async function getJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

function data912(panel: "arg_stocks" | "arg_cedears" | "arg_corp" | "arg_bonds") {
  return cached(panel, async () => {
    const rows = (await getJson(`https://data912.com/live/${panel}`)) as {
      symbol: string; c: number; pct_change?: number;
    }[];
    const out = new Map<string, Cotizacion>();
    for (const r of rows) {
      if (r.symbol && r.c > 0) out.set(r.symbol.toUpperCase(), { precio: r.c, cambioDia: r.pct_change });
    }
    return out;
  });
}

const FCI_CATEGORIAS = ["mercadoDinero", "rentaFija", "rentaVariable", "rentaMixta", "otros"];

function fci() {
  return cached("fci", async () => {
    const todos = await Promise.all(
      FCI_CATEGORIAS.map((c) =>
        getJson(`https://api.argentinadatos.com/v1/finanzas/fci/${c}/ultimo`).catch(() => []),
      ),
    );
    const out = new Map<string, Cotizacion>();
    for (const rows of todos as { fondo: string; vcp: number }[][]) {
      for (const r of rows) if (r.fondo && r.vcp > 0) out.set(r.fondo.toUpperCase(), { precio: r.vcp });
    }
    return out;
  });
}

function crypto(ids: string[]) {
  const key = "crypto:" + [...ids].sort().join(",");
  return cached(key, async () => {
    const json = (await getJson(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=usd&include_24hr_change=true`,
    )) as Record<string, { usd: number; usd_24h_change?: number }>;
    const out = new Map<string, Cotizacion>();
    for (const [id, v] of Object.entries(json)) {
      if (v.usd > 0) out.set(id.toUpperCase(), { precio: v.usd, cambioDia: v.usd_24h_change });
    }
    return out;
  });
}

/** Fuente de cada tipo (null = sin cotización automática). */
export function fuentePorTipo(tipo: string): Promise<Map<string, Cotizacion>> | null {
  switch (tipo) {
    case "accion": return data912("arg_stocks");
    case "cedear": return data912("arg_cedears");
    case "on":     return data912("arg_corp");
    case "bono":   return data912("arg_bonds");
    case "fci":    return fci();
    default:       return null;
  }
}

export interface PosicionLike { id: number; tipo: string; ticker: string }

/** Devuelve cotización por id de posición (las que no se pudieron resolver quedan fuera). */
export async function cotizarPosiciones(posiciones: PosicionLike[]): Promise<Map<number, Cotizacion>> {
  const out = new Map<number, Cotizacion>();
  const cryptoIds = posiciones.filter((p) => p.tipo === "crypto").map((p) => p.ticker.trim().toLowerCase());
  const tipos = [...new Set(posiciones.map((p) => p.tipo))].filter((t) => t !== "crypto");

  const [cryptoMap, ...mapas] = await Promise.all([
    cryptoIds.length ? crypto(cryptoIds) : Promise.resolve(new Map<string, Cotizacion>()),
    ...tipos.map((t) => fuentePorTipo(t) ?? Promise.resolve(new Map<string, Cotizacion>())),
  ]);
  const porTipo = new Map(tipos.map((t, i) => [t, mapas[i]]));

  for (const p of posiciones) {
    const key = p.ticker.trim().toUpperCase();
    const q = p.tipo === "crypto" ? cryptoMap.get(key) : porTipo.get(p.tipo)?.get(key);
    if (q) out.set(p.id, q);
  }
  return out;
}

/** Símbolos disponibles para autocompletar según el tipo. */
export async function simbolosDisponibles(tipo: string): Promise<string[]> {
  const src = fuentePorTipo(tipo);
  if (!src) return [];
  return [...(await src).keys()].sort();
}
