-- ============================================================
-- Notificaciones (campanita) — el bot avisa cada carga por Telegram
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

CREATE TABLE IF NOT EXISTS notificaciones (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    titulo      TEXT NOT NULL,
    detalle     TEXT,
    ref_tabla   TEXT,        -- 'gastos_mensuales' | 'cuotas' | 'ingresos'
    ref_id      BIGINT,      -- id del registro cargado (para poder deshacerlo)
    leida       BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own" ON notificaciones;
CREATE POLICY "own" ON notificaciones
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
