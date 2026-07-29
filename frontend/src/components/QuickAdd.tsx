import { useEffect, useState } from "react";
import {
  gastosApi, ingresosApi, cuotasApi, categoriasApi, tarjetasApi,
  type GastoMensualCreate, type CuotaCreate, type Categoria, type Tarjeta,
} from "../api_client";
import "./QuickAdd.css";

type Tipo = "gasto" | "ingreso" | "cuota";
const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

interface QuickAddProps {
  initialTipo?: Tipo;
  onClose: () => void;
  onSaved: () => void;
}

export default function QuickAdd({ initialTipo = "gasto", onClose, onSaved }: QuickAddProps) {
  const now = new Date();
  const mes = now.getMonth() + 1;
  const anio = now.getFullYear();

  const [tipo, setTipo] = useState<Tipo>(initialTipo);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // — Gasto —
  const [gMonto, setGMonto] = useState("");
  const [gCat, setGCat] = useState("Otros");
  const [gNombre, setGNombre] = useState("");
  const [gMoneda, setGMoneda] = useState("ARS");

  // — Ingreso —
  const [iSueldo, setISueldo] = useState("");
  const [iOtros, setIOtros] = useState("");

  // — Cuota —
  const [cNombre, setCNombre] = useState("");
  const [cMonto, setCMonto] = useState("");
  const [cTotal, setCTotal] = useState("12");
  const [cActual, setCActual] = useState("1");
  const [cMoneda, setCMoneda] = useState("ARS");
  const [cCat, setCCat] = useState("Sin categoría");
  const [cTarjeta, setCTarjeta] = useState<number | null>(null);

  useEffect(() => {
    categoriasApi.list().then((cats) => {
      setCategorias(cats);
      if (cats.length && !cats.some((c) => c.nombre === "Otros")) setGCat(cats[0].nombre);
    }).catch(() => {});
    tarjetasApi.list().then(setTarjetas).catch(() => {});
  }, []);

  // Al pasar a la pestaña Ingreso, precargo el valor actual del mes.
  useEffect(() => {
    if (tipo !== "ingreso") return;
    ingresosApi.get(anio, mes).then((d) => {
      setISueldo(d.sueldo ? String(d.sueldo) : "");
      setIOtros(d.otros ? String(d.otros) : "");
    }).catch(() => {});
  }, [tipo, anio, mes]);

  // Cerrar con Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }

  const num = (s: string) => parseFloat(s.replace(",", ".")) || 0;

  async function saveGasto() {
    const monto = num(gMonto);
    if (monto <= 0) { flash("Ingresá un monto"); return; }
    setSaving(true);
    try {
      const body: GastoMensualCreate = {
        mes, anio,
        nombre: gNombre.trim() || gCat,
        monto,
        categoria: gCat,
        moneda: gMoneda,
        nota: null,
      };
      await gastosApi.create(body);
      onSaved();
      flash("✓ Gasto guardado");
      setGMonto(""); setGNombre(""); // dejo categoría/moneda para cargar otro rápido
    } catch (e) { flash((e as Error).message); }
    finally { setSaving(false); }
  }

  async function saveIngreso() {
    setSaving(true);
    try {
      await ingresosApi.upsert(anio, mes, { sueldo: num(iSueldo), otros: num(iOtros) });
      onSaved();
      flash("✓ Ingresos guardados");
    } catch (e) { flash((e as Error).message); }
    finally { setSaving(false); }
  }

  async function saveCuota() {
    const monto = num(cMonto);
    if (!cNombre.trim()) { flash("Ingresá un nombre"); return; }
    if (monto <= 0) { flash("Ingresá un monto"); return; }
    setSaving(true);
    try {
      const body: CuotaCreate = {
        nombre: cNombre.trim(),
        monto_cuota: monto,
        cuota_actual: parseInt(cActual) || 1,
        total_cuotas: parseInt(cTotal) || 1,
        mes_inicio: mes, anio_inicio: anio,
        activa: 1, moneda: cMoneda,
        tarjeta_id: cTarjeta, categoria: cCat, nota: null,
      };
      await cuotasApi.create(body);
      onSaved();
      flash("✓ Cuota guardada");
      setCNombre(""); setCMonto("");
    } catch (e) { flash((e as Error).message); }
    finally { setSaving(false); }
  }

  const catList = categorias.length ? categorias.map((c) => c.nombre) : ["Otros"];

  return (
    <div className="qa-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="qa-panel">
        <div className="qa-grip" />

        {/* Segmented control */}
        <div className="qa-tabs">
          {(["gasto", "ingreso", "cuota"] as Tipo[]).map((t) => (
            <button
              key={t}
              className={`qa-tab${tipo === t ? " active" : ""}`}
              onClick={() => setTipo(t)}
            >
              {t === "gasto" ? "Gasto" : t === "ingreso" ? "Ingreso" : "Cuota"}
            </button>
          ))}
          <button className="qa-close" onClick={onClose} aria-label="Cerrar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="qa-body">
          {/* ── GASTO ── */}
          {tipo === "gasto" && (
            <>
              <div className="qa-amount">
                <span className="qa-amount__currency">{gMoneda === "USD" ? "U$D" : "$"}</span>
                <input
                  className="qa-amount__input"
                  inputMode="decimal"
                  placeholder="0"
                  value={gMonto}
                  onChange={(e) => setGMonto(e.target.value.replace(/[^\d.,]/g, ""))}
                  autoFocus
                />
                <button
                  type="button"
                  className="qa-cur"
                  onClick={() => setGMoneda((m) => (m === "ARS" ? "USD" : "ARS"))}
                >
                  {gMoneda}
                </button>
              </div>

              <span className="qa-label">Categoría</span>
              <div className="qa-chips">
                {catList.map((c) => {
                  const cat = categorias.find((x) => x.nombre === c);
                  return (
                    <button
                      key={c}
                      className={`qa-chip${gCat === c ? " active" : ""}`}
                      onClick={() => setGCat(c)}
                    >
                      {cat && <span className="qa-chip__dot" style={{ background: cat.color }} />}
                      {c}
                    </button>
                  );
                })}
              </div>

              <input
                className="qa-input"
                placeholder="Detalle (opcional) — ej: súper, nafta..."
                value={gNombre}
                onChange={(e) => setGNombre(e.target.value)}
              />

              <button className="qa-save" onClick={saveGasto} disabled={saving}>
                {saving ? "Guardando..." : "Guardar gasto"}
              </button>
            </>
          )}

          {/* ── INGRESO ── */}
          {tipo === "ingreso" && (
            <>
              <p className="qa-hint">Ingresos de {MONTHS[mes - 1]} {anio}</p>
              <span className="qa-label">Sueldo</span>
              <div className="qa-amount qa-amount--sm">
                <span className="qa-amount__currency">$</span>
                <input className="qa-amount__input" inputMode="decimal" placeholder="0"
                  value={iSueldo} onChange={(e) => setISueldo(e.target.value.replace(/[^\d.,]/g, ""))} autoFocus />
              </div>
              <span className="qa-label">Otros ingresos</span>
              <div className="qa-amount qa-amount--sm">
                <span className="qa-amount__currency">$</span>
                <input className="qa-amount__input" inputMode="decimal" placeholder="0"
                  value={iOtros} onChange={(e) => setIOtros(e.target.value.replace(/[^\d.,]/g, ""))} />
              </div>
              <button className="qa-save" onClick={saveIngreso} disabled={saving}>
                {saving ? "Guardando..." : "Guardar ingresos"}
              </button>
            </>
          )}

          {/* ── CUOTA ── */}
          {tipo === "cuota" && (
            <>
              <input className="qa-input" placeholder="Nombre — ej: TV, notebook..."
                value={cNombre} onChange={(e) => setCNombre(e.target.value)} autoFocus />

              <div className="qa-amount qa-amount--sm">
                <span className="qa-amount__currency">{cMoneda === "USD" ? "U$D" : "$"}</span>
                <input className="qa-amount__input" inputMode="decimal" placeholder="0"
                  value={cMonto} onChange={(e) => setCMonto(e.target.value.replace(/[^\d.,]/g, ""))} />
                <button type="button" className="qa-cur" onClick={() => setCMoneda((m) => (m === "ARS" ? "USD" : "ARS"))}>
                  {cMoneda}
                </button>
              </div>
              <span className="qa-sublabel">Monto por cuota</span>

              <div className="qa-row">
                <div>
                  <span className="qa-label">Cuota actual</span>
                  <input className="qa-input" inputMode="numeric" value={cActual}
                    onChange={(e) => setCActual(e.target.value.replace(/\D/g, ""))} />
                </div>
                <div>
                  <span className="qa-label">Total cuotas</span>
                  <input className="qa-input" inputMode="numeric" value={cTotal}
                    onChange={(e) => setCTotal(e.target.value.replace(/\D/g, ""))} />
                </div>
              </div>

              <span className="qa-label">Categoría</span>
              <div className="qa-chips">
                <button className={`qa-chip${cCat === "Sin categoría" ? " active" : ""}`} onClick={() => setCCat("Sin categoría")}>
                  Sin categoría
                </button>
                {categorias.map((c) => (
                  <button key={c.id} className={`qa-chip${cCat === c.nombre ? " active" : ""}`} onClick={() => setCCat(c.nombre)}>
                    <span className="qa-chip__dot" style={{ background: c.color }} />{c.nombre}
                  </button>
                ))}
              </div>

              {tarjetas.length > 0 && (
                <>
                  <span className="qa-label">Tarjeta</span>
                  <div className="qa-chips">
                    <button className={`qa-chip${cTarjeta === null ? " active" : ""}`} onClick={() => setCTarjeta(null)}>
                      Sin tarjeta
                    </button>
                    {tarjetas.map((t) => (
                      <button key={t.id} className={`qa-chip${cTarjeta === t.id ? " active" : ""}`} onClick={() => setCTarjeta(t.id)}>
                        {t.nombre} ···{t.ultimos_4}
                      </button>
                    ))}
                  </div>
                </>
              )}

              <p className="qa-hint">Inicio: {MONTHS[mes - 1]} {anio}</p>
              <button className="qa-save" onClick={saveCuota} disabled={saving}>
                {saving ? "Guardando..." : "Guardar cuota"}
              </button>
            </>
          )}
        </div>

        {toast && <div className="qa-toast">{toast}</div>}
      </div>
    </div>
  );
}
