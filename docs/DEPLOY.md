# Deploying

Two things get deployed from this repo, to two different places, across three hostnames.

| What | Host(s) | Where | Source |
|---|---|---|---|
| Landing page | `grindz.dev` | **Vercel** | `apps/web` |
| The app | `app.grindz.dev` | **Vercel** — same project | `apps/web` |
| Exercise imagery | `cdn.grindz.dev` | **Cloudflare Workers** | `cdn/` |

The two Vercel hostnames are one project serving one bundle that branches on
`window.location.hostname` — see **[DOMAINS.md](DOMAINS.md)** for why, and for the DNS and
cookie details.

> ### Which GitHub repo Cloudflare and Vercel should point at
>
> **`ShockRock2004/grindz`.** This is the only account the project uses. Point Vercel and the
> Cloudflare Worker build here.
>
> The repo was transferred from an earlier account. GitHub redirects `git` operations from the
> old URL, but **neither Vercel nor Cloudflare follows that redirect for builds** — if either
> was ever connected to the old location, reconnect it by hand.

---

## Web app → Vercel

The repo is a monorepo, so Vercel needs to be told which directory the app lives in. Set
that once when you import the project:

1. **Add New → Project**, import `ShockRock2004/grindz`.
2. Set **Root Directory** to **`apps/web`**. This is the only setting that matters — with it,
   Vercel reads `apps/web/vercel.json` and everything else is automatic.
3. Add the two environment variables under **Settings → Environment Variables**:

   ```
   VITE_SUPABASE_URL
   VITE_SUPABASE_ANON_KEY
   ```

   Set both for **Production**, **Preview** and **Development**. The anon key is a
   publishable client key — it is designed to ship in the bundle, and row-level security is
   what actually protects the data.
4. **Settings → Domains** — add **`grindz.dev`** *and* **`app.grindz.dev`**, both pointed at
   Production. One project, two aliases; do not create a second project and do not redirect
   one host to the other.
5. Deploy. Every push to `main` redeploys; every PR gets a preview URL.

**Do not** set `VITE_DEV_BYPASS_AUTH` or `VITE_DEV_SEED` on Vercel. They only take effect
when `import.meta.env.DEV` is true, so a production build ignores them entirely — but setting
them signals an intent that does not exist.

### What `apps/web/vercel.json` does

- **`rewrites`** — the app is a client-routed SPA. Without a rewrite, a hard refresh on
  `/progress` asks Vercel for a file that does not exist and returns 404. The rewrite is
  written as a negative lookahead rather than a blanket `/(.*) → /index.html` so that real
  files still win: `sw.js`, `workbox-*.js`, `manifest.webmanifest` and everything under
  `assets/` must be served as themselves. A blanket rewrite that swallows `sw.js` silently
  breaks the service worker, and therefore offline support and the image cache.
- **`headers`** — hashed build assets are immutable for a year; `index.html` and `sw.js`
  must revalidate every time or users get pinned to a stale build forever.

### After the first deploy — Supabase redirect URL

Google sign-in returns to `window.location.origin`, so **every** origin the app can be served
from has to be whitelisted or the callback fails.

**Supabase dashboard → Authentication → URL Configuration**

```
Site URL       https://app.grindz.dev          ← the app host, not grindz.dev

Redirect URLs  https://app.grindz.dev
               https://app.grindz.dev/**
               https://grindz.dev
               http://localhost:5173
               http://localhost:5173/**
               https://grindz-*.vercel.app/**   ← PR previews
               grindz://auth                    ← the Android app
```

Site URL must be the **app** host: it is the fallback Supabase uses when a request carries no
explicit `redirectTo`, and a session deposited on the marketing origin is one the app cannot
read. Full reasoning in [DOMAINS.md](DOMAINS.md); provider setup in
[SUPABASE-SETUP.md](SUPABASE-SETUP.md).

---

## Images → Cloudflare

`cdn/` holds the 42 exercise PNGs, the 8 category heroes, `_headers`, and `wrangler.jsonc`.
See [cdn/README.md](../cdn/README.md) for how the caching works and why filenames are
effectively immutable.

### Moving the CDN off `grindz-assets`

Today Cloudflare still builds from a **separate `grindz-assets` repo on a now-retired GitHub
account** and serves it from a `*.workers.dev` subdomain. The images live in this monorepo
under `cdn/` now, and the code already points at `https://cdn.grindz.dev` — a Worker that
**does not exist yet**. Until you create it, every exercise photo 404s.

