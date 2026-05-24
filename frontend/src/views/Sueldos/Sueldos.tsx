import { useState, useEffect } from "react";
import { ingresosApi, type Ingresos } from "../../api_client";
import { Card } from "../../components/Card";
import PeriodSelector from "../../components/PeriodSelector";
import "../../styles/abm.css";

function fmt(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

export default function Sueldos() {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes]   = useState(now.getMonth() + 1);

  const [data, setData]     = useState<Ingresos | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const [sueldo, setSueldo] = useState(0);
  const [otros, setOtros]   = useState(0);

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
    setSaved(false);
    ingresosApi.get(anio, mes)
      .then((d) => {
        setData(d);
        setSueldo(d.sueldo);
        setOtros(d.otros);
      })
      .catch((e: Error) => {
        // 404 = no hay registro — empezamos en 0
        if (e.message === "Not Found") {
          setData(null);
          setSueldo(0);
          setOtros(0);
        } else {
          setError(e.message);
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [anio, mes]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await ingresosApi.upsert(anio, mes, { sueldo, otros });
      setSaved(true);
      load();
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="abm">
      <div className="abm__toolbar">
        <div className="abm__toolbar-left">
          <PeriodSelector anio={anio} mes={mes} onPrev={prevMonth} onNext={nextMonth} />
          {data && <span className="badge badge--positive">Registrado</span>}
          {!data && !loading && <span className="badge badge--neutral">Sin registro</span>}
        </div>
      </div>

      {error && <p style={{ color: "var(--negative)", fontSize: "var(--text-sm)" }}>{error}</p>}

      <Card>
        {loading ? (
          <div className="abm-loading"><div className="spinner" /></div>
        ) : (
          <form className="form sueldo-form" onSubmit={handleSubmit}>
            <div className="form__field">
              <label className="form__label">Sueldo</label>
              <input
                className="form__input"
                type="number"
                min={0}
                step="0.01"
                value={sueldo || ""}
                onChange={(e) => setSueldo(parseFloat(e.target.value) || 0)}
                placeholder="0"
                autoFocus
              />
            </div>
            <div className="form__field">
              <label className="form__label">Otros ingresos</label>
              <input
                className="form__input"
                type="number"
                min={0}
                step="0.01"
                value={otros || ""}
                onChange={(e) => setOtros(parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>

            {/* Total preview */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "var(--space-4)",
              background: "var(--bg-elevated)",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
            }}>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Total ingresos
              </span>
              <span style={{ fontSize: "var(--text-xl)", fontWeight: "var(--font-bold)", color: "var(--positive)", fontVariantNumeric: "tabular-nums" }}>
                {fmt(sueldo + otros)}
              </span>
            </div>

            <div className="form__actions">
              {saved && (
                <span style={{ fontSize: "var(--text-sm)", color: "var(--positive)", marginRight: "auto" }}>
                  ✓ Guardado
                </span>
              )}
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Guardando..." : data ? "Actualizar" : "Guardar"}
              </button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
