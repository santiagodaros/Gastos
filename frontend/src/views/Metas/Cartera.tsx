import { useEffect, useState } from "react";
import { posicionesApi, type MetaAhorro, type Posicion, type PosicionCreate } from "../../api_client";
import { Modal, ConfirmModal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import {
  TIPOS_POSICION, factorNominal, simbolosDisponibles, type Cotizacion,
} from "../../lib/market";
import { pesificar } from "../../lib/finance";

export function fmtMoneda(n: number, moneda = "ARS") {
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: moneda,
    maximumFractionDigits: moneda === "USD" ? 2 : 0,
  });
}

export type Cotizaciones = Map<number, Cotizacion>;

export function tipoLabel(tipo: string) {
  return TIPOS_POSICION.find((t) => t.value === tipo)?.label ?? tipo;
}

/** Valor actual y costo de una posición en su propia moneda. Sin cotización → usa el costo. */
export function valuar(p: Posicion, cot?: Cotizacion) {
  const f = factorNominal(p.tipo);
  const costo = p.cantidad * p.precio_compra * f;
  const cotizada = !!cot;
  const valor = cot ? p.cantidad * cot.precio * f : costo;
  return { costo, valor, cotizada, pct: costo > 0 && cotizada ? (valor / costo - 1) * 100 : null };
}

function convertir(monto: number, desde: string, hacia: string, dolar: number) {
  if (desde === hacia) return monto;
  const ars = pesificar(monto, desde, dolar);
  return hacia === "USD" ? ars / dolar : ars;
}

/** Total de la cartera expresado en la moneda de la meta. */
export function totalCartera(meta: MetaAhorro, pos: Posicion[], cots: Cotizaciones, dolar: number) {
  let valor = 0, costo = 0, sinCotizar = 0;
  for (const p of pos) {
    const v = valuar(p, cots.get(p.id));
    if (!v.cotizada && p.tipo !== "plazo_fijo" && p.tipo !== "otro") sinCotizar++;
    valor += convertir(v.valor, p.moneda, meta.moneda, dolar);
    costo += convertir(v.costo, p.moneda, meta.moneda, dolar);
  }
  return { valor, costo, sinCotizar, pct: costo > 0 ? (valor / costo - 1) * 100 : null };
}

function Pct({ v }: { v: number | null | undefined }) {
  if (v == null) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  return (
    <span style={{ color: v >= 0 ? "var(--positive)" : "var(--negative)" }}>
      {v >= 0 ? "+" : ""}{v.toFixed(1)}%
    </span>
  );
}

// ─── Panel dentro de la card ──────────────────────────────────────────────────

export function CarteraPanel({ meta, posiciones, cots, dolar }: {
  meta: MetaAhorro; posiciones: Posicion[]; cots: Cotizaciones; dolar: number;
}) {
  if (posiciones.length === 0) return null;
  const tot = totalCartera(meta, posiciones, cots, dolar);

  return (
    <div className="cartera">
      <div className="cartera__head">
        <span className="meta-card__amount-label" style={{ margin: 0 }}>Cartera</span>
        <span className="cartera__total">
          {fmtMoneda(tot.valor, meta.moneda)} <Pct v={tot.pct} />
        </span>
      </div>
      {posiciones.map((p) => {
        const cot = cots.get(p.id);
        const v = valuar(p, cot);
        return (
          <div className="cartera__row" key={p.id}>
            <span className="badge badge--neutral cartera__tipo">{tipoLabel(p.tipo)}</span>
            <span className="cartera__ticker" title={p.nombre ?? p.ticker}>{p.nombre || p.ticker}</span>
            <span className="cartera__valor">
              {fmtMoneda(v.valor, p.moneda)}
              {p.moneda !== meta.moneda && <span className="cartera__mon">{p.moneda}</span>}
            </span>
            <span className="cartera__pct">
              {v.cotizada ? <Pct v={v.pct} /> : <span title="Sin cotización automática (se muestra el costo)" style={{ color: "var(--text-muted)" }}>s/c</span>}
            </span>
          </div>
        );
      })}
      {tot.sinCotizar > 0 && (
        <div className="cartera__nota">{tot.sinCotizar} sin cotización — revisá el ticker o la conexión.</div>
      )}
    </div>
  );
}

// ─── Modal de gestión ─────────────────────────────────────────────────────────

const EMPTY = (meta_id: number, moneda: string): PosicionCreate => ({
  meta_id, tipo: "accion", ticker: "", nombre: null, cantidad: 0, precio_compra: 0, moneda,
});

