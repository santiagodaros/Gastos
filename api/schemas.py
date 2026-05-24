from pydantic import BaseModel
from typing import Optional


# ─── Gastos Mensuales ─────────────────────────────────────────────────────────

class GastoMensualBase(BaseModel):
    mes: int
    anio: int
    nombre: str
    monto: float
    categoria: str = "General"
    moneda: str = "ARS"

class GastoMensual(GastoMensualBase):
    id: int


# ─── Gastos Fijos ─────────────────────────────────────────────────────────────

class GastoFijoBase(BaseModel):
    nombre: str
    monto: float
    activo: int = 1
    moneda: str = "ARS"
    mes: int
    anio: int

class GastoFijo(GastoFijoBase):
    id: int
    grupo_id: int


# ─── Ingresos ─────────────────────────────────────────────────────────────────

class IngresosCreate(BaseModel):
    sueldo: float = 0.0
    otros: float = 0.0

class Ingresos(IngresosCreate):
    id: int
    mes: int
    anio: int


# ─── Tarjetas ─────────────────────────────────────────────────────────────────

class TarjetaCreate(BaseModel):
    nombre: str
    tipo: str = "VISA"
    ultimos_4: str = ""
    activa: int = 1

class Tarjeta(TarjetaCreate):
    id: int


# ─── Cuotas ───────────────────────────────────────────────────────────────────

class CuotaCreate(BaseModel):
    nombre: str
    monto_cuota: float
    cuota_actual: int
    total_cuotas: int
    mes_inicio: int
    anio_inicio: int
    activa: int = 1
    moneda: str = "ARS"
    tarjeta_id: Optional[int] = None

class Cuota(CuotaCreate):
    id: int


# ─── Metas de Ahorro ──────────────────────────────────────────────────────────

class MetaAhorroCreate(BaseModel):
    nombre: str
    objetivo: float
    acumulado: float = 0.0
    fecha_limite: Optional[str] = None
    prioridad: int = 50
    activa: int = 1

class MetaAhorro(MetaAhorroCreate):
    id: int


class DepositoCreate(BaseModel):
    monto: float
    fecha: Optional[str] = None  # ISO date string; defaults to today if omitted


# ─── Categorías ───────────────────────────────────────────────────────────────

class CategoriaCreate(BaseModel):
    nombre: str
    color: str = "#6366f1"

class Categoria(CategoriaCreate):
    id: int
    activa: int


# ─── Proyección de Cuotas ─────────────────────────────────────────────────────

class CuotaProyectada(BaseModel):
    id: int
    nombre: str
    monto_ars: float      # ya convertido a ARS
    numero_cuota: int     # qué número de cuota cae ese mes
    total_cuotas: int

class ProyeccionMes(BaseModel):
    mes: int
    anio: int
    label: str            # "Abr 2026"
    total_ars: float
    cuotas: list[CuotaProyectada]
