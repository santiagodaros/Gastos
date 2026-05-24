from fastapi import APIRouter, Depends, HTTPException
import sqlite3
from ..dependencies import get_db
from ..schemas import Ingresos, IngresosCreate

router = APIRouter()


@router.get("/{anio}/{mes}", response_model=Ingresos)
def get_ingresos(anio: int, mes: int, db: sqlite3.Connection = Depends(get_db)):
    row = db.execute(
        "SELECT id, mes, anio, sueldo, otros FROM ingresos WHERE mes=? AND anio=?",
        (mes, anio),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Sin registro de ingresos para ese mes.")
    return dict(row)


@router.put("/{anio}/{mes}", response_model=Ingresos)
def upsert_ingresos(anio: int, mes: int, body: IngresosCreate,
                    db: sqlite3.Connection = Depends(get_db)):
    """Insert or replace ingresos for the given month."""
    db.execute(
        "INSERT INTO ingresos(mes, anio, sueldo, otros) VALUES(?, ?, ?, ?) "
        "ON CONFLICT(mes, anio) DO UPDATE SET sueldo=excluded.sueldo, otros=excluded.otros",
        (mes, anio, body.sueldo, body.otros),
    )
    db.commit()
    row = db.execute(
        "SELECT id, mes, anio, sueldo, otros FROM ingresos WHERE mes=? AND anio=?",
        (mes, anio),
    ).fetchone()
    return dict(row)


@router.delete("/{anio}/{mes}")
def delete_ingresos(anio: int, mes: int, db: sqlite3.Connection = Depends(get_db)):
    result = db.execute(
        "DELETE FROM ingresos WHERE mes=? AND anio=?", (mes, anio)
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="No existe registro para ese mes.")
    return {"deleted": True}
