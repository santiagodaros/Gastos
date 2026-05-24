from fastapi import APIRouter, Depends, HTTPException
from typing import List
import sqlite3
from ..dependencies import get_db
from ..schemas import Cuota, CuotaCreate

router = APIRouter()


@router.get("", response_model=List[Cuota])
def list_cuotas(db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute(
        "SELECT id, nombre, monto_cuota, cuota_actual, total_cuotas, "
        "mes_inicio, anio_inicio, activa, moneda, tarjeta_id FROM cuotas ORDER BY id"
    ).fetchall()
    return [dict(r) for r in rows]


@router.get("/{cuota_id}", response_model=Cuota)
def get_cuota(cuota_id: int, db: sqlite3.Connection = Depends(get_db)):
    row = db.execute(
        "SELECT id, nombre, monto_cuota, cuota_actual, total_cuotas, "
        "mes_inicio, anio_inicio, activa, moneda, tarjeta_id FROM cuotas WHERE id=?",
        (cuota_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Cuota no encontrada.")
    return dict(row)


@router.post("", response_model=Cuota, status_code=201)
def create_cuota(body: CuotaCreate, db: sqlite3.Connection = Depends(get_db)):
    cur = db.execute(
        "INSERT INTO cuotas(nombre, monto_cuota, cuota_actual, total_cuotas, "
        "mes_inicio, anio_inicio, activa, moneda, tarjeta_id) VALUES(?,?,?,?,?,?,?,?,?)",
        (body.nombre, body.monto_cuota, body.cuota_actual, body.total_cuotas,
         body.mes_inicio, body.anio_inicio, body.activa, body.moneda, body.tarjeta_id),
    )
    db.commit()
    row = db.execute(
        "SELECT id, nombre, monto_cuota, cuota_actual, total_cuotas, "
        "mes_inicio, anio_inicio, activa, moneda, tarjeta_id FROM cuotas WHERE id=?",
        (cur.lastrowid,),
    ).fetchone()
    return dict(row)


@router.put("/{cuota_id}", response_model=Cuota)
def update_cuota(cuota_id: int, body: CuotaCreate,
                 db: sqlite3.Connection = Depends(get_db)):
    result = db.execute(
        "UPDATE cuotas SET nombre=?, monto_cuota=?, cuota_actual=?, total_cuotas=?, "
        "mes_inicio=?, anio_inicio=?, activa=?, moneda=?, tarjeta_id=? WHERE id=?",
        (body.nombre, body.monto_cuota, body.cuota_actual, body.total_cuotas,
         body.mes_inicio, body.anio_inicio, body.activa, body.moneda,
         body.tarjeta_id, cuota_id),
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Cuota no encontrada.")
    row = db.execute(
        "SELECT id, nombre, monto_cuota, cuota_actual, total_cuotas, "
        "mes_inicio, anio_inicio, activa, moneda, tarjeta_id FROM cuotas WHERE id=?",
        (cuota_id,),
    ).fetchone()
    return dict(row)


@router.delete("/{cuota_id}")
def delete_cuota(cuota_id: int, db: sqlite3.Connection = Depends(get_db)):
    result = db.execute("DELETE FROM cuotas WHERE id=?", (cuota_id,))
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Cuota no encontrada.")
    return {"deleted": True}


# ─── Pause / Unpause per month ────────────────────────────────────────────────

@router.post("/{cuota_id}/pausar/{anio}/{mes}")
def pausar_cuota(cuota_id: int, anio: int, mes: int,
                 db: sqlite3.Connection = Depends(get_db)):
    """Pause a cuota for a specific month (mirrors _toggle_pause in the monolith)."""
    _assert_exists(cuota_id, db)
    db.execute(
        "INSERT OR IGNORE INTO cuotas_pausadas(cuota_id, mes, anio) VALUES(?, ?, ?)",
        (cuota_id, mes, anio),
    )
    db.commit()
    return {"paused": True, "cuota_id": cuota_id, "mes": mes, "anio": anio}


@router.delete("/{cuota_id}/pausar/{anio}/{mes}")
def reactivar_cuota(cuota_id: int, anio: int, mes: int,
                    db: sqlite3.Connection = Depends(get_db)):
    """Unpause a cuota for a specific month."""
    _assert_exists(cuota_id, db)
    db.execute(
        "DELETE FROM cuotas_pausadas WHERE cuota_id=? AND mes=? AND anio=?",
        (cuota_id, mes, anio),
    )
    db.commit()
    return {"paused": False, "cuota_id": cuota_id, "mes": mes, "anio": anio}


def _assert_exists(cuota_id: int, db: sqlite3.Connection):
    if not db.execute("SELECT 1 FROM cuotas WHERE id=?", (cuota_id,)).fetchone():
        raise HTTPException(status_code=404, detail="Cuota no encontrada.")
