import { useState } from "react";
import Sidebar, { type ViewId } from "./Sidebar";
import { useTheme } from "../lib/theme";
import { useAuth } from "../lib/auth";
import "./Layout.css";

const VIEW_TITLES: Record<ViewId, string> = {
  dashboard:  "Dashboard",
  gastos:     "Gastos Mensuales",
  fijos:      "Gastos Fijos",
  cuotas:     "Cuotas",
  sueldos:    "Sueldos",
  metas:      "Metas de Ahorro",
  historial:  "Historial",
  categorias: "Categorías",
};

interface LayoutProps {
  children: (view: ViewId) => React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [activeView, setActiveView] = useState<ViewId>("dashboard");
  const [collapsed, setCollapsed]   = useState(false);
  const { theme, toggleTheme }      = useTheme();
  const { signOut }                 = useAuth();

  const now = new Date();
  const dateStr = now.toLocaleDateString("es-AR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="layout">
      <Sidebar
        activeView={activeView}
        onNavigate={setActiveView}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSignOut={signOut}
      />

      <div className="layout__content">
        <header className="layout__topbar">
          <span className="layout__topbar-title">{VIEW_TITLES[activeView]}</span>
          <span className="layout__topbar-meta">{dateStr}</span>
        </header>

        <main className="layout__main">
          {children(activeView)}
        </main>
      </div>
    </div>
  );
}
