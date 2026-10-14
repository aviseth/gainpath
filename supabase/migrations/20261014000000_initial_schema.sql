-- Liftwise initial schema (PLAN.md §2.3).
--
-- Mirrors src/data/schema.ts. The browser's IndexedDB is the primary store;
-- these tables are a per-user backup that sync reconciles with
-- last-write-wins on the client clock (`updated_at`, ms epoch).
--
-- * Every table: RLS restricted to the owner, no delete policy (soft deletes
--   via `deleted_at` tombstones).
-- * `server_updated_at` is stamped by trigger on every insert and accepted
--   update; pulls page on (server_updated_at, id) so client clock skew can't
--   hide rows.
-- * Writes go through `sync_push`, which only overwrites a row when the
--   incoming `updated_at` is newer.
-- * No foreign keys between synced tables: rows arrive in any order from
--   several devices, and the client validates references.
-- * Shape validation lives in the client (Zod). The server enforces types,
--   ownership and LWW, so one unexpected enum value can't block a whole push.

create table public.profiles (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  server_updated_at timestamptz not null default clock_timestamp(),
  goal text not null,
  experience text not null,
  sessions_per_week integer not null,
  session_minutes integer not null,
  time_saver_mode boolean not null,
  calibration_offset double precision not null,
  config_overrides jsonb not null,
  current_gym_id uuid
);

create table public.gyms (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  server_updated_at timestamptz not null default clock_timestamp(),
  name text not null,
  is_default boolean not null
);

create table public.equipment (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  server_updated_at timestamptz not null default clock_timestamp(),
  gym_id uuid not null,
  name text not null,
  type text not null,
  brand text,
  model text,
  min_kg double precision not null,
  max_kg double precision not null,
  increment_kg double precision not null,
  micro_increment_kg double precision,
  photo_path text,
  notes text,
  status text not null,
  broken_since bigint,
  status_reason text
);

-- Custom exercises only; the seed catalogue ships as static JSON.
create table public.exercises (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  server_updated_at timestamptz not null default clock_timestamp(),
  name text not null,
  pattern text not null,
  vector jsonb not null,
  kind text not null,
  equipment_types text[] not null,
  fatigue_cost double precision not null,
  rep_range jsonb not null
);

-- exercise_id is text everywhere: seed exercises use slugs, custom ones use uuids.
create table public.equipment_exercises (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  server_updated_at timestamptz not null default clock_timestamp(),
  equipment_id uuid not null,
  exercise_id text not null
);

create table public.exercise_prefs (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  server_updated_at timestamptz not null default clock_timestamp(),
  exercise_id text,
  equipment_id uuid,
  kind text not null,
  reason text
);

create table public.temp_exclusions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  server_updated_at timestamptz not null default clock_timestamp(),
  date date not null,
  equipment_id uuid,
  exercise_id text,
  body_region text,
  reason text not null
);

create table public.sessions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  server_updated_at timestamptz not null default clock_timestamp(),
  gym_id uuid not null,
  date date not null,
  status text not null,
  readiness_score double precision,
  is_deload boolean not null,
  is_calibration boolean not null,
  plan jsonb,
  rationale jsonb
);

create table public.set_logs (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  server_updated_at timestamptz not null default clock_timestamp(),
  session_id uuid,
  exercise_id text not null,
  equipment_id uuid not null,
  ts bigint not null,
  weight_kg double precision not null,
  reps integer not null,
  rpe double precision,
  rir double precision,
  is_warmup boolean not null,
  is_amrap boolean not null,
  predicted_rir double precision,
  approximate boolean not null
);

create table public.e1rm_estimates (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  server_updated_at timestamptz not null default clock_timestamp(),
  exercise_id text not null,
  equipment_id uuid not null,
  value_kg double precision not null,
  uncertainty_pct double precision not null,
  updated_from_set_id uuid,
  history jsonb
);

