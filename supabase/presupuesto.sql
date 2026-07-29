-- ============================================================
-- Presupuesto por porcentajes del sueldo
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- Una fila por usuario (user_id es PK).
-- ============================================================

CREATE TABLE IF NOT EXISTS presupuesto (
    user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    pct_ahorro  FLOAT NOT NULL DEFAULT 20,
    pct_cuotas  FLOAT NOT NULL DEFAULT 30,
    pct_gastos  FLOAT NOT NULL DEFAULT 50,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE presupuesto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own" ON presupuesto;
CREATE POLICY "own" ON presupuesto
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
