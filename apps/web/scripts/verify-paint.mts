/**
 * Body-map paint verifier.  Run: `npm run verify:paint`
 *
 * The numbers written into ../src/data/bodyMapStyle.ts comments used to drift from the
 * fills they described, and a code review found a block documenting a tier that had been
 * retuned twice since. This recomputes them from the actual exported paint so a stale
 * comment shows up as a failing check rather than as a misleading note.
 *
 * It asserts:
 *   1. every colour in the module parses — `legendStops` degrades quietly on a bad value
 *      rather than crashing a render, so this is where a typo'd constant is caught loudly
 *   2. every legend swatch and border composites to the same colour as the island it labels,
 *      in every variant — the legend cannot silently describe a palette the figure is not using
 *   3. the tiers stay ordered rest < secondary < primary by luminance
 *   4. a tier under 3:1 against resting is REPORTED, and if it carries a rim that rim really
 *      clears 3:1 at >=1px. Assisting is deliberately under the bar (see bodyMapStyle), so this
 *      prints the trade every run rather than failing on it
 *   5. the `solid` variant agrees with `glass` on tone, since it is glass pre-composited
 *   6. the `flat` reference palette is untouched, because the parity measurement renders it
 */
import { BODY_MAP_PAINT, ISLAND_LAYERS, isGradient, legendRim, legendStops, parseColor, type BodyMapVariant } from '../src/data/bodyMapStyle'

