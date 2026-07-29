import { useEffect, useState } from "react";
import { comprobantesApi } from "../api_client";

/** Visor de comprobantes: imágenes en overlay, PDFs se abren en pestaña nueva. */
export default function Lightbox({ path, onClose }: { path: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const isPdf = path.toLowerCase().endsWith(".pdf");

  useEffect(() => {
    let cancel = false;
    comprobantesApi.signedUrl(path).then((u) => {
      if (cancel) return;
      if (!u) { onClose(); return; }
      if (isPdf) { window.open(u, "_blank"); onClose(); return; }
      setUrl(u);
    });
    return () => { cancel = true; };
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isPdf) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 500, cursor: "zoom-out", padding: "var(--space-4)",
      }}
    >
      {url ? (
        <img
          src={url}
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: "94vw", maxHeight: "92vh", borderRadius: "var(--radius)", boxShadow: "var(--shadow-lg)", cursor: "default" }}
        />
      ) : (
        <div className="spinner" />
      )}
    </div>
  );
}