export function CarteraModal({ meta, posiciones, cots, onClose, onChanged }: {
  meta: MetaAhorro; posiciones: Posicion[]; cots: Cotizaciones;
  onClose: () => void; onChanged: () => void;
}) {
  const toast = useToast();
  const [form, setForm]       = useState<PosicionCreate>(EMPTY(meta.id, meta.moneda));
  const [editId, setEditId]   = useState<number | null>(null);
  const [saving, setSaving]   = useState(false);
  const [simbolos, setSimbolos] = useState<string[]>([]);
  const [toDelete, setToDelete] = useState<Posicion | null>(null);

  useEffect(() => {
    let vivo = true;
    simbolosDisponibles(form.tipo).then((s) => vivo && setSimbolos(s));
    return () => { vivo = false; };
  }, [form.tipo]);

  const hint = TIPOS_POSICION.find((t) => t.value === form.tipo)?.hint ?? "";
  const manual = form.tipo === "plazo_fijo" || form.tipo === "otro";

  function reset() {
    setForm(EMPTY(meta.id, meta.moneda));
    setEditId(null);
  }

  function startEdit(p: Posicion) {
    const { id, ...rest } = p;
    setForm(rest);
    setEditId(id);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...form, ticker: form.ticker.trim(), nombre: form.nombre?.trim() || null };
      if (editId != null) await posicionesApi.update(editId, body);
      else await posicionesApi.create(body);
      toast.success(editId != null ? "Posición actualizada" : "Posición agregada");
      reset();
      onChanged();
    } catch (err: unknown) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!toDelete) return;
    try {
      await posicionesApi.delete(toDelete.id);
      toast.success("Eliminada");
      if (editId === toDelete.id) reset();
      setToDelete(null);
      onChanged();
    } catch (err: unknown) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Modal title={`Cartera — ${meta.nombre}`} onClose={onClose}>
      <div className="cartera-modal">
        {posiciones.length > 0 && (
          <div className="cartera-modal__list">
            {posiciones.map((p) => {
              const v = valuar(p, cots.get(p.id));
              return (
                <div className="cartera-modal__item" key={p.id}>
                  <button type="button" className="cartera-modal__main" onClick={() => startEdit(p)} title="Editar">
                    <span className="badge badge--neutral cartera__tipo">{tipoLabel(p.tipo)}</span>
                    <span className="cartera__ticker">{p.nombre || p.ticker}</span>
                    <span className="cartera-modal__qty">{p.cantidad} × {fmtMoneda(p.precio_compra, p.moneda)}</span>
                    <span className="cartera__valor">{fmtMoneda(v.valor, p.moneda)}</span>
                    <span className="cartera__pct">{v.cotizada ? <Pct v={v.pct} /> : "s/c"}</span>
                  </button>
                  <button type="button" className="row-action-btn danger" onClick={() => setToDelete(p)} title="Eliminar">✕</button>
                </div>
              );
            })}
          </div>
        )}

        <form className="form" onSubmit={submit}>
          <div className="meta-card__amount-label">{editId != null ? "Editar posición" : "Agregar posición"}</div>
          <div className="form__row">
            <div className="form__field">
              <label className="form__label">Tipo</label>
              <select className="form__select" value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value, ticker: "" })}>
                {TIPOS_POSICION.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="form__field">
              <label className="form__label">Moneda</label>
              <select className="form__select" value={form.moneda}
                onChange={(e) => setForm({ ...form, moneda: e.target.value })}>
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>
          <div className="form__field">
            <label className="form__label">{manual ? "Descripción" : "Ticker / fondo"}</label>
            <input className="form__input" list="cartera-simbolos" value={form.ticker} required
              placeholder={hint}
              onChange={(e) => setForm({ ...form, ticker: e.target.value })} />
            <datalist id="cartera-simbolos">
              {simbolos.slice(0, 1500).map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div className="form__row">
            <div className="form__field">
              <label className="form__label">Cantidad</label>
              <input className="form__input" type="number" min={0} step="any" required
                value={form.cantidad || ""}
                onChange={(e) => setForm({ ...form, cantidad: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="form__field">
              <label className="form__label">
                {manual ? "Valor unitario" : "Precio de compra"}
                {(form.tipo === "bono" || form.tipo === "on") && (
                  <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}> (c/100 VN)</span>
                )}
              </label>
              <input className="form__input" type="number" min={0} step="any" required
                value={form.precio_compra || ""}
                onChange={(e) => setForm({ ...form, precio_compra: parseFloat(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="form__actions">
            {editId != null && <button type="button" className="btn-ghost" onClick={reset}>Cancelar edición</button>}
            <button type="button" className="btn-ghost" onClick={onClose}>Cerrar</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Guardando..." : editId != null ? "Guardar" : "Agregar"}
            </button>
          </div>
        </form>
      </div>
      {toDelete && (
        <ConfirmModal subject={toDelete.nombre || toDelete.ticker} onConfirm={remove}
          onClose={() => setToDelete(null)} loading={false} />
      )}
    </Modal>
  );
}
