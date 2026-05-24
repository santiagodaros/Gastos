from fastapi import APIRouter, Depends, HTTPException
from typing import List
import sqlite3
from ..dependencies import get_db
from ..schemas import Categoria, CategoriaCreate

router = APIRouter()


@router.get("", response_model=List[Categoria])
def list_categorias(db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute(
        "SELECT id, nombre, color, activa FROM categorias WHERE activa=1 ORDER BY nombre"
    ).fetchall()
    return [dict(r) for r in rows]


@router.post("", response_model=Categoria, status_code=201)
def create_categoria(body: CategoriaCreate, db: sqlite3.Connection = Depends(get_db)):
    try:
        cur = db.execute(
            "INSERT INTO categorias(nombre, color) VALUES(?, ?)",
            (body.nombre.strip(), body.color),
        )
        db.commit()
    except Exception:
        raise HTTPException(status_code=409, detail="Ya existe una categoría con ese nombre.")
    row = db.execute(
        "SELECT id, nombre, color, activa FROM categorias WHERE id=?", (cur.lastrowid,)
    ).fetchone()
    return dict(row)


@router.put("/{cat_id}", response_model=Categoria)
def update_categoria(cat_id: int, body: CategoriaCreate, db: sqlite3.Connection = Depends(get_db)):
    result = db.execute(
        "UPDATE categorias SET nombre=?, color=? WHERE id=?",
        (body.nombre.strip(), body.color, cat_id),
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Categoría no encontrada.")
    row = db.execute(
        "SELECT id, nombre, color, activa FROM categorias WHERE id=?", (cat_id,)
    ).fetchone()
    return dict(row)


@router.delete("/{cat_id}")
def delete_categoria(cat_id: int, db: sqlite3.Connection = Depends(get_db)):
    result = db.execute("UPDATE categorias SET activa=0 WHERE id=?", (cat_id,))
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Categoría no encontrada.")
    return {"deleted": True}
