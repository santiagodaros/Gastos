import { useEffect, useMemo, useState } from "react";
import {
  comprobantesApi, resumenesApi, tarjetasApi,
  type ComprobanteItem, type ResumenImportado, type Tarjeta,
} from "../../api_client";
import Lightbox from "../../components/Lightbox";
import "./Documentos.css";

type Tab = "comprobantes" | "resumenes";

const MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const isPdf = (p: string) => p.toLowerCase().endsWith(".pdf");

function fmtArs(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}
function fmtUsd(n: number) {
  return `U$D ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtMonto(n: number, moneda: string) {
  return moneda === "USD" ? fmtUsd(n) : fmtArs(n);
}

export default function Documentos() {
  const [tab, setTab] = useState<Tab>("comprobantes");

  return (
    <div className="doc">
      <div className="doc__tabs">
        <button className={`doc__tab${tab === "comprobantes" ? " is-active" : ""}`} onClick={() => setTab("comprobantes")}>
          Comprobantes por mes
        </button>
        <button className={`doc__tab${tab === "resumenes" ? " is-active" : ""}`} onClick={() => setTab("resumenes")}>
          Resúmenes por tarjeta
        </button>
      </div>

      {tab === "comprobantes" ? <ComprobantesPorMes /> : <ResumenesPorTarjeta />}
    </div>
  );
}

// ─── Comprobantes agrupados por mes ────────────────────────────────────────────

function ComprobantesPorMes() {
  const [items, setItems] = useState<ComprobanteItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const list = await comprobantesApi.listItems();
      if (cancel) return;
      setItems(list);
      const imgPaths = list.filter((i) => !isPdf(i.path)).map((i) => i.path);
      const map = await comprobantesApi.signedUrls(imgPaths);
      if (!cancel) { setUrls(map); setLoading(false); }
    })();
    return () => { cancel = true; };
  }, []);

  const grupos = useMemo(() => {
    const by = new Map<string, ComprobanteItem[]>();
    for (const it of items) {
      const key = `${it.anio}-${String(it.mes).padStart(2, "0")}`;
      (by.get(key) ?? by.set(key, []).get(key)!).push(it);
    }
    return Array.from(by.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [items]);

  if (loading) return <div className="doc__loading"><div className="spinner" /></div>;
  if (!items.length) {
    return <div className="doc__empty">Todavía no hay comprobantes cargados. Subí una foto de un ticket desde un gasto o cuota (o mandásela al bot) y aparece acá.</div>;
  }

  return (
    <>
      {grupos.map(([key, its]) => {
        const [y, m] = key.split("-");
        return (
          <section key={key} className="doc__month">
            <div className="doc__month-head">
              <h3 className="doc__month-title">{MESES[parseInt(m)]} {y}</h3>
              <span className="doc__month-count">{its.length} comprobante{its.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="doc__grid">
              {its.map((it) => (
                <button key={`${it.tipo}-${it.id}`} className="doc__thumb" onClick={() => setView(it.path)} title={it.nombre}>
                  <div className="doc__thumb-img">
                    {isPdf(it.path) ? (
                      <span className="doc__pdf">PDF</span>
                    ) : urls[it.path] ? (
                      <img src={urls[it.path]} alt={it.nombre} loading="lazy" />
                    ) : (
                      <span className="doc__pdf">···</span>
                    )}
                    {it.tipo === "cuota" && <span className="doc__badge">cuota</span>}
                  </div>
                  <span className="doc__thumb-name">{it.nombre}</span>
                  <span className="doc__thumb-amount">{fmtMonto(it.monto, it.moneda)}</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
      {view && <Lightbox path={view} onClose={() => setView(null)} />}
    </>
  );
}

// ─── Resúmenes agrupados por tarjeta ───────────────────────────────────────────

function ResumenesPorTarjeta() {
  const [resumenes, setResumenes] = useState<ResumenImportado[]>([]);
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<string | null>(null);

  async function load() {
    const [r, t] = await Promise.all([resumenesApi.list(), tarjetasApi.list()]);
    setResumenes(r); setTarjetas(t); setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const tarjetaNombre = (r: ResumenImportado) => {
    const t = tarjetas.find((x) => x.id === r.tarjeta_id);
    if (t) return `${t.nombre} ···${t.ultimos_4}`;
    return r.tarjeta ?? "Sin tarjeta";
  };

  const grupos = useMemo(() => {
    const by = new Map<string, ResumenImportado[]>();
    for (const r of resumenes) {
      const key = tarjetaNombre(r);
      (by.get(key) ?? by.set(key, []).get(key)!).push(r);
    }
    return Array.from(by.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [resumenes, tarjetas]);

  async function borrar(r: ResumenImportado) {
    if (!confirm("¿Borrar este resumen guardado? (no toca los gastos ya cargados)")) return;
    await resumenesApi.delete(r.id, r.pdf_path);
    load();
  }

  if (loading) return <div className="doc__loading"><div className="spinner" /></div>;
  if (!resumenes.length) {
    return <div className="doc__empty">Todavía no importaste ningún resumen. Cuando importes uno desde Gastos, se guarda acá separado por tarjeta.</div>;
  }

  return (
    <>
      {grupos.map(([nombre, rs]) => (
        <section key={nombre} className="doc__card-group">
          <div className="doc__month-head">
            <h3 className="doc__month-title">{nombre}</h3>
            <span className="doc__month-count">{rs.length} resumen{rs.length !== 1 ? "es" : ""}</span>
          </div>
          <div className="doc__res-list">
            {rs.map((r) => (
              <div key={r.id} className="doc__res">
                <div className="doc__res-main">
                  <span className="doc__res-period">{MESES[r.periodo_mes]} {r.periodo_anio}</span>
                  <span className="doc__res-meta">{r.cant_items} consumos</span>
                </div>
                <div className="doc__res-totals">
                  <span>{fmtArs(r.total_ars)}</span>
                  {r.total_usd > 0 && <span className="doc__res-usd">{fmtUsd(r.total_usd)}</span>}
                </div>
                <div className="doc__res-actions">
                  {r.pdf_path && (
                    <button className="doc__link" onClick={() => setView(r.pdf_path)}>Ver PDF</button>
                  )}
                  <button className="doc__link doc__link--danger" onClick={() => borrar(r)}>Borrar</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      {view && <Lightbox path={view} onClose={() => setView(null)} />}
    </>
  );
}
