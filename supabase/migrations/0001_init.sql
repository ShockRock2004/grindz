-- Grindz — complete schema for a FRESH Supabase project.
--
-- Paste into Supabase → SQL Editor → New query → Run. Idempotent: safe to re-run.
--
-- This is the from-scratch equivalent of everything in docs/SUPABASE-MIGRATION.md, which is
-- written as a delta against a project that already existed. Use this file when standing up a
-- new project; use that document to understand *why* the custom-exercise rules are shaped the
-- way they are.
--
-- Grindz is standalone — it owns every table below. Both apps/web and apps/mobile read and
-- write exactly these tables and columns; `scripts/check-parity.mjs` keeps their data layers
-- in step.

-- =====================================================================
-- profiles — one row per user. Holds the optional Groq API key
-- (src/lib/groq.ts), used only for AI-assisted exercise authoring, the optional
-- Gemini API key (src/lib/gemini.ts), used only for the AI Insights screen, and
-- the body-map gender preference (src/lib/gender.ts) — synced here rather than
-- kept device-local so it follows the user across devices, the same reason
-- both keys do.
-- =====================================================================
create table if not exists public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  groq_key   text,
  gemini_key text,
  gender     text check (gender in ('male', 'female')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- `create table if not exists` above only helps a brand-new project; a `profiles` table
-- that already existed before these columns were added needs them bolted on explicitly.
alter table public.profiles add column if not exists gender text;
alter table public.profiles add column if not exists gemini_key text;
alter table public.profiles drop constraint if exists profiles_gender_check;
alter table public.profiles add constraint profiles_gender_check check (gender in ('male', 'female'));

-- =====================================================================
-- workout_sessions — one finished training session.
-- =====================================================================
create table if not exists public.workout_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade,
  category_key    text not null,
  title           text,
  started_at      timestamptz not null,
  ended_at        timestamptz,
  duration_s      integer,
  note            text,
  total_volume_kg double precision,
  total_sets      integer,
  created_at      timestamptz not null default now()
);

create index if not exists workout_sessions_user_started_idx
  on public.workout_sessions (user_id, started_at desc);

-- =====================================================================
-- workout_sets — every logged set.
--
-- session_id cascades: deleteSession() removes only the parent row, so without
-- ON DELETE CASCADE every deleted session would leave its sets orphaned and
-- still counted by allSets() → wrong PRs, wrong volume charts, forever.
-- =====================================================================
create table if not exists public.workout_sets (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.workout_sessions on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  exercise     text not null,
  category_key text,
  set_index    integer not null,
  weight_kg    double precision not null default 0,
  reps         integer not null default 0,
  is_warmup    boolean not null default false,
  rpe          smallint,
  duration_s   integer,
  distance_m   integer,
  performed_at timestamptz not null default now()
);

create index if not exists workout_sets_session_idx
  on public.workout_sets (session_id);
create index if not exists workout_sets_user_performed_idx
  on public.workout_sets (user_id, performed_at desc);

-- =====================================================================
-- workout_plan — the weekly planner grid.
--
-- The primary key is what setPlanSlot()'s upsert targets
-- (onConflict: 'user_id,day,slot'). Without it the upsert errors.
-- =====================================================================
create table if not exists public.workout_plan (
  user_id      uuid not null references auth.users on delete cascade,
  day          text not null,
  slot         integer not null,
  category_key text not null,
  updated_at   timestamptz not null default now(),
  primary key (user_id, day, slot)
);

-- =====================================================================
-- workout_custom_exercises — user-added movements. All 14 columns.
--
-- `is_public` defaults TRUE: an exercise one person adds is visible to everyone. That is
-- the requirement, but it is a real privacy property — anything typed into a custom
-- exercise name becomes public, and it is awkward to reverse once entries exist. Set the
-- default to false here instead if you want them private; both apps handle either.
--
-- `image_url` points at the `exercise-images` Storage bucket below. It used to hold a
-- `data:` URI, which bloated every read and was re-sent to every user the exercise was
-- shared with.
--
-- No unique constraint on (name, category_key): duplicates are likely once the table is
-- shared, and a constraint would reject a second person's identical entry. The apps
-- de-duplicate by lower(name) + category_key at read time, preferring your own row.
-- =====================================================================
create table if not exists public.workout_custom_exercises (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  category_key text not null,
  name         text not null,
  target       text,
  form         text,
  mode         text,
  image_url    text,
  video_url    text,
  secondary    text[],
  tips         text[],
  equipment    text,
  is_public    boolean not null default true,
  created_at   timestamptz not null default now()
);

