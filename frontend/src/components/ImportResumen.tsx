import { useEffect, useMemo, useState } from "react";
import { gastosApi, type GastoMensual, type GastoMensualCreate, type Categoria, type Tarjeta } from "../api_client";
import { Modal } from "./Modal";
import type { StmtTx, ParsedStatement } from "../lib/galiciaParser";
import "./ImportResumen.css";

interface Props {
  anio: number;
  mes: number;
  gastos: GastoMensual[];
  tarjetas: Tarjeta[];
  categorias: Categoria[];
  onClose: () => void;
  onApplied: () => void;
}

function fmt(n: number, moneda: string) {
  if (moneda === "USD") return `U$D ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}
function fmtFecha(iso: string) { const [, m, d] = iso.split("-"); return `${d}/${m}`; }

export default function ImportResumen({ anio, mes, gastos, tarjetas, categorias, onClose, onApplied }: Props) {
  const [step, setStep] = useState<"pick" | "parsing" | "review">("pick");
  const [parsed, setParsed] = useState<ParsedStatement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const [addSet, setAddSet] = useState<Set<number>>(new Set());
  const [fixSet, setFixSet] = useState<Set<number>>(new Set());
  const [categoria, setCategoria] = useState("Otros");
  const [tarjetaId, setTarjetaId] = useState<number | null>(null);

  async function handleFile(file: File) {
    setStep("parsing");
    setError(null);
    try {
      const { extractPdfLines } = await import("../lib/pdfText");
      const { parseGaliciaStatement } = await import("../lib/galiciaParser");
      const lines = await extractPdfLines(file);
      const res = parseGaliciaStatement(lines);
      if (res.transacciones.length === 0) {
        setError("No se detectaron consumos en el PDF. ¿Es un resumen de Galicia?");
        setStep("pick");
        return;
      }
      setParsed(res);
      // Adivinar la tarjeta del usuario según la marca detectada.
      const guess = tarjetas.find((t) =>
        res.tarjeta && (t.nombre.toUpperCase().includes(res.tarjeta) || t.tipo.toUpperCase().includes(res.tarjeta.slice(0, 4)))
      );
      setTarjetaId(guess?.id ?? null);
      setCategoria(categorias.some((c) => c.nombre === "Otros") ? "Otros" : (categorias[0]?.nombre ?? "Otros"));
      setStep("review");
    } catch (e) {
      setError("No pude leer el PDF: " + (e as Error).message);
      setStep("pick");
    }
  }

  // Matching: cada compra del resumen contra los gastos ya cargados (por monto+moneda).
  const recon = useMemo(() => {
    const compras = (parsed?.transacciones ?? []).filter((t) => t.tipo === "compra");
    const cuotas  = (parsed?.transacciones ?? []).filter((t) => t.tipo === "cuota");
    const used = new Set<number>();
    const coincidencias: { tx: StmtTx; gasto: GastoMensual }[] = [];
    const faltantes: StmtTx[] = [];
    for (const tx of compras) {
      const g = gastos.find((g) => !used.has(g.id) && g.moneda === tx.moneda && Math.abs(g.monto - tx.monto) < 0.5);
      if (g) { used.add(g.id); coincidencias.push({ tx, gasto: g }); }
      else faltantes.push(tx);
    }
    return { compras, cuotas, coincidencias, faltantes, usedIds: used };
  }, [parsed, gastos]);

  // Inicializar selecciones cuando se parsea un resumen nuevo.
  useEffect(() => {
    if (!parsed) return;
    setAddSet(new Set(recon.faltantes.map((_, i) => i)));
    setFixSet(new Set(recon.coincidencias.map((_, i) => i).filter((i) => recon.coincidencias[i].gasto.fecha !== recon.coincidencias[i].tx.fecha)));
  }, [parsed]); // eslint-disable-line react-hooks/exhaustive-deps

  const sobrantes = gastos.filter((g) => g.tarjeta_id === tarjetaId && tarjetaId !== null && !recon.usedIds.has(g.id));

  function toggle(set: Set<number>, setter: (s: Set<number>) => void, i: number) {
    const n = new Set(set);
    n.has(i) ? n.delete(i) : n.add(i);
    setter(n);
  }

  async function apply() {
    setApplying(true);
    setError(null);
    try {
      const toAdd: GastoMensualCreate[] = recon.faltantes
        .filter((_, i) => addSet.has(i))
        .map((tx) => ({
          mes, anio, nombre: tx.descripcion, monto: tx.monto, categoria,
          moneda: tx.moneda, nota: null, fecha: tx.fecha, tarjeta_id: tarjetaId, verificado: true,
        }));
      await gastosApi.createMany(toAdd);

      for (let i = 0; i < recon.coincidencias.length; i++) {
        const c = recon.coincidencias[i];
        if (fixSet.has(i) && c.gasto.fecha !== c.tx.fecha) {
          await gastosApi.update(c.gasto.id, { fecha: c.tx.fecha });
        }
      }
      await gastosApi.marcarVerificados(recon.coincidencias.map((c) => c.gasto.id));

      onApplied();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setApplying(false);
    }
  }

  const totalResumen = recon.compras.reduce((s, t) => s + (t.moneda === "ARS" ? t.monto : 0), 0);
  const totalCargado = recon.coincidencias.reduce((s, c) => s + (c.tx.moneda === "ARS" ? c.tx.monto : 0), 0);

  return (
    <Modal title="Importar resumen de tarjeta" size="lg" onClose={onClose}>
      {error && <p className="ir-error">{error}</p>}

      {step === "pick" && (
        <div className="ir-pick">
          <p className="ir-hint">
            Elegí el PDF del resumen de tu tarjeta Galicia (Visa o Mastercard). Se lee en tu
            dispositivo, no se sube a ningún lado. Vas a poder revisar antes de aplicar nada.
          </p>
          <label className="ir-drop">
            <input type="file" accept="application/pdf,.pdf" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>Elegir PDF del resumen</span>
          </label>
        </div>
      )}

      {step === "parsing" && (
        <div className="ir-loading"><div className="spinner" /><span>Leyendo el resumen...</span></div>
      )}

      {step === "review" && parsed && (
        <div className="ir-review">
          {/* Encabezado: tarjeta + categoría para nuevos */}
          <div className="ir-controls">
            <div className="ir-badge">Detectado: <b>{parsed.tarjeta ?? "—"}</b></div>
            <label className="ir-ctrl">
              Tarjeta
              <select value={tarjetaId ?? ""} onChange={(e) => setTarjetaId(e.target.value ? parseInt(e.target.value) : null)}>
                <option value="">Efectivo / Débito</option>
                {tarjetas.map((t) => <option key={t.id} value={t.id}>{t.nombre} ···{t.ultimos_4}</option>)}
              </select>
            </label>
            <label className="ir-ctrl">
              Categoría (nuevos)
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                {categorias.length ? categorias.map((c) => <option key={c.id} value={c.nombre}>{c.nombre}</option>) : <option>Otros</option>}
              </select>
            </label>
          </div>

          {/* Faltantes */}
          <section className="ir-sec">
            <h4 className="ir-sec__title ir-add">➕ Faltantes — agregar ({recon.faltantes.length})</h4>
            {recon.faltantes.length === 0 ? <p className="ir-empty">Nada para agregar, ya está todo cargado 🎉</p> : (
              <ul className="ir-list">
                {recon.faltantes.map((tx, i) => (
                  <li key={i} className="ir-row">
                    <input type="checkbox" checked={addSet.has(i)} onChange={() => toggle(addSet, setAddSet, i)} />
                    <span className="ir-date">{fmtFecha(tx.fecha)}</span>
                    <span className="ir-desc">{tx.descripcion}</span>
                    <span className="ir-amount">{fmt(tx.monto, tx.moneda)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Coincidencias */}
          <section className="ir-sec">
            <h4 className="ir-sec__title ir-ok">✅ Coincidencias — ya cargadas ({recon.coincidencias.length})</h4>
            {recon.coincidencias.length === 0 ? <p className="ir-empty">—</p> : (
              <ul className="ir-list">
                {recon.coincidencias.map((c, i) => {
                  const diff = c.gasto.fecha !== c.tx.fecha;
                  return (
                    <li key={i} className="ir-row">
                      <span className="ir-check">✓</span>
                      <span className="ir-desc">{c.gasto.nombre}</span>
                      <span className="ir-amount">{fmt(c.tx.monto, c.tx.moneda)}</span>
                      {diff && (
                        <label className="ir-fix">
                          <input type="checkbox" checked={fixSet.has(i)} onChange={() => toggle(fixSet, setFixSet, i)} />
                          corregir fecha {fmtFecha(c.gasto.fecha ?? "")}→{fmtFecha(c.tx.fecha)}
                        </label>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Sobrantes */}
          {sobrantes.length > 0 && (
            <section className="ir-sec">
              <h4 className="ir-sec__title ir-warn">⚠️ En la app pero no en el resumen ({sobrantes.length})</h4>
              <ul className="ir-list">
                {sobrantes.map((g) => (
                  <li key={g.id} className="ir-row ir-muted">
                    <span className="ir-desc">{g.nombre}</span>
                    <span className="ir-amount">{fmt(g.monto, g.moneda)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Cuotas (informativo) */}
          {recon.cuotas.length > 0 && (
            <section className="ir-sec">
              <h4 className="ir-sec__title">🧾 Cuotas en el resumen ({recon.cuotas.length}) — verificá que estén en la sección Cuotas</h4>
              <ul className="ir-list">
                {recon.cuotas.map((t, i) => (
                  <li key={i} className="ir-row ir-muted">
                    <span className="ir-date">{t.cuota}</span>
                    <span className="ir-desc">{t.descripcion}</span>
                    <span className="ir-amount">{fmt(t.monto, t.moneda)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Totales + aplicar */}
          <div className="ir-footer">
            <div className="ir-totals">
              <span>Compras resumen (ARS): <b>{fmt(totalResumen, "ARS")}</b></span>
              <span>Ya cargado (ARS): <b>{fmt(totalCargado, "ARS")}</b></span>
            </div>
            <button className="btn-primary" onClick={apply} disabled={applying}>
              {applying ? "Aplicando..." : `Aplicar (${addSet.size} nuevos)`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
