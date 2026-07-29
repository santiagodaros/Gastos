-- ============================================================
-- Metas tipo "Inversión" (ahorro sin objetivo fijo, con horizonte)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- tipo: 'meta' (objetivo con monto) | 'inversion' (abierta, con horizonte)
ALTER TABLE metas_ahorro ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'meta';
-- aporte mensual estimado (para proyectar el valor futuro de una inversión)
ALTER TABLE metas_ahorro ADD COLUMN IF NOT EXISTS aporte_mensual FLOAT NOT NULL DEFAULT 0;
