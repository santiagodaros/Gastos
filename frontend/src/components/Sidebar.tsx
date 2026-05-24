import "./Sidebar.css";

export type ViewId =
  | "dashboard"
  | "gastos"
  | "fijos"
  | "cuotas"
  | "sueldos"
  | "metas"
  | "proyeccion"
  | "historial"
  | "categorias";

interface NavItem {
  id: ViewId;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard",       icon: "⬡" },
  { id: "gastos",    label: "Gastos Mensuales", icon: "↕" },
  { id: "fijos",     label: "Gastos Fijos",     icon: "◈" },
  { id: "cuotas",    label: "Cuotas",           icon: "⊞" },
  { id: "sueldos",   label: "Sueldos",          icon: "◎" },
  { id: "metas",       label: "Metas de Ahorro",  icon: "◇" },
  { id: "proyeccion",  label: "Proyección",        icon: "▦" },
  { id: "historial",   label: "Historial",          icon: "◱" },
  { id: "categorias",  label: "Categorías",         icon: "◉" },
];

interface SidebarProps {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({
  activeView,
  onNavigate,
  collapsed,
  onToggle,
}: SidebarProps) {
  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
      {/* Brand */}
      <div className="sidebar__brand">
        <div className="sidebar__brand-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
            <polyline points="16 7 22 7 22 13" />
          </svg>
        </div>
        <div className="sidebar__brand-text">
          <span className="sidebar__brand-title">Gastos</span>
          <span className="sidebar__brand-subtitle">Finanzas · 2026</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="sidebar__nav">
        <span className="sidebar__section-label">Navegación</span>

        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`sidebar__item${activeView === item.id ? " active" : ""}`}
            onClick={() => onNavigate(item.id)}
            title={collapsed ? item.label : undefined}
          >
            <span className="sidebar__item-icon">
              <NavIcon id={item.id} />
            </span>
            <span className="sidebar__item-label">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Toggle */}
      <div className="sidebar__footer">
        <button className="sidebar__toggle" onClick={onToggle} title="Colapsar sidebar">
          <span className="sidebar__toggle-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </span>
          <span className="sidebar__toggle-label">Colapsar</span>
        </button>
      </div>
    </aside>
  );
}

function NavIcon({ id }: { id: ViewId }) {
  const props = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (id) {
    case "dashboard":
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case "gastos":
      return (
        <svg {...props}>
          <line x1="12" y1="2" x2="12" y2="22" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      );
    case "fijos":
      return (
        <svg {...props}>
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );
    case "cuotas":
      return (
        <svg {...props}>
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
          <line x1="1" y1="10" x2="23" y2="10" />
        </svg>
      );
    case "sueldos":
      return (
        <svg {...props}>
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </svg>
      );
    case "metas":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      );
    case "proyeccion":
      return (
        <svg {...props}>
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
          <line x1="2" y1="20" x2="22" y2="20" />
        </svg>
      );
    case "historial":
      return (
        <svg {...props}>
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      );
    case "categorias":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          <path d="M4.93 4.93a10 10 0 0 0 0 14.14" />
        </svg>
      );
  }
}
