from fastapi import APIRouter, Depends
from typing import List
import sqlite3
from datetime import date, datetime
from ..dependencies import get_db
from ..schemas import ProyeccionMes, CuotaProyectada

try:
    from ..services.dolar import get_dolar_oficial
except Exception:
    def get_dolar_oficial() -> float:  # type: ignore[misc]
        return 1.0

router = APIRouter()

MONTH_LABELS = [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]


@router.get("/{meses}", response_model=List[ProyeccionMes])
def proyeccion_cuotas(meses: int, db: sqlite3.Connection = Depends(get_db)):
    """
    Retorna la proyección mensual de cuotas activas para los próximos N meses.
    Las cuotas en USD se convierten a ARS usando la cotización actual.
    """
    # Limitar a un rango razonable
    meses = max(1, min(meses, 60))

    # Cotización dólar (con fallback a 1.0 si el servicio falla)
    try:
        dolar_rate = get_dolar_oficial()
    except Exception:
        dolar_rate = 1.0

    # Cuotas activas
    rows = db.execute(
        "SELECT id, nombre, monto_cuota, total_cuotas, mes_inicio, anio_inicio, moneda "
        "FROM cuotas WHERE activa = 1"
    ).fetchall()
    cuotas = [dict(r) for r in rows]

    # Mes de inicio: mes actual
    now = date.today()
    inicio_anio = now.year
    inicio_mes = now.month

    resultado: List[ProyeccionMes] = []

    for i in range(meses):
        # Calcular mes y año objetivo
        total_meses = (inicio_anio * 12 + inicio_mes - 1) + i
        target_anio = total_meses // 12
        target_mes = (total_meses % 12) + 1

        cuotas_del_mes: List[CuotaProyectada] = []
        total_ars = 0.0

        for c in cuotas:
            # Número de cuota que corresponde a este mes
            numero = (target_anio * 12 + target_mes) - (c["anio_inicio"] * 12 + c["mes_inicio"]) + 1

            # Solo si está dentro del rango activo
            if 1 <= numero <= c["total_cuotas"]:
                monto = float(c["monto_cuota"])
                if c["moneda"] == "USD":
                    monto_ars = monto * dolar_rate
                else:
                    monto_ars = monto

                total_ars += monto_ars
                cuotas_del_mes.append(
                    CuotaProyectada(
                        id=c["id"],
                        nombre=c["nombre"],
                        monto_ars=round(monto_ars, 2),
                        numero_cuota=numero,
                        total_cuotas=c["total_cuotas"],
                    )
                )

        label = f"{MONTH_LABELS[target_mes - 1]} {target_anio}"

        resultado.append(
            ProyeccionMes(
                mes=target_mes,
                anio=target_anio,
                label=label,
                total_ars=round(total_ars, 2),
                cuotas=cuotas_del_mes,
            )
        )

    return resultado
