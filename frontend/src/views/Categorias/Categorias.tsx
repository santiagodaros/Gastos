import { useState, useEffect } from "react";
import { categoriasApi, type Categoria, type CategoriaCreate } from "../../api_client";
import { Card } from "../../components/Card";
import { Modal, ConfirmModal } from "../../components/Modal";
import "../../styles/abm.css";

const COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#10b981", "#06b6d4", "#3b82f6",
  "#6366f1", "#8b5cf6", "#ec4899", "#6b7280",
];

const EMPTY_FORM: CategoriaCreate = { nombre: "", color: "#6366f1" };

export default function Categorias() {
  const [items, setItems]       = useState<Categoria[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const [modal, setModal]       = useState<"add" | "edit" | null>(null);
  const [editItem, setEditItem] = useState<Categoria | null>(null);
  const [form, setForm]         = useState<CategoriaCreate>({ ...EMPTY_FORM });
  const [toDelete, setToDelete] = useState<Categoria | null>(null);
  const [deleting, setDeleting] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    categoriasApi.list()
      .then(setItems)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setForm({ ...EMPTY_FORM });
    setEditItem(null);
    setModal("add");
  }

  function openEdit(item: Categoria) {
    setForm({ nombre: item.nombre, color: item.color });
    setEditItem(item);
    setModal("edit");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal === "edit" && editItem) {
        await categoriasApi.update(editItem.id, form);
      } else {
        await categoriasApi.create(form);
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
      await categoriasApi.delete(toDelete.id);
      setToDelete(null);
      load();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="abm">
      <div className="abm__toolbar">
        <div className="abm__toolbar-left">
          <h2 style={{ fontSize: "var(--text-base)", fontWeight: "var(--font-semibold)", color: "var(--text-primary)", margin: 0 }}>
            Categorías
          </h2>
          {!loading && (
            <span className="badge badge--neutral">{items.length} categorías</span>
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
          <div className="abm-empty">Sin categorías</div>
        ) : (
          <table className="abm-table">
            <thead>
              <tr>
                <th>Color</th>
                <th>Nombre</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td style={{ width: 40 }}>
                    <span
                      style={{
                        display: "inline-block",
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: item.color,
                        verticalAlign: "middle",
                      }}
                    />
                  </td>
                  <td style={{ color: "var(--text-primary)", fontWeight: "var(--font-medium)" }}>
                    {item.nombre}
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
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {modal && (
        <Modal title={modal === "add" ? "Nueva Categoría" : "Editar Categoría"} onClose={() => setModal(null)}>
          <form className="form" onSubmit={handleSubmit}>
            <div className="form__field">
              <label className="form__label">Nombre</label>
              <input
                className="form__input"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej: Viajes, Mascotas..."
                required
                autoFocus
              />
            </div>
            <div className="form__field">
              <label className="form__label">Color</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginTop: "var(--space-1)" }}>
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, color: c })}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: c,
                      border: form.color === c
                        ? "3px solid var(--text-primary)"
                        : "3px solid transparent",
                      outline: form.color === c ? "2px solid var(--surface-1)" : "none",
                      outlineOffset: 1,
                      cursor: "pointer",
                      padding: 0,
                      flexShrink: 0,
                    }}
                  />
                ))}
              </div>
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
