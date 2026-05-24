import { useState, useEffect } from "react";
import { metasApi, type MetaAhorro, type MetaAhorroCreate } from "../../api_client";
import { Card } from "../../components/Card";
import { Modal, ConfirmModal } from "../../components/Modal";
import "../../styles/abm.css";
import "./Metas.css";

function fmt(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

const EMPTY_FORM: MetaAhorroCreate = {
  nombre: "",
  objetivo: 0,
  acumulado: 0,
  fecha_limite: null,
  prioridad: 2,
  activa: 1,
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
    setForm({ nombre: item.nombre, objetivo: item.objetivo, acumulado: item.acumulado, fecha_limite: item.fecha_limite, prioridad: item.prioridad, activa: item.activa });
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
            const pct = item.objetivo > 0 ? Math.min(100, (item.acumulado / item.objetivo) * 100) : 0;
            const pri = PRIORIDAD_LABEL[item.prioridad] ?? PRIORIDAD_LABEL[2];
            const progressColor = pct >= 100 ? "var(--positive)" : pct >= 50 ? "var(--accent)" : "var(--warning)";

            return (
              <Card key={item.id} variant={pct >= 100 ? "positive" : "default"}>
                <div className="meta-card">
                  <div className="meta-card__header">
                    <span className="meta-card__nombre" style={{ opacity: item.activa ? 1 : 0.5 }}>
                      {item.nombre}
                    </span>
                    <div style={{ display: "flex", gap: "var(--space-1)", alignItems: "center" }}>
                      <span className={`badge ${pri.cls}`}>{pri.label}</span>
                      {!item.activa && <span className="badge badge--neutral">Inactiva</span>}
                    </div>
                  </div>

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

                  <div>
                    <div className="progress-bar" style={{ height: 8 }}>
                      <div className="progress-bar__fill" style={{ width: `${pct}%`, background: progressColor }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: "var(--space-1)" }}>
                      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                        {pct.toFixed(0)}%{pct >= 100 ? " — ¡Completada!" : ""}
                      </span>
                      {item.fecha_limite && (
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                          Límite: {new Date(item.fecha_limite).toLocaleDateString("es-AR")}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="meta-card__actions">
                    <button className="btn-ghost" style={{ fontSize: "var(--text-xs)", padding: "var(--space-1) var(--space-3)" }} onClick={() => openDepositar(item)}>
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
              <input className="form__input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Viaje, auto, fondo de emergencia..." required autoFocus />
            </div>
            <div className="form__row">
              <div className="form__field">
                <label className="form__label">Objetivo</label>
                <input className="form__input" type="number" min={0} step="0.01" value={form.objetivo || ""} onChange={(e) => setForm({ ...form, objetivo: parseFloat(e.target.value) || 0 })} required />
              </div>
              <div className="form__field">
                <label className="form__label">Acumulado</label>
                <input className="form__input" type="number" min={0} step="0.01" value={form.acumulado || ""} onChange={(e) => setForm({ ...form, acumulado: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="form__row">
              <div className="form__field">
                <label className="form__label">Prioridad</label>
                <select className="form__select" value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: parseInt(e.target.value) })}>
                  <option value={1}>Alta</option>
                  <option value={2}>Media</option>
                  <option value={3}>Baja</option>
                </select>
              </div>
              <div className="form__field">
                <label className="form__label">Estado</label>
                <select className="form__select" value={form.activa} onChange={(e) => setForm({ ...form, activa: parseInt(e.target.value) })}>
                  <option value={1}>Activa</option>
                  <option value={0}>Inactiva</option>
                </select>
              </div>
            </div>
            <div className="form__field">
              <label className="form__label">Fecha límite (opcional)</label>
              <input className="form__input" type="date" value={form.fecha_limite ?? ""} onChange={(e) => setForm({ ...form, fecha_limite: e.target.value || null })} />
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
              {" / "}{fmt(editItem.objetivo)}
            </div>
            <div className="form__field">
              <label className="form__label">Monto a depositar</label>
              <input className="form__input" type="number" min={0.01} step="0.01" value={deposito || ""} onChange={(e) => setDeposito(parseFloat(e.target.value) || 0)} required autoFocus />
            </div>
            <div className="form__actions">
              <button type="button" className="btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={saving || deposito <= 0}>{saving ? "Procesando..." : "Depositar"}</button>
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
