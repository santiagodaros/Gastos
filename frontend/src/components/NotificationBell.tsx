import { useEffect, useRef, useState } from "react";
import { notificacionesApi, type Notificacion } from "../api_client";
import { useToast } from "./Toast";
import "./NotificationBell.css";

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "recién";
  const m = Math.floor(s / 60); if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60); if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24); return d === 1 ? "ayer" : `hace ${d} días`;
}

export default function NotificationBell({ onChanged }: { onChanged?: () => void }) {
  const toast = useToast();
  const [items, setItems] = useState<Notificacion[]>([]);
  const [open, setOpen] = useState(false);
  const lastMax = useRef<number | null>(null);

  async function load() {
    const data = await notificacionesApi.list();
    // Toast al llegar algo nuevo (salvo en la primera carga).
    const maxId = data[0]?.id ?? 0;
    if (lastMax.current !== null && maxId > lastMax.current) {
      const nueva = data.find((n) => n.id > lastMax.current!);
      if (nueva) toast.info(`🔔 ${nueva.titulo}`);
    }
    lastMax.current = maxId;
    setItems(data);
  }

  useEffect(() => {
    load();
    const iv = setInterval(load, 25_000);
    return () => clearInterval(iv);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const unread = items.filter((n) => !n.leida).length;

  async function onSi(n: Notificacion) {
    setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, leida: true } : x)));
    await notificacionesApi.marcarLeida(n.id);
  }

  async function onNo(n: Notificacion) {
    setItems((xs) => xs.filter((x) => x.id !== n.id));
    try {
      await notificacionesApi.rechazar(n);
      toast.success("Deshecho y eliminado");
      onChanged?.();
    } catch (e) {
      toast.error((e as Error).message);
      load();
    }
  }

  async function marcarTodas() {
    setItems((xs) => xs.map((x) => ({ ...x, leida: true })));
    await notificacionesApi.marcarTodas();
  }

  return (
    <div className="bell">
      <button className="bell__btn" onClick={() => setOpen((o) => !o)} aria-label="Notificaciones">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && <span className="bell__badge">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <>
          <div className="bell__backdrop" onClick={() => setOpen(false)} />
          <div className="bell__panel">
            <div className="bell__header">
              <span>Notificaciones</span>
              {unread > 0 && <button className="bell__mark-all" onClick={marcarTodas}>Marcar leídas</button>}
            </div>

            {items.length === 0 ? (
              <div className="bell__empty">Sin novedades</div>
            ) : (
              <div className="bell__list">
                {items.map((n) => (
                  <div key={n.id} className={`bell__item${n.leida ? " is-read" : ""}`}>
                    {!n.leida && <span className="bell__dot" />}
                    <div className="bell__item-body">
                      <div className="bell__item-title">{n.titulo}</div>
                      {n.detalle && <div className="bell__item-detail">{n.detalle}</div>}
                      <div className="bell__item-time">{timeAgo(n.created_at)}</div>
                    </div>
                    <div className="bell__item-actions">
                      <button className="bell__yes" title="Sí, fui yo" onClick={() => onSi(n)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                      </button>
                      <button className="bell__no" title="No fui yo — deshacer" onClick={() => onNo(n)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
