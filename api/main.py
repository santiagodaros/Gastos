from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from contextlib import asynccontextmanager
from .dependencies import DB_PATH, GASTOS_DIR
from .routers import gastos, dolar, resumen, ingresos, tarjetas, cuotas, metas, proyeccion, categorias


@asynccontextmanager
async def lifespan(_app: FastAPI):
    os.makedirs(GASTOS_DIR, exist_ok=True)
    yield


app = FastAPI(title="Gestor Gastos API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tauri dev mode
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "ok", "db_path": DB_PATH}


app.include_router(gastos.router,    prefix="/api/gastos",    tags=["Gastos"])
app.include_router(ingresos.router,  prefix="/api/ingresos",  tags=["Ingresos"])
app.include_router(tarjetas.router,  prefix="/api/tarjetas",  tags=["Tarjetas"])
app.include_router(cuotas.router,    prefix="/api/cuotas",    tags=["Cuotas"])
app.include_router(metas.router,     prefix="/api/metas",     tags=["Metas de Ahorro"])
app.include_router(dolar.router,     prefix="/api/dolar",     tags=["Dolar"])
app.include_router(resumen.router,     prefix="/api/resumen",     tags=["Resumen"])
app.include_router(proyeccion.router,  prefix="/api/proyeccion",  tags=["Proyeccion"])
app.include_router(categorias.router,  prefix="/api/categorias",  tags=["Categorias"])
