import { useEffect, useMemo, useState } from "react";
import {
  gastosApi, fijosApi, cuotasApi, tarjetasApi, categoriasApi, resumenesApi, comprobantesApi,
  type GastoMensual, type GastoMensualCreate, type GastoFijo, type Cuota, type CuotaCreate, type Categoria, type Tarjeta,
} from "../api_client";
import { Modal } from "./Modal";
import type { StmtTx, ParsedStatement } from "../lib/galiciaParser";
import "./ImportResumen.css";

interface Props {
  anio: number;
  mes: number;
  onClose: () => void;
  onApplied: () => void;
}

function fmt(n: number, moneda: string) {
  if (moneda === "USD") return `U$D ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}
function fmtFecha(iso: string) { const [, m, d] = iso.split("-"); return `${d}/${m}`; }
const near = (a: number, b: number) => Math.abs(a - b) < 0.5;

export default function ImportResumen({ anio, mes, onClose, onApplied }: Props) {
  const [step, setStep] = useState<"pick" | "parsing" | "review">("pick");
  const [parsed, setParsed] = useState<ParsedStatement | null>(null);
  const [savedResumenId, setSavedResumenId] = useState<number | null>(null);
  const [savedNote, setSavedNote] = useState<"nuevo" | "existente" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  // Datos del mes (los busca solo, para cruzar contra las 3 secciones).
  const [gastos, setGastos] = useState<GastoMensual[]>([]);
  const [fijos, setFijos] = useState<GastoFijo[]>([]);
  const [cuotas, setCuotas] = useState<Cuota[]>([]);
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);

  const [addSet, setAddSet] = useState<Set<number>>(new Set());
  const [addCuotaSet, setAddCuotaSet] = useState<Set<number>>(new Set());
  const [fixSet, setFixSet] = useState<Set<number>>(new Set());
  const [categoria, setCategoria] = useState("Otros");
  const [tarjetaId, setTarjetaId] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      gastosApi.list(anio, mes), fijosApi.list(anio, mes), cuotasApi.list(),
      tarjetasApi.list(), categoriasApi.list(),
    ]).then(([g, f, c, t, cats]) => {
      setGastos(g); setFijos(f); setCuotas(c); setTarjetas(t); setCategorias(cats);
      setCategoria(cats.some((x) => x.nombre === "Otros") ? "Otros" : (cats[0]?.nombre ?? "Otros"));
    }).catch((e) => setError((e as Error).message));
  }, [anio, mes]);

  async function handleFile(file: File) {
    setStep("parsing");
    setError(null);
    try {
      const { extractPdfLines } = await import("../lib/pdfText");
      const { parseGaliciaStatement } = await import("../lib/galiciaParser");
      const res = parseGaliciaStatement(await extractPdfLines(file));
      if (res.transacciones.length === 0) {
        setError("No se detectaron consumos en el PDF. ¿Es un resumen de Galicia?");
        setStep("pick");
        return;
      }
      setParsed(res);
      const guess = tarjetas.find((t) =>
        res.tarjeta && (t.nombre.toUpperCase().includes(res.tarjeta) || t.tipo.toUpperCase().includes(res.tarjeta.slice(0, 4)))
      );
      setTarjetaId(guess?.id ?? null);
      setStep("review");
      // Guardar el resumen en Documentos apenas se importa (sin esperar a "Aplicar").
      void guardarResumen(res, file, guess?.id ?? null);
    } catch (e) {
      setError("No pude leer el PDF: " + (e as Error).message);
      setStep("pick");
    }
  }

  // Sube el PDF + guarda el resumen (dedup por período + total + cantidad).
  async function guardarResumen(res: ParsedStatement, file: File, tid: number | null) {
    try {
      const txs = res.transacciones;
      const totalArs = txs.filter((t) => t.moneda !== "USD").reduce((s, t) => s + t.monto, 0);
      const totalUsd = txs.filter((t) => t.moneda === "USD").reduce((s, t) => s + t.monto, 0);

      const existentes = await resumenesApi.list();
      const dup = existentes.find((r) =>
        r.periodo_mes === mes && r.periodo_anio === anio &&
        r.cant_items === txs.length && Math.round(r.total_ars) === Math.round(totalArs));
      if (dup) { setSavedResumenId(dup.id); setSavedNote("existente"); return; }

      const pdfPath = await comprobantesApi.upload(file);
      const id = await resumenesApi.create({
        tarjeta: res.tarjeta ?? tarjetas.find((t) => t.id === tid)?.nombre ?? null,
        tarjeta_id: tid,
        periodo_mes: mes, periodo_anio: anio,
        total_ars: totalArs, total_usd: totalUsd, cant_items: txs.length,
        pdf_path: pdfPath,
      });
      setSavedResumenId(id);
      setSavedNote("nuevo");
    } catch { /* si falla el guardado del resumen, no bloquea la conciliación */ }
  }

  // Cruce contra las 3 secciones.
  const recon = useMemo(() => {
    const compras = (parsed?.transacciones ?? []).filter((t) => t.tipo === "compra");
    const cuotasTx = (parsed?.transacciones ?? []).filter((t) => t.tipo === "cuota");

    const usedG = new Set<number>();
    const usedF = new Set<number>();
    const enFijos: { tx: StmtTx; fijo: GastoFijo }[] = [];
    const enGastos: { tx: StmtTx; gasto: GastoMensual }[] = [];
    const faltantes: StmtTx[] = [];

    for (const tx of compras) {
      const fijo = fijos.find((f) => !usedF.has(f.id) && f.moneda === tx.moneda && near(f.monto, tx.monto));
      if (fijo) { usedF.add(fijo.id); enFijos.push({ tx, fijo }); continue; }
      const g = gastos.find((g) => !usedG.has(g.id) && g.moneda === tx.moneda && near(g.monto, tx.monto));
      if (g) { usedG.add(g.id); enGastos.push({ tx, gasto: g }); continue; }
      faltantes.push(tx);
    }

    const usedC = new Set<number>();
    const cuotasOk: { tx: StmtTx; cuota: Cuota }[] = [];
    const cuotasFalt: StmtTx[] = [];
    for (const tx of cuotasTx) {
      const c = cuotas.find((c) => !usedC.has(c.id) && c.moneda === tx.moneda && near(c.monto_cuota, tx.monto));
      if (c) { usedC.add(c.id); cuotasOk.push({ tx, cuota: c }); }
      else cuotasFalt.push(tx);
    }

    return { compras, enFijos, enGastos, faltantes, cuotasOk, cuotasFalt, usedG };
  }, [parsed, gastos, fijos, cuotas]);

  useEffect(() => {
    if (!parsed) return;
    setAddSet(new Set(recon.faltantes.map((_, i) => i)));
    setAddCuotaSet(new Set(recon.cuotasFalt.map((_, i) => i)));
    setFixSet(new Set(recon.enGastos.map((_, i) => i).filter((i) => recon.enGastos[i].gasto.fecha !== recon.enGastos[i].tx.fecha)));
  }, [parsed]); // eslint-disable-line react-hooks/exhaustive-deps

  const sobrantes = gastos.filter((g) => g.tarjeta_id === tarjetaId && tarjetaId !== null && !recon.usedG.has(g.id));

  function toggle(set: Set<number>, setter: (s: Set<number>) => void, i: number) {
    const n = new Set(set); n.has(i) ? n.delete(i) : n.add(i); setter(n);
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

      for (let i = 0; i < recon.enGastos.length; i++) {
        const c = recon.enGastos[i];
        if (fixSet.has(i) && c.gasto.fecha !== c.tx.fecha) {
          await gastosApi.update(c.gasto.id, { fecha: c.tx.fecha });
        }
      }
      await gastosApi.marcarVerificados(recon.enGastos.map((c) => c.gasto.id));

      // Crear las cuotas faltantes seleccionadas (en la sección Cuotas).
      // El resumen dice "NN/MM" = cuota NN de MM en el mes reconciliado. El modelo
      // de la app arranca en la cuota 1, así que calculo el mes de la cuota 1
      // (NN-1 meses hacia atrás) y guardo cuota_actual=1.
      for (let i = 0; i < recon.cuotasFalt.length; i++) {
        if (!addCuotaSet.has(i)) continue;
        const tx = recon.cuotasFalt[i];
        const [nn, mm] = (tx.cuota ?? "1/1").split("/").map((s) => parseInt(s) || 1);
        const startIdx = anio * 12 + (mes - 1) - (nn - 1);
        const body: CuotaCreate = {
          nombre: tx.descripcion, monto_cuota: tx.monto,
          cuota_actual: 1, total_cuotas: mm,
          mes_inicio: (startIdx % 12) + 1, anio_inicio: Math.floor(startIdx / 12),
          activa: 1, moneda: tx.moneda, tarjeta_id: tarjetaId,
          categoria: "Sin categoría", nota: null,
        };
        await cuotasApi.create(body);
      }

      // El resumen ya se guardó al importar; si cambiaste la tarjeta en la revisión, la reasigno.
      if (savedResumenId !== null) {
        try {
          await resumenesApi.setTarjeta(savedResumenId, tarjetaId, tarjetas.find((t) => t.id === tarjetaId)?.nombre ?? parsed?.tarjeta ?? null);
        } catch { /* no bloquea */ }
      }

      onApplied();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setApplying(false);
    }
  }

  const okCount = recon.enFijos.length + recon.enGastos.length + recon.cuotasOk.length;

  // Total neto del resumen (con signo): créditos/reintegros ya restan.
  const txs = parsed?.transacciones ?? [];
  const netArs = txs.filter((t) => t.moneda !== "USD").reduce((s, t) => s + t.monto, 0);
  const netUsd = txs.filter((t) => t.moneda === "USD").reduce((s, t) => s + t.monto, 0);
  const hayCreditos = txs.some((t) => t.monto < 0);

  return (
    <Modal title="Importar resumen de tarjeta" size="lg" onClose={onClose}>
      {error && <p className="ir-error">{error}</p>}

      {step === "pick" && (
        <div className="ir-pick">
          <p className="ir-hint">
            Elegí el PDF del resumen de tu tarjeta Galicia (Visa o Mastercard). Se lee en tu
            dispositivo, no se sube a ningún lado. Cruza contra <b>Gastos</b>, <b>Fijos</b> y
            <b> Cuotas</b>, y podés revisar antes de aplicar nada.
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
          <div className="ir-controls">
            <div className="ir-badge">Detectado: <b>{parsed.tarjeta ?? "—"}</b></div>
            {savedNote && (
              <div className="ir-badge ir-badge--ok">
                {savedNote === "nuevo" ? "✓ Guardado en Documentos" : "✓ Ya estaba en Documentos"}
              </div>
            )}
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

          {/* Faltantes → agregar a Gastos */}
          <section className="ir-sec">
            <h4 className="ir-sec__title ir-add">➕ Faltan en la app — agregar a Gastos ({recon.faltantes.length})</h4>
            {recon.faltantes.length === 0 ? <p className="ir-empty">Nada para agregar, está todo cargado 🎉</p> : (
              <ul className="ir-list">
                {recon.faltantes.map((tx, i) => (
                  <li key={i} className="ir-row">
                    <input type="checkbox" checked={addSet.has(i)} onChange={() => toggle(addSet, setAddSet, i)} />
                    <span className="ir-date">{fmtFecha(tx.fecha)}</span>
                    <span className="ir-desc">
                      {tx.descripcion}
                      {tx.monto < 0 && <span className="ir-tag" style={{ marginLeft: 6, color: "var(--positive)" }}>crédito / reintegro</span>}
                    </span>
                    <span className="ir-amount" style={tx.monto < 0 ? { color: "var(--positive)" } : undefined}>{fmt(tx.monto, tx.moneda)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Ya en Fijos */}
          {recon.enFijos.length > 0 && (
            <section className="ir-sec">
              <h4 className="ir-sec__title ir-ok">✅ Ya en Gastos Fijos ({recon.enFijos.length})</h4>
              <ul className="ir-list">
                {recon.enFijos.map((c, i) => (
                  <li key={i} className="ir-row"><span className="ir-check">✓</span>
                    <span className="ir-desc">{c.tx.descripcion} <span className="ir-tag">→ {c.fijo.nombre}</span></span>
                    <span className="ir-amount">{fmt(c.tx.monto, c.tx.moneda)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Ya en Gastos */}
          {recon.enGastos.length > 0 && (
            <section className="ir-sec">
              <h4 className="ir-sec__title ir-ok">✅ Ya en Gastos ({recon.enGastos.length})</h4>
              <ul className="ir-list">
                {recon.enGastos.map((c, i) => {
                  const diff = c.gasto.fecha !== c.tx.fecha;
                  return (
                    <li key={i} className="ir-row"><span className="ir-check">✓</span>
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
            </section>
          )}

          {/* Cuotas */}
          {(recon.cuotasOk.length > 0 || recon.cuotasFalt.length > 0) && (
            <section className="ir-sec">
              <h4 className="ir-sec__title">🧾 Cuotas del resumen ({recon.cuotasOk.length + recon.cuotasFalt.length})</h4>
              <ul className="ir-list">
                {recon.cuotasOk.map((c, i) => (
                  <li key={"ok" + i} className="ir-row"><span className="ir-check">✓</span>
                    <span className="ir-date">{c.tx.cuota}</span>
                    <span className="ir-desc">{c.tx.descripcion} <span className="ir-tag">→ {c.cuota.nombre}</span></span>
                    <span className="ir-amount">{fmt(c.tx.monto, c.tx.moneda)}</span>
                  </li>
                ))}
                {recon.cuotasFalt.map((t, i) => (
                  <li key={"f" + i} className="ir-row">
                    <input type="checkbox" checked={addCuotaSet.has(i)} onChange={() => toggle(addCuotaSet, setAddCuotaSet, i)} />
                    <span className="ir-date">{t.cuota}</span>
                    <span className="ir-desc">{t.descripcion} <span className="ir-tag ir-tag--warn">agregar a Cuotas</span></span>
                    <span className="ir-amount">{fmt(t.monto, t.moneda)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

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

          <div className="ir-footer">
            <div className="ir-totals">
              <span>{okCount} ya cargados · {recon.faltantes.length} faltan</span>
              <span>
                Total del resumen: <b>{fmt(netArs, "ARS")}</b>{netUsd !== 0 ? ` · ${fmt(netUsd, "USD")}` : ""}
                {hayCreditos && <span style={{ color: "var(--positive)", marginLeft: 6 }}>(ya con créditos restados)</span>}
              </span>
            </div>
            <button className="btn-primary" onClick={apply} disabled={applying}>
              {applying ? "Aplicando..." : `Aplicar (${addSet.size} gastos${addCuotaSet.size ? `, ${addCuotaSet.size} cuotas` : ""})`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
