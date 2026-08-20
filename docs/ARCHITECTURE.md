# Architecture

Grindz is one product on two stacks, sharing one backend and one image CDN.

```
                    ┌──────────────────────────┐
                    │  Supabase (Postgres)     │
                    │  Google OAuth + RLS      │
                    │  workout_* + body_metrics│
                    └────────────┬─────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 │                               │
        ┌────────▼─────────┐           ┌─────────▼──────────┐
        │  apps/web        │           │  apps/mobile       │
        │  React + Vite    │           │  React Native      │
        │  Tailwind, PWA   │           │  Expo SDK 57       │
        └────────┬─────────┘           └─────────┬──────────┘
                 │                               │
                 └───────────────┬───────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │  Cloudflare Worker       │
                    │  37 exercise photos      │
                    │  8 category heroes       │
                    └──────────────────────────┘
```

## The two surfaces

**`apps/web`** — React 18 + TypeScript + Vite + Tailwind. Installable PWA with a service
worker. Deployed to Vercel and served on two hostnames: `grindz.dev` (the landing page) and
`app.grindz.dev` (the app itself).

**`apps/mobile`** — React Native 0.86 on Expo SDK 57, new architecture (Fabric + TurboModules)
with Hermes. This produces the released APK. Navigation is React Navigation; SVG via
`react-native-svg`; images via `expo-image`.

They are deliberately **not** a shared-component codebase. A Tailwind `<div>` and a React
Native `<View>` do not usefully unify, and pretending otherwise produces a lowest-common-
denominator UI on both. What *is* shared is the stuff where disagreement would be a bug.

## What must stay identical

Five files are byte-identical across both apps. `scripts/check-parity.mjs` fails the build if
they drift:

| File | Why drift would be a bug |
|---|---|
| `data/assetCdn.ts` | Different URLs mean a device re-downloads a photo it already has, defeating the CDN. |
| `data/bodyMapStyle.ts` | Every colour in the muscle heat map. Drift means "worked" looks like one thing on the phone and another on the web. |
| `data/bodyMuscles.ts` | The traced SVG geometry. Generated — see below. |
| `data/exerciseMuscles.ts` | Which muscles each exercise trains. |
| `lib/stats.ts` | PR / estimated-1RM / volume maths. Drift means the same history yields different numbers per surface. |

Copy the correct version across both apps; never hand-edit one side to match the other.

## The body map

The front/back muscle figures are not a picture — they are traced vector geometry with each
muscle as an addressable region.

`apps/web/scripts/trace/` vectorises the reference artwork: its dark separator ink forms a
closed network, so connected-component labelling recovers the segmentation the illustrator
drew, and potrace turns each region into béziers.
`apps/web/scripts/gen-body-muscles.mjs` then validates that geometry and writes
`data/bodyMuscles.ts` into **both** apps.

Geometry only — no fill or stroke is ever emitted. All colour comes from `bodyMapStyle.ts` at
render time, which is why one palette file can drive an SVG on the web and a
`react-native-svg` tree on the phone.

One platform quirk worth knowing: `react-native-svg` drops the alpha channel from `rgba()`
strings, so colours are split into `fill` + `fillOpacity` rather than passed as one value.

`apps/web/scripts/verify-paint.mts` guards the palette — it re-derives every documented
contrast figure from the actual values, so the comments can't quietly go stale.

## Data

Supabase Postgres with owner-only row-level security —
Grindz owns the `workout_*` tables and reuses `body_metrics` for bodyweight.

```
workout_sessions      one row per finished workout
workout_sets          every set: weight, reps, rpe, duration_s, distance_m
workout_plan          the weekly plan grid
workout_templates     saved session templates
workout_custom_exercises
workout_favorites
body_metrics          bodyweight / body-fat
```

An in-progress session is mirrored to local storage (`localStorage` on web,
`AsyncStorage` on native) so a crash or a force-kill never loses a workout — it is written
on every set change and cleared on save.

The exercise catalog itself is **static source**, not a database table: `data/catalog.ts`.

## Optional AI

Custom-exercise validation goes to Groq (`llama-3.3-70b-versatile`) using **the user's own
API key**, stored on their Supabase profile row so a key entered in either app works in both.
It is strictly advisory — the user can always save what they typed. With no key, the feature
is simply unavailable and nothing else changes.

## Keyboard handling

Both surfaces had the same bug — the keyboard covering the weight/reps inputs on the last
exercise of a session — and each needed a stack-specific fix:

- **Native:** Expo SDK 55+ mandates edge-to-edge, which makes `adjustResize` behave like
  `adjustNothing` and breaks `KeyboardAvoidingView`. Fixed with
  `react-native-keyboard-controller`: `KeyboardProvider` at the true root, and
  `KeyboardAwareScrollView` on the scrolling screens.
- **Web:** `apps/web/src/lib/keyboard.ts` listens to `visualViewport` **resize** (not
  `focusin`) and scrolls the focused field into view.

Both go further than uncovering the field — they scroll it into view.

> Not yet confirmed on physical hardware, and there is a known open bug in
> `react-native-keyboard-controller` affecting RN 0.86 + new architecture, which is this app's
> configuration.
