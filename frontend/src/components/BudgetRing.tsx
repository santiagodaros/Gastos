import { useEffect, useState } from "react";
import CountUp from "./CountUp";

interface BudgetRingProps {
  used: number;
  budget: number;
  fmt: (n: number) => string;
  size?: number;
}

/** Anillo radial: cuánto del sueldo llevás gastado, con lo que te queda al centro. */
export default function BudgetRing({ used, budget, fmt, size = 200 }: BudgetRingProps) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 60);
    return () => clearTimeout(t);
  }, []);

  const pct = budget > 0 ? used / budget : 0;
  const clamped = Math.min(1, Math.max(0, pct));
  const over = pct > 1;
  const remaining = budget - used;

  const stroke = 16;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const offset = C * (1 - (animated ? clamped : 0));
  const color = over ? "var(--negative)" : pct >= 0.85 ? "var(--warning)" : "var(--positive)";

  // El monto del centro se achica según su largo para no tocar el anillo.
  const inner = size - stroke * 2 - 22;
  const remStr = fmt(Math.abs(remaining));
  const heroFont =
    remStr.length >= 13 ? "1.2rem" :
    remStr.length >= 11 ? "1.4rem" :
    remStr.length >= 9  ? "1.65rem" : "1.9rem";

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)", overflow: "visible" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-elevated)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1), stroke 0.3s ease", filter: `drop-shadow(0 0 6px ${color})`, opacity: 0.95 }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", textAlign: "center",
      }}>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {over ? "Te excediste" : "Te queda"}
        </span>
        <span style={{
          fontSize: heroFont, fontWeight: "var(--font-bold)", letterSpacing: "-0.03em", lineHeight: 1.05,
          color: over ? "var(--negative)" : "var(--text-primary)",
          maxWidth: inner, whiteSpace: "nowrap",
        }}>
          <CountUp value={Math.abs(remaining)} format={fmt} />
        </span>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2 }}>
          de {fmt(budget)}
        </span>
      </div>
    </div>
  );
}
