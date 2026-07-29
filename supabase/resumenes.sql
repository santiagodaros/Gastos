-- ============================================================
-- Resúmenes importados (guardar cada resumen de tarjeta que importás)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

CREATE TABLE IF NOT EXISTS resumenes_importados (
    id            BIGSERIAL PRIMARY KEY,
    user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    tarjeta       TEXT,        -- marca detectada (VISA/MASTERCARD)
    tarjeta_id    BIGINT REFERENCES tarjetas(id) ON DELETE SET NULL,
    periodo_mes   INTEGER NOT NULL,
    periodo_anio  INTEGER NOT NULL,
    total_ars     FLOAT NOT NULL DEFAULT 0,
    total_usd     FLOAT NOT NULL DEFAULT 0,
    cant_items    INTEGER NOT NULL DEFAULT 0,
    pdf_path      TEXT,        -- ruta del PDF en Storage
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE resumenes_importados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own" ON resumenes_importados;
CREATE POLICY "own" ON resumenes_importados
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
