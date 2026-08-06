/**
 * Paint for the anatomy map. Kept byte-identical between the web app and
 * grindz-native so both surfaces render the same thing from the same numbers.
 *
 * The path data in ./bodyMuscles carries geometry only; every colour the map wears comes
 * from here, and the trained tiers are built from the theme's cyan tokens. The `solid` variant
 * is those same tiers pre-composited to opaque, and `flat` is the reference artwork's own
 * palette — so those two are literals by necessity, not by shortcut. `npm run verify:paint`
 * recomputes the derived values and fails if they stop agreeing with the tokens.
 *
 * The trained tiers wear a two-stop gradient running top-left -> bottom-right; `rest` is
 * flat. The gradient is the intended look, taken verbatim from the reference design — a
 * fully flat treatment was built and rejected as lifeless. The known cost is that an
 * objectBoundingBox ramp lands differently on a small island (deltoid) than on a large one
 * (lat), so two muscles at the same intensity are not pixel-identical; the tiers are
 * separated by enough tone that this reads as shading rather than as a difference in state.
 *
 * There is deliberately no backdrop blur either. CSS `backdrop-filter` does not apply
 * to SVG shapes, and react-native-svg has no equivalent, so the glass is faux — built
 * from translucent fills alone. At the size this map actually renders (~64dp per
 * figure) the effect has to come from tone; a blur radius that small is invisible.
 */
import { C, alpha } from '../theme'

/**
 * 'glass' — the default: smoked-glass separators, frosted islands.
 * 'solid' — opaque equivalent, used when the OS asks for reduced transparency.
 * 'flat'  — the reference artwork's own palette. This is what the parity test renders;
 *           keeping it here is what makes "did the restyle move the artwork?" testable.
 */
export type BodyMapVariant = 'glass' | 'solid' | 'flat'

/**
 * Gradient stops, running top-left -> bottom-right (CSS `135deg`, SVG 0,0 -> 1,1).
 * A tier whose fill is a plain string is painted flat instead.
 */
export type Stops = readonly [string, string]

export interface IslandPaint {
  /** a flat colour, or a two-stop gradient running top-left -> bottom-right */
  fill: string | Stops
  /** rim light along the island edge, or null for none */
  rim: string | null
  rimWidth: number
}

/** Narrowing helper so both renderers branch the same way. */
export function isGradient(fill: string | Stops): fill is Stops {
  return Array.isArray(fill)
}

export interface BodyMapPaint {
  /**
   * Layer 2 — the dark glass the muscles sit on, and what shows through the gaps.
   *
   * `opacity` is applied to the whole silhouette GROUP, not per path. The head, hands
   * and feet are separate traced paths lying inside the body path, and their outlines
   * differ from it by sub-pixel amounts (potrace approximated each independently), so
   * all of them have to be drawn to cover the figure exactly. Filling them one by one
   * at a translucent alpha would double up where they overlap the body and make the
   * extremities darker than the separators; compositing the group once does not.
   */
  body: { color: string; opacity: number; rim: string | null; rimWidth: number }
  /** layer 3 — a muscle that has not been trained */
  rest: IslandPaint
  /** layer 4 — trained */
  secondary: IslandPaint
  primary: IslandPaint
}

