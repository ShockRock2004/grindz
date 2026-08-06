# Where images come from

There are **two** image pipelines in Grindz and they share nothing but a cache policy. The
question "how does a user's uploaded photo get onto the CDN?" has a short answer:

> **It doesn't.** User uploads never touch Cloudflare. They go to Supabase Storage.

Everything below explains why that split exists and what actually happens on each path.

---

## The two paths at a glance

| | **Curated library** | **User upload** |
|---|---|---|
| What | The 42 exercise PNGs + 8 category heroes | A photo someone attaches to a custom exercise |
| Lives in | Cloudflare Worker (`cdn.grindz.dev`) | Supabase Storage (`exercise-images` bucket) |
| Source of truth | `cdn/public/` **in this git repo** | The bucket; nothing in git |
| How it gets there | You commit a file and push | The app uploads it at runtime |
| Who can write | Whoever can push to `main` | Any signed-in user |
| Changes how often | Rarely, by you | Constantly, by everyone |
| URL shape | `cdn.grindz.dev/images/<cat>/<file>.png` | `<project>.supabase.co/storage/v1/object/public/exercise-images/<uid>/<ts>-<slug>.webp` |
| Cost model | Free (Workers static assets) | Counts against Supabase storage + egress |
| Code | `src/data/assetCdn.ts` | `src/lib/storage.ts` |

---

## Why an upload cannot go to the CDN

This is the crux, and it is a property of what the CDN *is*:

```
    cdn.grindz.dev  =  a Cloudflare Worker with `assets: { directory: "./public" }`
                       built from the git repo, root directory `cdn/`

    ┌──────────────────────────────────────────────────────────────┐
    │  git push  →  Cloudflare build  →  static files published    │
    └──────────────────────────────────────────────────────────────┘
                    ▲
                    └── the ONLY way in
```

A static-assets Worker has:

- **no upload endpoint** — there is no URL an app could `POST` a file to
- **no write credentials** — nothing the client could authenticate with even if there were
- **no runtime code at all** — `wrangler.jsonc` has no `main`; Cloudflare just serves bytes

Adding an image means committing it and redeploying. That is exactly right for 42 curated
photos that ship with the product, and exactly wrong for something a user picks in a gym at
11pm. Making it work would mean building an authenticated upload API, giving it write access
to a git repo, and triggering a full site rebuild per photo — reinventing object storage,
badly, on top of a CDN.

Supabase Storage already is object storage, already authenticates with the session the user
is holding, and already serves its public buckets through a CDN of its own.

---

## What actually happens when a user uploads

