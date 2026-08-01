import { useState, useEffect, useMemo } from "react";
import { gastosApi, categoriasApi, tarjetasApi, comprobantesApi, type GastoMensual, type GastoMensualCreate, type Categoria, type Tarjeta } from "../../api_client";
import { getCotizacionDolar } from "../../lib/finance";
import { Card } from "../../components/Card";
import { Modal, ConfirmModal } from "../../components/Modal";
import ImportResumen from "../../components/ImportResumen";
import Lightbox from "../../components/Lightbox";
import { useToast } from "../../components/Toast";
import PeriodSelector from "../../components/PeriodSelector";
import { usePeriod } from "../../lib/period";
import "../../styles/abm.css";
import "./GastosMensuales.css";

const MONEDAS = ["ARS", "USD"];

function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split("T")[0];
}

const EMPTY_FORM: GastoMensualCreate = {
  mes: new Date().getMonth() + 1,
  anio: new Date().getFullYear(),
  nombre: "",
  monto: 0,
  categoria: "Otros",
  moneda: "ARS",
  nota: null,
  fecha: todayISO(),
  tarjeta_id: null,
  verificado: false,
  medio: null,
  comprobante_url: null,
};

function fmt(n: number, moneda: string) {
  if (moneda === "USD") return `U$D ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

function fmtFecha(iso?: string | null) {
  if (!iso) return "—";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export default function GastosMensuales() {
  const toast = useToast();
  const { anio, mes, prev, next, goToday, isCurrent } = usePeriod();

  const [items, setItems]           = useState<GastoMensual[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [tarjetas, setTarjetas]     = useState<Tarjeta[]>([]);
  const [dolarRate, setDolarRate]   = useState(0);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const [modal, setModal]       = useState<"add" | "edit" | null>(null);
  const [editItem, setEditItem] = useState<GastoMensual | null>(null);
  const [form, setForm]         = useState<GastoMensualCreate>(EMPTY_FORM);
  const [toDelete, setToDelete] = useState<GastoMensual | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [viewPath, setViewPath] = useState<string | null>(null);

  // Búsqueda y filtros
  const [q, setQ]       = useState("");
  const [fCat, setFCat] = useState("");
  const [fTar, setFTar] = useState("");

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
    tarjetasApi.list().then(setTarjetas).catch(() => {});
    getCotizacionDolar().then(setDolarRate).catch(() => {});
  }, []);

  function openAdd() {
    setForm({ ...EMPTY_FORM, mes, anio, fecha: todayISO() });
    setFile(null);
    setEditItem(null);
    setModal("add");
  }

  function openEdit(item: GastoMensual) {
    setForm({ mes: item.mes, anio: item.anio, nombre: item.nombre, monto: item.monto, categoria: item.categoria, moneda: item.moneda, nota: item.nota ?? null, fecha: item.fecha ?? todayISO(), tarjeta_id: item.tarjeta_id ?? null, verificado: item.verificado ?? false, medio: item.medio ?? null, comprobante_url: item.comprobante_url ?? null });
    setFile(null);
    setEditItem(item);
    setModal("edit");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...form };
      if (file) {
        const path = await comprobantesApi.upload(file);
        if (editItem?.comprobante_url && editItem.comprobante_url !== path) {
          await comprobantesApi.remove(editItem.comprobante_url);
        }
        body.comprobante_url = path;
      } else if (modal === "edit" && editItem?.comprobante_url && !form.comprobante_url) {
        await comprobantesApi.remove(editItem.comprobante_url);
      }
      if (modal === "edit" && editItem) {
        await gastosApi.update(editItem.id, body);
        toast.success("Gasto actualizado");
      } else {
        await gastosApi.create(body);
        toast.success("Gasto agregado");
      }
      setModal(null);
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      if (toDelete.comprobante_url) await comprobantesApi.remove(toDelete.comprobante_url);
      await gastosApi.delete(toDelete.id);
      toast.success("Gasto eliminado");
      setToDelete(null);
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items.filter((i) => {
      if (query && !(i.nombre.toLowerCase().includes(query) || (i.nota ?? "").toLowerCase().includes(query))) return false;
      if (fCat && i.categoria !== fCat) return false;
      if (fTar === "efectivo" && i.tarjeta_id) return false;
      if (fTar && fTar !== "efectivo" && i.tarjeta_id !== parseInt(fTar)) return false;
      return true;
    });
  }, [items, q, fCat, fTar]);

  const filtering = q.trim() !== "" || fCat !== "" || fTar !== "";
  const total = filtered.reduce((s, i) => s + (i.moneda === "USD" ? i.monto * dolarRate : i.monto), 0);

  return (
    <div className="abm">
      <div className="abm__toolbar">
        <div className="abm__toolbar-left">
          <PeriodSelector anio={anio} mes={mes} onPrev={prev} onNext={next} onToday={goToday} isCurrent={isCurrent} />
          {!loading && (
            <span className="badge badge--neutral">
              {filtering ? `${filtered.length} de ${items.length}` : `${items.length} registros`}
            </span>
          )}
          {!loading && items.some((i) => i.tarjeta_id && !i.verificado) && (
            <span className="badge" style={{ background: "var(--warning-muted)", color: "var(--warning)" }}>
              {items.filter((i) => i.tarjeta_id && !i.verificado).length} sin verificar
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <button className="btn-ghost" onClick={() => setShowImport(true)} title="Importar resumen de tarjeta">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Importar resumen
          </button>
          <button className="btn-primary" onClick={openAdd}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Agregar
          </button>
        </div>
      </div>

      {error && <p style={{ color: "var(--negative)", fontSize: "var(--text-sm)" }}>{error}</p>}

      {!loading && items.length > 0 && (
        <div className="gm-filters">
          <input
            className="gm-filters__search"
            placeholder="Buscar por nombre o nota…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="gm-filters__select" value={fCat} onChange={(e) => setFCat(e.target.value)}>
            <option value="">Todas las categorías</option>
            {categorias.map((c) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
          </select>
          <select className="gm-filters__select" value={fTar} onChange={(e) => setFTar(e.target.value)}>
            <option value="">Todos los medios</option>
            <option value="efectivo">Efectivo / Débito</option>
            {tarjetas.map((t) => <option key={t.id} value={t.id}>{t.nombre} ···{t.ultimos_4}</option>)}
          </select>
          {filtering && (
            <button className="btn-ghost" onClick={() => { setQ(""); setFCat(""); setFTar(""); }}>Limpiar</button>
          )}
        </div>
      )}

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
        ) : filtered.length === 0 ? (
          <div className="abm-empty">Ningún gasto coincide con el filtro</div>
        ) : (
          <table className="abm-table">
            <thead>
              <tr>
                <th style={{ width: 56 }}>Fecha</th>
                <th>Nombre</th>
                <th>Categoría</th>
                <th style={{ textAlign: "right" }}>Monto</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums", fontSize: "var(--text-sm)" }}>
                    {fmtFecha(item.fecha)}
                  </td>
                  <td>
                    <span style={{ color: "var(--text-primary)", fontWeight: "var(--font-medium)" }}>
                      {item.verificado && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--positive)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5, verticalAlign: "middle" }}>
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                      {item.nombre}
                    </span>
                    {item.tarjeta_id && (() => {
                      const t = tarjetas.find((x) => x.id === item.tarjeta_id);
                      return t ? <span className="badge badge--accent" style={{ marginLeft: 6, fontSize: "var(--text-xs)" }}>{t.nombre}</span> : null;
                    })()}
                    {item.medio === "transferencia" && (
                      <span className="badge badge--neutral" style={{ marginLeft: 6, fontSize: "var(--text-xs)" }}>Transferencia</span>
                    )}
                    {item.comprobante_url && (
                      <button
                        onClick={() => setViewPath(item.comprobante_url!)}
                        title="Ver comprobante"
                        style={{ marginLeft: 6, background: "none", border: "none", cursor: "pointer", fontSize: "var(--text-sm)" }}
                      >📎</button>
                    )}
                    {item.nota && <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2 }}>{item.nota}</div>}
                  </td>
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
                <td colSpan={3} style={{ paddingTop: "var(--space-4)", fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {filtering ? "Total filtrado" : "Total ARS"}
                  {dolarRate > 0 && filtered.some((i) => i.moneda === "USD") && (
                    <span style={{ display: "block", marginTop: 2, textTransform: "none", letterSpacing: 0 }}>USD @ {fmt(dolarRate, "ARS")}</span>
                  )}
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
                  step="0.01"
                  value={form.monto || ""}
                  onChange={(e) => setForm({ ...form, monto: parseFloat(e.target.value) || 0 })}
                  required
                />
                <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2 }}>
                  Podés poner un monto negativo (ej: −5000) para descontar.
                </span>
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
            <div className="form__row">
              <div className="form__field">
                <label className="form__label">Fecha</label>
                <input
                  className="form__input"
                  type="date"
                  value={form.fecha ?? ""}
                  onChange={(e) => setForm({ ...form, fecha: e.target.value || null })}
                />
              </div>
              <div className="form__field">
                <label className="form__label">Tarjeta / medio</label>
                <select
                  className="form__select"
                  value={form.tarjeta_id ?? ""}
                  onChange={(e) => setForm({ ...form, tarjeta_id: e.target.value ? parseInt(e.target.value) : null })}
                >
                  <option value="">Efectivo / Débito</option>
                  {tarjetas.map((t) => <option key={t.id} value={t.id}>{t.nombre} ···{t.ultimos_4}</option>)}
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
            <div className="form__field">
              <label className="form__label">Nota <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(opcional)</span></label>
              <textarea
                className="form__input"
                value={form.nota ?? ""}
                onChange={(e) => setForm({ ...form, nota: e.target.value || null })}
                placeholder="Ej: factura de enero, viaje a Mendoza..."
                rows={2}
                style={{ resize: "vertical" }}
              />
            </div>
            <div className="form__field">
              <label className="form__label">Comprobante / ticket <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(opcional)</span></label>
              {form.comprobante_url && !file ? (
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <button type="button" className="btn-ghost" onClick={() => setViewPath(form.comprobante_url!)}>📎 Ver adjunto</button>
                  <button type="button" className="btn-ghost" style={{ color: "var(--negative)" }} onClick={() => setForm({ ...form, comprobante_url: null })}>Quitar</button>
                </div>
              ) : (
                <>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    capture="environment"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}
                  />
                  {file && <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 4 }}>{file.name}</div>}
                </>
              )}
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

      {showImport && (
        <ImportResumen
          anio={anio}
          mes={mes}
          onClose={() => setShowImport(false)}
          onApplied={load}
        />
      )}

      {viewPath && <Lightbox path={viewPath} onClose={() => setViewPath(null)} />}
    </div>
  );
}
