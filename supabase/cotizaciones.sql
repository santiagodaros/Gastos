-- ============================================================
-- Cotización del dólar POR MES (para no distorsionar meses pasados).
-- Se auto-captura el mes actual; podés editar cualquier mes desde Sueldos.
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

CREATE TABLE IF NOT EXISTS cotizaciones (
    id         BIGSERIAL PRIMARY KEY,
    user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    anio       INTEGER NOT NULL,
    mes        INTEGER NOT NULL,
    valor      FLOAT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, anio, mes)
);

ALTER TABLE cotizaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own" ON cotizaciones;
CREATE POLICY "own" ON cotizaciones
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
