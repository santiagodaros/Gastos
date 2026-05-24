import { useEffect, useRef } from "react";
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
}

export default function DonutChart({
  slices,
  size = 160,
  thickness = 22,
  centerLabel = "total",
  centerValue,
  formatValue = (v) => v.toLocaleString("es-AR"),
}: DonutChartProps) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;

  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const displayValue = centerValue ?? formatValue(total);

  // Build segments — start at top (−90°)
  let offset = circumference * 0.25; // rotate start to 12 o'clock

  const segments = slices.map((slice) => {
    const pct = total > 0 ? slice.value / total : 0;
    const dash = pct * circumference;
    const gap = circumference - dash;
    const currentOffset = circumference - offset;

    offset += dash;

    return { ...slice, dash, gap, strokeOffset: currentOffset };
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

  return (
    <div className="donut-chart">
      {/* SVG */}
      <div className="donut-chart__svg-wrapper" style={{ width: size, height: size }}>
        <svg ref={svgRef} width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Track */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="var(--bg-elevated)"
            strokeWidth={thickness}
          />

          {/* Segments */}
          {segments.map((seg, i) => (
            <circle
              key={i}
              className="donut-chart__segment"
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={thickness}
              strokeDasharray={`${seg.dash} ${seg.gap}`}
              strokeDashoffset={seg.strokeOffset}
              strokeLinecap="butt"
            />
          ))}
        </svg>

        {/* Center text */}
        <div className="donut-chart__center">
          <span className="donut-chart__center-value">{displayValue}</span>
          <span className="donut-chart__center-label">{centerLabel}</span>
        </div>
      </div>

      {/* Legend */}
      <div className="donut-chart__legend">
        {slices.map((slice, i) => (
          <div key={i} className="donut-chart__legend-item">
            <span
              className="donut-chart__legend-dot"
              style={{ background: slice.color }}
            />
            <div className="donut-chart__legend-info">
              <div className="donut-chart__legend-name">{slice.label}</div>
              <div className="donut-chart__legend-value">
                {formatValue(slice.value)}
                {total > 0 && (
                  <> · {((slice.value / total) * 100).toFixed(1)}%</>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
