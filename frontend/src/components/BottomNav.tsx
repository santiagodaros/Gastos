import type { ViewId } from "./Sidebar";
import "./BottomNav.css";

interface BottomNavProps {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
  onQuickAdd: () => void;
}

const svg = {
  width: 22, height: 22, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 2,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
};

const ITEMS: { id: ViewId; label: string; icon: React.ReactNode }[] = [
  {
    id: "dashboard", label: "Inicio",
    icon: <svg {...svg}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>,
  },
  {
    id: "gastos", label: "Gastos",
    icon: <svg {...svg}><line x1="12" y1="2" x2="12" y2="22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>,
  },
  {
    id: "cuotas", label: "Cuotas",
    icon: <svg {...svg}><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>,
  },
  {
    id: "metas", label: "Metas",
    icon: <svg {...svg}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>,
  },
];

export default function BottomNav({ activeView, onNavigate, onQuickAdd }: BottomNavProps) {
  return (
    <nav className="bottomnav">
      {ITEMS.slice(0, 2).map((it) => (
        <button
          key={it.id}
          className={`bottomnav__item${activeView === it.id ? " active" : ""}`}
          onClick={() => onNavigate(it.id)}
        >
          {it.icon}
          <span>{it.label}</span>
        </button>
      ))}

      <button className="bottomnav__fab" onClick={onQuickAdd} aria-label="Carga rápida">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {ITEMS.slice(2).map((it) => (
        <button
          key={it.id}
          className={`bottomnav__item${activeView === it.id ? " active" : ""}`}
          onClick={() => onNavigate(it.id)}
        >
          {it.icon}
          <span>{it.label}</span>
        </button>
      ))}
    </nav>
  );
}
