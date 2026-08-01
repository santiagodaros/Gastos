import { createContext, useContext, useMemo, useState } from "react";

/**
 * Mes/año seleccionado, COMPARTIDO por toda la app. Antes cada vista tenía su
 * propio estado y se desincronizaban (Dashboard en julio, Gastos en agosto).
 */
interface PeriodCtx {
  anio: number;
  mes: number;
  setPeriod: (anio: number, mes: number) => void;
  prev: () => void;
  next: () => void;
  goToday: () => void;
  isCurrent: boolean;
}

const Ctx = createContext<PeriodCtx | null>(null);

export function PeriodProvider({ children }: { children: React.ReactNode }) {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes]   = useState(now.getMonth() + 1);

  const value = useMemo<PeriodCtx>(() => {
    const n = new Date();
    return {
      anio, mes,
      setPeriod: (y, m) => { setAnio(y); setMes(m); },
      prev: () => { if (mes === 1) { setMes(12); setAnio((y) => y - 1); } else setMes((m) => m - 1); },
      next: () => { if (mes === 12) { setMes(1); setAnio((y) => y + 1); } else setMes((m) => m + 1); },
      goToday: () => { const t = new Date(); setAnio(t.getFullYear()); setMes(t.getMonth() + 1); },
      isCurrent: anio === n.getFullYear() && mes === n.getMonth() + 1,
    };
  }, [anio, mes]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePeriod(): PeriodCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePeriod debe usarse dentro de <PeriodProvider>");
  return c;
}
