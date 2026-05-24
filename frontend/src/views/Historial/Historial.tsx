import { useState, useEffect } from "react";
import { historialApi, type ResumenMes } from "../../api_client";
import { Card } from "../../components/Card";
import BarChart, { type BarChartBar } from "../../components/BarChart";
import "./Historial.css";

const RANGES = [3, 6, 12] as const;

function fmt(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

function fmtFull(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

export default function Historial() {
  const [meses, setMeses]   = useState<3 | 6 | 12>(6);
  const [data, setData]     = useState<ResumenMes[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    historialApi.get(meses)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [meses]);

  const now = new Date();
  const currentLabel = `${["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][now.getMonth()]} ${now.getFullYear()}`;

  const ingresosData: BarChartBar[] = data.map((d) => ({
    label: d.label,
    value: d.ingresos,
    detail: fmtFull(d.ingresos),
    isCurrent: d.label === currentLabel,
  }));

  const gastosData: BarChartBar[] = data.map((d) => ({
    label: d.label,
    value: d.total_gastos,
    detail: fmtFull(d.total_gastos),
    isCurrent: d.label === currentLabel,
  }));

  const balanceData: BarChartBar[] = data.map((d) => ({
    label: d.label,
    value: Math.abs(d.balance),
    detail: `${d.balance >= 0 ? "+" : "-"}${fmtFull(Math.abs(d.balance))}`,
    isCurrent: d.label === currentLabel,
  }));

  // Aggregate stats
  const totalIngresos  = data.reduce((s, d) => s + d.ingresos, 0);
  const totalGastos    = data.reduce((s, d) => s + d.total_gastos, 0);
  const totalBalance   = data.reduce((s, d) => s + d.balance, 0);
  const avgBalance     = data.length > 0 ? totalBalance / data.length : 0;

  return (
    <div className="historial">
      {/* Toolbar */}
      <div className="historial__toolbar">
        <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>Últimos</span>
        {RANGES.map((r) => (
          <button
            key={r}
            className={`historial__range-btn${meses === r ? " active" : ""}`}
            onClick={() => setMeses(r)}
          >
            {r} meses
          </button>
        ))}
      </div>

      {error && (
        <p style={{ color: "var(--negative)", fontSize: "var(--text-sm)" }}>{error}</p>
      )}

      {loading ? (
        <Card><div className="abm-loading"><div className="spinner" /></div></Card>
      ) : (
        <>
          {/* Stats summary */}
          <Card>
            <div className="historial__stats">
              <div className="historial__stat">
                <span className="historial__stat-label">Ingresos acumulados</span>
                <span className="historial__stat-value" style={{ color: "var(--positive)" }}>
                  {fmt(totalIngresos)}
                </span>
              </div>
              <div className="historial__stat">
                <span className="historial__stat-label">Gastos acumulados</span>
                <span className="historial__stat-value" style={{ color: "var(--negative)" }}>
                  {fmt(totalGastos)}
                </span>
              </div>
              <div className="historial__stat">
                <span className="historial__stat-label">Balance acumulado</span>
                <span className="historial__stat-value" style={{ color: totalBalance >= 0 ? "var(--positive)" : "var(--negative)" }}>
                  {totalBalance >= 0 ? "+" : ""}{fmt(totalBalance)}
                </span>
              </div>
              <div className="historial__stat">
                <span className="historial__stat-label">Balance promedio / mes</span>
                <span className="historial__stat-value" style={{ color: avgBalance >= 0 ? "var(--positive)" : "var(--negative)" }}>
                  {avgBalance >= 0 ? "+" : ""}{fmt(avgBalance)}
                </span>
              </div>
            </div>
          </Card>

          {/* Charts: Ingresos | Gastos */}
          <div className="historial__charts">
            <Card>
              <p className="historial__section-title">Ingresos</p>
              <BarChart data={ingresosData} height={180} formatValue={fmt} />
            </Card>
            <Card>
              <p className="historial__section-title">Total Gastos</p>
              <BarChart data={gastosData} height={180} formatValue={fmt} />
            </Card>
          </div>

          {/* Balance chart (full width) */}
          <Card>
            <p className="historial__section-title">Balance mensual (valor absoluto)</p>
            <BarChart data={balanceData} height={160} formatValue={fmt} />
            <div style={{ marginTop: "var(--space-3)", display: "flex", flexWrap: "wrap", gap: "var(--space-4)" }}>
              {data.map((d) => (
                <span
                  key={`${d.anio}-${d.mes}`}
                  style={{
                    fontSize: "var(--text-xs)",
                    color: d.balance >= 0 ? "var(--positive)" : "var(--negative)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {d.label}: {d.balance >= 0 ? "+" : ""}{fmt(d.balance)}
                </span>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
