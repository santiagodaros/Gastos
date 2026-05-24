import sqlite3
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GASTOS_DIR = os.path.join(BASE_DIR, "Gastos")
DB_PATH = os.path.join(GASTOS_DIR, "finanzas.db")


def _run_migrations(conn: sqlite3.Connection) -> None:
    c = conn.cursor()

    # gastos_fijos: temporal versioning model
    cols = {row[1] for row in c.execute("PRAGMA table_info(gastos_fijos)").fetchall()}
    if "grupo_id" not in cols:
        c.execute("ALTER TABLE gastos_fijos ADD COLUMN grupo_id INTEGER")
        c.execute("""
            UPDATE gastos_fijos SET grupo_id = (
                SELECT MIN(f2.id) FROM gastos_fijos f2
                WHERE LOWER(TRIM(f2.nombre)) = LOWER(TRIM(gastos_fijos.nombre))
            )
        """)
        conn.commit()

    # categorias table
    c.execute("""
        CREATE TABLE IF NOT EXISTS categorias (
            id    INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL UNIQUE,
            color  TEXT NOT NULL DEFAULT '#6366f1',
            activa INTEGER NOT NULL DEFAULT 1
        )
    """)
    if c.execute("SELECT COUNT(*) FROM categorias").fetchone()[0] == 0:
        c.executemany(
            "INSERT INTO categorias(nombre, color) VALUES(?, ?)",
            [
                ("Comida",          "#10b981"),
                ("Transporte",      "#3b82f6"),
                ("Salud",           "#ef4444"),
                ("Entretenimiento", "#8b5cf6"),
                ("Ropa",            "#ec4899"),
                ("Hogar",           "#f59e0b"),
                ("Tecnología",      "#06b6d4"),
                ("Servicios",       "#6366f1"),
                ("Otros",           "#6b7280"),
            ],
        )
    conn.commit()


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    _run_migrations(conn)
    try:
        yield conn
    finally:
        conn.close()
