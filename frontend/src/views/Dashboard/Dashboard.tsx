import { useState, useEffect } from "react";
import { resumenApi, resumenCategoriasApi, cuotasApi, presupuestoApi, ahorroMesApi, type Resumen, type CategoriaBreakdown, type Cuota, type Presupuesto } from "../../api_client";
import { MetricCard } from "../../components/Card";
import { Card } from "../../components/Card";
import DonutChart, { type DonutSlice } from "../../components/DonutChart";
import ImportResumen from "../../components/ImportResumen";
import BudgetRing from "../../components/BudgetRing";
import CountUp from "../../components/CountUp";
import { Skeleton } from "../../components/Skeleton";
import { useNav } from "../../lib/nav";
import { usePeriod } from "../../lib/period";
import PeriodSelector from "../../components/PeriodSelector";
import type { ViewId } from "../../components/Sidebar";
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

const BUCKET_TO_VIEW: Record<string, ViewId> = {
  Fijos: "fijos",
  Mensuales: "gastos",
  Cuotas: "cuotas",
};

export default function Dashboard() {
  const nav = useNav();
  const now = new Date();
  const { anio, mes, prev, next, goToday, isCurrent } = usePeriod();

  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [catBreakdown, setCatBreakdown] = useState<CategoriaBreakdown[]>([]);
  const [cuotasPronto, setCuotasPronto] = useState<(Cuota & { remaining: number })[]>([]);
  const [presu, setPresu]     = useState<Presupuesto | null>(null);
  const [ahorroMes, setAhorroMes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const currentPeriod = now.getFullYear() * 12 + now.getMonth() + 1;

    Promise.all([
      resumenApi.get(anio, mes),
      resumenCategoriasApi.get(anio, mes),
      cuotasApi.list(),
      presupuestoApi.get(),
      ahorroMesApi.get(anio, mes),
    ])
      .then(([r, cats, cuotas, presupuesto, ahorro]) => {
        setResumen(r);
        setCatBreakdown(cats);
        setPresu(presupuesto);
        setAhorroMes(ahorro);
        // Cuotas que terminan en los próximos 3 meses (inclusive el mes actual)
        const pronto = cuotas
          .filter((c) => c.activa)
          .map((c) => {
            const endPeriod = c.anio_inicio * 12 + c.mes_inicio + c.total_cuotas - 1;
            const remaining = endPeriod - currentPeriod + 1;
            return { ...c, remaining };
          })
          .filter((c) => c.remaining >= 1 && c.remaining <= 3)
          .sort((a, b) => a.remaining - b.remaining);
        setCuotasPronto(pronto);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [anio, mes, refreshKey]);


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
  // Fila de presupuesto: usado vs. asignado (budget = sueldo × %).
  function renderBudgetRow(label: string, color: string, used: number, budget: number) {
    const pct = budget > 0 ? (used / budget) * 100 : 0;
    const remaining = budget - used;
    const over = budget > 0 && used > budget;
    return (
      <div className="balance-bar" style={{ marginBottom: "var(--space-5)" }} key={label}>
        <div className="balance-bar__header">
          <span className="balance-bar__title" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
            {label}
          </span>
          <span style={{ fontSize: "var(--text-xs)", fontWeight: "var(--font-semibold)", color: over ? "var(--negative)" : "var(--positive)", fontVariantNumeric: "tabular-nums" }}>
            {over ? `excedido ${fmt(-remaining)}` : `quedan ${fmt(remaining)}`}
          </span>
        </div>
        <div className="balance-bar__track">
          <div className="balance-bar__fill" style={{ width: `${Math.min(100, pct)}%`, background: over ? "var(--negative)" : color }} />
        </div>
        <div className="balance-bar__labels">
          <span>usaste {fmt(used)}</span>
          <span>de {fmt(budget)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Period selector */}
      <div className="dashboard__period">
        <PeriodSelector anio={anio} mes={mes} onPrev={prev} onNext={next} onToday={goToday} isCurrent={isCurrent} />

        {resumen && (
          <span className="dolar-badge">
            <span className="dolar-badge__dot" />
            USD ${resumen.dolar_rate.toLocaleString("es-AR")}
          </span>
        )}

        <button className="btn-ghost" style={{ marginLeft: "auto" }} onClick={() => setShowImport(true)} title="Importar resumen de tarjeta">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Importar resumen
        </button>
      </div>

      {/* Loading → skeletons */}
      {loading && (
        <>
          <Card>
            <div className="dashboard__hero-inner">
              <Skeleton width={200} height={200} radius="50%" />
              <div className="dashboard__hero-stats">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)" }}>
                    <Skeleton width={80} height={13} />
                    <Skeleton width={90} height={13} />
                  </div>
                ))}
              </div>
            </div>
          </Card>
          <div className="dashboard__metrics">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i}>
                <div className="metric-card">
                  <Skeleton width={70} height={12} />
                  <Skeleton width={110} height={30} radius={10} />
                  <Skeleton width={90} height={12} />
                </div>
              </Card>
            ))}
          </div>
        </>
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
          {/* Hero: anillo del mes */}
          {(() => {
            const base = resumen.sueldo > 0 ? resumen.sueldo : resumen.ingresos;
            if (base <= 0) return null;
            const rows: { label: string; value: number; color: string }[] = [
              { label: "Ingresos", value: resumen.ingresos, color: "var(--positive)" },
              { label: "Gastos", value: resumen.total_gastos, color: "var(--negative)" },
              { label: "Cuotas", value: resumen.cuotas, color: "var(--warning)" },
              { label: "Balance", value: resumen.balance, color: resumen.balance >= 0 ? "var(--positive)" : "var(--negative)" },
            ];
            return (
              <Card className="dashboard__hero">
                <div className="dashboard__hero-inner">
                  <BudgetRing used={resumen.total_gastos} budget={base} fmt={fmt} />
                  <div className="dashboard__hero-stats">
                    <p className="dashboard__hero-title">
                      {resumen.sueldo > 0 ? "Gastado del sueldo" : "Gastado de tus ingresos"} este mes
                    </p>
                    {rows.map((r) => (
                      <div key={r.label} className="dashboard__hero-row">
                        <span className="dashboard__hero-row-label">{r.label}</span>
                        <span className="dashboard__hero-row-value" style={{ color: r.color }}>
                          <CountUp value={r.value} format={fmt} />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            );
          })()}

          {/* Metric cards */}
          <div className="dashboard__metrics">
            <MetricCard
              label="Ingresos"
              value={<CountUp value={resumen.ingresos} format={fmtShort} />}
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
              value={<CountUp value={resumen.total_gastos} format={fmtShort} />}
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
              value={<CountUp value={resumen.balance} format={fmtShort} />}
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
              value={<CountUp value={resumen.cuotas} format={fmtShort} />}
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

          {/* Presupuesto del mes */}
          {presu && resumen.sueldo > 0 && (
            <Card>
              <p className="dashboard__section-title">Presupuesto del mes · sobre tu sueldo</p>
              {renderBudgetRow("Gastos", "var(--warning)",  resumen.gastos_fijos + resumen.gastos_mensuales, resumen.sueldo * presu.pct_gastos / 100)}
              {renderBudgetRow("Cuotas", "var(--negative)", resumen.cuotas, resumen.sueldo * presu.pct_cuotas / 100)}
              {renderBudgetRow("Ahorro", "var(--positive)", ahorroMes, resumen.sueldo * presu.pct_ahorro / 100)}
            </Card>
          )}

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
                  onSliceClick={(i) => {
                    const view = BUCKET_TO_VIEW[donutSlices[i].label];
                    if (view) nav(view);
                  }}
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

          {/* Widget: cuotas que terminan pronto */}
          {cuotasPronto.length > 0 && (
            <Card>
              <p className="dashboard__section-title">
                <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  Cuotas por terminar
                </span>
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                {cuotasPronto.map((c) => {
                  const totalM   = c.mes_inicio + c.total_cuotas - 1;
                  const endYear  = c.anio_inicio + Math.floor((totalM - 1) / 12);
                  const endMonth = ((totalM - 1) % 12) + 1;
                  const label = c.remaining === 1
                    ? "Último pago este mes"
                    : c.remaining === 2
                    ? "Termina el mes que viene"
                    : `Termina en ${MONTHS[endMonth - 1]} ${endYear}`;
                  return (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-3)", background: "var(--bg-elevated)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: "var(--font-medium)", color: "var(--text-primary)", fontSize: "var(--text-sm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nombre}</div>
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--warning)", marginTop: 2 }}>{label}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-semibold)", color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                          {c.moneda === "USD"
                            ? `U$D ${c.monto_cuota.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : fmt(c.monto_cuota)}
                        </div>
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                          {c.remaining === 1 ? "1 cuota" : `${c.remaining} cuotas`} restante{c.remaining !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

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

      {showImport && (
        <ImportResumen
          anio={anio}
          mes={mes}
          onClose={() => setShowImport(false)}
          onApplied={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
