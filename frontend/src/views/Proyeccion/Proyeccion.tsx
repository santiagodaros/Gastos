import { useState, useEffect } from "react";
import { proyeccionApi, type ProyeccionMes } from "../../api_client";
import { MetricCard, Card } from "../../components/Card";
import BarChart, { type BarChartBar } from "../../components/BarChart";
import "./Proyeccion.css";

const MESES_OPCIONES = [6, 12, 18, 24] as const;

function fmt(n: number) {
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });
}

function fmtShort(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

function mesKey(mes: number, anio: number) {
  return `${anio}-${mes}`;
}

export default function Proyeccion() {
  const [data, setData]               = useState<ProyeccionMes[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [meses, setMeses]             = useState(12);
  const [expandedMes, setExpandedMes] = useState<string | null>(null);
  const [activeBarIdx, setActiveBarIdx] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    proyeccionApi
      .get(meses)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [meses]);

  // Datos para el gráfico
  const now = new Date();
  const bars: BarChartBar[] = data.map((d, i) => ({
    label: d.label.split(" ")[0], // solo "Abr", "May"...
    value: d.total_ars,
    detail: `${d.cuotas.length} cuota${d.cuotas.length !== 1 ? "s" : ""}`,
    isCurrent: i === 0 && d.mes === now.getMonth() + 1 && d.anio === now.getFullYear(),
  }));

  // Total de todos los meses
  const totalArs = data.reduce((s, d) => s + d.total_ars, 0);

  function handleBarClick(idx: number) {
    const item = data[idx];
    if (!item) return;
    const key = mesKey(item.mes, item.anio);
    setActiveBarIdx(idx);
    setExpandedMes((prev) => (prev === key ? null : key));
  }

  function handleRowClick(item: ProyeccionMes) {
    const key = mesKey(item.mes, item.anio);
    const idx = data.findIndex((d) => d.mes === item.mes && d.anio === item.anio);
    setActiveBarIdx(idx >= 0 ? idx : null);
    setExpandedMes((prev) => (prev === key ? null : key));
  }

  return (
    <div className="proyeccion">
      {/* Header */}
      <div className="proyeccion__header">
        <h2 className="proyeccion__title">Proyección de Cuotas</h2>
        <div className="proyeccion__meses-selector">
          {MESES_OPCIONES.map((m) => (
            <button
              key={m}
              className={`proyeccion__meses-btn${meses === m ? " active" : ""}`}
              onClick={() => setMeses(m)}
            >
              {m}m
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="proyeccion__loading">
          <div className="spinner" />
          <span>Calculando proyección...</span>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="proyeccion__error">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </div>
      )}

      {!loading && !error && data.length > 0 && (
        <>
          {/* Metric card */}
          <div className="proyeccion__metrics">
            <MetricCard
              label={`Total próximos ${meses} meses`}
              value={fmtShort(totalArs)}
              valueColor="warning"
              variant="warning"
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                  <line x1="1" y1="10" x2="23" y2="10" />
                </svg>
              }
              footer={fmt(totalArs)}
              badge={
                data.length > 0
                  ? {
                      text: `${data.filter((d) => d.cuotas.length > 0).length} meses con cuotas`,
                      type: "warning",
                    }
                  : undefined
              }
            />

            <MetricCard
              label="Promedio mensual"
              value={fmtShort(totalArs / data.length)}
              valueColor="accent"
              variant="accent"
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                  <line x1="2" y1="20" x2="22" y2="20" />
                </svg>
              }
              footer={fmt(totalArs / data.length)}
            />
          </div>

          {/* Gráfico */}
          <Card>
            <p className="proyeccion__section-title">Evolución mensual en ARS</p>
            <div className="proyeccion__chart-wrapper">
              <BarChart
                data={bars}
                height={240}
                formatValue={(v) =>
                  v.toLocaleString("es-AR", {
                    style: "currency",
                    currency: "ARS",
                    maximumFractionDigits: 0,
                  })
                }
                onBarClick={handleBarClick}
                activeIndex={activeBarIdx}
              />
            </div>
            <p className="proyeccion__chart-hint">
              Hacé clic en una barra para ver el detalle del mes
            </p>
          </Card>

          {/* Tabla detalle */}
          <Card>
            <p className="proyeccion__section-title">Detalle por mes</p>
            <div className="proyeccion__table">
              {data.map((item) => {
                const key = mesKey(item.mes, item.anio);
                const isExpanded = expandedMes === key;
                const isActive = activeBarIdx !== null && data[activeBarIdx] &&
                  mesKey(data[activeBarIdx].mes, data[activeBarIdx].anio) === key;

                return (
                  <div
                    key={key}
                    className={`proyeccion__row${isExpanded ? " expanded" : ""}${isActive ? " highlighted" : ""}`}
                  >
                    <button
                      className="proyeccion__row-header"
                      onClick={() => handleRowClick(item)}
                    >
                      <span className="proyeccion__row-chevron">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{
                            transform: isExpanded ? "rotate(90deg)" : "none",
                            transition: "transform var(--transition-fast)",
                          }}
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </span>

                      <span className="proyeccion__row-label">{item.label}</span>

                      <span className="proyeccion__row-badge">
                        {item.cuotas.length} cuota{item.cuotas.length !== 1 ? "s" : ""}
                      </span>

                      <span className="proyeccion__row-total">
                        {item.total_ars > 0 ? fmt(item.total_ars) : "—"}
                      </span>
                    </button>

                    {isExpanded && item.cuotas.length > 0 && (
                      <div className="proyeccion__row-detail">
                        {item.cuotas.map((c) => (
                          <div key={c.id} className="proyeccion__cuota-item">
                            <span className="proyeccion__cuota-nombre">{c.nombre}</span>
                            <span className="proyeccion__cuota-progreso">
                              {c.numero_cuota}/{c.total_cuotas}
                            </span>
                            <span className="proyeccion__cuota-monto">
                              {fmt(c.monto_ars)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {isExpanded && item.cuotas.length === 0 && (
                      <div className="proyeccion__row-detail">
                        <span className="proyeccion__row-empty">Sin cuotas activas este mes</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
