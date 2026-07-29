import { useState, useEffect } from "react";
import { metasApi, type MetaAhorro, type MetaAhorroCreate } from "../../api_client";
import { Card } from "../../components/Card";
import { Modal, ConfirmModal } from "../../components/Modal";
import "../../styles/abm.css";
import "./Metas.css";

function fmt(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

// Meses desde hoy hasta una fecha. Mínimo 1.
function mesesHasta(fechaStr: string | null): number {
  if (!fechaStr) return 12;
  const fecha = new Date(fechaStr);
  const hoy   = new Date();
  const m = (fecha.getFullYear() - hoy.getFullYear()) * 12 + (fecha.getMonth() - hoy.getMonth());
  return Math.max(1, m);
}

// Proyección con interés compuesto mensual a partir de TNA
function proyectar(acumulado: number, tna: number, meses: number) {
  if (tna <= 0 || acumulado <= 0) return { proyectado: acumulado, rendimiento: 0 };
  const r = Math.pow(1 + tna / 100, 1 / 12) - 1;  // tasa mensual efectiva
  const proyectado = acumulado * Math.pow(1 + r, meses);
  return { proyectado, rendimiento: proyectado - acumulado };
}

// Proyección de una inversión: capital que compone + aportes mensuales (anualidad).
function proyectarInversion(acumulado: number, tna: number, meses: number, aporte: number) {
  const r = tna > 0 ? Math.pow(1 + tna / 100, 1 / 12) - 1 : 0;
  const fvCapital = r > 0 ? acumulado * Math.pow(1 + r, meses) : acumulado;
  const fvAportes = r > 0 ? aporte * ((Math.pow(1 + r, meses) - 1) / r) : aporte * meses;
  const proyectado = fvCapital + fvAportes;
  const aportado = acumulado + aporte * meses;
  return { proyectado, aportado, rendimiento: proyectado - aportado };
}

const EMPTY_FORM: MetaAhorroCreate = {
  nombre: "",
  objetivo: 0,
  acumulado: 0,
  fecha_limite: null,
  prioridad: 2,
  activa: 1,
  tasa_rendimiento: 0,
  tipo: "meta",
  aporte_mensual: 0,
};

export default function Metas() {
  const [items, setItems]       = useState<MetaAhorro[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);

  const [modal, setModal]       = useState<"add" | "edit" | "depositar" | null>(null);
  const [editItem, setEditItem] = useState<MetaAhorro | null>(null);
  const [form, setForm]         = useState<MetaAhorroCreate>({ ...EMPTY_FORM });
  const [deposito, setDeposito] = useState(0);
  const [toDelete, setToDelete] = useState<MetaAhorro | null>(null);
  const [deleting, setDeleting] = useState(false);

  function load() {
    setLoading(true);
    metasApi.list()
      .then(setItems)
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setForm({ ...EMPTY_FORM });
    setEditItem(null);
    setModal("add");
  }

  function openEdit(item: MetaAhorro) {
    setForm({
      nombre: item.nombre,
      objetivo: item.objetivo,
      acumulado: item.acumulado,
      fecha_limite: item.fecha_limite,
      prioridad: item.prioridad,
      activa: item.activa,
      tasa_rendimiento: item.tasa_rendimiento ?? 0,
      tipo: item.tipo ?? "meta",
      aporte_mensual: item.aporte_mensual ?? 0,
    });
    setEditItem(item);
    setModal("edit");
  }

  function openDepositar(item: MetaAhorro) {
    setEditItem(item);
    setDeposito(0);
    setModal("depositar");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal === "edit" && editItem) {
        await metasApi.update(editItem.id, form);
      } else if (modal === "add") {
        await metasApi.create(form);
      }
      setModal(null);
      load();
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDepositar(e: React.FormEvent) {
    e.preventDefault();
    if (!editItem || deposito <= 0) return;
    setSaving(true);
    try {
      await metasApi.depositar(editItem.id, deposito);
      setModal(null);
      load();
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await metasApi.delete(toDelete.id);
      setToDelete(null);
      load();
    } finally {
      setDeleting(false);
    }
  }

  const PRIORIDAD_LABEL: Record<number, { label: string; cls: string }> = {
    1: { label: "Alta",  cls: "badge--negative" },
    2: { label: "Media", cls: "badge--warning"  },
    3: { label: "Baja",  cls: "badge--neutral"  },
  };

  const activas = items.filter((i) => i.activa);

  return (
    <div className="abm">
      <div className="abm__toolbar">
        <div className="abm__toolbar-left">
          <span className="badge badge--neutral">{activas.length} activas</span>
        </div>
        <button className="btn-primary" onClick={openAdd}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Nueva Meta
        </button>
      </div>

      {loading ? (
        <div className="abm-loading"><div className="spinner" /></div>
      ) : items.length === 0 ? (
        <div className="abm-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
          </svg>
          Sin metas de ahorro
        </div>
      ) : (
        <div className="metas-grid">
          {items.map((item) => {
            const tna    = item.tasa_rendimiento ?? 0;
            const meses  = mesesHasta(item.fecha_limite);

            // ── Card de INVERSIÓN (sin objetivo, con horizonte) ──
            if (item.tipo === "inversion") {
              const inv = proyectarInversion(item.acumulado, tna, meses, item.aporte_mensual ?? 0);
              const horizonteLabel = item.fecha_limite
                ? `al ${new Date(item.fecha_limite).toLocaleDateString("es-AR", { month: "short", year: "numeric" })}`
                : "en 12 meses";
              return (
                <Card key={item.id}>
                  <div className="meta-card">
                    <div className="meta-card__header">
                      <span className="meta-card__nombre" style={{ opacity: item.activa ? 1 : 0.5 }}>{item.nombre}</span>
                      <div style={{ display: "flex", gap: "var(--space-1)", alignItems: "center" }}>
                        <span className="badge badge--accent">Inversión</span>
                        {!item.activa && <span className="badge badge--neutral">Inactiva</span>}
                      </div>
                    </div>

                    <div className="meta-card__amounts">
                      <div>
                        <div className="meta-card__amount-label">Acumulado</div>
                        <div className="meta-card__amount" style={{ color: "var(--positive)" }}>{fmt(item.acumulado)}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="meta-card__amount-label">Aporte mensual</div>
                        <div className="meta-card__amount">{item.aporte_mensual ? fmt(item.aporte_mensual) : "—"}</div>
                      </div>
                    </div>

                    <div style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius)", padding: "var(--space-3)", border: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{tna > 0 ? `${tna}% TNA` : "sin rendimiento"}</span>
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Horizonte {horizonteLabel}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <div>
                          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: 2 }}>Rend. estimado</div>
                          <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-semibold)", color: "var(--positive)", fontVariantNumeric: "tabular-nums" }}>+{fmt(inv.rendimiento)}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: 2 }}>Valor proyectado</div>
                          <div style={{ fontSize: "var(--text-base)", fontWeight: "var(--font-bold)", color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{fmt(inv.proyectado)}</div>
                        </div>
                      </div>
                    </div>

                    <div className="meta-card__actions">
                      <button className="btn-ghost" style={{ fontSize: "var(--text-xs)", padding: "var(--space-1) var(--space-3)" }} onClick={() => openDepositar(item)}>+ Aportar</button>
                      <div style={{ display: "flex", gap: "var(--space-1)" }}>
                        <button className="row-action-btn" onClick={() => openEdit(item)} title="Editar">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button className="row-action-btn danger" onClick={() => setToDelete(item)} title="Eliminar">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            }

            const { proyectado, rendimiento } = proyectar(item.acumulado, tna, meses);

            const pct          = item.objetivo > 0 ? Math.min(100, (item.acumulado / item.objetivo) * 100) : 0;
            const pctProyectado = item.objetivo > 0 ? Math.min(100, (proyectado / item.objetivo) * 100) : 0;

            const progressColor = pct >= 100 ? "var(--positive)" : pct >= 50 ? "var(--accent)" : "var(--warning)";
            const pri = PRIORIDAD_LABEL[item.prioridad] ?? PRIORIDAD_LABEL[2];

            // Label de horizonte temporal para el rendimiento
            const horizonteLabel = item.fecha_limite
              ? `al ${new Date(item.fecha_limite).toLocaleDateString("es-AR", { month: "short", year: "numeric" })}`
              : "en 12 meses";

            return (
              <Card key={item.id} variant={pct >= 100 ? "positive" : "default"}>
                <div className="meta-card">

                  {/* Header */}
                  <div className="meta-card__header">
                    <span className="meta-card__nombre" style={{ opacity: item.activa ? 1 : 0.5 }}>
                      {item.nombre}
                    </span>
                    <div style={{ display: "flex", gap: "var(--space-1)", alignItems: "center" }}>
                      <span className={`badge ${pri.cls}`}>{pri.label}</span>
                      {!item.activa && <span className="badge badge--neutral">Inactiva</span>}
                    </div>
                  </div>

                  {/* Montos principales */}
                  <div className="meta-card__amounts">
                    <div>
                      <div className="meta-card__amount-label">Acumulado</div>
                      <div className="meta-card__amount" style={{ color: "var(--positive)" }}>{fmt(item.acumulado)}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="meta-card__amount-label">Objetivo</div>
                      <div className="meta-card__amount">{fmt(item.objetivo)}</div>
                    </div>
                  </div>

                  {/* Barra de progreso — dual si hay rendimiento */}
                  <div>
                    <div className="progress-bar" style={{ height: 8 }}>
                      {tna > 0 && pctProyectado > pct ? (
                        // Una sola barra con gradiente: sólido hasta el % actual, degradado hasta el proyectado
                        <div
                          className="progress-bar__fill"
                          style={{
                            width: `${pctProyectado}%`,
                            background: `linear-gradient(to right, ${progressColor} ${((pct / Math.max(pctProyectado, 0.01)) * 100).toFixed(1)}%, color-mix(in srgb, ${progressColor} 28%, transparent) 100%)`,
                          }}
                        />
                      ) : (
                        <div className="progress-bar__fill" style={{ width: `${pct}%`, background: progressColor }} />
                      )}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: "var(--space-1)" }}>
                      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                        {pct.toFixed(0)}%{pct >= 100 ? " — ¡Completada!" : ""}
                      </span>
                      {tna > 0 && pctProyectado > pct && (
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                          {pctProyectado.toFixed(0)}% proyectado
                        </span>
                      )}
                      {!tna && item.fecha_limite && (
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                          Límite: {new Date(item.fecha_limite).toLocaleDateString("es-AR")}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Panel de rendimiento — solo si tna > 0 */}
                  {tna > 0 && (
                    <div style={{
                      background: "var(--bg-elevated)",
                      borderRadius: "var(--radius)",
                      padding: "var(--space-3)",
                      border: "1px solid var(--border)",
                    }}>
                      {/* Encabezado del panel */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="2" x2="12" y2="22"/>
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                          </svg>
                          {tna}% TNA
                        </span>
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                          {horizonteLabel}
                        </span>
                      </div>
                      {/* Valores */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <div>
                          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: 2 }}>
                            Rend. estimado
                          </div>
                          <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-semibold)", color: "var(--positive)", fontVariantNumeric: "tabular-nums" }}>
                            +{fmt(rendimiento)}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: 2 }}>
                            Valor proyectado
                          </div>
                          <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-bold)", color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                            {fmt(proyectado)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Acciones */}
                  <div className="meta-card__actions">
                    <button
                      className="btn-ghost"
                      style={{ fontSize: "var(--text-xs)", padding: "var(--space-1) var(--space-3)" }}
                      onClick={() => openDepositar(item)}
                    >
                      + Depositar
                    </button>
                    <div style={{ display: "flex", gap: "var(--space-1)" }}>
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
                  </div>

                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit modal */}
      {(modal === "add" || modal === "edit") && (
        <Modal title={modal === "add" ? "Nueva Meta de Ahorro" : "Editar Meta"} onClose={() => setModal(null)}>
          <form className="form" onSubmit={handleSubmit}>
            <div className="form__field">
              <label className="form__label">Nombre</label>
              <input
                className="form__input"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej: Viaje, auto, fondo de emergencia..."
                required
                autoFocus
              />
            </div>
            <div className="form__field">
              <label className="form__label">Tipo</label>
              <select
                className="form__select"
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              >
                <option value="meta">Meta con objetivo</option>
                <option value="inversion">Inversión (abierta, con horizonte)</option>
              </select>
            </div>
            <div className="form__row">
              {form.tipo === "meta" && (
                <div className="form__field">
                  <label className="form__label">Objetivo</label>
                  <input
                    className="form__input"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.objetivo || ""}
                    onChange={(e) => setForm({ ...form, objetivo: parseFloat(e.target.value) || 0 })}
                    required
                  />
                </div>
              )}
              <div className="form__field">
                <label className="form__label">Acumulado</label>
                <input
                  className="form__input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.acumulado || ""}
                  onChange={(e) => setForm({ ...form, acumulado: parseFloat(e.target.value) || 0 })}
                />
              </div>
              {form.tipo === "inversion" && (
                <div className="form__field">
                  <label className="form__label">Aporte mensual</label>
                  <input
                    className="form__input"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.aporte_mensual || ""}
                    onChange={(e) => setForm({ ...form, aporte_mensual: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                  />
                </div>
              )}
            </div>
            <div className="form__row">
              <div className="form__field">
                <label className="form__label">Prioridad</label>
                <select
                  className="form__select"
                  value={form.prioridad}
                  onChange={(e) => setForm({ ...form, prioridad: parseInt(e.target.value) })}
                >
                  <option value={1}>Alta</option>
                  <option value={2}>Media</option>
                  <option value={3}>Baja</option>
                </select>
              </div>
              <div className="form__field">
                <label className="form__label">Estado</label>
                <select
                  className="form__select"
                  value={form.activa}
                  onChange={(e) => setForm({ ...form, activa: parseInt(e.target.value) })}
                >
                  <option value={1}>Activa</option>
                  <option value={0}>Inactiva</option>
                </select>
              </div>
            </div>
            <div className="form__row">
              <div className="form__field">
                <label className="form__label">{form.tipo === "inversion" ? "Horizonte" : "Fecha límite"} <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(opcional)</span></label>
                <input
                  className="form__input"
                  type="date"
                  value={form.fecha_limite ?? ""}
                  onChange={(e) => setForm({ ...form, fecha_limite: e.target.value || null })}
                />
              </div>
              <div className="form__field">
                <label className="form__label">
                  TNA % <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(rendimiento)</span>
                </label>
                <input
                  className="form__input"
                  type="number"
                  min={0}
                  max={999}
                  step="0.1"
                  value={form.tasa_rendimiento || ""}
                  onChange={(e) => setForm({ ...form, tasa_rendimiento: parseFloat(e.target.value) || 0 })}
                  placeholder="Ej: 85"
                />
              </div>
            </div>
            <div className="form__actions">
              <button type="button" className="btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Depositar modal */}
      {modal === "depositar" && editItem && (
        <Modal title={`Depositar — ${editItem.nombre}`} size="sm" onClose={() => setModal(null)}>
          <form className="form" onSubmit={handleDepositar}>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginBottom: "var(--space-2)" }}>
              Acumulado actual: <strong style={{ color: "var(--positive)" }}>{fmt(editItem.acumulado)}</strong>
              {editItem.objetivo > 0 && <>{" / "}{fmt(editItem.objetivo)}</>}
            </div>
            <div className="form__field">
              <label className="form__label">Monto a depositar</label>
              <input
                className="form__input"
                type="number"
                min={0.01}
                step="0.01"
                value={deposito || ""}
                onChange={(e) => setDeposito(parseFloat(e.target.value) || 0)}
                required
                autoFocus
              />
            </div>
            <div className="form__actions">
              <button type="button" className="btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={saving || deposito <= 0}>
                {saving ? "Procesando..." : "Depositar"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {toDelete && (
        <ConfirmModal subject={toDelete.nombre} onConfirm={handleDelete} onClose={() => setToDelete(null)} loading={deleting} />
      )}
    </div>
  );
}
