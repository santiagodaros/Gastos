-- ============================================================
-- RESET para empezar de cero.
-- BORRA:   gastos mensuales + cuotas (y sus pausas) + notificaciones ligadas.
-- CONSERVA: sueldos/ingresos, gastos fijos, categorías, tarjetas,
--           presupuesto, metas de ahorro, cotizaciones, resúmenes importados.
--
-- ⚠️ IRREVERSIBLE. Corré esto en Supabase → SQL Editor (después de reactivar
--    el proyecto si estaba pausado). Verificá que el UID sea el tuyo.
-- ============================================================

do $$
declare
  uid uuid := '43afd425-6489-4bb2-bd88-6143223cbf3f';  -- tu APP_USER_ID
begin
  -- notificaciones que apuntan a gastos/cuotas que se van a borrar
  delete from notificaciones
    where user_id = uid and ref_tabla in ('gastos_mensuales', 'cuotas');

  -- pausas de cuotas
  delete from cuotas_pausadas where user_id = uid;

  -- cuotas
  delete from cuotas where user_id = uid;

  -- gastos mensuales
  delete from gastos_mensuales where user_id = uid;
end $$;

-- Comprobación (deberían dar 0):
-- select count(*) from gastos_mensuales where user_id = '43afd425-6489-4bb2-bd88-6143223cbf3f';
-- select count(*) from cuotas          where user_id = '43afd425-6489-4bb2-bd88-6143223cbf3f';