create table public.swaps (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  server_updated_at timestamptz not null default clock_timestamp(),
  session_id uuid not null,
  removed_exercise_id text not null,
  removed_equipment_id uuid,
  reason text not null,
  accepted_option jsonb,
  weekday integer not null,
  time_bucket integer not null
);

create table public.checkins (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  server_updated_at timestamptz not null default clock_timestamp(),
  date date not null,
  sleep_quality integer not null,
  energy integer not null,
  sleep_hours double precision,
  soreness jsonb not null
);

create table public.wearable_daily (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  server_updated_at timestamptz not null default clock_timestamp(),
  date date not null,
  source text not null,
  hrv_ms double precision,
  resting_hr double precision,
  sleep_hours double precision
);

create table public.anchors (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  server_updated_at timestamptz not null default clock_timestamp(),
  muscle_region text not null,
  exercise_id text not null,
  equipment_id uuid,
  mesocycle_start bigint not null
);

create table public.mesocycles (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  server_updated_at timestamptz not null default clock_timestamp(),
  start bigint not null,
  "end" bigint,
  user_adjust jsonb not null
);

create table public.ai_cache (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  server_updated_at timestamptz not null default clock_timestamp(),
  kind text not null,
  key text not null,
  value jsonb
);

-- Tables that sync. Keep in step with TABLE_NAMES in src/data/schema.ts.
create function public.synced_tables()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'profiles', 'gyms', 'equipment', 'exercises', 'equipment_exercises',
    'exercise_prefs', 'temp_exclusions', 'sessions', 'set_logs',
    'e1rm_estimates', 'swaps', 'checkins', 'wearable_daily', 'anchors',
    'mesocycles', 'ai_cache'
  ]::text[]
$$;

create function public.set_server_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.server_updated_at := clock_timestamp();
  return new;
end
$$;

-- Per-table RLS, trigger and pull index.
do $$
declare
  t text;
begin
  foreach t in array public.synced_tables() loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "owner can read" on public.%I for select to authenticated
         using (user_id = (select auth.uid()))', t);
    execute format(
      'create policy "owner can insert" on public.%I for insert to authenticated
         with check (user_id = (select auth.uid()))', t);
    execute format(
      'create policy "owner can update" on public.%I for update to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format(
      'create trigger set_server_updated_at before insert or update on public.%I
         for each row execute function public.set_server_updated_at()', t);
    execute format(
      'create index %I on public.%I (user_id, server_updated_at, id)', t || '_pull_idx', t);
  end loop;
end
$$;

-- Upsert a batch with last-write-wins. Runs as the caller (security invoker),
-- so RLS still applies; user_id is always forced to the signed-in user.
create function public.sync_push(p_table text, p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cols text;
  updates text;
  affected integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not (p_table = any (public.synced_tables())) then
    raise exception 'unknown table: %', p_table using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = '22023';
  end if;

  select
    string_agg(format('%I', column_name), ', ' order by ordinal_position),
    string_agg(format('%I = excluded.%I', column_name, column_name), ', ' order by ordinal_position)
      filter (where column_name not in ('id', 'user_id', 'created_at'))
  into cols, updates
  from information_schema.columns
  where table_schema = 'public'
    and table_name = p_table
    and column_name <> 'server_updated_at';

  execute format(
    'insert into public.%1$I as t (%2$s)
       select %2$s from jsonb_populate_recordset(null::public.%1$I, $1)
     on conflict (id) do update set %3$s
       where excluded.updated_at > t.updated_at',
    p_table, cols, updates)
  using (
    select coalesce(jsonb_agg(r || jsonb_build_object('user_id', uid)), '[]'::jsonb)
    from jsonb_array_elements(p_rows) as r
  );

  get diagnostics affected = row_count;
  return affected;
end
$$;

revoke all on function public.sync_push(text, jsonb) from public, anon;
grant execute on function public.sync_push(text, jsonb) to authenticated;
