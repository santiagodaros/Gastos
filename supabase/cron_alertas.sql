-- ============================================================
-- Alertas proactivas del bot: dispara el chequeo diario.
-- Llama a la Edge Function telegram-bot con ?task=cron una vez por día.
--
-- Antes de correr:
--   1) Deploy del bot con las alertas:  supabase functions deploy telegram-bot --no-verify-jwt
--   2) Activá las extensiones pg_cron y pg_net (Dashboard → Database → Extensions)
--   3) Reemplazá TU_WEBHOOK_SECRET abajo por el valor de TELEGRAM_WEBHOOK_SECRET
--      de la función (si no tenés WEBHOOK_SECRET seteado, borrá "&secret=TU_WEBHOOK_SECRET").
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Corre todos los días 13:00 UTC (= 10:00 AR).
select cron.schedule(
  'gastos-alertas-diarias',
  '0 13 * * *',
  $$
  select net.http_post(
    url := 'https://miiesbxfimxdszwubqpy.supabase.co/functions/v1/telegram-bot?task=cron&secret=TU_WEBHOOK_SECRET'
  );
  $$
);

-- Para desactivarlo:  select cron.unschedule('gastos-alertas-diarias');
-- Para ver los jobs:  select * from cron.job;
