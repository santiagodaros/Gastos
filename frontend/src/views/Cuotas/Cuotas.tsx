import { useState, useEffect } from "react";
import { cuotasApi, tarjetasApi, proyeccionApi, categoriasApi, comprobantesApi, type Cuota, type CuotaCreate, type Tarjeta, type ProyeccionMes, type Categoria } from "../../api_client";
import { Card, MetricCard } from "../../components/Card";
import { Modal, ConfirmModal } from "../../components/Modal";
import Lightbox from "../../components/Lightbox";
import { useToast } from "../../components/Toast";
import BarChart, { type BarChartBar } from "../../components/BarChart";
import "../../styles/abm.css";

const MONEDAS = ["ARS", "USD"];
const MONTHS  = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MESES_OPCIONES = [6, 12, 18, 24] as const;

function fmt(n: number, moneda = "ARS") {
  if (moneda === "USD") return `U$D ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

function fmtShort(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

const now = new Date();

const EMPTY_FORM: CuotaCreate = {
  nombre: "", monto_cuota: 0, cuota_actual: 1, total_cuotas: 12,
  mes_inicio: now.getMonth() + 1, anio_inicio: now.getFullYear(),
  activa: 1, moneda: "ARS", tarjeta_id: null, categoria: "Sin categoría", nota: null, comprobante_url: null,
};

type Tab = "lista" | "proyeccion";

export default function Cuotas() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("lista");

  // — Lista —
  const [items, setItems]       = useState<Cuota[]>([]);
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [modal, setModal]       = useState<"add" | "edit" | null>(null);
  const [editItem, setEditItem] = useState<Cuota | null>(null);
  const [form, setForm]         = useState<CuotaCreate>({ ...EMPTY_FORM });
  const [toDelete, setToDelete] = useState<Cuota | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showTerminadas, setShowTerminadas] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [viewPath, setViewPath] = useState<string | null>(null);

  // — Proyección —
  const [proyData, setProyData]         = useState<ProyeccionMes[]>([]);
  const [proyLoading, setProyLoading]   = useState(false);
  const [proyError, setProyError]       = useState<string | null>(null);
  const [meses, setMeses]               = useState(12);
  const [expandedMes, setExpandedMes]   = useState<string | null>(null);
  const [activeBarIdx, setActiveBarIdx] = useState<number | null>(null);

  function load() {
    setLoading(true);
    Promise.all([cuotasApi.list(), tarjetasApi.list(), categoriasApi.list()])
      .then(([c, t, cats]) => { setItems(c); setTarjetas(t); setCategorias(cats); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (tab !== "proyeccion") return;
    setProyLoading(true);
    setProyError(null);
    proyeccionApi.get(meses)
      .then(setProyData)
      .catch((e: Error) => setProyError(e.message))
      .finally(() => setProyLoading(false));
  }, [tab, meses]);

  // CRUD handlers
  function openAdd()  { setForm({ ...EMPTY_FORM }); setFile(null); setEditItem(null); setModal("add"); }
  function openEdit(item: Cuota) {
    setForm({ nombre: item.nombre, monto_cuota: item.monto_cuota, cuota_actual: item.cuota_actual,
      total_cuotas: item.total_cuotas, mes_inicio: item.mes_inicio, anio_inicio: item.anio_inicio,
      activa: item.activa, moneda: item.moneda, tarjeta_id: item.tarjeta_id,
      categoria: item.categoria || "Sin categoría", nota: item.nota ?? null, comprobante_url: item.comprobante_url ?? null });
    setFile(null); setEditItem(item); setModal("edit");
  }
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const body = { ...form };
      if (file) {
        const path = await comprobantesApi.upload(file);
        if (editItem?.comprobante_url && editItem.comprobante_url !== path) await comprobantesApi.remove(editItem.comprobante_url);
        body.comprobante_url = path;
      } else if (modal === "edit" && editItem?.comprobante_url && !form.comprobante_url) {
        await comprobantesApi.remove(editItem.comprobante_url);
      }
      if (modal === "edit" && editItem) { await cuotasApi.update(editItem.id, body); toast.success("Cuota actualizada"); }
      else { await cuotasApi.create(body); toast.success("Cuota agregada"); }
      setModal(null); load();
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }
  async function handleDelete() {
    if (!toDelete) return; setDeleting(true);
    try {
      if (toDelete.comprobante_url) await comprobantesApi.remove(toDelete.comprobante_url);
      await cuotasApi.delete(toDelete.id); toast.success("Cuota eliminada"); setToDelete(null); load();
    }
    catch (e: unknown) { toast.error((e as Error).message); }
    finally { setDeleting(false); }
  }
  function tarjetaNombre(id: number | null) {
    if (!id) return null;
    const t = tarjetas.find((t) => t.id === id);
    return t ? `${t.nombre} ···${t.ultimos_4}` : null;
  }

  // Proyección helpers
  function mesKey(mes: number, anio: number) { return `${anio}-${mes}`; }
  const totalArs = proyData.reduce((s, d) => s + d.total_ars, 0);
  const bars: BarChartBar[] = proyData.map((d, i) => ({
    label: d.label.split(" ")[0],
    value: d.total_ars,
    detail: `${d.cuotas.length} cuota${d.cuotas.length !== 1 ? "s" : ""}`,
    isCurrent: i === 0 && d.mes === now.getMonth() + 1 && d.anio === now.getFullYear(),
  }));
  function handleBarClick(idx: number) {
    const item = proyData[idx];
    if (!item) return;
    setActiveBarIdx(idx);
    setExpandedMes((prev) => { const k = mesKey(item.mes, item.anio); return prev === k ? null : k; });
  }

  // Una cuota está "terminada" cuando su última cuota ya pasó (por fecha).
  // Sigue en la DB (historial), pero deja de contar y se puede ocultar.
  const curPeriod = now.getFullYear() * 12 + now.getMonth() + 1;
  const isFinished = (c: Cuota) =>
    c.anio_inicio * 12 + c.mes_inicio + c.total_cuotas - 1 < curPeriod;

  const terminadas = items.filter(isFinished);
  const vigentes   = items.filter((c) => !isFinished(c));
  const activas    = vigentes.filter((i) => i.activa);
  const visibleItems = showTerminadas ? items : vigentes;

  return (
    <div className="abm">
      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.25rem", marginBottom: "1rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem" }}>
        {(["lista", "proyeccion"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "0.4rem 1rem",
              borderRadius: "6px",
              border: "none",
              fontSize: "0.875rem",
              fontWeight: tab === t ? 600 : 400,
              cursor: "pointer",
              background: tab === t ? "var(--accent)" : "transparent",
              color: tab === t ? "#fff" : "var(--text-muted)",
              transition: "all 0.15s",
            }}
          >
            {t === "lista" ? "Cuotas" : "Proyección"}
          </button>
        ))}
      </div>

      {/* ── TAB: LISTA ── */}
      {tab === "lista" && (
        <>
          <div className="abm__toolbar">
            <div className="abm__toolbar-left">
              <span className="badge badge--neutral">{activas.length} activas</span>
              {terminadas.length > 0 && (
                <button
                  className="btn-ghost"
                  style={{ fontSize: "var(--text-xs)", padding: "0.3rem 0.7rem" }}
                  onClick={() => setShowTerminadas((v) => !v)}
                >
                  {showTerminadas ? "Ocultar" : "Ver"} terminadas ({terminadas.length})
                </button>
              )}
            </div>
            <button className="btn-primary" onClick={openAdd}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Agregar
            </button>
          </div>

          <Card>
            {loading ? (
              <div className="abm-loading"><div className="spinner" /></div>
            ) : items.length === 0 ? (
              <div className="abm-empty">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
                </svg>
                Sin cuotas registradas
              </div>
            ) : (
              <table className="abm-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Progreso</th>
                    <th style={{ textAlign: "right" }}>Monto/cuota</th>
                    <th>Tarjeta</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((item) => {
                    const pct = item.total_cuotas > 0 ? (item.cuota_actual / item.total_cuotas) * 100 : 0;
                    return (
                      <tr key={item.id} style={{ opacity: item.activa ? 1 : 0.45 }}>
                        <td>
                          <span style={{ color: "var(--text-primary)", fontWeight: "var(--font-medium)" }}>{item.nombre}</span>
                          {item.comprobante_url && (
                            <button onClick={() => setViewPath(item.comprobante_url!)} title="Ver comprobante" style={{ marginLeft: 6, background: "none", border: "none", cursor: "pointer" }}>📎</button>
                          )}
                          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2 }}>
                            Inicio: {MONTHS[item.mes_inicio - 1]} {item.anio_inicio}
                          </div>
                          {item.nota && <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 1 }}>{item.nota}</div>}
                        </td>
                        <td style={{ minWidth: 120 }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                            <div className="progress-bar">
                              <div className="progress-bar__fill" style={{ width: `${Math.min(100, pct)}%`, background: "var(--warning)" }} />
                            </div>
                            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                              {item.cuota_actual} / {item.total_cuotas}
                            </span>
                          </div>
                        </td>
                        <td className="num">{fmt(item.monto_cuota, item.moneda)}</td>
                        <td>
                          {tarjetaNombre(item.tarjeta_id)
                            ? <span className="badge badge--accent">{tarjetaNombre(item.tarjeta_id)}</span>
                            : <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>—</span>}
                        </td>
                        <td>
                          {isFinished(item) ? (
                            <span className="badge badge--neutral">Terminada</span>
                          ) : (
                            <span className={`badge ${item.activa ? "badge--positive" : "badge--neutral"}`}>
                              {item.activa ? "Activa" : "Pausada"}
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="row-actions">
                            <button className="row-action-btn" onClick={() => openEdit(item)} title="Editar">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button className="row-action-btn danger" onClick={() => setToDelete(item)} title="Eliminar">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}

      {/* ── TAB: PROYECCIÓN ── */}
      {tab === "proyeccion" && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginBottom: "1rem", gap: "0.25rem" }}>
            {MESES_OPCIONES.map((m) => (
              <button
                key={m}
                onClick={() => setMeses(m)}
                style={{
                  padding: "0.35rem 0.75rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  fontSize: "0.8rem",
                  fontWeight: meses === m ? 600 : 400,
                  cursor: "pointer",
                  background: meses === m ? "var(--accent)" : "transparent",
                  color: meses === m ? "#fff" : "var(--text-muted)",
                  transition: "all 0.15s",
                }}
              >
                {m}m
              </button>
            ))}
          </div>

          {proyLoading && (
            <div className="abm-loading"><div className="spinner" /></div>
          )}

          {proyError && !proyLoading && (
            <p style={{ color: "var(--negative)", fontSize: "var(--text-sm)" }}>{proyError}</p>
          )}

          {!proyLoading && !proyError && proyData.length > 0 && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                <MetricCard
                  label={`Total próximos ${meses} meses`}
                  value={fmtShort(totalArs)}
                  valueColor="warning"
                  variant="warning"
                  icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>}
                  footer={fmt(totalArs)}
                  badge={{ text: `${proyData.filter((d) => d.cuotas.length > 0).length} meses con cuotas`, type: "warning" }}
                />
                <MetricCard
                  label="Promedio mensual"
                  value={fmtShort(totalArs / proyData.length)}
                  valueColor="accent"
                  variant="accent"
                  icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" /></svg>}
                  footer={fmt(totalArs / proyData.length)}
                />
              </div>

              <Card>
                <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "1rem" }}>
                  Evolución mensual en ARS
                </p>
                <BarChart
                  data={bars}
                  height={220}
                  formatValue={(v) => v.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })}
                  onBarClick={handleBarClick}
                  activeIndex={activeBarIdx}
                />
                <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: "0.5rem", textAlign: "center" }}>
                  Hacé clic en una barra para ver el detalle del mes
                </p>
              </Card>

              <Card>
                <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.75rem" }}>
                  Detalle por mes
                </p>
                <div>
                  {proyData.map((item, idx) => {
                    const key = mesKey(item.mes, item.anio);
                    const isExpanded = expandedMes === key;
                    const isActive   = activeBarIdx === idx;
                    return (
                      <div key={key} style={{ borderBottom: "1px solid var(--border)", background: isActive ? "var(--surface-raised)" : "transparent", borderRadius: isActive ? "6px" : "0" }}>
                        <button
                          onClick={() => { setActiveBarIdx(idx); setExpandedMes((p) => p === key ? null : key); }}
                          style={{ display: "flex", alignItems: "center", gap: "0.75rem", width: "100%", padding: "0.75rem 0.5rem", background: "none", border: "none", cursor: "pointer", color: "var(--text)" }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                            style={{ transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}>
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                          <span style={{ flex: 1, textAlign: "left", fontWeight: 500, fontSize: "0.875rem" }}>{item.label}</span>
                          <span className="badge badge--neutral">{item.cuotas.length} cuota{item.cuotas.length !== 1 ? "s" : ""}</span>
                          <span style={{ fontWeight: 600, fontSize: "0.875rem", minWidth: 90, textAlign: "right" }}>
                            {item.total_ars > 0 ? fmt(item.total_ars) : "—"}
                          </span>
                        </button>
                        {isExpanded && (
                          <div style={{ padding: "0 0.5rem 0.75rem 2rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                            {item.cuotas.length === 0
                              ? <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Sin cuotas activas este mes</span>
                              : item.cuotas.map((c) => (
                                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem" }}>
                                  <span style={{ flex: 1, color: "var(--text)" }}>{c.nombre}</span>
                                  <span style={{ color: "var(--text-muted)" }}>{c.numero_cuota}/{c.total_cuotas}</span>
                                  <span style={{ fontWeight: 500, minWidth: 80, textAlign: "right" }}>{fmt(c.monto_ars)}</span>
                                </div>
                              ))
                            }
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            </>
          )}
        </>
      )}

      {/* Modals */}
      {modal && (
        <Modal title={modal === "add" ? "Nueva Cuota" : "Editar Cuota"} onClose={() => setModal(null)}>
          <form className="form" onSubmit={handleSubmit}>
            <div className="form__field">
              <label className="form__label">Nombre</label>
              <input className="form__input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: TV, notebook..." required autoFocus />
            </div>
            <div className="form__row">
              <div className="form__field">
                <label className="form__label">Monto por cuota</label>
                <input className="form__input" type="number" min={0} step="0.01" value={form.monto_cuota || ""} onChange={(e) => setForm({ ...form, monto_cuota: parseFloat(e.target.value) || 0 })} required />
              </div>
              <div className="form__field">
                <label className="form__label">Moneda</label>
                <select className="form__select" value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value })}>
                  {MONEDAS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div className="form__row">
              <div className="form__field">
                <label className="form__label">Cuota actual</label>
                <input className="form__input" type="number" min={1} value={form.cuota_actual} onChange={(e) => setForm({ ...form, cuota_actual: parseInt(e.target.value) || 1 })} />
              </div>
              <div className="form__field">
                <label className="form__label">Total cuotas</label>
                <input className="form__input" type="number" min={1} value={form.total_cuotas} onChange={(e) => setForm({ ...form, total_cuotas: parseInt(e.target.value) || 1 })} />
              </div>
            </div>
            <div className="form__row">
              <div className="form__field">
                <label className="form__label">Mes inicio</label>
                <select className="form__select" value={form.mes_inicio} onChange={(e) => setForm({ ...form, mes_inicio: parseInt(e.target.value) })}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div className="form__field">
                <label className="form__label">Año inicio</label>
                <input className="form__input" type="number" value={form.anio_inicio} onChange={(e) => setForm({ ...form, anio_inicio: parseInt(e.target.value) || now.getFullYear() })} />
              </div>
            </div>
            {tarjetas.length > 0 && (
              <div className="form__field">
                <label className="form__label">Tarjeta</label>
                <select className="form__select" value={form.tarjeta_id ?? ""} onChange={(e) => setForm({ ...form, tarjeta_id: e.target.value ? parseInt(e.target.value) : null })}>
                  <option value="">Sin tarjeta</option>
                  {tarjetas.map((t) => <option key={t.id} value={t.id}>{t.nombre} ···{t.ultimos_4}</option>)}
                </select>
              </div>
            )}
            <div className="form__row">
              <div className="form__field">
                <label className="form__label">Categoría</label>
                <select className="form__select" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                  <option value="Sin categoría">Sin categoría</option>
                  {categorias.map((c) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                </select>
              </div>
              <div className="form__field">
                <label className="form__label">Estado</label>
                <select className="form__select" value={form.activa} onChange={(e) => setForm({ ...form, activa: parseInt(e.target.value) })}>
                  <option value={1}>Activa</option>
                  <option value={0}>Pausada</option>
                </select>
              </div>
            </div>
            <div className="form__field">
              <label className="form__label">Nota <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(opcional)</span></label>
              <textarea
                className="form__input"
                value={form.nota ?? ""}
                onChange={(e) => setForm({ ...form, nota: e.target.value || null })}
                placeholder="Ej: compré la tele en Cetrogar, 12 cuotas sin interés..."
                rows={2}
                style={{ resize: "vertical" }}
              />
            </div>
            <div className="form__field">
              <label className="form__label">Comprobante / factura <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(opcional)</span></label>
              {form.comprobante_url && !file ? (
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <button type="button" className="btn-ghost" onClick={() => setViewPath(form.comprobante_url!)}>📎 Ver adjunto</button>
                  <button type="button" className="btn-ghost" style={{ color: "var(--negative)" }} onClick={() => setForm({ ...form, comprobante_url: null })}>Quitar</button>
                </div>
              ) : (
                <>
                  <input type="file" accept="image/*,application/pdf" capture="environment"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }} />
                  {file && <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 4 }}>{file.name}</div>}
                </>
              )}
            </div>
            <div className="form__actions">
              <button type="button" className="btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button>
            </div>
          </form>
        </Modal>
      )}

      {toDelete && (
        <ConfirmModal subject={toDelete.nombre} onConfirm={handleDelete} onClose={() => setToDelete(null)} loading={deleting} />
      )}

      {viewPath && <Lightbox path={viewPath} onClose={() => setViewPath(null)} />}
    </div>
  );
}
