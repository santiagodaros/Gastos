-- ============================================================
-- Conciliación de resúmenes: fecha del gasto, tarjeta y verificado
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

ALTER TABLE gastos_mensuales ADD COLUMN IF NOT EXISTS fecha DATE;
ALTER TABLE gastos_mensuales ADD COLUMN IF NOT EXISTS tarjeta_id BIGINT REFERENCES tarjetas(id) ON DELETE SET NULL;
ALTER TABLE gastos_mensuales ADD COLUMN IF NOT EXISTS verificado BOOLEAN NOT NULL DEFAULT false;

-- Backfill: a los gastos existentes les ponemos el día 1 de su mes contable.
UPDATE gastos_mensuales SET fecha = make_date(anio, mes, 1) WHERE fecha IS NULL;

-- Los nuevos gastos toman por defecto la fecha de hoy.
ALTER TABLE gastos_mensuales ALTER COLUMN fecha SET DEFAULT CURRENT_DATE;
