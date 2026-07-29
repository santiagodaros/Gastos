import { useState, useEffect } from "react";
import {
  tarjetasApi, categoriasApi, presupuestoApi,
  type Tarjeta, type TarjetaCreate,
  type Categoria, type CategoriaCreate,
  type Presupuesto,
} from "../../api_client";
import { Card } from "../../components/Card";
import { Modal, ConfirmModal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import "../../styles/abm.css";

// ─── Constantes ───────────────────────────────────────────────────────────────

const TIPOS_TARJETA = ["Crédito", "Débito", "Prepaga"];

// Paleta curada: misma saturación/luminosidad → los gráficos leen como un sistema.
const COLORS = [
  "#4c6ef5", "#15aabf", "#12b886", "#82c91e",
  "#fab005", "#fd7e14", "#fa5252", "#e64980",
  "#be4bdb", "#7048e8", "#20c997", "#868e96",
];

const EMPTY_TARJETA: TarjetaCreate = { nombre: "", tipo: "Crédito", ultimos_4: "", activa: 1 };
const EMPTY_CAT: CategoriaCreate   = { nombre: "", color: "#6366f1" };

type Tab = "tarjetas" | "categorias" | "presupuesto";

// ─── Helpers UI ───────────────────────────────────────────────────────────────

const TabBtn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    style={{
      padding: "0.4rem 1rem",
      borderRadius: "6px",
      border: "none",
      fontSize: "0.875rem",
      fontWeight: active ? 600 : 400,
      cursor: "pointer",
      background: active ? "var(--accent)" : "transparent",
      color: active ? "#fff" : "var(--text-muted)",
      transition: "all 0.15s",
    }}
  >
    {children}
  </button>
);

const EditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
  </svg>
);

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Configuracion() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("tarjetas");

  // ── Tarjetas state ──
  const [tarjetas, setTarjetas]     = useState<Tarjeta[]>([]);
  const [tLoading, setTLoading]     = useState(true);
  const [tSaving, setTSaving]       = useState(false);
  const [tModal, setTModal]         = useState<"add" | "edit" | null>(null);
  const [tEditItem, setTEditItem]   = useState<Tarjeta | null>(null);
  const [tForm, setTForm]           = useState<TarjetaCreate>({ ...EMPTY_TARJETA });
  const [tToDelete, setTToDelete]   = useState<Tarjeta | null>(null);
  const [tDeleting, setTDeleting]   = useState(false);

  // ── Categorías state ──
  const [cats, setCats]             = useState<Categoria[]>([]);
  const [cLoading, setCLoading]     = useState(true);
  const [cSaving, setCSaving]       = useState(false);
  const [cModal, setCModal]         = useState<"add" | "edit" | null>(null);
  const [cEditItem, setCEditItem]   = useState<Categoria | null>(null);
  const [cForm, setCForm]           = useState<CategoriaCreate>({ ...EMPTY_CAT });
  const [cToDelete, setCToDelete]   = useState<Categoria | null>(null);
  const [cDeleting, setCDeleting]   = useState(false);

  // ── Presupuesto state ──
  const [presu, setPresu]     = useState<Presupuesto>({ pct_ahorro: 20, pct_cuotas: 30, pct_gastos: 50 });
  const [pLoading, setPLoading] = useState(true);
  const [pSaving, setPSaving]   = useState(false);
  const [pSaved, setPSaved]     = useState(false);

  // ── Loaders ──
  function loadTarjetas() {
    setTLoading(true);
    tarjetasApi.list().then(setTarjetas).finally(() => setTLoading(false));
  }
  function loadCats() {
    setCLoading(true);
    categoriasApi.list().then(setCats).finally(() => setCLoading(false));
  }
  function loadPresupuesto() {
    setPLoading(true);
    presupuestoApi.get().then(setPresu).finally(() => setPLoading(false));
  }

  useEffect(() => { loadTarjetas(); loadCats(); loadPresupuesto(); }, []);

  async function handlePSubmit(e: React.FormEvent) {
    e.preventDefault(); setPSaving(true); setPSaved(false);
    try { await presupuestoApi.upsert(presu); setPSaved(true); toast.success("Presupuesto guardado"); }
    catch (err: unknown) { toast.error((err as Error).message); }
    finally { setPSaving(false); }
  }

  // ── Tarjetas CRUD ──
  async function handleTSubmit(e: React.FormEvent) {
    e.preventDefault(); setTSaving(true);
    try {
      if (tModal === "edit" && tEditItem) await tarjetasApi.update(tEditItem.id, tForm);
      else await tarjetasApi.create(tForm);
      toast.success("Tarjeta guardada");
      setTModal(null); loadTarjetas();
    } catch (err: unknown) { toast.error((err as Error).message); }
    finally { setTSaving(false); }
  }
  async function handleTDelete() {
    if (!tToDelete) return; setTDeleting(true);
    try { await tarjetasApi.delete(tToDelete.id); setTToDelete(null); loadTarjetas(); }
    finally { setTDeleting(false); }
  }

  // ── Categorías CRUD ──
  async function handleCSubmit(e: React.FormEvent) {
    e.preventDefault(); setCSaving(true);
    try {
      if (cModal === "edit" && cEditItem) await categoriasApi.update(cEditItem.id, cForm);
      else await categoriasApi.create(cForm);
      toast.success("Categoría guardada");
      setCModal(null); loadCats();
    } catch (err: unknown) { toast.error((err as Error).message); }
    finally { setCSaving(false); }
  }
  async function handleCDelete() {
    if (!cToDelete) return; setCDeleting(true);
    try { await categoriasApi.delete(cToDelete.id); setCToDelete(null); loadCats(); }
    finally { setCDeleting(false); }
  }

  return (
    <div className="abm">

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.25rem", marginBottom: "1rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem" }}>
        <TabBtn active={tab === "tarjetas"}    onClick={() => setTab("tarjetas")}>Tarjetas</TabBtn>
        <TabBtn active={tab === "categorias"}  onClick={() => setTab("categorias")}>Categorías</TabBtn>
        <TabBtn active={tab === "presupuesto"} onClick={() => setTab("presupuesto")}>Presupuesto</TabBtn>
      </div>

      {/* ── TAB: PRESUPUESTO ── */}
      {tab === "presupuesto" && (
        <Card>
          {pLoading ? (
            <div className="abm-loading"><div className="spinner" /></div>
          ) : (
            <form className="form" onSubmit={handlePSubmit} style={{ maxWidth: 480 }}>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "var(--space-2)" }}>
                Definí qué porcentaje de tu <b>sueldo</b> destinás a cada cosa. En el Inicio vas a ver
                cuánto llevás usado de cada uno este mes.
              </p>

              {([
                { key: "pct_ahorro", label: "Ahorro", color: "var(--positive)" },
                { key: "pct_cuotas", label: "Cuotas", color: "var(--negative)" },
                { key: "pct_gastos", label: "Gastos", color: "var(--warning)" },
              ] as const).map(({ key, label, color }) => (
                <div className="form__field" key={key}>
                  <label className="form__label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
                    {label}
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      className="form__input"
                      type="number" min={0} max={100} step={1}
                      value={presu[key] || ""}
                      onChange={(e) => { setPSaved(false); setPresu({ ...presu, [key]: parseFloat(e.target.value) || 0 }); }}
                      style={{ maxWidth: 120 }}
                    />
                    <span style={{ color: "var(--text-muted)", fontWeight: "var(--font-semibold)" }}>%</span>
                  </div>
                </div>
              ))}

              {(() => {
                const total = presu.pct_ahorro + presu.pct_cuotas + presu.pct_gastos;
                const libre = 100 - total;
                const over  = total > 100;
                return (
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "var(--space-3) var(--space-4)", borderRadius: "var(--radius)",
                    background: "var(--bg-elevated)", border: `1px solid ${over ? "var(--negative)" : "var(--border)"}`,
                  }}>
                    <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                      {over ? "Te pasaste del 100%" : "Sin asignar"}
                    </span>
                    <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: "var(--font-bold)", color: over ? "var(--negative)" : "var(--text-primary)" }}>
                      {over ? `+${(total - 100).toFixed(0)}%` : `${libre.toFixed(0)}%`}
                    </span>
                  </div>
                );
              })()}

              <div className="form__actions">
                {pSaved && <span style={{ fontSize: "var(--text-sm)", color: "var(--positive)", marginRight: "auto" }}>✓ Guardado</span>}
                <button type="submit" className="btn-primary" disabled={pSaving}>{pSaving ? "Guardando..." : "Guardar"}</button>
              </div>
            </form>
          )}
        </Card>
      )}

      {/* ── TAB: TARJETAS ── */}
      {tab === "tarjetas" && (
        <>
          <div className="abm__toolbar">
            <div className="abm__toolbar-left">
              {!tLoading && <span className="badge badge--neutral">{tarjetas.length} tarjetas</span>}
            </div>
            <button className="btn-primary" onClick={() => { setTForm({ ...EMPTY_TARJETA }); setTEditItem(null); setTModal("add"); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Agregar tarjeta
            </button>
          </div>

          <Card>
            {tLoading ? (
              <div className="abm-loading"><div className="spinner" /></div>
            ) : tarjetas.length === 0 ? (
              <div className="abm-empty">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
                </svg>
                Sin tarjetas — agregá una para usarla en cuotas
              </div>
            ) : (
              <table className="abm-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Tipo</th>
                    <th>Últimos 4</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {tarjetas.map((t) => (
                    <tr key={t.id} style={{ opacity: t.activa ? 1 : 0.45 }}>
                      <td style={{ color: "var(--text-primary)", fontWeight: "var(--font-medium)" }}>{t.nombre}</td>
                      <td>
                        <span className="badge badge--accent">{t.tipo}</span>
                      </td>
                      <td>
                        <span style={{ fontFamily: "monospace", letterSpacing: "0.1em", color: "var(--text-secondary)" }}>
                          ···· {t.ultimos_4}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${t.activa ? "badge--positive" : "badge--neutral"}`}>
                          {t.activa ? "Activa" : "Inactiva"}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="row-action-btn" onClick={() => { setTForm({ nombre: t.nombre, tipo: t.tipo, ultimos_4: t.ultimos_4, activa: t.activa }); setTEditItem(t); setTModal("edit"); }} title="Editar">
                            <EditIcon />
                          </button>
                          <button className="row-action-btn danger" onClick={() => setTToDelete(t)} title="Eliminar">
                            <TrashIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {tModal && (
            <Modal title={tModal === "add" ? "Nueva Tarjeta" : "Editar Tarjeta"} onClose={() => setTModal(null)}>
              <form className="form" onSubmit={handleTSubmit}>
                <div className="form__field">
                  <label className="form__label">Nombre</label>
                  <input className="form__input" value={tForm.nombre} onChange={(e) => setTForm({ ...tForm, nombre: e.target.value })} placeholder="Ej: Visa Galicia, Naranja..." required autoFocus />
                </div>
                <div className="form__row">
                  <div className="form__field">
                    <label className="form__label">Tipo</label>
                    <select className="form__select" value={tForm.tipo} onChange={(e) => setTForm({ ...tForm, tipo: e.target.value })}>
                      {TIPOS_TARJETA.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form__field">
                    <label className="form__label">Últimos 4 dígitos</label>
                    <input
                      className="form__input"
                      value={tForm.ultimos_4}
                      onChange={(e) => setTForm({ ...tForm, ultimos_4: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                      placeholder="1234"
                      maxLength={4}
                      inputMode="numeric"
                      pattern="[0-9]{4}"
                      required
                    />
                  </div>
                </div>
                <div className="form__field">
                  <label className="form__label">Estado</label>
                  <select className="form__select" value={tForm.activa} onChange={(e) => setTForm({ ...tForm, activa: parseInt(e.target.value) })}>
                    <option value={1}>Activa</option>
                    <option value={0}>Inactiva</option>
                  </select>
                </div>
                <div className="form__actions">
                  <button type="button" className="btn-ghost" onClick={() => setTModal(null)}>Cancelar</button>
                  <button type="submit" className="btn-primary" disabled={tSaving}>{tSaving ? "Guardando..." : "Guardar"}</button>
                </div>
              </form>
            </Modal>
          )}

          {tToDelete && (
            <ConfirmModal subject={`${tToDelete.nombre} ···${tToDelete.ultimos_4}`} onConfirm={handleTDelete} onClose={() => setTToDelete(null)} loading={tDeleting} />
          )}
        </>
      )}

      {/* ── TAB: CATEGORÍAS ── */}
      {tab === "categorias" && (
        <>
          <div className="abm__toolbar">
            <div className="abm__toolbar-left">
              {!cLoading && <span className="badge badge--neutral">{cats.length} categorías</span>}
            </div>
            <button className="btn-primary" onClick={() => { setCForm({ ...EMPTY_CAT }); setCEditItem(null); setCModal("add"); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Agregar categoría
            </button>
          </div>

          <Card>
            {cLoading ? (
              <div className="abm-loading"><div className="spinner" /></div>
            ) : cats.length === 0 ? (
              <div className="abm-empty">Sin categorías</div>
            ) : (
              <table className="abm-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>Color</th>
                    <th>Nombre</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cats.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <span style={{ display: "inline-block", width: 20, height: 20, borderRadius: "50%", background: c.color, verticalAlign: "middle" }} />
                      </td>
                      <td style={{ color: "var(--text-primary)", fontWeight: "var(--font-medium)" }}>{c.nombre}</td>
                      <td>
                        <div className="row-actions">
                          <button className="row-action-btn" onClick={() => { setCForm({ nombre: c.nombre, color: c.color }); setCEditItem(c); setCModal("edit"); }} title="Editar">
                            <EditIcon />
                          </button>
                          <button className="row-action-btn danger" onClick={() => setCToDelete(c)} title="Eliminar">
                            <TrashIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {cModal && (
            <Modal title={cModal === "add" ? "Nueva Categoría" : "Editar Categoría"} onClose={() => setCModal(null)}>
              <form className="form" onSubmit={handleCSubmit}>
                <div className="form__field">
                  <label className="form__label">Nombre</label>
                  <input className="form__input" value={cForm.nombre} onChange={(e) => setCForm({ ...cForm, nombre: e.target.value })} placeholder="Ej: Viajes, Mascotas..." required autoFocus />
                </div>
                <div className="form__field">
                  <label className="form__label">Color</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginTop: "var(--space-1)" }}>
                    {COLORS.map((col) => (
                      <button key={col} type="button" onClick={() => setCForm({ ...cForm, color: col })}
                        style={{ width: 28, height: 28, borderRadius: "50%", background: col, border: cForm.color === col ? "3px solid var(--text-primary)" : "3px solid transparent", cursor: "pointer", padding: 0, flexShrink: 0 }}
                      />
                    ))}
                  </div>
                </div>
                <div className="form__actions">
                  <button type="button" className="btn-ghost" onClick={() => setCModal(null)}>Cancelar</button>
                  <button type="submit" className="btn-primary" disabled={cSaving}>{cSaving ? "Guardando..." : "Guardar"}</button>
                </div>
              </form>
            </Modal>
          )}

          {cToDelete && (
            <ConfirmModal subject={cToDelete.nombre} onConfirm={handleCDelete} onClose={() => setCToDelete(null)} loading={cDeleting} />
          )}
        </>
      )}
    </div>
  );
}
