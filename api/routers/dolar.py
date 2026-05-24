from fastapi import APIRouter
from ..services.dolar import get_dolar_oficial, _CACHE
import time

router = APIRouter()


@router.get("")
def cotizacion_dolar():
    """Return current USD oficial sell rate and cache metadata."""
    venta = get_dolar_oficial()
    age = int(time.time() - _CACHE["ts"]) if _CACHE["ts"] else None
    return {"venta": venta, "cache_age_seconds": age}
