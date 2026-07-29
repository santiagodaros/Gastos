import { useEffect, useRef, useState } from "react";
import "./DonutChart.css";

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
  formatValue?: (v: number) => string;
  onSliceClick?: (index: number) => void;
}

export default function DonutChart({
  slices,
  size = 160,
  thickness = 22,
  centerLabel = "total",
  centerValue,
  formatValue = (v) => v.toLocaleString("es-AR"),
  onSliceClick,
}: DonutChartProps) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;

  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const displayValue = centerValue ?? formatValue(total);

  const [active, setActive] = useState<number | null>(null);

  // Build segments — start at top (−90°). Guardo la bisectriz para "despegar".
  let offset = circumference * 0.25;
  let acc = 0;
  const push = 9;

  const segments = slices.map((slice) => {
    const pct = total > 0 ? slice.value / total : 0;
    const dash = pct * circumference;
    const gap = circumference - dash;
    const currentOffset = circumference - offset;
    offset += dash;

    const midFrac = acc + pct / 2;
    acc += pct;
    const dx = Math.sin(2 * Math.PI * midFrac) * push;
    const dy = -Math.cos(2 * Math.PI * midFrac) * push;

    return { ...slice, pct, dash, gap, strokeOffset: currentOffset, dx, dy };
  });

  const svgRef = useRef<SVGSVGElement>(null);

  // Animate on mount
  useEffect(() => {
    const circles = svgRef.current?.querySelectorAll<SVGCircleElement>(".donut-chart__segment");
    circles?.forEach((el, i) => {
      el.style.strokeDashoffset = `${circumference}`;
      setTimeout(() => {
        el.style.strokeDashoffset = `${segments[i].strokeOffset}`;
      }, 50 + i * 80);
    });
  }, [slices]);

  const activeSeg = active !== null ? segments[active] : null;
  const clickable = !!onSliceClick;

  return (
    <div className="donut-chart">
      {/* SVG */}
      <div className="donut-chart__svg-wrapper" style={{ width: size, height: size }}>
        <svg ref={svgRef} width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Track */}
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="var(--bg-elevated)" strokeWidth={thickness} />

          {/* Segments */}
          {segments.map((seg, i) => {
            const isActive = active === i;
            const dimmed = active !== null && !isActive;
            return (
              <circle
                key={i}
                className="donut-chart__segment"
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={isActive ? thickness + 3 : thickness}
                strokeDasharray={`${seg.dash} ${seg.gap}`}
                strokeDashoffset={seg.strokeOffset}
                strokeLinecap="butt"
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onClick={() => onSliceClick?.(i)}
                style={{
                  transform: isActive ? `translate(${seg.dx}px, ${seg.dy}px)` : "none",
                  opacity: dimmed ? 0.32 : 1,
                  cursor: clickable ? "pointer" : "default",
                  filter: isActive ? `drop-shadow(0 0 7px ${seg.color})` : "none",
                  transition: "stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1), transform 0.22s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease, stroke-width 0.2s ease, filter 0.2s ease",
                }}
              />
            );
          })}
        </svg>

        {/* Center text */}
        <div className="donut-chart__center" style={clickable && activeSeg ? { cursor: "pointer" } : undefined}
          onClick={() => activeSeg && onSliceClick?.(active!)}>
          {activeSeg ? (
            <>
              <span className="donut-chart__center-value" style={{ color: activeSeg.color }}>
                {formatValue(activeSeg.value)}
              </span>
              <span className="donut-chart__center-label">
                {activeSeg.label} · {(activeSeg.pct * 100).toFixed(1)}%
              </span>
            </>
          ) : (
            <>
              <span className="donut-chart__center-value">{displayValue}</span>
              <span className="donut-chart__center-label">{centerLabel}</span>
            </>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="donut-chart__legend">
        {slices.map((slice, i) => (
          <div
            key={i}
            className={`donut-chart__legend-item${active === i ? " is-active" : ""}`}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onClick={() => onSliceClick?.(i)}
            style={{ cursor: clickable ? "pointer" : "default" }}
          >
            <span className="donut-chart__legend-dot" style={{ background: slice.color }} />
            <div className="donut-chart__legend-info">
              <div className="donut-chart__legend-name">{slice.label}</div>
              <div className="donut-chart__legend-value">
                {formatValue(slice.value)}
                {total > 0 && <> · {((slice.value / total) * 100).toFixed(1)}%</>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
