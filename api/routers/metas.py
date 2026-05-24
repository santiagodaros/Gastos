from fastapi import APIRouter, Depends, HTTPException
from typing import List
import sqlite3
from datetime import date
from ..dependencies import get_db
from ..schemas import MetaAhorro, MetaAhorroCreate, DepositoCreate

router = APIRouter()


@router.get("", response_model=List[MetaAhorro])
def list_metas(db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute(
        "SELECT id, nombre, objetivo, acumulado, fecha_limite, prioridad, activa "
        "FROM metas_ahorro ORDER BY prioridad DESC, nombre"
    ).fetchall()
    return [dict(r) for r in rows]


@router.get("/{meta_id}", response_model=MetaAhorro)
def get_meta(meta_id: int, db: sqlite3.Connection = Depends(get_db)):
    row = db.execute(
        "SELECT id, nombre, objetivo, acumulado, fecha_limite, prioridad, activa "
        "FROM metas_ahorro WHERE id=?",
        (meta_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Meta no encontrada.")
    return dict(row)


@router.post("", response_model=MetaAhorro, status_code=201)
def create_meta(body: MetaAhorroCreate, db: sqlite3.Connection = Depends(get_db)):
    cur = db.execute(
        "INSERT INTO metas_ahorro(nombre, objetivo, acumulado, fecha_limite, prioridad, activa) "
        "VALUES(?, ?, ?, ?, ?, ?)",
        (body.nombre, body.objetivo, body.acumulado, body.fecha_limite,
         body.prioridad, body.activa),
    )
    db.commit()
    row = db.execute(
        "SELECT id, nombre, objetivo, acumulado, fecha_limite, prioridad, activa "
        "FROM metas_ahorro WHERE id=?",
        (cur.lastrowid,),
    ).fetchone()
    return dict(row)


@router.put("/{meta_id}", response_model=MetaAhorro)
def update_meta(meta_id: int, body: MetaAhorroCreate,
                db: sqlite3.Connection = Depends(get_db)):
    result = db.execute(
        "UPDATE metas_ahorro SET nombre=?, objetivo=?, acumulado=?, "
        "fecha_limite=?, prioridad=?, activa=? WHERE id=?",
        (body.nombre, body.objetivo, body.acumulado, body.fecha_limite,
         body.prioridad, body.activa, meta_id),
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Meta no encontrada.")
    row = db.execute(
        "SELECT id, nombre, objetivo, acumulado, fecha_limite, prioridad, activa "
        "FROM metas_ahorro WHERE id=?",
        (meta_id,),
    ).fetchone()
    return dict(row)


@router.delete("/{meta_id}")
def delete_meta(meta_id: int, db: sqlite3.Connection = Depends(get_db)):
    result = db.execute("DELETE FROM metas_ahorro WHERE id=?", (meta_id,))
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Meta no encontrada.")
    return {"deleted": True}


@router.post("/{meta_id}/depositos", status_code=201)
def add_deposito(meta_id: int, body: DepositoCreate,
                 db: sqlite3.Connection = Depends(get_db)):
    """Register a deposit and update acumulado on the meta."""
    if not db.execute("SELECT 1 FROM metas_ahorro WHERE id=?", (meta_id,)).fetchone():
        raise HTTPException(status_code=404, detail="Meta no encontrada.")

    fecha = body.fecha or date.today().isoformat()
    db.execute(
        "INSERT INTO depositos_ahorro(meta_id, monto, fecha) VALUES(?, ?, ?)",
        (meta_id, body.monto, fecha),
    )
    db.execute(
        "UPDATE metas_ahorro SET acumulado = acumulado + ? WHERE id=?",
        (body.monto, meta_id),
    )
    db.commit()
    row = db.execute(
        "SELECT id, nombre, objetivo, acumulado, fecha_limite, prioridad, activa "
        "FROM metas_ahorro WHERE id=?",
        (meta_id,),
    ).fetchone()
    return {"deposito": {"monto": body.monto, "fecha": fecha}, "meta": dict(row)}
