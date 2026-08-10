# Domains

> ## Current status — registered, not yet delegated
>
> Checked **2026-08-06**. `grindz.dev` is registered at **Name.com** (the GitHub Student Pack
> registrar) and resolving:
>
> ```
> grindz.dev       NS   ns1psw / ns2lns / ns3fgq / ns4kmw .name.com
> grindz.dev       A    91.195.240.94      ← parking page  (server: Parking/1.0)
> app.grindz.dev   A    91.195.240.94      ← same, via wildcard
> cdn.grindz.dev   A    91.195.240.94      ← same, via wildcard
> ```
>
> The wildcard is why all three subdomains "resolve" to something. **None of it is yours yet**
> — it is Name.com's parking page, and it will shadow every record you expect to work until
> the domain is delegated.
>
> **Next step: move the nameservers to Cloudflare.** Not optional — `cdn.grindz.dev` has to be
> a Worker **Custom Domain**, and Cloudflare will only create one inside a zone it controls on
> the same account as the Worker. See [Step 1](#step-1--delegate-the-zone-to-cloudflare) below.
>
> Run `node scripts/check-domains.mjs` at any point to see exactly which stage you are at.
>
> **`.dev` is HSTS-preloaded at the TLD level.** Every browser refuses plain HTTP on it, with
> no click-through — the parking page above is only reachable by `curl`, which ignores the
> preload list. Vercel and Cloudflare both issue certificates automatically so this costs you
> nothing, but you can never test this domain over `http://`, and a certificate problem is a
> hard failure rather than a warning.
>
> If you ever move to a different name, set `VITE_SITE_HOST` and `VITE_APP_ORIGIN`; the
> hostnames are not hardcoded outside `src/lib/domains.ts`.

Three hostnames, three different things serving them.

| Host | Serves | Origin | Source |
|---|---|---|---|
| `grindz.dev` | the landing page | Vercel project **`grindz-landing`** | `apps/landing` |
| `app.grindz.dev` | the app | Vercel project **`grindz`** | `apps/web` |
| `cdn.grindz.dev` | the 43 exercise photos | Cloudflare Worker | `cdn/` |

```
                        ┌──────────────────────────────┐
   grindz.dev ─────────►│  Vercel: grindz-landing      │
                        │  root directory apps/landing │
                        │  no supabase, no router, no  │
                        │  service worker — 70 KB gzip │
                        └──────────────┬───────────────┘
                                       │ "Continue with Google"
                                       │ is a LINK across origins
                                       ▼
                        ┌──────────────────────────────┐
   app.grindz.dev ─────►│  Vercel: grindz              │
                        │  root directory apps/web     │
                        │  the PWA — auth lives here   │
                        └──────────────┬───────────────┘
                                       │ images
                                       ▼
                        ┌──────────────────────────────┐
   cdn.grindz.dev ─────►│  Cloudflare Worker           │
                        │  static assets from cdn/     │
                        └──────────────────────────────┘
```

---

## Two Vercel projects

Each hostname is its own deployment, built from its own directory:

| Vercel project | Root directory | Serves | Bundle |
|---|---|---|---|
| `grindz-landing` | `apps/landing` | `grindz.dev` | **212 KB** (70 KB gzip) |
| `grindz` | `apps/web` | `app.grindz.dev` | 635 KB (187 KB gzip) |

The separation is real, not a runtime branch: **`apps/landing` has no `@supabase/supabase-js`,
no router and no service worker.** A visitor who has never signed in — which is every visitor
the marketing site is written for — no longer downloads an auth stack and an offline shell to
read a pitch.

Verified on the built bundle: `supabase`, `createClient` and `react-router` all appear **zero**
times in `apps/landing/dist`.

There is also a correctness reason for the missing service worker. The app registers one on
`app.grindz.dev`; a second registration on the parent domain would keep its own precache, and
a stale marketing shell is a page that keeps sending people to a version of the app that has
moved on.

### What it costs

Some files exist in both trees — the traced muscle geometry, the heat-map palette, the theme
and `BodyMap.tsx` itself. The hero muscle map is the strongest thing on the landing page, so
it renders the **real component** rather than a screenshot of one, and that means the geometry
and the renderer have to be present on both sides.

Copies are a genuine cost. `scripts/check-parity.mjs` is what stops them being a *silent* one
— it now enforces seven files across three apps, so a marketing page cannot end up painting
"trained" in a colour the app stopped using.

---

## Sign-in has to happen on the app host

`localStorage` is per-origin. A session minted on `grindz.dev` is stored under
`https://grindz.dev` and is **invisible** to `https://app.grindz.dev` — different origin,
different storage. So the marketing page does not run OAuth at all; its call to action is an
`<a href="https://app.grindz.dev">`, and the app asks Google.

```
grindz.dev              app.grindz.dev                  Google
    │                        │                            │
    │  "Continue with        │                            │
    │   Google"  ───────────►│                            │
    │   (a link, not         │  signInWithOAuth() ───────►│
    │    a button)           │                            │
    │                        │◄─── ?code= ────────────────┘
    │                        │  session → localStorage
    │                        │            on THIS origin ✅
```

If sign-in ran on `grindz.dev`, the user would come back "signed in" to a page with no app on
it, and clicking through to `app.grindz.dev` would show them a sign-in screen again.

---

## The hint cookie

A returning user typing `grindz.dev` should land in the app, not on a pitch for something they
already use. But the landing page cannot read the session — that is the whole point above.

So the app leaves a note on the shared parent domain:

```js
document.cookie = 'gz_hint=1; domain=.grindz.dev; path=/; max-age=31536000; secure; samesite=lax'
```

| Property | Value | Why |
|---|---|---|
| Contents | `1` | a boolean, nothing else |
| Token? | **no** | it is a hint, not a credential |
| User id / email? | **no** | |
| `Domain` | `.grindz.dev` | readable from both hosts |
| `HttpOnly` | no | client JS on the landing page is the only reader |
| `SameSite` | `Lax` | the redirect is a top-level navigation |

**Worst case if it is stale or forged:** the visitor is sent to `app.grindz.dev` and shown a
sign-in screen — exactly what clicking the button would have done. It grants nothing.

Written from `onAuthStateChange` in `app-context.tsx` rather than from `signInWithGoogle`,
because OAuth returns via a full page load — the sign-in call never runs its own success path.
The listener fires on every route in, including a restored session and a token refresh.

`signOut()` clears it **eagerly**, before the listener would. If it survived a sign-out,
`grindz.dev` would keep bouncing the user to `app.grindz.dev`, which would show a sign-in
page — making the marketing site unreachable for the one person who just left.

### Where each half lives

The cookie is **written by the app** and **read by the landing page** — two codebases, one
string between them:

| | File | Does |
|---|---|---|
| Write | `apps/web/src/lib/domains.ts` → `setSignedInHint()` | called from `onAuthStateChange`, cleared in `signOut()` |
| Read | `apps/landing/src/lib/domains.ts` → `redirectToAppIfSignedIn()` | called from `main.tsx` |

In `apps/landing/src/main.tsx`, **before React mounts**:

```ts
if (!redirectToAppIfSignedIn()) {
  createRoot(document.getElementById('root')!).render(<StrictMode><Landing /></StrictMode>)
}
```

From a `useEffect` it would paint a frame or two of marketing copy at an existing user first,
which reads as a bug. `location.replace` rather than `assign`, so Back returns them to
wherever they came from instead of to a page that immediately redirects again.

Off the `grindz.dev` domain the cookie is never written at all — a browser silently drops a
`Domain` the page does not own, and there is no point writing something that can never be
read. Nothing depends on it locally: you reach the landing page there by editing the URL.

---

## Setting it up

Five steps, in this order. Each one depends on the one before it, and
`node scripts/check-domains.mjs` tells you when each has landed.

### Step 1 — delegate the zone to Cloudflare

The domain is at Name.com on Name.com's nameservers. It has to be on **Cloudflare's**, because
`cdn.grindz.dev` is a Worker Custom Domain and Cloudflare only creates those inside a zone it
controls, on the same account as the Worker.

1. **Cloudflare → Add a site → `grindz.dev`**, pick the **Free** plan.
2. Cloudflare scans the existing records and shows you two nameservers, e.g.
   `xxx.ns.cloudflare.com` / `yyy.ns.cloudflare.com`. Copy them.
3. **Name.com → My Domains → grindz.dev → Nameservers → Manage**. Delete all four
   `*.name.com` entries and add the two Cloudflare ones.
4. Wait for Cloudflare to mark the zone **Active** — usually minutes, up to 24h.

```bash
node scripts/check-domains.mjs        # step 1 turns green when NS are Cloudflare's
```

> **Delete the parking records once the zone is live.** Cloudflare's scan copies whatever
> Name.com had, including the `A → 91.195.240.94` parking record and very likely a `*`
> wildcard. Both will shadow the records below — a wildcard `A` answers for `app` and `cdn`
> before your CNAMEs ever get a chance. Remove them in **Cloudflare → DNS → Records**.

### Step 2 — the CDN Worker

Do this before Vercel: it is the piece that is currently broken (images 404), and it is
independent of the app.

| # | Step | Where |
|---|---|---|
| 1 | Create a Worker named **`grindz-cdn`** | Workers & Pages → Create |
| 2 | Settings → Build → connect **`ShockRock2004/grindz`**, root directory **`cdn`** | |
| 3 | Settings → Domains & Routes → Custom Domain → **`cdn.grindz.dev`** | needs step 1 done |
| 4 | Verify | `node scripts/check-cdn.mjs` → 43/43 |

Cloudflare creates and manages the `cdn` DNS record itself — do not add one by hand.

Only once `check-cdn.mjs` passes and a web deploy + a new APK have shipped should you retire
the old `grindz-assets` Worker. Full ordering in [DEPLOY.md](DEPLOY.md).

### Step 3 — Vercel domains

**Two** Vercel projects, both importing `ShockRock2004/grindz`. The only setting that matters
on each is the root directory:

| Project | Root Directory | Domain | Env vars |
|---|---|---|---|
| `grindz` | **`apps/web`** | `app.grindz.dev` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `grindz-landing` | **`apps/landing`** | `grindz.dev` (+ `www`) | *none* |

The landing project needs **no environment variables at all** — it has no Supabase client. If
you ever move the app off `app.grindz.dev`, set `VITE_APP_ORIGIN` on the landing project and
`VITE_SITE_HOST` on the app; nothing else hardcodes either host.

> Vercel builds a monorepo subdirectory but still installs from the repo root by default. Both
> `apps/web` and `apps/landing` carry their own `package.json` and lockfile, so setting the
> root directory is sufficient — no `installCommand` override needed.

Vercel will show you the DNS records it wants. In **Cloudflare → DNS → Records**:

| Type | Name | Content | Proxy |
|---|---|---|---|
| `CNAME` | `@` (or `grindz.dev`) | `cname.vercel-dns.com` | **DNS only** (grey cloud) |
| `CNAME` | `app` | `cname.vercel-dns.com` | **DNS only** (grey cloud) |
| — | `cdn` | *managed by the Worker Custom Domain — leave alone* | — |

> **Grey-cloud the Vercel records.** Proxying them puts a second CDN in front of Vercel's,
> which breaks Vercel's certificate issuance and produces `ERR_TOO_MANY_REDIRECTS` under
> Cloudflare's default Flexible SSL mode. If you do want them proxied later, set SSL/TLS mode
> to **Full (strict)** first — but grey cloud is the setting that just works.
>
> Cloudflare cannot `CNAME` the apex in the normal sense; it uses **CNAME flattening**
> automatically, so entering `CNAME @ → cname.vercel-dns.com` is correct and does not need an
> `A` record.

### Step 4 — Supabase

**Authentication → URL Configuration**

- **Site URL:** `https://app.grindz.dev` — the app host, never the marketing host
- **Redirect URLs:** must include `https://app.grindz.dev` and `https://app.grindz.dev/**`

Full list in [SUPABASE-SETUP.md](SUPABASE-SETUP.md#3b-supabase).

### Step 5 — Google Cloud Console

Add both to **Authorized JavaScript origins** (`https://grindz.dev` and
`https://app.grindz.dev`). The **Authorized redirect URI** stays Supabase's callback only —
`https://<project-ref>.supabase.co/auth/v1/callback`.

---

## Verifying

| Check | Expected |
|---|---|
| `grindz.dev` in a clean profile | landing page, CTA is a **link** to `app.grindz.dev` |
| `app.grindz.dev` signed out | landing page, CTA is a **Google button** |
| sign in, then open `grindz.dev` | redirected to the app before anything paints |
| sign out, then open `grindz.dev` | landing page — **no** redirect loop |
| `localhost:5173` | the app, unaffected |
| a PR preview URL | the app, unaffected |

The sign-out check is the one that matters: it is what proves the cookie is being cleared.

```bash
# both hosts must serve the app, not a redirect
curl -sI https://grindz.dev      | head -1     # 200
curl -sI https://app.grindz.dev  | head -1     # 200
curl -sI https://cdn.grindz.dev/hero/abs.png   # 200 + immutable
```
