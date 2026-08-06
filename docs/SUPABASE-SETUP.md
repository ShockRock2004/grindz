# Standing up the new Supabase project

Grindz used to share a Supabase project with Metrix. It no longer does — Grindz is standalone
and owns every table in `supabase/migrations/0001_init.sql`, including `profiles` and
`body_metrics`, which used to be shared.

This document is the whole move: new project → schema → Google OAuth → env vars → cutover.

> **Order matters in exactly one place.** Do not delete anything on the old project until the
> new one is verified and the apps are shipped against it. Everything else here is reversible.

---

## 0. What you are replacing

| | Old | New |
|---|---|---|
| Project | `zbjsoexrcoyxkolflram` | *(you create it in step 1)* |
| Shared with | Metrix | nothing — Grindz only |
| Schema applied by | `docs/SUPABASE-MIGRATION.md` (a delta) | `supabase/migrations/0001_init.sql` (from scratch) |
| Owns `profiles` / `body_metrics` | ambiguous | Grindz |

---

## 1. Create the project

**supabase.com/dashboard → New project**

| Field | Value | Why |
|---|---|---|
| Name | `grindz` | |
| Region | closest to your users | egress latency; India → `ap-south-1` |
| Password | generate, store in a password manager | this is the **Postgres** password, not an API key |
| Plan | Free | 1 GB storage ≈ 11,000 exercise photos — see [IMAGES.md](IMAGES.md) |

When it finishes provisioning, note **Settings → API**:

```
Project URL   https://<project-ref>.supabase.co
anon key      sb_publishable_…      ← safe to ship in a bundle
service_role  sb_secret_…           ← NEVER put this in an app
```

> The anon key is *designed* to be public — it identifies the project, not the user. Row-level
> security is what protects the data, which is why every table in the migration has RLS on.
> The `service_role` key bypasses RLS entirely and must never reach a client.

---

## 2. Apply the schema

**SQL Editor → New query**, paste the whole of `supabase/migrations/0001_init.sql`, **Run**.

It is idempotent — safe to re-run, and safe to run again after you edit it.

What it creates:

```
tables       profiles · workout_sessions · workout_sets · workout_plan
             workout_custom_exercises (14 cols) · workout_templates
             workout_favorites · body_metrics

RLS          on for all 8 · "own row" policies keyed on auth.uid()
             workout_custom_exercises is the exception — see below

storage      bucket `exercise-images`, public read, 5 MB cap,
             jpeg/png/webp only, + 3 object policies

trigger      on_auth_user_created → creates the profiles row on sign-up
```

### Verify it took

```sql
select tablename, rowsecurity from pg_tables
 where schemaname = 'public' order by tablename;            -- 8 rows, all true

select count(*) from information_schema.columns
 where table_name = 'workout_custom_exercises';             -- 14

select id, public from storage.buckets;                     -- exercise-images | true

select count(*) from pg_policies where schemaname in ('public','storage');
```

### One thing to be deliberate about

`workout_custom_exercises` is **public-read by design**:

```sql
create policy "read_public_custom_exercises" ...
  for select using (is_public or user_id = auth.uid());
```

`is_public` defaults to **true**, so an exercise one person adds is visible to everyone. That
was the requirement, but it is a real privacy property and it is awkward to reverse once
people have added entries. Writes stay owner-only — the read policy is the only shared one.

---

## 3. Google OAuth

Two consoles, and the thing that catches everyone is that the redirect URI Google needs is
**Supabase's callback, not your app's**.

```
  ┌─────────────┐  1. click    ┌──────────────┐  2. authorize  ┌────────────┐
  │  your app   │─────────────►│   Google     │───────────────►│  Google    │
  │ app.grindz  │              │  consent     │                │  issues ✓  │
  └─────────────┘              └──────────────┘                └─────┬──────┘
        ▲                                                            │
        │  4. Supabase redirects to your app with a ?code=           │ 3. Google redirects to
        │     (must be in the Redirect URLs allow-list)              │    the SUPABASE callback
        │                                                            ▼
        │                              ┌──────────────────────────────────────────┐
        └──────────────────────────────│ https://<ref>.supabase.co/auth/v1/callback│
                                       └──────────────────────────────────────────┘
                                          ▲ this is what goes in Google Console
```

### 3a. Google Cloud Console

**console.cloud.google.com** → create (or pick) a project.

**APIs & Services → OAuth consent screen**

| Field | Value |
|---|---|
| User type | **External** |
| App name | Grindz |
| Support email | your email |
| App domain | `https://grindz.dev` |
| Authorized domains | `grindz.dev`, `supabase.co` |
| Scopes | `email`, `profile`, `openid` — the defaults, nothing more |
| Publishing status | **Publish app** |

> While the consent screen is in **Testing**, only accounts you add under *Test users* can
> sign in — everyone else gets `access_blocked`. With only the three basic scopes, publishing
> does **not** require Google's verification review. Publish it, or your first real user is
> locked out.

**APIs & Services → Credentials → Create credentials → OAuth client ID**

| Field | Value |
|---|---|
| Application type | **Web application** |
| Name | Grindz web |

