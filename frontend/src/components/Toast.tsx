import { createContext, useContext, useState, useCallback, useRef } from "react";
import "./Toast.css";

type ToastKind = "success" | "error" | "info";
interface ToastItem { id: number; kind: ToastKind; msg: string; }

interface ToastApi {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const DURATION = 3400;

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}

const ICON: Record<ToastKind, React.ReactNode> = {
  success: <path d="M20 6 9 17l-5-5" />,
  error: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
  info: <><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></>,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setItems((xs) => xs.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((kind: ToastKind, msg: string) => {
    const id = ++idRef.current;
    setItems((xs) => [...xs, { id, kind, msg }]);
    setTimeout(() => remove(id), DURATION);
  }, [remove]);

  const api: ToastApi = {
    success: (m) => push("success", m),
    error: (m) => push("error", m),
    info: (m) => push("info", m),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack">
        {items.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`} onClick={() => remove(t.id)}>
            <svg className="toast__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {ICON[t.kind]}
            </svg>
            <span className="toast__msg">{t.msg}</span>
            <span className="toast__life" style={{ animationDuration: `${DURATION}ms` }} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
