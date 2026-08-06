# Supabase changes for shared custom exercises

> **Status: APPLIED and verified** against project `zbjsoexrcoyxkolflram`.
>
> | Step | State |
> |---|---|
> | 7 new columns (14 total) | ✅ |
> | `exercise-images` bucket — public, 5 MB, jpeg/png/webp | ✅ |
> | Storage insert + delete policies | ✅ |
> | `read_public_custom_exercises` shared-read policy | ✅ |
>
> Verified by reading `information_schema.columns`, `pg_policies` and `storage.buckets` back.
>
> **One correction to what this document originally said:** it told you to drop a policy named
> `owner`. No such policy exists — the real ones are `own_select`, `own_insert`, `own_update`
> and `own_delete`. Because the schema was read before anything was changed, the fix turned out
> to be purely additive: Postgres OR-combines permissive policies, so
> `read_public_custom_exercises` sits *alongside* `own_select` and nothing had to be dropped.
> The write policies were already correct.
>
> Undo shared visibility with:
> `drop policy "read_public_custom_exercises" on workout_custom_exercises;`

> **Standing up a *new* project?** This document is a delta against a database that already
> existed. For a fresh project run [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql)
> instead — it creates every table, all 14 custom-exercise columns, the policies below and the
> storage bucket in one idempotent script.

The rest of this file is kept as the reference for what was applied and why.

Until the migration was applied, the apps kept working — the data layer falls back to the old
column set — but uploaded images, YouTube links and coaching tips were **not persisted**, and
custom exercises stayed private to their author.

I could not run this myself: the apps authenticate with the **anon** key, which by design
cannot execute DDL or create storage buckets.

---

## 1. Columns

```sql
alter table workout_custom_exercises add column if not exists image_url  text;
alter table workout_custom_exercises add column if not exists video_url  text;
alter table workout_custom_exercises add column if not exists mode       text;
alter table workout_custom_exercises add column if not exists secondary  text[];
alter table workout_custom_exercises add column if not exists tips       text[];
alter table workout_custom_exercises add column if not exists equipment  text;
alter table workout_custom_exercises add column if not exists is_public  boolean not null default true;
```

`is_public` defaults to **true** so that an exercise one person adds shows up for everyone —
which is what "another user will get the same workout next time he opens the app" requires.

## 2. Row-level security — readable by all, writable by the author

The existing policy is owner-only (`auth.uid() = user_id`) for every operation. Split it, so
reads are global and writes stay yours:

```sql
drop policy if exists "owner" on workout_custom_exercises;

create policy "read public custom exercises"
  on workout_custom_exercises for select
  using (is_public or auth.uid() = user_id);

create policy "insert own custom exercises"
  on workout_custom_exercises for insert
  with check (auth.uid() = user_id);

create policy "update own custom exercises"
  on workout_custom_exercises for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "delete own custom exercises"
  on workout_custom_exercises for delete
  using (auth.uid() = user_id);
```

> **Read this before you run it.** This makes every custom exercise, and the image attached to
> it, visible to every signed-in user. That is what was asked for, but it is a genuine privacy
> change and it is not easily undone once people have added things — anything someone types
> into a custom exercise name becomes public. If you would rather keep them private, skip this
> section and set `is_public` to `false` by default in step 1; the apps handle both.

Duplicate names are likely once the table is shared. The app de-duplicates by
`lower(name) + category_key` at read time, preferring your own row, so a shared list stays
tidy without a unique constraint that would reject a second person's identical entry.

## 3. Storage bucket for exercise images

The Cloudflare CDN cannot take runtime uploads — `grindz-assets` is a **static** Workers
deploy built from a Git repo, so there is no upload endpoint and no way for the app to add a
file to it. User-supplied images go to Supabase Storage instead, which is already part of the
stack and enforces the same auth.

**Storage → New bucket**

| Setting | Value |
|---|---|
| Name | `exercise-images` |
| Public bucket | **on** |
| File size limit | `5 MB` |
| Allowed MIME types | `image/jpeg, image/png, image/webp` |

Then the policies:

```sql
create policy "public read exercise images"
  on storage.objects for select
  using (bucket_id = 'exercise-images');

create policy "signed-in users upload exercise images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'exercise-images');

create policy "authors delete their own exercise images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'exercise-images' and owner = auth.uid());
```

Uploads are keyed `<user-id>/<timestamp>-<slug>.<ext>`, so two people adding "Zercher Squat"
never collide and an image is traceable to whoever added it.

---

## Verifying it worked

```sql
select column_name from information_schema.columns
where table_name = 'workout_custom_exercises'
order by column_name;
-- expect: category_key, created_at, equipment, form, id, image_url, is_public,
--         mode, name, secondary, target, tips, user_id, video_url
```

In the app: **Settings → Add Exercise**, attach an image, add a YouTube link, save, then open
the muscle group. The exercise should show your photo, and a **View demo** button. Sign in as
a different user and it should still be there.
