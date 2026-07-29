import { useCallback, useEffect, useRef, useState } from "react";
import { biometric } from "../lib/biometric";
import "./BiometricGate.css";

/**
 * Candado de privacidad: si el usuario activó Face ID, tapa la app hasta que
 * verifique. Se re-bloquea al volver de segundo plano tras un rato.
 */
export default function BiometricGate({ children }: { children: React.ReactNode }) {
  const enabled = biometric.isEnabled();
  const [locked, setLocked] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const hiddenAt = useRef<number | null>(null);

  const tryUnlock = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    const ok = await biometric.unlock();
    setBusy(false);
    if (ok) setLocked(false);
    else setFailed(true);
  }, []);

  // Re-bloquear al volver de background si estuvo oculta > 20s.
  useEffect(() => {
    if (!enabled) return;
    function onVis() {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
      } else if (hiddenAt.current && Date.now() - hiddenAt.current > 20000) {
        setLocked(true);
        setFailed(false);
      }
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [enabled]);

  if (!enabled || !locked) return <>{children}</>;

  return (
    <div className="biolock">
      <div className="biolock__card">
        <div className="biolock__icon" aria-hidden>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h1 className="biolock__title">Gastos bloqueado</h1>
        <p className="biolock__hint">
          {failed ? "No se pudo verificar. Probá de nuevo." : "Verificá tu identidad para continuar."}
        </p>
        <button className="biolock__btn" onClick={tryUnlock} disabled={busy}>
          {busy ? "Verificando…" : "Desbloquear con Face ID"}
        </button>
      </div>
    </div>
  );
}
