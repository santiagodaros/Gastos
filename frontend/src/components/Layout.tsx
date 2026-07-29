import { useState } from "react";
import Sidebar, { type ViewId } from "./Sidebar";
import BottomNav from "./BottomNav";
import QuickAdd from "./QuickAdd";
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
  historial:     "Historial",
  configuracion: "Configuración",
};

interface LayoutProps {
  children: (view: ViewId) => React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [activeView, setActiveView] = useState<ViewId>("dashboard");
  const [collapsed, setCollapsed]   = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [quickAdd, setQuickAdd]     = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { theme, toggleTheme }      = useTheme();
  const { signOut }                 = useAuth();

  const now = new Date();
  const dateStr = now.toLocaleDateString("es-AR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  function handleNavigate(view: ViewId) {
    setActiveView(view);
    setMobileOpen(false); // cerrar drawer en mobile al navegar
  }

  return (
    <div className="layout">
      {/* Overlay backdrop — solo en mobile cuando el sidebar está abierto */}
      {mobileOpen && (
        <div className="layout__overlay" onClick={() => setMobileOpen(false)} />
      )}

      <Sidebar
        activeView={activeView}
        onNavigate={handleNavigate}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSignOut={signOut}
        mobileOpen={mobileOpen}
      />

      <div className="layout__content">
        <header className="layout__topbar">
          {/* Hamburger — solo visible en mobile */}
          <button
            className="layout__hamburger"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Abrir menú"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6"  x2="21" y2="6"  />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <span className="layout__topbar-title">{VIEW_TITLES[activeView]}</span>
          <span className="layout__topbar-meta">{dateStr}</span>
        </header>

        <main className="layout__main">
          <div className="view-fade" key={`${activeView}-${refreshKey}`}>
            {children(activeView)}
          </div>
        </main>
      </div>

      {/* Nav inferior (solo mobile) con botón de carga rápida */}
      <BottomNav
        activeView={activeView}
        onNavigate={handleNavigate}
        onQuickAdd={() => setQuickAdd(true)}
      />

      {/* Hoja de carga rápida: gasto / ingreso / cuota */}
      {quickAdd && (
        <QuickAdd
          onClose={() => setQuickAdd(false)}
          onSaved={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