**Authorized JavaScript origins** — where the button is clicked:

```
https://app.grindz.dev
https://grindz.dev
http://localhost:5173
```

**Authorized redirect URIs** — *only* Supabase's callback:

```
https://<project-ref>.supabase.co/auth/v1/callback
```

Copy the **Client ID** and **Client secret**.

> One Web client covers **both** the web app and the Android app. The native flow opens the
> system browser and comes back on the `grindz://` scheme, and that hop is handled by Supabase
> — Google only ever sees the Supabase callback. You do **not** need an Android OAuth client,
> and creating one with a SHA-1 fingerprint is a common wrong turn here.

### 3b. Supabase

**Authentication → Providers → Google** → enable, paste Client ID + Client secret, **Save**.

**Authentication → URL Configuration**

| Setting | Value |
|---|---|
| **Site URL** | `https://app.grindz.dev` |

Site URL must be the **app** host, not `grindz.dev`. It is the fallback Supabase redirects to
when a request arrives without an explicit `redirectTo`, and a session landing on the
marketing origin is a session the app cannot read — see [DOMAINS.md](DOMAINS.md).

**Redirect URLs** — every origin `redirectTo` can produce must be listed or the callback is
rejected:

```
https://app.grindz.dev
https://app.grindz.dev/**
https://grindz.dev
http://localhost:5173
http://localhost:5173/**
https://grindz-*.vercel.app/**      ← PR previews; wildcards are allowed here
grindz://auth                        ← the Android app
```

`grindz://auth` is what `Linking.createURL('auth')` produces from `"scheme": "grindz"` in
`apps/mobile/app.json`. Without it, native sign-in completes at Google and then dies on the
way back with no useful error.

### Why the two apps take different routes

| | Web | Native |
|---|---|---|
| Call | `signInWithOAuth({ redirectTo: origin })` | `signInWithOAuth({ skipBrowserRedirect: true })` |
| Browser | the page navigates | `WebBrowser.openAuthSessionAsync` |
| Return | `detectSessionInUrl: true` picks it up | tokens handed to `setSession` by hand |
| Session store | `localStorage` | `AsyncStorage` |

Google **refuses OAuth inside an embedded WebView** (`disallowed_useragent`), which is why
native asks for the authorize URL and opens it in the system browser instead of navigating.

---

## 4. Point the apps at it

Four places. Miss one and you get a half-migrated app that reads from the new project and
writes to the old, or vice versa.

| Where | Keys |
|---|---|
| `apps/web/.env` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `apps/mobile/.env` | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
| Vercel → Settings → Environment Variables | the two `VITE_*`, set for **Production + Preview + Development** |
| A new APK | `.env` is inlined at **build** time — an installed app keeps the old project until rebuilt |

```bash
# apps/web/.env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_…

# apps/mobile/.env
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_…
```

> Neither `.env` is committed. `EXPO_PUBLIC_*` and `VITE_*` are **inlined into the bundle**,
> so changing them requires a rebuild, not a restart — and a shipped APK cannot be repointed.

---

## 5. Verify before cutting over

```bash
cd apps/web
npm run typecheck && npm run build
npx vite preview --port 4173
```

Then, by hand, in this order:

| # | Check | Passing looks like |
|---|---|---|
| 1 | Sign in with Google | lands back signed in; no `redirect_uri_mismatch` |
| 2 | `select * from public.profiles` | **a row exists for you** — proves the trigger fired |
| 3 | Log a workout, reload | it is still there |
| 4 | Add a custom exercise **with a photo** | saves, photo renders |
| 5 | Storage → `exercise-images` | object at `<your-uid>/<ts>-<slug>.webp` |
| 6 | Sign in as a second account | sees the first account's custom exercise, **not** its workouts |

Check 6 is the one that actually tests RLS. If a second account can see the first's sessions,
stop — a policy did not apply.

---

## 6. Data migration — probably don't

There is no automated path from the old project, and for this app that is usually fine: the
data is one person's workout history, and OAuth means user ids **do not carry across
projects** — a fresh `auth.users` row gets a fresh uuid, so every `user_id` foreign key would
have to be remapped by hand.

If you do want to carry history over, the shape is:

1. Sign in on the **new** project first, to mint your new uuid.
2. Export from the old: `select * from workout_sessions where user_id = '<old-uuid>'` → CSV.
3. Rewrite `user_id` to the new uuid in the CSV.
4. Import, **parents before children**: `workout_sessions` → `workout_sets`.
5. Custom exercises last, since they are the only rows other users can see.

Do it with the service_role key from a local script, never from the app.

---

## 7. Retire the old project

Only after a web deploy and an APK are both live against the new project, and check 6 above
passed.

- [ ] Vercel Production is redeployed with the new env vars
- [ ] A new APK is built and installed (`.env` is baked in at build time)
- [ ] Metrix is confirmed to be off the shared project too — **it may still be using it**
- [ ] Then, and only then, pause or delete `zbjsoexrcoyxkolflram`

> **Rotate the Supabase management token.** One was used to apply the migration to the old
> project. If it is still live: <https://supabase.com/dashboard/account/tokens>.
