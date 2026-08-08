<div align="center">

<img src="docs/logo.png" width="112" alt="Grindz" />

# Grindz

**Log lifts. Chase PRs. See exactly what you've trained.**

A training tracker built twice — as a React Native Android app and as an installable web app —
sharing one Supabase backend, one muscle-map palette, and one image CDN.

<br/>

[![Download APK](https://img.shields.io/badge/Download-Grindz%20v1.3.0%20APK-00c6ff?style=for-the-badge&logo=android&logoColor=white)](../../releases/latest)
[![Install guide](https://img.shields.io/badge/How%20to%20install-555?style=for-the-badge)](docs/INSTALL.md)
[![Open in browser](https://img.shields.io/badge/Open%20in%20browser-0072ff?style=for-the-badge)](https://app.grindz.dev)

![Android 7.0+](https://img.shields.io/badge/Android-7.0%2B-3ddc84?logo=android&logoColor=white)
![APK 52.7 MB](https://img.shields.io/badge/APK-52.7%20MB-informational)
![React Native 0.86](https://img.shields.io/badge/React%20Native-0.86-61dafb?logo=react&logoColor=white)
![React 18 + Vite](https://img.shields.io/badge/Web-React%2018%20%2B%20Vite-646cff?logo=vite&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20OAuth-3ecf8e?logo=supabase&logoColor=white)

</div>

---

<div align="center">

<img src="docs/screenshots/phone/home.png" width="30%" alt="Home" />
<img src="docs/screenshots/phone/progress.png" width="30%" alt="Muscle heat map" />
<img src="docs/screenshots/phone/session.png" width="30%" alt="Live workout" />

<sub><b>Train</b> · pick a muscle group &nbsp;&nbsp;|&nbsp;&nbsp; <b>Progress</b> · what you actually hit this week &nbsp;&nbsp;|&nbsp;&nbsp; <b>Session</b> · log sets, RPE and rest</sub>

</div>

---

## What it does

**A muscle heat map that means something.** Not decoration: the front and back figures are
traced vector geometry with each muscle individually addressable, shaded by what you've
actually trained this week. Bright for worked, a deliberately faint wash for assisting, flat
for untouched.

**Live workout logging.** Sets as kg × reps, ticked off as you go, with RPE captured on the set
you just finished — so you rate it while it's still honest. Timed holds, supersets, per-set
notes and warm-up flags are all handled.

**One session, however many muscle groups.** A day planned as chest and triceps is one trip to
the gym, not two workouts. Every set still carries the muscle it actually trained, so the heat
map and the per-group counts stay exact no matter how far the session wanders off the plan.

**Progression memory.** Every exercise shows what you did *last time* and your best, right
where you're about to type. PRs — both top set and estimated 1RM — are detected as they happen.

**Planning and review.** Drag a split onto any day, up to three blocks. Plus a 16-week training
heatmap, a streak counter, per-exercise progression charts and bodyweight trend.

**An auto rest timer** that starts on each completed set, with +15s, skip and a vibration when
it's up — plus a wake lock so the screen doesn't die mid-set.

**Optional AI assist.** Adding a custom exercise? Groq files it under the right muscle group and
writes a form cue, using *your own* API key. Advisory only — you can always just save what you
typed.

---

## On a tablet, and in the browser

Neither layout is a stretched phone. At Material 3's `expanded` breakpoint the bottom tab bar
becomes a side rail and card grids widen to three or four columns. The web app is rebuilt
around what a browser actually has: a cursor, a keyboard and a viewport wider than it is tall.
`⌘K` opens a command palette that reaches every section, muscle group and exercise.

<div align="center">
<img src="docs/screenshots/tablet/progress.png" width="88%" alt="The muscle map on a tablet" />
</div>

The landing page and the app are **separate deployments** — `grindz.dev` from `apps/landing`
and `app.grindz.dev` from `apps/web` — so a first-time visitor downloads 70 KB rather than the
whole app. See **[docs/DOMAINS.md](docs/DOMAINS.md)**.

---

## Getting it on your phone

Grab the APK from the **[latest release](../../releases/latest)** and install it. Android will
ask you to allow installs from your browser the first time, and Play Protect will warn you
because the app didn't come from the Play Store — tap **Install without scanning** and carry on.

→ **[Step-by-step install guide](docs/INSTALL.md)**, including updating and `adb install`.

Prefer nothing to install? The web app is the same product — open
**[app.grindz.dev](https://app.grindz.dev)** and add it to your home screen.

**Yes, the APK is on GitHub** — attached to a *Release*, not committed into the repo. A 52 MB
binary in git history is a tax every clone pays forever.

---

## How it's built

```
grindz/
├── apps/
│   ├── landing/       The pitch → grindz.dev. No auth, no router, 70 KB gzip
│   ├── web/           React 18 + Vite + Tailwind, installable PWA → app.grindz.dev
│   └── mobile/        React Native 0.86 · Expo SDK 57  ← ships the APK
├── cdn/               Cloudflare image delivery — the 42 exercise photos
├── docs/              Install, build, architecture, domains, screenshots
├── supabase/          migrations/0001_init.sql — the whole schema
└── scripts/           check-parity · check-cdn · check-domains
```

Two stacks, deliberately **not** a shared component library — a Tailwind `<div>` and a React
Native `<View>` don't usefully unify. What *is* shared is everything where disagreement would
be a bug: the CDN contract, the heat-map palette, the traced muscle geometry and the PR maths.
Five files, byte-identical, enforced by `node scripts/check-parity.mjs`.

Exercise photos come from a **Cloudflare Worker** rather than being bundled, so a device
downloads any given photo at most once in its lifetime instead of paying for all 33 MB on every
update. → **[docs/IMAGES.md](docs/IMAGES.md)**

---

## Running it

```bash
# web
cd apps/web && npm install && npm run dev

# with demo data, no Google sign-in needed
VITE_DEV_BYPASS_AUTH=1 VITE_DEV_SEED=1 npm run dev

# android
cd apps/mobile && npm install && npm run android
```

Both apps need a `.env` pointing at a Supabase project. Neither `.env` nor any signing keystore
is in this repo.

→ **[Build guide](docs/BUILD.md)** · **[Architecture](docs/ARCHITECTURE.md)** ·
**[Domains](docs/DOMAINS.md)** · **[Supabase setup](docs/SUPABASE-SETUP.md)** ·
**[Images & CDN](docs/IMAGES.md)**

---

<div align="center">
<sub>Built for one lifter who wanted the log to be honest about what he'd actually trained.</sub>
</div>
