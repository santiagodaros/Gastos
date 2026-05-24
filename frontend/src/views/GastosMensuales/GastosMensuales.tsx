import { useState, useEffect } from "react";
import { gastosApi, categoriasApi, type GastoMensual, type GastoMensualCreate, type Categoria } from "../../api_client";
import { Card } from "../../components/Card";
import { Modal, ConfirmModal } from "../../components/Modal";
import PeriodSelector from "../../components/PeriodSelector";
import "../../styles/abm.css";
import "./GastosMensuales.css";

const MONEDAS = ["ARS", "USD"];

const EMPTY_FORM: GastoMensualCreate = {
  mes: new Date().getMonth() + 1,
  anio: new Date().getFullYear(),
  nombre: "",
  monto: 0,
  categoria: "Otros",
  moneda: "ARS",
};

function fmt(n: number, moneda: string) {
  if (moneda === "USD") return `U$D ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

export default function GastosMensuales() {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes]   = useState(now.getMonth() + 1);

  const [items, setItems]           = useState<GastoMensual[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const [modal, setModal]       = useState<"add" | "edit" | null>(null);
  const [editItem, setEditItem] = useState<GastoMensual | null>(null);
  const [form, setForm]         = useState<GastoMensualCreate>(EMPTY_FORM);
  const [toDelete, setToDelete] = useState<GastoMensual | null>(null);
  const [deleting, setDeleting] = useState(false);

  function prevMonth() {
    if (mes === 1) { setMes(12); setAnio((y) => y - 1); }
    else setMes((m) => m - 1);
  }
  function nextMonth() {
    if (mes === 12) { setMes(1); setAnio((y) => y + 1); }
    else setMes((m) => m + 1);
  }

  function load() {
    setLoading(true);
    setError(null);
    gastosApi.list(anio, mes)
      .then(setItems)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [anio, mes]);
  useEffect(() => {
    categoriasApi.list().then(setCategorias).catch(() => {});
  }, []);

  function openAdd() {
    setForm({ ...EMPTY_FORM, mes, anio });
    setEditItem(null);
    setModal("add");
  }

  function openEdit(item: GastoMensual) {
    setForm({ mes: item.mes, anio: item.anio, nombre: item.nombre, monto: item.monto, categoria: item.categoria, moneda: item.moneda });
    setEditItem(item);
    setModal("edit");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal === "edit" && editItem) {
        await gastosApi.update(editItem.id, form);
      } else {
        await gastosApi.create(form);
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
      await gastosApi.delete(toDelete.id);
      setToDelete(null);
      load();
    } finally {
      setDeleting(false);
    }
  }

  const total = items.reduce((s, i) => i.moneda === "ARS" ? s + i.monto : s, 0);

  return (
    <div className="abm">
      <div className="abm__toolbar">
        <div className="abm__toolbar-left">
          <PeriodSelector anio={anio} mes={mes} onPrev={prevMonth} onNext={nextMonth} />
          {!loading && (
            <span className="badge badge--neutral">{items.length} registros</span>
          )}
        </div>
        <button className="btn-primary" onClick={openAdd}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Agregar
        </button>
      </div>

      {error && <p style={{ color: "var(--negative)", fontSize: "var(--text-sm)" }}>{error}</p>}

      <Card>
        {loading ? (
          <div className="abm-loading"><div className="spinner" /></div>
        ) : items.length === 0 ? (
          <div className="abm-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            Sin gastos para este período
          </div>
        ) : (
          <table className="abm-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Categoría</th>
                <th style={{ textAlign: "right" }}>Monto</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td style={{ color: "var(--text-primary)", fontWeight: "var(--font-medium)" }}>{item.nombre}</td>
                  <td>
                    {(() => {
                      const cat = categorias.find((c) => c.nombre === item.categoria);
                      return (
                        <span className="badge badge--neutral" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          {cat && <span style={{ width: 8, height: 8, borderRadius: "50%", background: cat.color, flexShrink: 0 }} />}
                          {item.categoria}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="num">{fmt(item.monto, item.moneda)}</td>
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
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} style={{ paddingTop: "var(--space-4)", fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Total ARS
                </td>
                <td className="num" style={{ paddingTop: "var(--space-4)", color: "var(--text-primary)", fontWeight: "var(--font-bold)" }}>
                  {fmt(total, "ARS")}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </Card>

      {/* Modal Add/Edit */}
      {modal && (
        <Modal
          title={modal === "add" ? "Nuevo Gasto" : "Editar Gasto"}
          onClose={() => setModal(null)}
        >
          <form className="form" onSubmit={handleSubmit}>
            <div className="form__field">
              <label className="form__label">Nombre</label>
              <input
                className="form__input"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej: Netflix, supermercado..."
                required
                autoFocus
              />
            </div>
            <div className="form__row">
              <div className="form__field">
                <label className="form__label">Monto</label>
                <input
                  className="form__input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.monto || ""}
                  onChange={(e) => setForm({ ...form, monto: parseFloat(e.target.value) || 0 })}
                  required
                />
              </div>
              <div className="form__field">
                <label className="form__label">Moneda</label>
                <select
                  className="form__select"
                  value={form.moneda}
                  onChange={(e) => setForm({ ...form, moneda: e.target.value })}
                >
                  {MONEDAS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div className="form__field">
              <label className="form__label">Categoría</label>
              <select
                className="form__select"
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
              >
                {categorias.length > 0
                  ? categorias.map((c) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)
                  : <option value={form.categoria}>{form.categoria}</option>
                }
              </select>
            </div>
            <div className="form__actions">
              <button type="button" className="btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Confirm delete */}
      {toDelete && (
        <ConfirmModal
          subject={toDelete.nombre}
          onConfirm={handleDelete}
          onClose={() => setToDelete(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}
