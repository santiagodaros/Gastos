import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/tokens.css";
import "./styles/reset.css";
import { AuthProvider } from "./lib/auth";
import { ToastProvider } from "./components/Toast";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </AuthProvider>
  </React.StrictMode>,
);

// Registrar el service worker (PWA instalable). Solo en producción para no
// interferir con el HMR de Vite en desarrollo.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* si falla el registro, la app sigue funcionando como web normal */
    });
  });
}
