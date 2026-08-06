# Grindz — web

React 18 + TypeScript + Vite + Tailwind, as an installable PWA. Same product and same Supabase
backend as [the React Native app](../mobile), rebuilt from the static vanilla-JS page still
preserved in [`legacy/`](../../legacy).

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # -> dist/
npm run preview
npm run typecheck
npm run verify:paint # re-derives the body-map palette figures from the actual values
```

Needs a `.env` (not committed):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

For Google sign-in, add your origin under **Authentication → URL Configuration → Redirect
URLs** in the Supabase dashboard.

### Demo mode

Skips OAuth and swaps Supabase for a localStorage mock seeded with a realistic 6-week block, so
History, Progress, PRs and the heat map all have something to draw:

```bash
VITE_DEV_BYPASS_AUTH=1 VITE_DEV_SEED=1 npm run dev
```

Double-gated on `import.meta.env.DEV` **and** the env var, so it cannot reach a production
bundle — the dead branch is tree-shaken out by `vite build`.

## Notable pieces

- `src/data/bodyMapStyle.ts` — every colour in the muscle heat map. **Byte-identical** with the
  mobile app; see `scripts/check-parity.mjs` at the repo root.
- `src/data/assetCdn.ts` — the Cloudflare image contract. Also byte-identical.
- `src/lib/db-local.ts` / `db-seed.ts` — the demo-mode data layer.
- `src/lib/keyboard.ts` — scrolls the focused input into view on `visualViewport` **resize**
  (not `focusin`), which is what actually fires when the on-screen keyboard opens.
- `scripts/trace/` — vectorises the reference artwork into the traced muscle geometry.
- `scripts/screenshots.mts` — Playwright capture at device viewports (the README ships emulator
  captures instead; this exists for quick visual diffs).

## PWA

`vite-plugin-pwa` precaches the **shell only**. Exercise photos come from the Cloudflare CDN and
are cached on demand by a `CacheFirst` rule matched on **origin** — see [`cdn/`](../../cdn).
That's what keeps the install small and stops updates re-downloading the photo library.

## Mobile

There is no native shell here. The Android app is the React Native / Expo project in
[`apps/mobile`](../mobile) — see [docs/BUILD.md](../../docs/BUILD.md).
