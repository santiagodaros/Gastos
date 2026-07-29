/**
 * Parser de resúmenes de tarjeta Galicia (VISA / MASTERCARD).
 * Recibe las líneas de texto del PDF (ver pdfText.ts) y devuelve las
 * transacciones del "DETALLE DEL CONSUMO".
 *
 * Soporta los dos formatos de Galicia:
 *  - MASTERCARD: fecha con nombre de mes (31-May-26).
 *  - VISA:       fecha numérica (28-05-26).
 * Las cuotas se detectan por el token NN/MM en la línea (sirve para ambas).
 */

export interface StmtTx {
  fecha: string;               // YYYY-MM-DD
  descripcion: string;
  monto: number;               // positivo, en su moneda
  moneda: "ARS" | "USD";
  tipo: "compra" | "cuota";
  cuota?: string;              // "03/03" si es cuota
}

export interface ParsedStatement {
  tarjeta: "VISA" | "MASTERCARD" | null;
  transacciones: StmtTx[];
}

const MESES: Record<string, string> = {
  ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06",
  jul: "07", ago: "08", sep: "09", set: "09", oct: "10", nov: "11", dic: "12",
};

const AMOUNT_RE = /(-?)(\d{1,3}(?:\.\d{3})*,\d{2})/g;
// Fecha al inicio: dd-Mmm-yy (Mastercard) o dd-mm-yy (Visa).
const DATE_START_RE = /^(\d{2})-([A-Za-zÁÉÍÓÚáéíóú]{3}|\d{2})-(\d{2})\s+(.*)$/;
const CUOTA_RE = /\b(\d{2}\/\d{2})\b/;

// Líneas que NO son consumos (saldos, pagos, percepciones, intereses, totales…).
const SKIP_RE = /SALDO|SU PAGO|SUBTOTAL|TOTAL|PERCEP|DEV PER|\bIVA\b|CONSOLIDADO|L[IÍ]MITE|TASA|PENDIENTE|ANTERIOR|INTERES|IIBB|\bRG\b|CREDITO PROV/i;

function parseMonto(s: string): number {
  return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
}

function toISO(dd: string, mon: string, yy: string): string | null {
  const mm = /^\d{2}$/.test(mon) ? mon : MESES[mon.toLowerCase().slice(0, 3)];
  if (!mm || mm < "01" || mm > "12") return null;
  return `20${yy}-${mm}-${dd}`;
}

export function parseGaliciaStatement(lines: string[]): ParsedStatement {
  const text = lines.join("\n");
  const tarjeta: ParsedStatement["tarjeta"] =
    /MASTERCARD/i.test(text) ? "MASTERCARD" : /VISA/i.test(text) ? "VISA" : null;

  const transacciones: StmtTx[] = [];

  for (const line of lines) {
    if (SKIP_RE.test(line)) continue;

    const m = DATE_START_RE.exec(line);
    if (!m) continue;

    const [, dd, mon, yy, rest] = m;
    const fecha = toISO(dd, mon, yy);
    if (!fecha) continue;

    // El monto es el último importe con formato AR de la línea. Sin importe
    // no es un consumo (ej: la fila de fechas de vencimiento). Si es negativo,
    // es un crédito/reintegro → no es una compra, lo salteamos.
    const matches = [...rest.matchAll(AMOUNT_RE)];
    if (matches.length === 0) continue;
    const last = matches[matches.length - 1];
    if (last[1] === "-") continue;
    const monto = parseMonto(last[2]);
    if (monto <= 0) continue;

    const moneda: StmtTx["moneda"] = /USD|U\$S/i.test(line) ? "USD" : "ARS";
    const cuotaMatch = rest.match(CUOTA_RE);

    // Descripción: saco paréntesis USD, corto en el comprobante/monto, limpio
    // flags iniciales (K, *), token de cuota y "USD" colgado.
    let desc = rest.replace(/\(USA,USD,[^)]*\)/i, " ");
    const cut = desc.search(/\s+\d{5,}\b|\s+-?\d{1,3}(?:\.\d{3})*,\d{2}/);
    if (cut > 0) desc = desc.slice(0, cut);
    desc = desc
      .replace(/\b\d{2}\/\d{2}\b/, "")
      .replace(/^[*K]\s+/i, "")
      .replace(/\bUSD\b\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim();

    transacciones.push({
      fecha,
      descripcion: desc || "(sin descripción)",
      monto,
      moneda,
      tipo: cuotaMatch ? "cuota" : "compra",
      cuota: cuotaMatch?.[1],
    });
  }

  return { tarjeta, transacciones };
}