export const BODY_MAP_PAINT: Record<BodyMapVariant, BodyMapPaint> = {
  glass: {
    /*
     * Smoked glass: the card beneath shows through, and the outer edge catches light.
     *
     * Measured off the colour scheme the map is tuned against:
     *   card 16/255 | body silhouette ~29 | trained peak rgb(0,198,255)
     *
     * The separators are *lighter* than the muscles, not darker, so the body silhouette
     * is painted as a pale wash rather than as smoked glass. The resting state is
     * deliberately almost invisible — the card reads as one dark surface until a muscle
     * is worked, and then only that muscle carries any light.
     */
    body: { color: '#ffffff', opacity: 0.055, rim: 'rgba(255,255,255,0.07)', rimWidth: 0.5 },
    /*
     * A single-hue sequential scale: the same cyan->blue ramp at full strength for worked and
     * at a bare wash for assisting, over an almost-black resting tier. Measured as L* of each
     * tier's BRIGHT stop composited over the real card surface (white 0.045 over the #050505
     * page = rgb 16,16,16, giving a body silhouette of rgb 29,29,29):
     *   rest 13  ->  secondary 22  ->  primary 75
     * Monotonic, and the enormous gap is deliberate — worked muscles are the message, assisting
     * is a hint.
     */
    rest: {
      // The one flat tier. A ramp here was actively wrong: on a week with nothing logged the
      // WHOLE figure is `rest`, so the per-island sheen landed differently on a deltoid than
      // on a lat and implied a difference in training state where there was none. The trained
      // tiers can carry a ramp because they are read against each other, not against 40 copies
      // of themselves. 0.015 is the midpoint of the 0.019/0.010 ramp it replaces, so the
      // resting figure keeps exactly the tone it had.
      fill: 'rgba(255,255,255,0.015)',
      rim: null,
      rimWidth: 0.4,
    },
    secondary: {
      // Very faint, by explicit design direction. Everything brighter than this competed with
      // the worked tier on a real device: rgba(0,150,210,0.62) put worked:assisting at 1.79:1,
      // and a flat 0.34 with a 4.10:1 edge light still read as loud. This is a bare wash of the
      // same gradient the primary tier wears, so it says "the same thing, much less of it" —
      // L* 22 -> 15, against a resting island at L* 13.
      //
      // No rim. The edge light an earlier pass added to clear the WCAG 1.4.11 boundary minimum
      // is precisely what made assisting muscles shout, so it is gone at the user's direction.
      // That is a deliberate trade, recorded here rather than hidden: assisting now sits about
      // 1.3:1 against resting, so it is a PERIPHERAL cue and not the carrier of the message.
      // Everything it conveys is available without seeing it — every island exposes its muscle
      // name, tapping one opens its detail, and the hard-sets list below the figure states the
      // same data numerically.
      fill: [alpha(C.cyan, 0.16), alpha(C.cyanDeep, 0.11)],
      rim: null,
      rimWidth: 0,
    },
    primary: {
      // The reference gradient, verbatim: `--grad-primary` from the original stylesheet,
      // `linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)` — the same pair tailwind carries
      // as backgroundImage.cyan. 135deg means top-left -> bottom-right, which is why the
      // renderers paint these stops along 0,0 -> 1,1.
      //
      // Opaque on purpose. An earlier version ended at 0.72 alpha, which let the dark body
      // bleed through and turned the deep end muddy; the reference does not do that. Flat
      // fills were also tried and rejected — the ramp IS the intended look here.
      //
      // These numbers are reproducible — scripts/verify-paint.mts recomputes every tier
      // and asserts the legend matches the figure, so a comment cannot drift silently.
      fill: [C.cyan, C.cyanDeep],
      rim: null,
      rimWidth: 0,
    },
  },

  /*
   * Opaque throughout, for when the OS asks for reduced transparency.
   *
   * This is the `glass` variant PRE-COMPOSITED: each colour is the corresponding glass
   * layer already blended down over the card (white 0.045 over #050505 = #101010), so the
   * two variants render identically and a viewer who turns reduced transparency on sees
   * the same picture rather than a second design.
   *
   * An earlier pass built these by compositing the glass tiers over a separately-chosen
   * body colour (#14141b) instead. That is not the same thing — the glass body is itself
   * lifted by the card, so the tiers landed several L* darker than their glass twins and
   * `rest` drifted the furthest, which is what pushed the reduced-transparency variant to
   * the worst tier separation of the two. Compositing the finished stack removes the whole
   * class of error. Recompute all of these together, from the glass values, if any glass
   * layer or the card surface moves — `npm run verify:paint` fails if they disagree.
   */
  solid: {
    body: { color: '#1d1d1d', opacity: 1, rim: '#2d2d2d', rimWidth: 0.5 },
    // rim stays null exactly as it is on glass.rest: matching glass means matching its
    // separation too, and glass carries the resting boundary on tone alone.
    rest: { fill: '#212121', rim: null, rimWidth: 0.4 },
    secondary: { fill: ['#193841', '#1a2736'], rim: null, rimWidth: 0 },
    // already opaque in glass, so it needs no pre-compositing — the same two stops
    primary: { fill: [C.cyan, C.cyanDeep], rim: null, rimWidth: 0 },
  },

  // The reference artwork's own palette. Do not restyle this one — the round-2 parity
  // measurement renders it and compares against the source PNG.
  flat: {
    body: { color: '#333333', opacity: 1, rim: null, rimWidth: 0 },
    rest: { fill: '#9E9E9E', rim: null, rimWidth: 0 },
    secondary: { fill: '#FE6D6C', rim: null, rimWidth: 0 },
    primary: { fill: '#F14A3F', rim: null, rimWidth: 0 },
  },
}

