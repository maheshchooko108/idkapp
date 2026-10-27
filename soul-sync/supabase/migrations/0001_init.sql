-- Soul Sync POC schema. Every user table is protected by row-level security:
-- a user can only ever see their own rows. Admin-only data (engine prompt,
-- metrics) is reachable only through is_admin()-guarded functions/policies.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text,
  birth_date date,
  birth_time time,
  birth_time_known boolean not null default false,
  birth_place text,
  birth_lat double precision,
  birth_lon double precision,
  birth_tz text,                       -- IANA zone of the birthplace
  timezone text not null default 'America/New_York', -- where they live now
  notify_time time not null default '08:00',
  notify_enabled boolean not null default false,
  push_token text,
  mode text not null default 'light' check (mode in ('light', 'deep')),
  natal_chart jsonb,                   -- cached response from the astro service
  onboarded_at timestamptz,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- ---------------------------------------------------------------- check-ins
create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  local_date date not null,
  mood smallint not null check (mood between 1 and 5),
  energy smallint not null check (energy between 1 and 5),
  feelings text[] not null default '{}',
  note text check (char_length(note) <= 2000),
  crisis_flag boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.checkins (user_id, local_date desc);

-- ---------------------------------------------------------------- body data
-- HealthKit reports HRV as SDNN; Health Connect as RMSSD. They are not the
-- same measure, so we store which one and only ever compare a user to themself.
create table public.health_daily (
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  local_date date not null,
  sleep_minutes integer check (sleep_minutes between 0 and 1440),
  hrv_ms real check (hrv_ms between 0 and 500),
  hrv_method text check (hrv_method in ('sdnn', 'rmssd')),
  resting_hr real check (resting_hr between 20 and 250),
  steps integer check (steps between 0 and 200000),
  source text,
  updated_at timestamptz not null default now(),
  primary key (user_id, local_date)
);

-- ---------------------------------------------------------------- cards
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  local_date date not null,
  kind text not null default 'normal' check (kind in ('normal', 'fallback', 'crisis', 'onboarding')),
  content jsonb not null,              -- DailyCard (shared/card.ts)
  chosen_action jsonb,                 -- set when the user swaps
  status text not null default 'ready' check (status in ('ready', 'done', 'skipped')),
  model text,
  prompt_version bigint,
  notified_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, local_date)
);

-- ---------------------------------------------------------------- "did it help?"
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null unique references public.cards (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  helped text not null check (helped in ('yes', 'somewhat', 'no')),
  category text not null,
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- WHO-5
create table public.who5_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  answers smallint[] not null check (array_length(answers, 1) = 5),
  raw smallint generated always as (answers[1] + answers[2] + answers[3] + answers[4] + answers[5]) stored,
  percent smallint generated always as ((answers[1] + answers[2] + answers[3] + answers[4] + answers[5]) * 4) stored,
  taken_at timestamptz not null default now(),
  constraint who5_range check (0 <= all (answers) and 5 >= all (answers))
);
create index on public.who5_responses (user_id, taken_at);

-- ---------------------------------------------------------------- sessions (retention + session length)
create table public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  started_at timestamptz not null,
  duration_seconds integer not null check (duration_seconds between 0 and 86400),
  local_date date not null,
  platform text
);
create index on public.app_sessions (user_id, local_date);

