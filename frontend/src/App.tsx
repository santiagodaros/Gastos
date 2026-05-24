import { useAuth } from "./lib/auth";
import Login from "./views/Login/Login";
import MfaEnroll from "./views/MfaEnroll/MfaEnroll";
import MfaVerify from "./views/MfaVerify/MfaVerify";
import Layout from "./components/Layout";
import Dashboard from "./views/Dashboard/Dashboard";
import GastosMensuales from "./views/GastosMensuales/GastosMensuales";
import Fijos from "./views/Fijos/Fijos";
import Cuotas from "./views/Cuotas/Cuotas";
import Sueldos from "./views/Sueldos/Sueldos";
import Metas from "./views/Metas/Metas";
import Historial from "./views/Historial/Historial";
import Configuracion from "./views/Configuracion/Configuracion";
import type { ViewId } from "./components/Sidebar";

function renderView(view: ViewId) {
  switch (view) {
    case "dashboard":  return <Dashboard />;
    case "gastos":     return <GastosMensuales />;
    case "fijos":      return <Fijos />;
    case "cuotas":     return <Cuotas />;
    case "sueldos":    return <Sueldos />;
    case "metas":      return <Metas />;
    case "historial":     return <Historial />;
    case "configuracion": return <Configuracion />;
  }
}

const Spinner = () => (
  <div style={{
    minHeight: "100vh", display: "flex", alignItems: "center",
    justifyContent: "center", background: "var(--bg)"
  }}>
    <div className="spinner" />
  </div>
);

export default function App() {
  const { session, loading, mfaStatus } = useAuth();

  if (loading) return <Spinner />;

  // No hay sesión → login
  if (!session) return <Login />;

  // Tiene sesión pero MFA no está verificado
  if (mfaStatus === "unenrolled")  return <MfaEnroll />;
  if (mfaStatus === "needs-verify") return <MfaVerify />;

  // Sesión + MFA verificado → app
  return <Layout>{(view) => renderView(view)}</Layout>;
}
