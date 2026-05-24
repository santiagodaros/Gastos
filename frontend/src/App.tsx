import { useAuth } from "./lib/auth";
import Login from "./views/Login/Login";
import Layout from "./components/Layout";
import Dashboard from "./views/Dashboard/Dashboard";
import GastosMensuales from "./views/GastosMensuales/GastosMensuales";
import Fijos from "./views/Fijos/Fijos";
import Cuotas from "./views/Cuotas/Cuotas";
import Sueldos from "./views/Sueldos/Sueldos";
import Metas from "./views/Metas/Metas";
import Proyeccion from "./views/Proyeccion/Proyeccion";
import Historial from "./views/Historial/Historial";
import Categorias from "./views/Categorias/Categorias";
import type { ViewId } from "./components/Sidebar";

function renderView(view: ViewId) {
  switch (view) {
    case "dashboard":  return <Dashboard />;
    case "gastos":     return <GastosMensuales />;
    case "fijos":      return <Fijos />;
    case "cuotas":     return <Cuotas />;
    case "sueldos":    return <Sueldos />;
    case "metas":      return <Metas />;
    case "proyeccion": return <Proyeccion />;
    case "historial":  return <Historial />;
    case "categorias": return <Categorias />;
  }
}

export default function App() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "var(--bg)"
      }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!session) return <Login />;

  return <Layout>{(view) => renderView(view)}</Layout>;
}