const srgb = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
const Y = (x: number[]) => 0.2126 * srgb(x[0]) + 0.7152 * srgb(x[1]) + 0.0722 * srgb(x[2])
const Lstar = (y: number) => (y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y)
const ratio = (a: number[], b: number[]) => { const [x, y] = [Y(a), Y(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const over = (fg: number[], a: number, bg: number[]) => fg.map((c, i) => c * a + bg[i] * (1 - a))

/* The surface the map is actually drawn on: the .card wash over the page background. */
const CARD = over([255, 255, 255], 0.045, [5, 5, 5])

const fails: string[] = []

/*
 * Gate every colour in the module through the same parser the app uses. `legendStops`
 * deliberately degrades instead of throwing when a value is malformed, so without this
 * check a typo'd constant would ship as a quietly-wrong swatch. This is where it gets
 * caught loudly.
 */
function parse(c: string): [number, number, number, number] {
  const p = parseColor(c)
  if (!p) {
    fails.push(`unparseable colour ${JSON.stringify(c)}`)
    return [0, 0, 0, 1]
  }
  return p
}

for (const v of Object.keys(BODY_MAP_PAINT) as BodyMapVariant[]) {
  const p = BODY_MAP_PAINT[v]
  parse(p.body.color)
  if (p.body.rim) parse(p.body.rim)
  for (const k of ISLAND_LAYERS) {
    const f = p[k].fill
    if (isGradient(f)) { parse(f[0]); parse(f[1]) } else { parse(f) }
    if (p[k].rim) parse(p[k].rim!)
  }
}
const tone: Record<string, Record<string, number[]>> = {}

for (const v of ['glass', 'solid'] as BodyMapVariant[]) {
  const p = BODY_MAP_PAINT[v]
  const body = over(parse(p.body.color).slice(0, 3), p.body.opacity, CARD)
  console.log(`\n--- ${v} --- body rgb(${body.map(Math.round).join(',')}) L*=${Lstar(Y(body)).toFixed(1)}`)
  tone[v] = {}
  const lum: Record<string, number> = {}

  for (const k of ISLAND_LAYERS) {
    const f = p[k].fill
    /* a flat tier is just a gradient whose ends coincide, so both are checked the same way */
    const ends = isGradient(f) ? [f[0], f[1]] : [f, f]
    const legend = legendStops(v, k)
    const painted = ends.map((c) => { const [r, g, b, a] = parse(c); return over([r, g, b], a, body) })
    let worst = 0
    for (let i = 0; i < 2; i++) {
      const lg = parse(legend[i])
      const onCard = over(lg.slice(0, 3), lg[3], CARD)
      worst = Math.max(worst, ...painted[i].map((c, j) => Math.abs(c - onCard[j])))
    }
    /* the bright stop is what the eye reads the tier as, so rank tiers by it */
    lum[k] = Y(painted[0])
    tone[v][k] = painted[0]
    if (worst > 1) fails.push(`${v}.${k}: legend off the figure by ${worst.toFixed(2)}/255`)
    const shape = isGradient(f) ? `L* ${Lstar(Y(painted[0])).toFixed(1)} -> ${Lstar(Y(painted[1])).toFixed(1)}` : `L* ${Lstar(Y(painted[0])).toFixed(1)} flat`
    console.log(`  ${k.padEnd(9)} ${shape.padEnd(24)} legend ${worst <= 1 ? 'match' : 'MISMATCH'}`)
  }

  if (!(lum.rest < lum.secondary && lum.secondary < lum.primary)) fails.push(`${v}: tiers not monotonic`)
  console.log(`  worked:assisting  ${ratio(tone[v].primary, tone[v].secondary).toFixed(2)}:1`)
  console.log(`  assisting:resting ${ratio(tone[v].secondary, tone[v].rest).toFixed(2)}:1  (fill only)`)

  /*
   * WCAG 1.4.11 boundary contrast.
   *
   * A tier under the 3:1 boundary minimum is surfaced here every run. Where a tier DOES carry
   * a rim to clear that bar, the rim is load-bearing for accessibility, so it is measured
   * rather than trusted to a comment.
   */
  for (const k of ISLAND_LAYERS) {
    const rimColor = p[k].rim
    const fillRatio = ratio(tone[v][k], tone[v].rest)
    if (k === 'rest' || fillRatio >= 3) continue
    if (!rimColor || p[k].rimWidth <= 0) {
      /*
       * Not a failure. The assisting tier is deliberately below the WCAG 1.4.11 boundary
       * minimum at the user's explicit direction — it must read as a very faint hint, and
       * both a brighter fill and a 4.10:1 edge light were tried and rejected as too loud.
       * It is logged every run so the trade stays visible rather than becoming folklore.
       */
      console.log(`  ${k} — ${fillRatio.toFixed(2)}:1 vs resting, no rim: BELOW the 3:1 WCAG 1.4.11 boundary, by design`)
      continue
    }
    const [rr, rg, rb, ra] = parse(rimColor)
    const rim = over([rr, rg, rb], ra, body)
    const vsRest = ratio(rim, tone[v].rest)
    const vsBody = ratio(rim, body)
    const legend = parse(legendRim(v, k) ?? rimColor)
    const legendOnCard = over(legend.slice(0, 3), legend[3], CARD)
    const legendDelta = Math.max(...rim.map((c, i) => Math.abs(c - legendOnCard[i])))
    if (vsRest < 3) fails.push(`${v}.${k} rim only ${vsRest.toFixed(2)}:1 vs resting (needs 3:1)`)
    if (vsBody < 3) fails.push(`${v}.${k} rim only ${vsBody.toFixed(2)}:1 vs body separators (needs 3:1)`)
    if (p[k].rimWidth * (175 / 129) < 1) fails.push(`${v}.${k} rim is ${(p[k].rimWidth * (175 / 129)).toFixed(2)}px — sub-pixel, invisible`)
    if (legendDelta > 1) fails.push(`${v}.${k}: legend rim off the figure rim by ${legendDelta.toFixed(2)}/255`)
    console.log(
      `  ${k} rim         ${vsRest.toFixed(2)}:1 vs rest, ${vsBody.toFixed(2)}:1 vs body, ` +
      `${(p[k].rimWidth * (175 / 129)).toFixed(2)}px, legend ${legendDelta <= 1 ? 'match' : 'MISMATCH'}`,
    )
  }
}

/*
 * solid is glass pre-composited, so the two must land on the same colour — not merely a
 * similar one. The tolerance is 0.5 L*, which is roughly the rounding error of storing a
 * composite as an 8-bit hex; anything larger means the values were derived from the wrong
 * base, which is the mistake this check exists to catch.
 */
for (const k of ISLAND_LAYERS) {
  const d = Math.abs(Lstar(Y(tone.glass[k])) - Lstar(Y(tone.solid[k])))
  if (d > 0.5) fails.push(`solid.${k} is ${d.toFixed(2)} L* off glass.${k} — recompute from the glass value`)
}

const EXPECTED_FLAT: Record<string, string> = { body: '#333333', rest: '#9E9E9E', secondary: '#FE6D6C', primary: '#F14A3F' }
const f = BODY_MAP_PAINT.flat
const actualFlat: Record<string, string> = { body: f.body.color, rest: f.rest.fill, secondary: f.secondary.fill, primary: f.primary.fill }
for (const k of Object.keys(EXPECTED_FLAT)) {
  if (actualFlat[k].toLowerCase() !== EXPECTED_FLAT[k].toLowerCase()) {
    fails.push(`flat.${k} changed: ${actualFlat[k]} (parity measurement renders this palette)`)
  }
}

/* the same bad constant surfaces through several checks — report each problem once */
const distinct = [...new Set(fails)]
if (distinct.length) {
  console.error(`\n${distinct.length} check(s) FAILED:`)
  for (const m of distinct) console.error(`  - ${m}`)
  process.exit(1)
}
console.log('\nflat reference palette intact')
console.log('ALL CHECKS PASSED')
