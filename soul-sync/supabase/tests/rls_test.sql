-- Assertions for the migration: RLS isolation, protected columns, admin gate,
-- metrics and the outcomes view. Any failed assertion aborts with an error.
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'ben@example.com'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@example.com');
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-0000000000ad';

-- Seed data as the service role (edge functions).
insert into public.cards (user_id, local_date, content, status) values
  ('00000000-0000-0000-0000-00000000000a', current_date - 1, '{"headline":"x"}', 'done'),
  ('00000000-0000-0000-0000-00000000000a', current_date, '{"headline":"y"}', 'ready'),
  ('00000000-0000-0000-0000-00000000000b', current_date, '{"headline":"z"}', 'skipped');
update public.cards set prompt_version = 1 where local_date = current_date - 1;
insert into public.feedback (card_id, user_id, helped, category)
  select id, user_id, 'yes', 'breath' from public.cards where local_date = current_date - 1;
insert into public.app_sessions (user_id, started_at, duration_seconds, local_date) values
  ('00000000-0000-0000-0000-00000000000a', now() - interval '8 days', 70, current_date - 8),
  ('00000000-0000-0000-0000-00000000000a', now() - interval '7 days', 95, current_date - 7),
  ('00000000-0000-0000-0000-00000000000a', now() - interval '1 day', 200, current_date - 1),
  ('00000000-0000-0000-0000-00000000000b', now() - interval '8 days', 60, current_date - 8);
insert into public.who5_responses (user_id, answers, taken_at) values
  ('00000000-0000-0000-0000-00000000000a', '{2,2,2,2,2}', now() - interval '14 days'),
  ('00000000-0000-0000-0000-00000000000a', '{3,3,3,3,3}', now());
insert into public.health_daily (user_id, local_date, sleep_minutes, hrv_ms, hrv_method) values
  ('00000000-0000-0000-0000-00000000000a', current_date, 420, 50, 'sdnn'),
  ('00000000-0000-0000-0000-00000000000b', current_date - 1, 300, 30, 'rmssd');

do $$ begin
  assert (select percent from public.who5_responses order by taken_at desc limit 1) = 60, 'who5 percent generated';
  assert (select count(*) from public.engine_prompt_versions) = 1, 'seed creates exactly one prompt version';
end $$;

-- ---------------------------------------------------------------- as Ana
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

do $$ begin
  assert (select count(*) from public.cards) = 2, 'Ana sees only her cards';
  assert (select count(*) from public.health_daily) = 1, 'Ana sees only her health rows';
  assert (select count(*) from public.profiles) = 1, 'Ana sees only her profile';
  assert (select count(*) from public.app_config) = 0, 'non-admins cannot read the engine prompt';
  assert (select count(*) from public.my_weekly_outcomes) = 1, 'outcomes view is per-user';
  assert (select who5_percent from public.my_weekly_outcomes) = 60, 'outcomes view joins WHO-5';
end $$;

insert into public.checkins (local_date, mood, energy, feelings, note) values (current_date, 3, 2, '{restless}', 'big week');
update public.cards set status = 'done', completed_at = now() where local_date = current_date;
update public.profiles set mode = 'deep', first_name = 'Ana';

do $$ begin
  begin
    update public.profiles set is_admin = true;
    raise exception 'FAIL: user could grant themself admin';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.cards set content = '{"headline":"hacked"}';
    raise exception 'FAIL: user could rewrite card content';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.cards (user_id, local_date, content) values (auth.uid(), current_date + 1, '{}');
    raise exception 'FAIL: user could insert cards';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.checkins (user_id, local_date, mood, energy)
      values ('00000000-0000-0000-0000-00000000000b', current_date, 3, 3);
    raise exception 'FAIL: user could write a check-in for someone else';
  exception when insufficient_privilege or check_violation then null;
  end;
  begin
    perform public.admin_metrics();
    raise exception 'FAIL: non-admin could read metrics';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.who5_responses (answers) values ('{1,2,3,4,9}');
    raise exception 'FAIL: WHO-5 accepted an out-of-range answer';
  exception when check_violation then null;
  end;
end $$;

-- ---------------------------------------------------------------- as Ben
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select count(*) from public.checkins) = 0, 'Ben cannot see Ana''s check-ins';
  update public.cards set status = 'done' where user_id = '00000000-0000-0000-0000-00000000000a';
  assert not found, 'Ben cannot touch Ana''s cards';
end $$;

-- ---------------------------------------------------------------- as admin
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000ad';
do $$
declare m jsonb := public.admin_metrics(30);
begin
  assert (m #>> '{retention,d1,eligible}')::int = 2, 'd1 eligible';
  assert (m #>> '{retention,d1,retained}')::int = 1, 'd1 retained (Ana came back next day)';
  assert (m #>> '{retention,d7,eligible}')::int = 2, 'd7 eligible';
  assert (m #>> '{retention,d7,retained}')::int = 1, 'd7 retained (Ana back on day 7)';
  assert (m #>> '{action_completion,cards}')::int = 3, 'cards counted';
  assert (m #>> '{action_completion,done}')::int = 2, 'done counted';
  assert (m #>> '{who5,users_with_followup}')::int = 1, 'who5 pairs';
  assert (m #>> '{who5,avg_change}')::numeric = 20, 'who5 change';
  assert (m #>> '{session_seconds,sessions}')::int = 4, 'sessions counted';
  assert (m #>> '{session_seconds,share_under_2min}')::numeric = 0.75, 'share under 2 minutes';
  assert (select count(*) from public.app_config) >= 3, 'admin can read config';
  assert (m #> '{by_prompt_version,0}') = '{"version": 1, "cards": 1, "answers": 1, "yes_rate": 1.000}'::jsonb, 'helped rate per prompt version';
  assert (m #>> '{helped,yes_rate}')::numeric = 1, 'helped yes rate';
end $$;

update public.app_config set value = to_jsonb('Be brief.'::text) where key = 'engine_prompt';
do $$ begin
  assert (select count(*) from public.engine_prompt_versions) = 2, 'prompt edit creates a version';
  assert (select prompt from public.engine_prompt_versions order by id desc limit 1) = 'Be brief.', 'version stores new prompt';
  assert public.current_prompt_version() = (select max(id) from public.engine_prompt_versions), 'current version';
end $$;

reset role;
\echo 'rls_test: all assertions passed'
