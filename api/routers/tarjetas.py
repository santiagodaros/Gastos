from fastapi import APIRouter, Depends, HTTPException
from typing import List
import sqlite3
from ..dependencies import get_db
from ..schemas import Tarjeta, TarjetaCreate

router = APIRouter()


@router.get("", response_model=List[Tarjeta])
def list_tarjetas(db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute(
        "SELECT id, nombre, tipo, ultimos_4, activa FROM tarjetas ORDER BY nombre"
    ).fetchall()
    return [dict(r) for r in rows]


@router.get("/{tarjeta_id}", response_model=Tarjeta)
def get_tarjeta(tarjeta_id: int, db: sqlite3.Connection = Depends(get_db)):
    row = db.execute(
        "SELECT id, nombre, tipo, ultimos_4, activa FROM tarjetas WHERE id=?",
        (tarjeta_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Tarjeta no encontrada.")
    return dict(row)


@router.post("", response_model=Tarjeta, status_code=201)
def create_tarjeta(body: TarjetaCreate, db: sqlite3.Connection = Depends(get_db)):
    cur = db.execute(
        "INSERT INTO tarjetas(nombre, tipo, ultimos_4, activa) VALUES(?, ?, ?, ?)",
        (body.nombre, body.tipo, body.ultimos_4, body.activa),
    )
    db.commit()
    row = db.execute(
        "SELECT id, nombre, tipo, ultimos_4, activa FROM tarjetas WHERE id=?",
        (cur.lastrowid,),
    ).fetchone()
    return dict(row)


@router.put("/{tarjeta_id}", response_model=Tarjeta)
def update_tarjeta(tarjeta_id: int, body: TarjetaCreate,
                   db: sqlite3.Connection = Depends(get_db)):
    result = db.execute(
        "UPDATE tarjetas SET nombre=?, tipo=?, ultimos_4=?, activa=? WHERE id=?",
        (body.nombre, body.tipo, body.ultimos_4, body.activa, tarjeta_id),
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Tarjeta no encontrada.")
    row = db.execute(
        "SELECT id, nombre, tipo, ultimos_4, activa FROM tarjetas WHERE id=?",
        (tarjeta_id,),
    ).fetchone()
    return dict(row)


@router.delete("/{tarjeta_id}")
def delete_tarjeta(tarjeta_id: int, db: sqlite3.Connection = Depends(get_db)):
    result = db.execute("DELETE FROM tarjetas WHERE id=?", (tarjeta_id,))
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Tarjeta no encontrada.")
    return {"deleted": True}
