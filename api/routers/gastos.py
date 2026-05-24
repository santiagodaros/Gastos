from fastapi import APIRouter, Depends, HTTPException
from typing import List
import sqlite3
from ..dependencies import get_db
from ..schemas import GastoMensual, GastoMensualBase, GastoFijo, GastoFijoBase

router = APIRouter()

# ─── Gastos Mensuales ─────────────────────────────────────────────────────────

@router.get("/mensuales/{anio}/{mes}", response_model=List[GastoMensual])
def get_gastos_mensuales(anio: int, mes: int, db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute(
        "SELECT id, mes, anio, nombre, monto, categoria, moneda "
        "FROM gastos_mensuales WHERE mes=? AND anio=?",
        (mes, anio),
    ).fetchall()
    return [dict(r) for r in rows]


@router.post("/mensuales", response_model=GastoMensual, status_code=201)
def create_gasto_mensual(body: GastoMensualBase,
                         db: sqlite3.Connection = Depends(get_db)):
    cur = db.execute(
        "INSERT INTO gastos_mensuales(mes, anio, nombre, monto, categoria, moneda) "
        "VALUES(?, ?, ?, ?, ?, ?)",
        (body.mes, body.anio, body.nombre, body.monto, body.categoria, body.moneda),
    )
    db.commit()
    row = db.execute(
        "SELECT id, mes, anio, nombre, monto, categoria, moneda "
        "FROM gastos_mensuales WHERE id=?",
        (cur.lastrowid,),
    ).fetchone()
    return dict(row)


@router.put("/mensuales/{gasto_id}", response_model=GastoMensual)
def update_gasto_mensual(gasto_id: int, body: GastoMensualBase,
                         db: sqlite3.Connection = Depends(get_db)):
    result = db.execute(
        "UPDATE gastos_mensuales SET mes=?, anio=?, nombre=?, monto=?, categoria=?, moneda=? "
        "WHERE id=?",
        (body.mes, body.anio, body.nombre, body.monto, body.categoria, body.moneda, gasto_id),
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Gasto mensual no encontrado.")
    row = db.execute(
        "SELECT id, mes, anio, nombre, monto, categoria, moneda "
        "FROM gastos_mensuales WHERE id=?",
        (gasto_id,),
    ).fetchone()
    return dict(row)


@router.delete("/mensuales/{gasto_id}")
def delete_gasto_mensual(gasto_id: int, db: sqlite3.Connection = Depends(get_db)):
    result = db.execute("DELETE FROM gastos_mensuales WHERE id=?", (gasto_id,))
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Gasto mensual no encontrado.")
    return {"deleted": True}


# ─── Gastos Fijos ─────────────────────────────────────────────────────────────

_FIJO_COLS = "id, nombre, monto, activo, moneda, mes, anio, grupo_id"

_TEMPORAL_WHERE = """
    gf.activo = 1
    AND (gf.anio * 12 + gf.mes) <= ?
    AND gf.id = (
        SELECT id FROM gastos_fijos
        WHERE grupo_id = gf.grupo_id
          AND (anio * 12 + mes) <= ?
        ORDER BY (anio * 12 + mes) DESC
        LIMIT 1
    )
"""


@router.get("/fijos/{anio}/{mes}", response_model=List[GastoFijo])
def get_gastos_fijos(anio: int, mes: int, db: sqlite3.Connection = Depends(get_db)):
    periodo = anio * 12 + mes
    rows = db.execute(
        f"SELECT gf.{_FIJO_COLS} FROM gastos_fijos gf WHERE {_TEMPORAL_WHERE}",
        (periodo, periodo),
    ).fetchall()
    return [dict(r) for r in rows]


@router.post("/fijos", response_model=GastoFijo, status_code=201)
def create_gasto_fijo(body: GastoFijoBase, db: sqlite3.Connection = Depends(get_db)):
    cur = db.execute(
        "INSERT INTO gastos_fijos(nombre, monto, activo, moneda, mes, anio, grupo_id) "
        "VALUES(?, ?, ?, ?, ?, ?, -1)",
        (body.nombre, body.monto, body.activo, body.moneda, body.mes, body.anio),
    )
    new_id = cur.lastrowid
    db.execute("UPDATE gastos_fijos SET grupo_id=? WHERE id=?", (new_id, new_id))
    db.commit()
    row = db.execute(
        f"SELECT {_FIJO_COLS} FROM gastos_fijos WHERE id=?", (new_id,)
    ).fetchone()
    return dict(row)


@router.put("/fijos/{fijo_id}", response_model=GastoFijo)
def update_gasto_fijo(fijo_id: int, body: GastoFijoBase,
                      db: sqlite3.Connection = Depends(get_db)):
    existing = db.execute(
        "SELECT id, grupo_id, mes, anio FROM gastos_fijos WHERE id=?", (fijo_id,)
    ).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Gasto fijo no encontrado.")

    grupo_id = existing["grupo_id"]
    existing_periodo = existing["anio"] * 12 + existing["mes"]
    nuevo_periodo = body.anio * 12 + body.mes

    if nuevo_periodo <= existing_periodo:
        # Same month or moving back → update the version in-place
        db.execute(
            "UPDATE gastos_fijos SET nombre=?, monto=?, activo=?, moneda=?, mes=?, anio=? WHERE id=?",
            (body.nombre, body.monto, body.activo, body.moneda, body.mes, body.anio, fijo_id),
        )
        db.commit()
        result_id = fijo_id
    else:
        # Future month → create a new version, keeping past history intact
        cur = db.execute(
            "INSERT INTO gastos_fijos(nombre, monto, activo, moneda, mes, anio, grupo_id) "
            "VALUES(?, ?, ?, ?, ?, ?, ?)",
            (body.nombre, body.monto, body.activo, body.moneda, body.mes, body.anio, grupo_id),
        )
        db.commit()
        result_id = cur.lastrowid

    row = db.execute(
        f"SELECT {_FIJO_COLS} FROM gastos_fijos WHERE id=?", (result_id,)
    ).fetchone()
    return dict(row)


@router.delete("/fijos/{fijo_id}")
def delete_gasto_fijo(fijo_id: int, db: sqlite3.Connection = Depends(get_db)):
    row = db.execute("SELECT grupo_id FROM gastos_fijos WHERE id=?", (fijo_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Gasto fijo no encontrado.")
    db.execute("DELETE FROM gastos_fijos WHERE grupo_id=?", (row["grupo_id"],))
    db.commit()
    return {"deleted": True}