Both apps end at the same bucket with the same path layout, but **step 2 differs between them**
— see [the caveat below](#the-two-apps-do-not-downscale-equally). The web version is
`apps/web/src/lib/storage.ts`, the native one is `apps/mobile/src/lib/storage.ts`.

```
 user picks a photo in Add Exercise
            │
            ▼
 ┌──────────────────────────────────────────────────────┐
 │ 1. VALIDATE          validateImage()                 │
 │    · JPEG / PNG / WebP only                          │
 │    · ≤ 5 MB  (MAX_BYTES)                             │
 │    reject → message shown, exercise still saveable   │
 └──────────────────────────────────────────────────────┘
            │
            ▼
 ┌──────────────────────────────────────────────────────┐
 │ 2. SHRINK      ── WEB ONLY ──  shrink()              │
 │    · long edge capped at 1600 px (canvas re-encode)  │
 │    · re-encoded to WebP q=0.92                       │
 │    · under 1.5 MB and already small → left UNTOUCHED │
 │    · keeps the original if the re-encode grew it     │
 │    ⇒ ~212 KB typical, down from 3–8 MB               │
 │    ⇒ EXIF (incl. GPS) is dropped as a side effect    │
 │                                                      │
 │                ── NATIVE ──                          │
 │    expo-image-picker `quality: 0.92` + square crop.  │
 │    NO dimension cap. See the caveat below.           │
 └──────────────────────────────────────────────────────┘
            │
            ▼
 ┌──────────────────────────────────────────────────────┐
 │ 3. UPLOAD            supabase.storage                │
 │                        .from('exercise-images')      │
 │                        .upload(path, body, {…})      │
 │                                                      │
 │    path = `${user.id}/${Date.now()}-${slug}.webp`    │
 │    cacheControl: '31536000'   ← one year             │
 │    upsert: false              ← never clobber        │
 │                                                      │
 │    RLS: insert allowed only `to authenticated`       │
 └──────────────────────────────────────────────────────┘
            │
            ▼
 ┌──────────────────────────────────────────────────────┐
 │ 4. GET PUBLIC URL    .getPublicUrl(path)             │
 │    bucket is public-read, so no signing needed       │
 └──────────────────────────────────────────────────────┘
            │
            ▼
 ┌──────────────────────────────────────────────────────┐
 │ 5. STORE THE URL     workout_custom_exercises        │
 │                        .image_url  =  <that URL>     │
 │    a short text column — NOT the image bytes         │
 └──────────────────────────────────────────────────────┘
```

**Every step fails soft.** If the bucket is missing or the upload errors, the caller gets a
sentence explaining it and the exercise still saves — without a photo. Losing the whole
exercise because a photo failed would be the wrong trade.

### Quality settings, and why they are these numbers

The largest an exercise photo is ever drawn is the detail modal: `max-w-lg` (512 CSS px) with
the image at `w-4/5`, so **~410 CSS px** — about **1230 device px** on a 3× phone. Everything
below follows from that one measurement.

Measured on a synthetic 4000×3000 photo, then scaled by the 2.7× gap between that test image
and the real library average:

| Setting | Est. real size | Photos per 1 GB |
|---|---|---|
| 1200px q0.86 *(previous)* | ~93 KB | ~11,000 |
| **1600px q0.92** *(current)* | **~212 KB** | **~4,900** |
| 2048px q0.92 | ~476 KB | ~2,200 |

1600px clears the 1230px requirement with headroom for a larger presentation later without
re-uploading anything; 2048 buys resolution nothing renders. At ~212 KB the free tier still
holds far more photos than this app will produce.

An image already under `SKIP_REENCODE_BYTES` (1.5 MB) and within the size cap is uploaded
**untouched** — re-encoding is lossy even when it does not resize, so a second pass over an
already-reasonable photo would only discard detail.

### Aspect ratio — upload square, 1600×1600

**Every surface draws exercise photos with `contain`**, so no aspect ratio ever loses pixels.
The only question is how much empty space surrounds them, and square minimises it:

| Surface | Container | Fit |
|---|---|---|
| Web category grid | `aspect-[4/3]` | contain |
| Web detail modal | `aspect-[4/3]`, image at 80% | contain |
| Web session card | `h-28 w-28` → **1:1** | contain |
| Native category grid | `cardW × 0.78` → ~1.28:1 | contain |
| Native detail | `aspectRatio: 4/3` | contain |
| Native session thumb | `84 × 84` → **1:1** | contain |

Three reasons square is the answer:

1. **The catalogue is square.** Most built-ins are 1512×1512, so a square upload sits
   identically beside them. A tall phone photo reads as visibly smaller than its neighbours.
2. **It fills the two 1:1 containers completely** — the web session card and the native
   thumb. A 4:3 image pillarboxes in both.
3. In the 4:3 containers a square letterboxes to 75% width — but **so does every built-in**,
   so it looks consistent rather than wrong.

Native enforces this with `aspect: [1, 1]` in the picker. **Web has no crop step at all** —
it uploads whatever the user selected, and only advises square in the helper text. That is
the one remaining asymmetry between the two upload paths; a web-side cropper is the fix, and
silently centre-cropping instead would be worse, since it can cut a head off with no way for
the user to reframe.

> **Previews must use `contain` too.** Both apps previously previewed with `cover` — a
> square-cropped photo in a 4:3 preview box lost its top and bottom, so the user was shown
> *less* than they were about to get. Fixed in both; the preview now matches the card.

### The native path still has no resize

| | Web | Native |
|---|---|---|
| Dimension cap | **1600 px long edge** | **none** |
| Encode | WebP q=0.92, via `<canvas>` | JPEG `quality: 0.92`, by the picker |
| EXIF / GPS stripped | yes, by the canvas round-trip | not guaranteed |
| Crop | free | forced square (`aspect: [1, 1]`) |

The reason is mechanical: there is no `<canvas>` and no `createImageBitmap` in Hermes, so
`shrink()` has no direct equivalent. Because nothing bounds the dimensions, a native upload
is **larger than the web upload of the same photo** — the square crop helps, but a 3000×3000
JPEG at q0.92 is a few MB against the web path's ~212 KB.

Closing the gap means adding `expo-image-manipulator` and resizing before the base64 read:

```ts
// apps/mobile/src/components/AddExercise.tsx — NOT currently applied
const out = await ImageManipulator.manipulateAsync(
  res.assets[0].uri,
  [{ resize: { width: 1600 } }],
  { compress: 0.92, format: ImageManipulator.SaveFormat.WEBP, base64: true },
)
```

Deliberately not applied: it adds a native dependency, so it needs `npx expo install
expo-image-manipulator`, a rebuild, and a test on a real device — which is the one thing this
repo has never had. Everything else on this page is verified.

### The user id in the path is load-bearing

`${user.id}/…` is a prefix, not decoration. The delete policy is:

```sql
using (bucket_id = 'exercise-images' and owner = auth.uid())
```

so a user can only remove their own objects. The timestamp makes collisions impossible
without needing `upsert`, which is what keeps one user from overwriting another's file.

---

## Why `image_url` and not the image itself

Custom exercises used to store a `data:` URI directly in the text column. That was replaced,
and the reason generalises:

| Storing bytes in the column | Storing a URL |
|---|---|
| 1–2 MB string in every row read | ~100 byte string |
| Re-sent to **every** user the exercise is shared with, every time | Fetched once per device, then cached |
| Bloats every `select` that touches the table | Free |
| Eventually trips Postgres row-size limits | Never |

Custom exercises are public by default, so an exercise one person adds is read by everyone —
which turns a 2 MB column into 2 MB × every reader × every load.

---

## Caching: why egress stays near zero

The upload sets `cacheControl: '31536000'` (one year), but the HTTP header is the *weakest*
of the three layers. What actually matters is that the client stores the bytes durably:

| Layer | Mechanism | Where | Survives |
|---|---|---|---|
| HTTP | `Cache-Control: max-age=31536000` | set at upload | browser cache eviction, maybe |
| Web | Workbox `CacheFirst` on the Supabase storage path | `apps/web/vite.config.ts` | app updates ✅ |
| Native | `expo-image` `cachePolicy="memory-disk"` | `apps/mobile/src/data/images.ts` | app updates ✅ |

Cache Storage and the expo-image disk cache are keyed by URL and live in app storage, so they
persist across an app update. **Without the Workbox rule, every view re-downloads** — which is
the difference between paying Supabase egress once per device and paying it once per render.

The web rule matches on hostname + path rather than a fixed origin, so it keeps working when
the Supabase project changes:

```ts
({ url }) => /\.supabase\.co$/.test(url.hostname)
             && url.pathname.includes('/storage/v1/object/public/')
```

The curated-library rule matches the CDN by **origin** instead — see `cdn/README.md`. If you
ever change `ASSET_CDN`, that `urlPattern` must move with it or images still load while the
service worker silently stops caching them.

### Budget

At a measured **93 KB average**, the 1 GB Supabase free tier holds roughly **11,000 images**.
Egress is the number to watch, not storage, and the two cache layers above are what keep it
flat.

---

## Adding to the curated library

Not an upload — a commit.

```bash
cp new-photo.png cdn/public/images/shoulders/face-pull.png
git add cdn/public/images/shoulders/face-pull.png
git commit && git push        # Cloudflare rebuilds and publishes
```

> **Never overwrite an image in place.** Filenames are effectively content-addressed: devices
> holding the old copy keep serving it for a year, because you told them it was `immutable`.
> A changed photo ships under a **new filename**.
