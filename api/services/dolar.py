"""
Dolar Oficial service — fetches sell rate from dolarapi.com with a 1-hour in-memory cache.
Mirrors the get_dolar_oficial() logic from gestor_gastos.pyw without coupling to config.json.
"""
import time
import json
import urllib.request
from typing import Optional

_CACHE: dict = {"venta": 0.0, "ts": 0.0}
_TTL = 3600  # 1 hour


def get_dolar_oficial() -> float:
    """Return USD oficial sell rate (ARS). Cached for 1h; returns last known on error."""
    if _CACHE["venta"] and (time.time() - _CACHE["ts"]) < _TTL:
        return _CACHE["venta"]
    try:
        req = urllib.request.Request(
            "https://dolarapi.com/v1/dolares/oficial",
            headers={"User-Agent": "GestorGastos/1.0"},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
        venta = float(data.get("venta") or _CACHE["venta"] or 1.0)
        _CACHE["venta"] = venta
        _CACHE["ts"] = time.time()
        return venta
    except Exception:
        return _CACHE["venta"] or 1.0


def pesificar(monto: float, moneda: Optional[str], dolar_rate: float) -> float:
    """Convert amount to ARS if currency is USD."""
    if moneda and moneda.upper() == "USD":
        return monto * dolar_rate
    return monto
