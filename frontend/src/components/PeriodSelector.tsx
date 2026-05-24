const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

interface PeriodSelectorProps {
  anio: number;
  mes: number;
  onPrev: () => void;
  onNext: () => void;
}

export default function PeriodSelector({ anio, mes, onPrev, onNext }: PeriodSelectorProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
      <button className="dashboard__period-btn" onClick={onPrev}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <span className="dashboard__period-label">{MONTHS[mes - 1]} {anio}</span>
      <button className="dashboard__period-btn" onClick={onNext}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  );
}
