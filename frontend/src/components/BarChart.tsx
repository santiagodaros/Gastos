import { useEffect, useRef, useState } from "react";
import "./BarChart.css";

export interface BarChartBar {
  label: string;
  value: number;
  detail?: string;
  isCurrent?: boolean;
}

interface BarChartProps {
  data: BarChartBar[];
  height?: number;
  formatValue?: (v: number) => string;
  color?: string;
  onBarClick?: (index: number) => void;
  activeIndex?: number | null;
}

function fmtAxisY(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

export default function BarChart({
  data,
  height = 220,
  formatValue = fmtAxisY,
  onBarClick,
  activeIndex = null,
}: BarChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    bar: BarChartBar;
  } | null>(null);
  const [animated, setAnimated] = useState(false);
  // Ancho real del contenedor → el viewBox coincide 1:1 con los píxeles y no se
  // deforma (antes usaba 600 fijo + preserveAspectRatio=none y se estiraba).
  const [wrapW, setWrapW] = useState(600);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw && cw > 0) setWrapW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Animate on mount / data change
  useEffect(() => {
    setAnimated(false);
    const t = setTimeout(() => setAnimated(true), 30);
    return () => clearTimeout(t);
  }, [data]);

  if (!data.length) return null;

  const maxVal = Math.max(...data.map((d) => d.value), 1);

  // Layout constants
  const paddingLeft = 52;
  const paddingRight = 12;
  const paddingTop = 12;
  const paddingBottom = 36; // space for X labels
  const svgWidth = Math.max(320, Math.round(wrapW)); // = ancho real del contenedor
  const svgHeight = height;
  const chartW = svgWidth - paddingLeft - paddingRight;
  const chartH = svgHeight - paddingTop - paddingBottom;

  const barCount = data.length;
  const barGap = 0.25;
  // Ancho de barra con tope, para que en gráficos anchos no queden gigantes.
  const barW = Math.min((chartW / barCount) * (1 - barGap), 80);
  const barStep = chartW / barCount;

  // Y axis ticks — 4 intervals
  const tickCount = 4;
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) =>
    (maxVal / tickCount) * i
  );

  function barX(i: number) {
    return paddingLeft + i * barStep + (barStep - barW) / 2;
  }

  function barHeight(val: number) {
    return val > 0 ? (val / maxVal) * chartH : 0;
  }

  function barY(val: number) {
    return paddingTop + chartH - barHeight(val);
  }

  return (
    <div className="bar-chart" ref={wrapRef} style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: `${height}px`, display: "block" }}
        onMouseLeave={() => setTooltip(null)}
      >
        <defs>
          <linearGradient id="bar-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.5" />
          </linearGradient>
          <linearGradient id="bar-gradient-active" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-hover)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.8" />
          </linearGradient>
        </defs>

        {/* Y-axis grid lines + labels */}
        {yTicks.map((tick, i) => {
          const y = paddingTop + chartH - (tick / maxVal) * chartH;
          return (
            <g key={i}>
              <line
                x1={paddingLeft}
                y1={y}
                x2={svgWidth - paddingRight}
                y2={y}
                stroke="var(--border)"
                strokeWidth="1"
                strokeDasharray={i === 0 ? "none" : "3 3"}
              />
              <text
                x={paddingLeft - 6}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fill="var(--text-muted)"
                fontFamily="var(--font-mono)"
              >
                {fmtAxisY(tick)}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((bar, i) => {
          const x = barX(i);
          const bh = barHeight(bar.value);
          const by = barY(bar.value);
          const isActive = activeIndex === i;
          const isCurrent = bar.isCurrent;
          const isEmpty = bar.value === 0;

          const gradientId = isActive || isCurrent
            ? "url(#bar-gradient-active)"
            : "url(#bar-gradient)";

          return (
            <g key={i}>
              {/* Hover hit area */}
              <rect
                x={paddingLeft + i * barStep}
                y={paddingTop}
                width={barStep}
                height={chartH}
                fill="transparent"
                style={{ cursor: onBarClick ? "pointer" : "default" }}
                onMouseEnter={() => {
                  const svg = svgRef.current;
                  if (!svg) return;
                  const rect = svg.getBoundingClientRect();
                  const scaleX = rect.width / svgWidth;
                  const scaleY = rect.height / svgHeight;
                  setTooltip({
                    x: (x + barW / 2) * scaleX,
                    y: by * scaleY,
                    bar,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
                onClick={() => onBarClick?.(i)}
              />

              {/* Bar rect */}
              {isEmpty ? (
                <rect
                  x={x}
                  y={paddingTop + chartH - 3}
                  width={barW}
                  height={3}
                  rx="2"
                  fill="var(--border-strong)"
                  opacity="0.4"
                />
              ) : (
                <rect
                  x={x}
                  y={animated ? by : paddingTop + chartH}
                  width={barW}
                  height={animated ? bh : 0}
                  rx="3"
                  fill={gradientId}
                  opacity={isEmpty ? 0.2 : 1}
                  style={{
                    transition: "y 0.4s cubic-bezier(0.4,0,0.2,1), height 0.4s cubic-bezier(0.4,0,0.2,1)",
                    filter: isActive ? "drop-shadow(0 0 6px var(--accent-glow))" : "none",
                  }}
                />
              )}

              {/* X label */}
              <text
                x={x + barW / 2}
                y={svgHeight - 6}
                textAnchor="middle"
                fontSize="10"
                fill={isCurrent ? "var(--accent)" : "var(--text-secondary)"}
                fontFamily="var(--font-sans)"
                fontWeight={isCurrent ? "600" : "400"}
              >
                {bar.label}
              </text>

              {/* Current month indicator dot */}
              {isCurrent && (
                <circle
                  cx={x + barW / 2}
                  cy={svgHeight - paddingBottom + 8}
                  r="2.5"
                  fill="var(--accent)"
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="bar-chart__tooltip"
          style={{
            left: tooltip.x,
            top: tooltip.y,
          }}
        >
          <div className="bar-chart__tooltip-label">{tooltip.bar.label}</div>
          <div className="bar-chart__tooltip-value">
            {formatValue(tooltip.bar.value)}
          </div>
          {tooltip.bar.detail && (
            <div className="bar-chart__tooltip-detail">{tooltip.bar.detail}</div>
          )}
        </div>
      )}
    </div>
  );
}
