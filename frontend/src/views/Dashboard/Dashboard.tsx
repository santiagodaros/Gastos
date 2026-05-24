import { useState, useEffect } from "react";
import { resumenApi, resumenCategoriasApi, type Resumen, type CategoriaBreakdown } from "../../api_client";
import { MetricCard } from "../../components/Card";
import { Card } from "../../components/Card";
import DonutChart, { type DonutSlice } from "../../components/DonutChart";
import "../../styles/abm.css";
import "./Dashboard.css";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function fmt(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

function fmtShort(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

export default function Dashboard() {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes]   = useState(now.getMonth() + 1);

  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [catBreakdown, setCatBreakdown] = useState<CategoriaBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      resumenApi.get(anio, mes),
      resumenCategoriasApi.get(anio, mes),
    ])
      .then(([r, cats]) => { setResumen(r); setCatBreakdown(cats); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [anio, mes]);

  function prevMonth() {
    if (mes === 1) { setMes(12); setAnio((y) => y - 1); }
    else setMes((m) => m - 1);
  }

  function nextMonth() {
    if (mes === 12) { setMes(1); setAnio((y) => y + 1); }
    else setMes((m) => m + 1);
  }

  // Donut slices para distribución de gastos
  const donutSlices: DonutSlice[] = resumen
    ? [
        { label: "Fijos",    value: resumen.gastos_fijos,     color: "var(--accent)"    },
        { label: "Mensuales",value: resumen.gastos_mensuales, color: "var(--warning)"   },
        { label: "Cuotas",   value: resumen.cuotas,           color: "var(--negative)"  },
      ].filter((s) => s.value > 0)
    : [];

  // Balance como % de ingresos
  const balancePct = resumen && resumen.ingresos > 0
    ? Math.max(0, Math.min(100, (resumen.balance / resumen.ingresos) * 100))
    : 0;
  const gastosPct = resumen && resumen.ingresos > 0
    ? Math.min(100, (resumen.total_gastos / resumen.ingresos) * 100)
    : 0;

  return (
    <div className="dashboard">
      {/* Period selector */}
      <div className="dashboard__period">
        <button className="dashboard__period-btn" onClick={prevMonth}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="dashboard__period-label">
          {MONTHS[mes - 1]} {anio}
        </span>
        <button className="dashboard__period-btn" onClick={nextMonth}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        {resumen && (
          <span className="dolar-badge">
            <span className="dolar-badge__dot" />
            USD ${resumen.dolar_rate.toLocaleString("es-AR")}
          </span>
        )}
      </div>

      {/* Loading / error */}
      {loading && (
        <div className="dashboard__loading">
          <div className="spinner" />
          <span>Cargando datos...</span>
        </div>
      )}

      {error && !loading && (
        <div className="dashboard__error">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error === "Not Found" ? "No hay datos para este período." : `Error: ${error}`}
        </div>
      )}

      {!loading && resumen && (
        <>
          {/* Metric cards */}
          <div className="dashboard__metrics">
            <MetricCard
              label="Ingresos"
              value={fmtShort(resumen.ingresos)}
              valueColor="positive"
              variant="positive"
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                  <polyline points="16 7 22 7 22 13" />
                </svg>
              }
              footer={fmt(resumen.ingresos)}
            />

            <MetricCard
              label="Total Gastos"
              value={fmtShort(resumen.total_gastos)}
              valueColor="negative"
              variant="negative"
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
                  <polyline points="16 17 22 17 22 11" />
                </svg>
              }
              footer={fmt(resumen.total_gastos)}
            />

            <MetricCard
              label="Balance"
              value={fmtShort(resumen.balance)}
              valueColor={resumen.balance >= 0 ? "positive" : "negative"}
              variant={resumen.balance >= 0 ? "positive" : "negative"}
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="2" x2="12" y2="22" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              }
              badge={
                resumen.balance >= 0
                  ? { text: `+${balancePct.toFixed(0)}% guardado`, type: "positive" }
                  : { text: "Déficit", type: "negative" }
              }
              footer={fmt(resumen.balance)}
            />

            <MetricCard
              label="Cuotas"
              value={fmtShort(resumen.cuotas)}
              valueColor="warning"
              variant="warning"
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                  <line x1="1" y1="10" x2="23" y2="10" />
                </svg>
              }
              footer={fmt(resumen.cuotas)}
            />
          </div>

          {/* Content row */}
          <div className="dashboard__content">
            {/* Donut */}
            <Card>
              <p className="dashboard__section-title">Distribución de Gastos</p>
              {donutSlices.length > 0 ? (
                <DonutChart
                  slices={donutSlices}
                  size={180}
                  thickness={24}
                  centerLabel="gastos"
                  centerValue={fmtShort(resumen.total_gastos)}
                  formatValue={(v) => v.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })}
                />
              ) : (
                <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
                  Sin gastos registrados.
                </p>
              )}
            </Card>

            {/* Balance bars */}
            <Card>
              <p className="dashboard__section-title">Composición de Gastos</p>
              <div className="balance-bar" style={{ marginBottom: "var(--space-5)" }}>
                <div className="balance-bar__header">
                  <span className="balance-bar__title">Fijos</span>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                    {resumen.ingresos > 0 ? ((resumen.gastos_fijos / resumen.ingresos) * 100).toFixed(0) : 0}%
                  </span>
                </div>
                <div className="balance-bar__track">
                  <div
                    className="balance-bar__fill"
                    style={{
                      width: resumen.ingresos > 0 ? `${Math.min(100, (resumen.gastos_fijos / resumen.ingresos) * 100)}%` : "0%",
                      background: "var(--accent)",
                    }}
                  />
                </div>
                <div className="balance-bar__labels">
                  <span>{fmt(resumen.gastos_fijos)}</span>
                  <span>de {fmt(resumen.ingresos)}</span>
                </div>
              </div>

              <div className="balance-bar" style={{ marginBottom: "var(--space-5)" }}>
                <div className="balance-bar__header">
                  <span className="balance-bar__title">Mensuales</span>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                    {resumen.ingresos > 0 ? ((resumen.gastos_mensuales / resumen.ingresos) * 100).toFixed(0) : 0}%
                  </span>
                </div>
                <div className="balance-bar__track">
                  <div
                    className="balance-bar__fill"
                    style={{
                      width: resumen.ingresos > 0 ? `${Math.min(100, (resumen.gastos_mensuales / resumen.ingresos) * 100)}%` : "0%",
                      background: "var(--warning)",
                    }}
                  />
                </div>
                <div className="balance-bar__labels">
                  <span>{fmt(resumen.gastos_mensuales)}</span>
                  <span>de {fmt(resumen.ingresos)}</span>
                </div>
              </div>

              <div className="balance-bar">
                <div className="balance-bar__header">
                  <span className="balance-bar__title">Cuotas</span>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                    {resumen.ingresos > 0 ? ((resumen.cuotas / resumen.ingresos) * 100).toFixed(0) : 0}%
                  </span>
                </div>
                <div className="balance-bar__track">
                  <div
                    className="balance-bar__fill"
                    style={{
                      width: resumen.ingresos > 0 ? `${Math.min(100, (resumen.cuotas / resumen.ingresos) * 100)}%` : "0%",
                      background: "var(--negative)",
                    }}
                  />
                </div>
                <div className="balance-bar__labels">
                  <span>{fmt(resumen.cuotas)}</span>
                  <span>de {fmt(resumen.ingresos)}</span>
                </div>
              </div>
            </Card>
          </div>

          {/* Desglose por categoría */}
          <Card>
            <p className="dashboard__section-title">Desglose por Categoría</p>
            {catBreakdown.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
                Sin gastos categorizados este período.
              </p>
            ) : (
              <div className="cat-breakdown">
                <DonutChart
                  slices={catBreakdown.map((b) => ({ label: b.categoria, value: b.total, color: b.color }))}
                  size={170}
                  thickness={22}
                  centerLabel="total"
                  centerValue={fmtShort(catBreakdown.reduce((s, b) => s + b.total, 0))}
                  formatValue={(v) => v.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })}
                />
                <div className="cat-breakdown__legend" style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", alignSelf: "center" }}>
                  {catBreakdown.map((b) => {
                    const totalAll = catBreakdown.reduce((s, x) => s + x.total, 0);
                    const pct = totalAll > 0 ? (b.total / totalAll) * 100 : 0;
                    return (
                      <div key={b.categoria} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: b.color, flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>{b.categoria}</span>
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", minWidth: 32, textAlign: "right" }}>{pct.toFixed(0)}%</span>
                        <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-medium)", minWidth: 85, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {fmt(b.total)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>

          {/* Desglose sueldo */}
          {(resumen.sueldo > 0 || resumen.otros > 0) && (
            <Card>
              <p className="dashboard__section-title">Desglose de Ingresos</p>
              <div style={{ display: "flex", gap: "var(--space-8)", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "var(--space-1)" }}>Sueldo</div>
                  <div style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--font-bold)", color: "var(--positive)", fontVariantNumeric: "tabular-nums" }}>
                    {fmt(resumen.sueldo)}
                  </div>
                </div>
                {resumen.otros > 0 && (
                  <div>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "var(--space-1)" }}>Otros</div>
                    <div style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--font-bold)", color: "var(--neutral)", fontVariantNumeric: "tabular-nums" }}>
                      {fmt(resumen.otros)}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
