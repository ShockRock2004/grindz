# Design audit — web app

Run against the built web app with the UI/UX rule database, then checked by measurement
rather than by eye. This records what was found, what was changed, and — as importantly —
what was recommended and deliberately **not** adopted.

Reproduce the checks:

```bash
cd apps/web
npm run verify:a11y -- --base=http://localhost:4174   # focus, names, responsive
npm run verify:web  -- --base=http://localhost:4174 --mode=app
```

---

## Recommendations not adopted, and why

The generated design system classified this correctly as a **Data-Dense Dashboard** — that
part matched and was kept. It also proposed a blue/amber palette (`#1E40AF` / `#D97706`) on a
light background with Fira Code / Fira Sans.

That was rejected. Grindz already has an established identity — cyan `#00c6ff` on near-black
`#050505`, Poppins / Inter — and, more decisively, the palette is not the web app's to change:
`src/theme.ts` and `src/data/bodyMapStyle.ts` are **byte-identical with the mobile app** and
enforced by `scripts/check-parity.mjs`. Swapping the web palette would either break that
invariant or force a redesign of the Android app's muscle heat map.

What was taken from the recommendation instead: the style classification, the effects list
(row hover, smooth filter transitions, loading feedback), and the pre-delivery checklist.

---

## Measured before changing anything

Contrast ratios computed from the actual token values against `#050505`:

| Pair | Ratio | Verdict |
|---|---|---|
| `text-ink2` `#e7e9ee` | 16.78:1 | pass |
| `cyan` `#00c6ff` | 10.21:1 | pass |
| `text-muted2` `#a7a7b0` | 8.54:1 | pass |
| `cyan-ink` on cyan button | 8.22:1 | pass |
| `text-muted` `#8b8b94` | 6.04:1 | pass |
| `text-muted/70` | 3.42:1 | **fails 4.5:1 for body text** |
| `text-muted/60` | 2.75:1 | **fails 4.5:1, and 3:1 for icons** |
| `text-muted/35` | 1.64:1 | exempt — disabled controls only |

So the core palette was already sound; only the alpha-reduced variants failed.

---

## Fixed

**Focus indicators — 8 of 74 interactive elements had any.** Tabbing through the app was
very nearly invisible. Fixed once in `src/index.css` rather than at 66 call sites:

```css
:where(a, button, input, select, textarea, summary, [tabindex]:not([tabindex='-1'])):focus-visible {
  outline: 2px solid #00c6ff;
  outline-offset: 2px;
}
```

`:focus-visible` so a mouse click never paints a ring; `:where()` contributes zero
specificity so components with their own focus treatment still win. Verified: **10/10 tab
stops now report a visible indicator**.

**Accessible names.** The stepper `+`/`−` controls and the planner's remove-from-day button
were icon-only with no label. Now labelled; a scripted sweep of five routes finds no
remaining unnamed button or link.

**Contrast.** Body text at `text-muted/70` and meaningful icons at `/60` raised to full
`text-muted` (6.04:1). Left alone deliberately: `/35` on disabled pagination (WCAG exempts
disabled controls) and `/60` on a `·` separator (decorative).

**Emoji as an icon.** The empty PR board used a 🏆 character. Replaced with the `IconTrophy`
SVG already imported in that file.

---

## Verified, not assumed

- **`cursor-pointer`** — the checklist flags this, but Tailwind's preflight already emits
  `button,[role=button]{cursor:pointer}`. Confirmed in the built CSS; no change needed.
- **`prefers-reduced-motion`** — already honoured in `index.css`.
- **Responsive at 375 / 768 / 1024 / 1440** — `document.scrollWidth` equals the viewport at
  every one, so there is no horizontal overflow.

## Not addressed

Light mode. The app is dark-only by design (`color-scheme: dark`), and the checklist's light
mode contrast row does not apply. Adding a light theme would mean re-deriving
`bodyMapStyle.ts` for both platforms — a real piece of work, not a polish pass.
