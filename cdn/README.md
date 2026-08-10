# Image CDN — Cloudflare

Every exercise photo and category hero image in Grindz is served from a **Cloudflare Workers
static-assets deployment**, not bundled into the apps:

```
https://cdn.grindz.dev/images/<category>/<file>.png
https://cdn.grindz.dev/hero/<category>.png
```

The URL contract lives in **one file**, kept byte-identical in both apps and enforced by
`scripts/check-parity.mjs`:

- `apps/web/src/data/assetCdn.ts`
- `apps/mobile/src/data/assetCdn.ts`

Change the origin there and copy it across. Nothing else in either app hardcodes the host.

## Why

The 43 PNGs total roughly **33 MB**. They used to be compiled into the Android APK, so every
user paid the full 33 MB on first install **and again on every update**, forever, whether or
not they ever opened a single exercise.

Serving them from a CDN means a device downloads any given photo **at most once in its
lifetime**.

> Worth being precise about the size story, because it is easy to over-claim: moving the
> images off removed 24.7 MB from the APK, but the same release added ~19 MB of new native
> libraries, so the net saving was only ~7 MB. The much bigger win in that release came from
> dropping the emulator-only x86 ABIs. See [docs/BUILD.md](../docs/BUILD.md#apk-size).

## Caching is explicit, not just an HTTP header

This is the part that actually delivers the promise — that an image survives an **app
update**, not merely an app restart:

| Layer | Mechanism | Where |
|---|---|---|
| CDN | `Cache-Control: public, max-age=31536000, immutable` | `public/_headers` |
| Web | Workbox `CacheFirst` rule matched on the CDN **origin** | `apps/web/vite.config.ts` |
| React Native | `expo-image` with `cachePolicy="memory-disk"` | `apps/mobile/src/data/images.ts` |

The bottom two matter more than the header. Cache Storage and the expo-image disk cache are
keyed by URL and live in app storage, so they persist across updates. An HTTP cache alone
would not reliably do that. Plain React Native `Image` was not enough either — it leans on
Fresco's cache, which is not a durable store.

The Workbox rule matches by **origin**, not by pathname, because a same-origin `/assets/`
path no longer exists at all.

## Deployment

The images and their Wrangler config live in **this repository**, under `cdn/`. Cloudflare
builds the Worker directly from it.

```
cdn/
  public/
    images/<category>/<file>.png    43 exercise photos
    hero/<category>.png              8 category heroes
    _headers                         immutable cache + CORS
  wrangler.jsonc
```

```jsonc
{
  "name": "grindz-cdn",
  "compatibility_date": "2026-08-01",
  "assets": { "directory": "./public" }
}
```

Cloudflare dashboard → **Workers & Pages → grindz-cdn → Settings → Build**: connect
`ShockRock2004/grindz` with **root directory `cdn`**. Pushing to `main` publishes. To deploy
by hand instead: `npx wrangler deploy --config cdn/wrangler.jsonc`.

The public hostname `cdn.grindz.dev` is a **Custom Domain** on that Worker
(Settings → Domains & Routes). It requires `grindz.dev` to be an active zone on the same
Cloudflare account.

Two things that are easy to get wrong, both learned the hard way:

- It is a **static-assets Worker, not a Pages project**. The build runs `npx wrangler deploy`,
  which needs that `assets` block — without it the deploy fails with *"Could not detect a
  directory containing static files."*
- Assets live under `public/` rather than the repo root. With `directory: "."` the README and
  the config itself would be publicly reachable URLs too.

### Migrating off the old deployment

Images were previously served by a Worker named **`grindz-assets`**, built from a separate
repo of the same name under a now-retired GitHub account. Those files live here now, so both
that Worker and that repo are redundant.

> **Find the old origin, do not guess it.** It is a `*.workers.dev` subdomain, and the
> subdomain is a *Cloudflare account* setting, unrelated to which GitHub account owned the
> source. Read the exact hostname off **Workers & Pages → grindz-assets → Settings → Domains
> & Routes** when you need it.
>
> It matters because until step 6 below it is a **live** origin that shipped builds are still
> fetching from — the released APK predates `cdn.grindz.dev` and points at the old Worker.

Order matters — the old Worker must outlive the switch, because every device that cached an
image from it holds that copy for a year:

1. Create the `grindz-cdn` Worker against this repo, root directory `cdn`.
2. Add `cdn.grindz.dev` as a Custom Domain on it.
3. Verify before switching anything:
   ```
   curl -I https://cdn.grindz.dev/hero/abs.png
   ```
   Expect `200` plus `cache-control: public, max-age=31536000, immutable`.
4. `ASSET_CDN` in both `assetCdn.ts` files and the `urlPattern` origin check in
   `apps/web/vite.config.ts` already point at `cdn.grindz.dev`. **They must always move
   together** — if they drift, images load but the service worker stops caching them and
   offline support quietly breaks.
5. Ship a web deploy and a mobile build carrying the new origin.
6. Only then retire the old one: archive the `grindz-assets` repo, and delete the
   `grindz-assets` Worker (Workers & Pages → grindz-assets → Settings → Delete).

Deleting the old Worker before step 5 breaks images for anything still pointed at it. Because
this is a new origin rather than a rename, every existing device re-downloads the full 32 MB
once — a deliberate one-time cost.

## Rules

**Never overwrite an image in place.** Filenames are effectively content-addressed: devices
holding the old copy will keep serving it for a year. Ship a changed photo under a **new
filename**.

**Sanity check after touching any of this** — build every URL the catalog can produce and
`HEAD` them; all 43 must return `200`.

## Trade-off, stated plainly

The apps now need a network connection the first time an exercise photo is shown. After that
the image is on disk permanently. Given the install shrank by tens of megabytes and updates no
longer re-download the library, that is the right trade for this app — but it is a real one,
and it is why the first browse of a muscle group wants a connection.
