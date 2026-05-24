import { useState, useEffect } from "react";
import { cuotasApi, tarjetasApi, type Cuota, type CuotaCreate, type Tarjeta } from "../../api_client";
import { Card } from "../../components/Card";
import { Modal, ConfirmModal } from "../../components/Modal";
import "../../styles/abm.css";

const MONEDAS = ["ARS", "USD"];
const MONTHS  = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function fmt(n: number, moneda: string) {
  if (moneda === "USD") return `U$D ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

const now = new Date();

const EMPTY_FORM: CuotaCreate = {
  nombre: "",
  monto_cuota: 0,
  cuota_actual: 1,
  total_cuotas: 12,
  mes_inicio: now.getMonth() + 1,
  anio_inicio: now.getFullYear(),
  activa: 1,
  moneda: "ARS",
  tarjeta_id: null,
};

export default function Cuotas() {
  const [items, setItems]       = useState<Cuota[]>([]);
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);

  const [modal, setModal]       = useState<"add" | "edit" | null>(null);
  const [editItem, setEditItem] = useState<Cuota | null>(null);
  const [form, setForm]         = useState<CuotaCreate>({ ...EMPTY_FORM });
  const [toDelete, setToDelete] = useState<Cuota | null>(null);
  const [deleting, setDeleting] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([cuotasApi.list(), tarjetasApi.list()])
      .then(([c, t]) => { setItems(c); setTarjetas(t); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setForm({ ...EMPTY_FORM });
    setEditItem(null);
    setModal("add");
  }

  function openEdit(item: Cuota) {
    setForm({
      nombre: item.nombre, monto_cuota: item.monto_cuota, cuota_actual: item.cuota_actual,
      total_cuotas: item.total_cuotas, mes_inicio: item.mes_inicio, anio_inicio: item.anio_inicio,
      activa: item.activa, moneda: item.moneda, tarjeta_id: item.tarjeta_id,
    });
    setEditItem(item);
    setModal("edit");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal === "edit" && editItem) {
        await cuotasApi.update(editItem.id, form);
      } else {
        await cuotasApi.create(form);
      }
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
      await cuotasApi.delete(toDelete.id);
      setToDelete(null);
      load();
    } finally {
      setDeleting(false);
    }
  }

  function tarjetaNombre(id: number | null) {
    if (!id) return null;
    const t = tarjetas.find((t) => t.id === id);
    return t ? `${t.nombre} ···${t.ultimos_4}` : null;
  }

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
              {items.map((item) => {
                const pct = item.total_cuotas > 0 ? (item.cuota_actual / item.total_cuotas) * 100 : 0;
                return (
                  <tr key={item.id} style={{ opacity: item.activa ? 1 : 0.45 }}>
                    <td style={{ color: "var(--text-primary)", fontWeight: "var(--font-medium)" }}>
                      {item.nombre}
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2 }}>
                        Inicio: {MONTHS[item.mes_inicio - 1]} {item.anio_inicio}
                      </div>
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
                        : <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>—</span>
                      }
                    </td>
                    <td>
                      <span className={`badge ${item.activa ? "badge--positive" : "badge--neutral"}`}>
                        {item.activa ? "Activa" : "Pausada"}
                      </span>
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
            <div className="form__field">
              <label className="form__label">Estado</label>
              <select className="form__select" value={form.activa} onChange={(e) => setForm({ ...form, activa: parseInt(e.target.value) })}>
                <option value={1}>Activa</option>
                <option value={0}>Pausada</option>
              </select>
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
    </div>
  );
}
