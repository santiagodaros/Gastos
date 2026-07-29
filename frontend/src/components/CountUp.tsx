import { useEffect, useRef, useState } from "react";

interface CountUpProps {
  value: number;
  format: (n: number) => string;
  duration?: number;
}

/** Anima un número desde su valor previo hasta `value` (ease-out). */
export default function CountUp({ value, format, duration = 650 }: CountUpProps) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) { setDisplay(to); return; }
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(from + (to - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value, duration]);

  return <>{format(display)}</>;
}