```
  NOW                                    TARGET
  ───                                    ──────
  <old repo>/grindz-assets               ShockRock2004/grindz  (this repo)
        │                                        │  root directory: cdn/
        ▼                                        ▼
  Worker: grindz-assets                    Worker: grindz-cdn
        │                                        │
        ▼                                        ▼
  <old>.workers.dev                        cdn.grindz.dev
                                           (Custom Domain)
        │                                        │
        └────── old app builds ────┐    ┌── new app builds ──┘
                                   ▼    ▼
                          both must work during the overlap
```

Read the old Worker's exact hostname off **Workers & Pages → grindz-assets → Settings →
Domains & Routes** rather than reconstructing it — a `*.workers.dev` subdomain is a
Cloudflare account setting and has nothing to do with the GitHub owner.

**Do these in order. The old Worker must outlive the switch** — every device that cached an
image from it was told `immutable` for a year, and an app that has not been updated is still
asking the old host.

| # | Step | Where |
|---|---|---|
| 1 | Create a Worker named **`grindz-cdn`** | Workers & Pages → Create |
| 2 | Settings → Build → connect **`ShockRock2004/grindz`**, root directory **`cdn`** | |
| 3 | Settings → Domains & Routes → Custom Domain **`cdn.grindz.dev`** | needs `grindz.dev` delegated to Cloudflare first — [DOMAINS.md Step 1](DOMAINS.md#step-1--delegate-the-zone-to-cloudflare) |
| 4 | Verify **before** touching anything else | `curl -I https://cdn.grindz.dev/hero/abs.png` → `200` + `immutable` |
| 5 | Deploy the web app, and build + ship a new APK | both already carry the new origin |
| 6 | **Only now** — archive `grindz-assets`, delete the `grindz-assets` Worker | Workers & Pages → grindz-assets → Settings → Delete |

Deleting the old Worker before step 5 breaks images for everything still pointed at it.

> It is a **static-assets Worker, not a Pages project** — the build runs `npx wrangler deploy`,
> which needs the `assets` block in `cdn/wrangler.jsonc`. Without it the deploy fails with
> *"Could not detect a directory containing static files."*

Because this is a new origin rather than a rename, every existing device re-downloads the full
32 MB once. That is a deliberate, one-time cost — see [cdn/README.md](../cdn/README.md).

To check every published URL rather than one:

```bash
node scripts/check-cdn.mjs                     # against cdn.grindz.dev
node scripts/check-cdn.mjs https://<old-worker>.workers.dev   # the outgoing one
```

It walks `cdn/public/`, builds the public URL for every file it finds, and `HEAD`s them all —
so it fails on a missing image, a bad path, or a lost `immutable` header.

To see which stage of the DNS/domain setup you are at:

```bash
node scripts/check-domains.mjs
```

It checks delegation, the CDN Custom Domain and both Vercel hosts against a public resolver,
and prints the next action. See [DOMAINS.md](DOMAINS.md).

The apps resolve image URLs from `src/data/assetCdn.ts`, which is kept byte-identical between
the web and mobile apps (`node scripts/check-parity.mjs`). Changing the CDN origin means
editing that file in both apps — nothing else hardcodes the host.

---

## Verifying a build before you ship it

```bash
cd apps/web
npm run typecheck
npm run build

# landing page, signed out, against the real production bundle
npx vite preview --port 4173 &
node scripts/verify-web.mjs --base=http://localhost:4173 --mode=landing

# the signed-in app. The auth bypass is compiled out of production builds by design,
# so this needs a development-mode build — NODE_ENV is what actually flips import.meta.env.DEV,
# not `--mode development`.
NODE_ENV=development VITE_DEV_BYPASS_AUTH=1 VITE_DEV_SEED=1 \
  npx vite build --mode development --outDir dist-demo
npx vite preview --outDir dist-demo --port 4174 &
node scripts/verify-web.mjs --base=http://localhost:4174 --mode=app
```

Both passes fail on console errors, page exceptions, failed requests, HTTP 4xx/5xx, a missing
layout, or a route that renders almost no text. `dist-demo/` is gitignored and must never be
deployed — it contains the auth bypass and the sample data generator.
