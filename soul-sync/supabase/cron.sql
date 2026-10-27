-- Run once in the Supabase SQL editor after deploying the functions.
-- Replace <project-ref> and <cron-secret> (the same value you set with
-- `supabase secrets set CRON_SECRET=...`).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'soul-sync-push-cards',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/push-cards',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', '<cron-secret>'),
    body := '{}'::jsonb
  );
  $$
);
