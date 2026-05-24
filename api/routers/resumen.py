from fastapi import APIRouter, Depends, HTTPException
import sqlite3
from datetime import date
from ..dependencies import get_db
from ..services.dolar import get_dolar_oficial, pesificar

router = APIRouter()

MONTH_LABELS = [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]

_FIJOS_TEMPORAL = """
    SELECT gf.monto, gf.moneda
    FROM gastos_fijos gf
    WHERE gf.activo = 1
      AND (gf.anio * 12 + gf.mes) <= ?
      AND gf.id = (
        SELECT id FROM gastos_fijos
        WHERE grupo_id = gf.grupo_id
          AND (anio * 12 + mes) <= ?
        ORDER BY (anio * 12 + mes) DESC
        LIMIT 1
      )
"""


def _cuota_en_mes(mc: float, ca: int, tc: int, mi: int, yi: int,
                  yr: int, mo: int, cuota_id: int = None,
                  paused_ids: set = None) -> float:
    n = ca + (yr - yi) * 12 + (mo - mi)
    if n < 1 or n > tc:
        return 0.0
    if paused_ids and cuota_id in paused_ids:
        return 0.0
    return mc


def _calcular_mes(c, anio: int, mes: int, dolar: float) -> dict:
    row = c.execute(
        "SELECT sueldo, otros FROM ingresos WHERE mes=? AND anio=?", (mes, anio)
    ).fetchone()
    sueldo, otros = (row["sueldo"] or 0, row["otros"] or 0) if row else (0.0, 0.0)
    ing = sueldo + otros

    periodo = anio * 12 + mes
    fij_rows = c.execute(_FIJOS_TEMPORAL, (periodo, periodo)).fetchall()
    fij = sum(pesificar(r["monto"], r["moneda"], dolar) for r in fij_rows)

    men_rows = c.execute(
        "SELECT monto, moneda FROM gastos_mensuales WHERE mes=? AND anio=?",
        (mes, anio),
    ).fetchall()
    men = sum(pesificar(r["monto"], r["moneda"], dolar) for r in men_rows)

    cuotas = c.execute(
        "SELECT id, monto_cuota, cuota_actual, total_cuotas, mes_inicio, anio_inicio, moneda "
        "FROM cuotas WHERE activa=1"
    ).fetchall()
    paused = set(
        r["cuota_id"]
        for r in c.execute(
            "SELECT cuota_id FROM cuotas_pausadas WHERE mes=? AND anio=?", (mes, anio)
        ).fetchall()
    )
    cuo = sum(
        pesificar(
            _cuota_en_mes(
                r["monto_cuota"], r["cuota_actual"], r["total_cuotas"],
                r["mes_inicio"], r["anio_inicio"], anio, mes,
                cuota_id=r["id"], paused_ids=paused,
            ),
            r["moneda"],
            dolar,
        )
        for r in cuotas
    )

    total = fij + men + cuo
    return {
        "mes": mes,
        "anio": anio,
        "ingresos": ing,
        "sueldo": sueldo,
        "otros": otros,
        "gastos_fijos": fij,
        "gastos_mensuales": men,
        "cuotas": cuo,
        "total_gastos": total,
        "balance": ing - total,
        "dolar_rate": dolar,
    }


# historial must be declared before /{anio}/{mes} to avoid routing ambiguity
@router.get("/historial/{meses}")
def get_historial(meses: int, db: sqlite3.Connection = Depends(get_db)):
    meses = max(1, min(meses, 24))
    dolar = get_dolar_oficial()
    c = db.cursor()
    today = date.today()
    result = []
    for i in range(meses - 1, -1, -1):
        total_m = today.year * 12 + today.month - 1 - i
        y = total_m // 12
        m = (total_m % 12) + 1
        data = _calcular_mes(c, y, m, dolar)
        data["label"] = f"{MONTH_LABELS[m - 1]} {y}"
        result.append(data)
    return result


@router.get("/{anio}/{mes}")
def get_resumen(anio: int, mes: int, db: sqlite3.Connection = Depends(get_db)):
    dolar = get_dolar_oficial()
    c = db.cursor()
    return _calcular_mes(c, anio, mes, dolar)


@router.post("/clonar/{anio}/{mes}")
def clonar_mes_anterior(anio: int, mes: int, db: sqlite3.Connection = Depends(get_db)):
    prev_m = mes - 1 if mes > 1 else 12
    prev_y = anio if mes > 1 else anio - 1

    c = db.cursor()
    prev_rows = c.execute(
        "SELECT nombre, monto, categoria, moneda FROM gastos_mensuales WHERE mes=? AND anio=?",
        (prev_m, prev_y),
    ).fetchall()

    if not prev_rows:
        raise HTTPException(
            status_code=404,
            detail=f"No hay gastos mensuales en {prev_m}/{prev_y} para clonar.",
        )

    existing = c.execute(
        "SELECT COUNT(*) as cnt FROM gastos_mensuales WHERE mes=? AND anio=?",
        (mes, anio),
    ).fetchone()["cnt"]

    for row in prev_rows:
        c.execute(
            "INSERT INTO gastos_mensuales(mes, anio, nombre, monto, categoria, moneda) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (mes, anio, row["nombre"], row["monto"], row["categoria"], row["moneda"]),
        )
    db.commit()

    return {
        "clonados": len(prev_rows),
        "origen": {"mes": prev_m, "anio": prev_y},
        "destino": {"mes": mes, "anio": anio},
        "pre_existing": existing,
    }