create index if not exists workout_custom_exercises_user_idx
  on public.workout_custom_exercises (user_id, created_at);
create index if not exists workout_custom_exercises_public_idx
  on public.workout_custom_exercises (category_key) where is_public;

-- =====================================================================
-- workout_templates — saved quick-start templates, one per category.
-- =====================================================================
create table if not exists public.workout_templates (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  category_key text not null,
  title        text not null,
  exercises    jsonb not null,  -- [{name, sets_count, last_weight, last_reps}]
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists workout_templates_user_updated_idx
  on public.workout_templates (user_id, updated_at desc);

-- =====================================================================
-- workout_favorites — starred exercises.
-- Primary key backs setFavorite()'s upsert (onConflict: 'user_id,exercise').
-- =====================================================================
create table if not exists public.workout_favorites (
  user_id  uuid not null references auth.users on delete cascade,
  exercise text not null,
  primary key (user_id, exercise)
);

-- =====================================================================
-- body_metrics — bodyweight + body-fat trend.
-- Primary key backs saveBodyweight()'s upsert (onConflict: 'user_id,measured_on').
-- =====================================================================
create table if not exists public.body_metrics (
  user_id      uuid not null references auth.users on delete cascade,
  measured_on  date not null,
  weight_kg    real,
  body_fat_pct real,
  created_at   timestamptz not null default now(),
  primary key (user_id, measured_on)
);

-- =====================================================================
-- Row Level Security.
--
-- Everything is owner-only except reads on workout_custom_exercises, which are shared.
-- Policies are dropped first so this file stays re-runnable; CREATE POLICY has no
-- IF NOT EXISTS.
-- =====================================================================
alter table public.profiles                 enable row level security;
alter table public.workout_sessions         enable row level security;
alter table public.workout_sets             enable row level security;
alter table public.workout_plan             enable row level security;
alter table public.workout_custom_exercises enable row level security;
alter table public.workout_templates        enable row level security;
alter table public.workout_favorites        enable row level security;
alter table public.body_metrics             enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own sessions" on public.workout_sessions;
create policy "own sessions" on public.workout_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own sets" on public.workout_sets;
create policy "own sets" on public.workout_sets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own plan" on public.workout_plan;
create policy "own plan" on public.workout_plan
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own templates" on public.workout_templates;
create policy "own templates" on public.workout_templates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own favorites" on public.workout_favorites;
create policy "own favorites" on public.workout_favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own body metrics" on public.body_metrics;
create policy "own body metrics" on public.body_metrics
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- custom exercises: read shared, write your own
drop policy if exists "read_public_custom_exercises" on public.workout_custom_exercises;
create policy "read_public_custom_exercises" on public.workout_custom_exercises
  for select using (is_public or auth.uid() = user_id);

drop policy if exists "own_insert" on public.workout_custom_exercises;
create policy "own_insert" on public.workout_custom_exercises
  for insert with check (auth.uid() = user_id);

drop policy if exists "own_update" on public.workout_custom_exercises;
create policy "own_update" on public.workout_custom_exercises
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_delete" on public.workout_custom_exercises;
create policy "own_delete" on public.workout_custom_exercises
  for delete using (auth.uid() = user_id);

-- =====================================================================
-- Storage — user-uploaded exercise photos.
--
-- These cannot go on the Cloudflare CDN: it is a static Workers deploy built from a git
-- repo, so it has no upload endpoint. Uploads are keyed <user-id>/<timestamp>-<slug>.<ext>
-- so two people adding the same exercise never collide.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exercise-images',
  'exercise-images',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "public read exercise images" on storage.objects;
create policy "public read exercise images" on storage.objects
  for select using (bucket_id = 'exercise-images');

drop policy if exists "signed-in users upload exercise images" on storage.objects;
create policy "signed-in users upload exercise images" on storage.objects
  for insert to authenticated with check (bucket_id = 'exercise-images');

drop policy if exists "authors delete their own exercise images" on storage.objects;
create policy "authors delete their own exercise images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'exercise-images' and owner = auth.uid());

-- =====================================================================
-- Auto-create a profile row on sign-up, so groq.ts can upsert against it
-- without a first-run race.
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