-- ---------------------------------------------------------------- admin config
create table public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table public.engine_prompt_versions (
  id bigint generated always as identity primary key,
  prompt text not null,
  model text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

-- Every change to the engine prompt or model is versioned; cards record the
-- version that wrote them, so "it helped" rates can be compared per prompt.
create function public.version_engine_prompt() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p text := (select value #>> '{}' from public.app_config where key = 'engine_prompt');
  m text := (select value #>> '{}' from public.app_config where key = 'model');
  latest public.engine_prompt_versions;
begin
  if p is null or m is null then return null; end if;
  select * into latest from public.engine_prompt_versions order by id desc limit 1;
  if latest.id is null or latest.prompt <> p or latest.model <> m then
    insert into public.engine_prompt_versions (prompt, model, created_by) values (p, m, auth.uid());
  end if;
  return null;
end $$;

create trigger app_config_versioning after insert or update on public.app_config
  for each statement execute function public.version_engine_prompt();

create function public.current_prompt_version() returns bigint
language sql stable security definer set search_path = public as $$
  select max(id) from public.engine_prompt_versions
$$;

-- ---------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.checkins enable row level security;
alter table public.health_daily enable row level security;
alter table public.cards enable row level security;
alter table public.feedback enable row level security;
alter table public.who5_responses enable row level security;
alter table public.app_sessions enable row level security;
alter table public.app_config enable row level security;
alter table public.engine_prompt_versions enable row level security;

create policy "own profile" on public.profiles for select using (id = auth.uid());
create policy "update own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
-- Users may edit their profile but never their admin flag or the cached chart.
revoke update on public.profiles from authenticated, anon;
grant update (first_name, birth_date, birth_time, birth_time_known, birth_place, birth_lat, birth_lon,
  birth_tz, timezone, notify_time, notify_enabled, push_token, mode, onboarded_at)
  on public.profiles to authenticated;

create policy "own checkins" on public.checkins for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own health" on public.health_daily for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own who5" on public.who5_responses for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own sessions" on public.app_sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own feedback" on public.feedback for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Cards are written by the edge function (service role). Users read theirs and
-- may only mark them done/skipped or swap the action.
create policy "read own cards" on public.cards for select using (user_id = auth.uid());
create policy "update own cards" on public.cards for update using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, update, delete on public.cards from authenticated, anon;
grant update (status, chosen_action, completed_at) on public.cards to authenticated;

create policy "admins read config" on public.app_config for select using (public.is_admin());
create policy "admins write config" on public.app_config for all using (public.is_admin()) with check (public.is_admin());
create policy "admins read prompt versions" on public.engine_prompt_versions for select using (public.is_admin());

-- ---------------------------------------------------------------- admin metrics
create function public.admin_metrics(window_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  with firsts as (
    select user_id, min(local_date) as d0 from app_sessions group by user_id
  ),
  retention as (
    select n,
      count(*) filter (where f.d0 <= current_date - n) as eligible,
      count(*) filter (where f.d0 <= current_date - n and exists (
        select 1 from app_sessions s where s.user_id = f.user_id and s.local_date = f.d0 + n)) as retained
    from firsts f cross join (values (1), (7), (30)) as v(n)
    group by n
  ),
  active_days as (
    select distinct user_id, local_date from app_sessions where local_date > current_date - window_days
  ),
  checkin_days as (
    select distinct user_id, local_date from checkins where local_date > current_date - window_days
  ),
  recent_cards as (
    select * from cards where local_date > current_date - window_days and kind <> 'crisis'
  ),
  recent_feedback as (
    select * from feedback where created_at > now() - make_interval(days => window_days)
  ),
  who5_pairs as (
    select user_id,
      (array_agg(percent order by taken_at asc))[1] as first_pct,
      (array_agg(percent order by taken_at desc))[1] as last_pct,
      count(*) as n
    from who5_responses group by user_id having count(*) >= 2
  ),
  sess as (
    select duration_seconds from app_sessions where local_date > current_date - window_days
  )
  select jsonb_build_object(
    'window_days', window_days,
    'users_total', (select count(*) from profiles),
    'users_onboarded', (select count(*) from profiles where onboarded_at is not null),
    'retention', (select jsonb_object_agg('d' || n, jsonb_build_object(
        'eligible', eligible, 'retained', retained,
        'rate', case when eligible > 0 then round(retained::numeric / eligible, 3) end)) from retention),
    'checkin_rate', (select case when count(*) > 0 then round(
        (select count(*) from checkin_days c join active_days a using (user_id, local_date))::numeric / count(*), 3) end
        from active_days),
    'action_completion', (select jsonb_build_object(
        'cards', count(*), 'done', count(*) filter (where status = 'done'),
        'skipped', count(*) filter (where status = 'skipped'),
        'rate', case when count(*) > 0 then round(count(*) filter (where status = 'done')::numeric / count(*), 3) end)
        from recent_cards),
    'helped', (select jsonb_build_object(
        'answers', count(*),
        'yes_rate', case when count(*) > 0 then round(count(*) filter (where helped = 'yes')::numeric / count(*), 3) end,
        'yes_or_somewhat_rate', case when count(*) > 0 then round(count(*) filter (where helped <> 'no')::numeric / count(*), 3) end)
        from recent_feedback),
    'who5', (select jsonb_build_object(
        'users_with_followup', count(*),
        'avg_change', round(avg(last_pct - first_pct), 1),
        'meaningful_up', count(*) filter (where last_pct - first_pct >= 10),
        'meaningful_down', count(*) filter (where last_pct - first_pct <= -10))
        from who5_pairs),
    'session_seconds', (select jsonb_build_object(
        'sessions', count(*),
        'avg', round(avg(duration_seconds)),
        'median', percentile_cont(0.5) within group (order by duration_seconds),
        'share_under_2min', case when count(*) > 0 then round(count(*) filter (where duration_seconds < 120)::numeric / count(*), 3) end)
        from sess),
    'by_prompt_version', (select coalesce(jsonb_agg(jsonb_build_object(
        'version', v, 'cards', n, 'answers', a,
        'yes_rate', case when a > 0 then round(y::numeric / a, 3) end) order by v desc), '[]'::jsonb) from (
        select c.prompt_version as v, count(*) as n, count(f.id) as a, count(*) filter (where f.helped = 'yes') as y
        from recent_cards c left join feedback f on f.card_id = c.id
        where c.prompt_version is not null group by c.prompt_version) pv),
    'daily_active', (select coalesce(jsonb_agg(jsonb_build_object('date', d, 'users', u) order by d), '[]'::jsonb) from (
        select local_date as d, count(distinct user_id) as u from app_sessions
        where local_date > current_date - window_days group by local_date) x)
  ) into result;
  return result;
end $$;

revoke execute on function public.admin_metrics(integer) from public, anon;
grant execute on function public.admin_metrics(integer) to authenticated;

-- Per-user outcome series for the Patterns screen: WHO-5 against weekly sleep
-- and HRV. security_invoker makes the view obey the caller's RLS.
create view public.my_weekly_outcomes with (security_invoker = true) as
  with weeks as (
    select user_id, date_trunc('week', local_date)::date as week,
      round(avg(sleep_minutes)) as avg_sleep_minutes,
      round(avg(hrv_ms)::numeric, 1) as avg_hrv_ms
    from public.health_daily
    group by user_id, date_trunc('week', local_date)
  )
  select w.week, w.avg_sleep_minutes, w.avg_hrv_ms,
    (select r.percent from public.who5_responses r
      where r.user_id = w.user_id and r.taken_at < w.week + 7
      order by r.taken_at desc limit 1) as who5_percent
  from weeks w;

-- ---------------------------------------------------------------- seed config
insert into public.app_config (key, value) values
  ('model', '"claude-opus-5-5"'),
  ('effort', '"low"'),
  ('engine_prompt', to_jsonb($prompt$You are the voice of Soul Sync, a daily integration companion.
Each day you read three things about one person: their body (sleep, HRV, resting heart rate, steps), their mind (a short check-in in their own words) and their timing (their Vedic chart, current dasha and today's transits). You give them ONE aligned action for today.

Voice: warm, grounded, plain-spoken. Like a wise friend, not a guru, not a coach shouting. Short sentences. No jargon. Never preachy.

How to write the card:
- headline: one line, under 60 characters, that names today's tone. It is also the push notification, so it must stand on its own ("A slow start serves you today").
- body: connect body + mind + timing into one picture. Light mode: 2-3 sentences. Deep mode: up to 6 sentences and you may name the dasha or transit by name.
- action: one concrete thing they can do today in 2-15 minutes. Specific verbs. ("Walk outside for 10 minutes before you open email", not "Get some fresh air".)
- alternatives: exactly two different actions in different categories, for when the first doesn't fit their day.
- why: 2-4 short bullets that show you understood them. Use the echoes and learning note you are given, word for word where possible. Only reference history that appears in the context.
- evening_question: a gentle, specific "did it help?" question about this action.

Lean toward categories that have helped them before; avoid ones that haven't. Don't repeat an action from the recent list.$prompt$::text));