/** The intensity tiers, weakest first. Exists to derive `IslandLayer` from one list. */
export const ISLAND_LAYERS = ['rest', 'secondary', 'primary'] as const
export type IslandLayer = (typeof ISLAND_LAYERS)[number]

/**
 * `#rgb`, `#rrggbb`, `#rrggbbaa` and `rgb()/rgba()` -> [r, g, b, a], or null if the string
 * is not one of those.
 *
 * Returns null rather than throwing: the only caller is a legend swatch, and it runs during
 * render. A malformed colour should cost a slightly-wrong swatch, not a crashed Progress
 * tab. Loud detection belongs in scripts/verify-paint.mts, which parses every value in this
 * file and fails the check — that is the right place to catch a bad constant, not the UI.
 */
export function parseColor(c: string): [number, number, number, number] | null {
  const s = c.trim()
  const m = /^rgba?\(([^)]+)\)$/.exec(s)
  if (m) {
    const p = m[1].split(',').map((x) => Number(x.trim()))
    if (p.length < 3 || p.slice(0, 3).some((n) => !Number.isFinite(n))) return null
    return [p[0], p[1], p[2], p.length > 3 && Number.isFinite(p[3]) ? p[3] : 1]
  }
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return null
  const h = s.slice(1)
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h
  const n = parseInt(full.slice(0, 6), 16)
  const a = full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a]
}

/**
 * The colour a legend swatch has to paint to actually match the figure.
 *
 * A muscle island is not drawn on the card — it is drawn on the body silhouette, which
 * is itself translucent over the card. A swatch painting the raw tier fill is therefore
 * a different colour from the muscle it claims to label, and the legend quietly lies.
 * This folds the body layer and the tier layer into one `rgba()` using source-over, so
 * the swatch composites over the card exactly the way the island does — no card colour
 * is baked in, which is what lets the same function serve both platforms.
 *
  * Deriving both legends from this is also what stops the tier alphas from drifting: the
 * numbers live here only, and a legend cannot fall out of step with a paint it reads.
 */
/**
 * The border colour a legend swatch needs, or null when that tier has no rim.
 *
 * The assisting tier carries its contrast on its edge rather than its fill, so a swatch
 * that painted only the fill would understate it and drift from the figure again — the
 * exact failure `legendStops` exists to prevent. Composited the same way, over the body.
 */
export function legendRim(variant: BodyMapVariant, layer: IslandLayer): string | null {
  const paint = BODY_MAP_PAINT[variant]
  const rim = paint[layer].rim
  if (!rim || paint[layer].rimWidth <= 0) return null
  const body = parseColor(paint.body.color)
  const tier = parseColor(rim)
  if (!body || !tier) return rim
  const [br, bg, bb] = body
  const [tr, tg, tb, ta] = tier
  const ba = paint.body.opacity
  const a = ba + ta * (1 - ba)
  if (a === 0) return null
  const mix = (b: number, t: number) => Math.round((b * ba * (1 - ta) + t * ta) / a)
  return `rgba(${mix(br, tr)}, ${mix(bg, tg)}, ${mix(bb, tb)}, ${Number(a.toFixed(4))})`
}

/**
 * Both ends of a legend swatch, composited. A flat tier returns the same colour twice, so a
 * caller can always paint a gradient and get the right answer either way.
 */
export function legendStops(variant: BodyMapVariant, layer: IslandLayer): [string, string] {
  const paint = BODY_MAP_PAINT[variant]
  const fill = paint[layer].fill
  const ends: readonly [string, string] = isGradient(fill) ? fill : [fill, fill]
  const body = parseColor(paint.body.color)
  const ba = paint.body.opacity

  const one = (c: string): string => {
    const tier = parseColor(c)
    // degrade to the raw stop rather than failing a render; verify-paint.mts is the gate
    if (!body || !tier) return c
    const [br, bg, bb] = body
    const [tr, tg, tb, ta] = tier
    const a = ba + ta * (1 - ba)
    if (a === 0) return 'rgba(0, 0, 0, 0)'
    const mix = (b: number, t: number) => Math.round((b * ba * (1 - ta) + t * ta) / a)
    return `rgba(${mix(br, tr)}, ${mix(bg, tg)}, ${mix(bb, tb)}, ${Number(a.toFixed(4))})`
  }
  return [one(ends[0]), one(ends[1])]
}
