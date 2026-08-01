const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

interface PeriodSelectorProps {
  anio: number;
  mes: number;
  onPrev: () => void;
  onNext: () => void;
  onToday?: () => void;
  isCurrent?: boolean;
}

export default function PeriodSelector({ anio, mes, onPrev, onNext, onToday, isCurrent }: PeriodSelectorProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
      <button className="dashboard__period-btn" onClick={onPrev} aria-label="Mes anterior">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <button
        className="dashboard__period-label"
        onClick={onToday}
        title={onToday ? "Volver al mes actual" : undefined}
        style={{ background: "none", border: "none", cursor: onToday ? "pointer" : "default", padding: 0 }}
      >
        {MONTHS[mes - 1]} {anio}
      </button>
      <button className="dashboard__period-btn" onClick={onNext} aria-label="Mes siguiente">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      {onToday && isCurrent === false && (
        <button className="period-today" onClick={onToday}>Hoy</button>
      )}
    </div>
  );
}
