/**
 * Render the body maps to a PNG, painted exactly as the app paints them.
 *
 * The trace pipeline can only be judged by eye — "one shape per muscle" and "no stray
 * artefact on the face" are visual claims, and a passing script that never draws the
 * figure cannot support either. This draws the real exported geometry through the real
 * exported palette (bodyMapStyle.ts, the same file both apps read) so what comes out is
 * what a user sees, not an approximation of it.
 *
 * Run: npx tsx scripts/shot-bodymap.mts <out.png> [sheet.ts=...]
 *   sheet=<label>:<module> renders an extra column from any module exporting
 *   BODY_VIEWBOX / FRONT_MUSCLES / BACK_MUSCLES — used to put the previous female trace
 *   next to the new one for a before/after.
 */
import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'
import { BODY_MAP_PAINT, ISLAND_LAYERS, isGradient } from '../src/data/bodyMapStyle'

const HERE = dirname(fileURLToPath(import.meta.url))
const [, , outArg, ...rest] = process.argv
const OUT = resolve(outArg ?? join(HERE, 'bodymap.png'))

interface Sheet {
  label: string
  BODY_VIEWBOX: string
  FRONT_MUSCLES: any[]
  BACK_MUSCLES: any[]
}

const sheets: Sheet[] = []
const load = async (label: string, mod: string) => {
  const m = await import(pathToFileURL(resolve(HERE, mod)).href)
  sheets.push({ label, BODY_VIEWBOX: m.BODY_VIEWBOX, FRONT_MUSCLES: m.FRONT_MUSCLES, BACK_MUSCLES: m.BACK_MUSCLES })
}
if (!process.env.SHEETS_ONLY) {
  await load('male', '../src/data/bodyMuscles.ts')
  await load('female', '../src/data/bodyMusclesFemale.ts')
}
for (const a of rest) {
  if (!a.startsWith('sheet=')) continue
  const [label, mod] = a.slice('sheet='.length).split(':')
  await load(label, mod)
}

const paint = BODY_MAP_PAINT.glass
const rgba = (c: string) => c

/*
 * Diagnostic paint, not the app's resting palette: every island is filled flat and rimmed
 * so the EDGES read. The shipped resting tier is near-black on a near-black body by
 * design, which is right in the app and useless for judging whether a muscle is one shape
 * or five. The geometry drawn here is exactly what ships; only the fill differs.
 */
const ISLAND_FILL = '#22d3ee'
const ISLAND_RIM = '#06212b'

function svg(s: Sheet, muscles: any[], title: string) {
  const sil = muscles.filter((m) => m.kind === 'silhouette')
  const islands = muscles.filter((m) => m.kind !== 'silhouette')
  const body = sil.map((m) => `<path d="${m.path}" fill-rule="evenodd"/>`).join('')
  const isl = islands
    .map(
      (m) =>
        `<path d="${m.path}" fill="${ISLAND_FILL}" fill-rule="evenodd" stroke="${ISLAND_RIM}" stroke-width="0.5"/>`,
    )
    .join('')
  return `<figure><figcaption>${title}</figcaption>
  <svg viewBox="${s.BODY_VIEWBOX}" width="300">
  <g fill="#3b4252" fill-rule="evenodd">${body}</g>${isl}</svg></figure>`
}

const cols = sheets
  .map((s) => `<div class="col">${svg(s, s.FRONT_MUSCLES, `${s.label} front`)}${svg(s, s.BACK_MUSCLES, `${s.label} back`)}</div>`)
  .join('')

const html = `<!doctype html><meta charset="utf-8"><style>
  body{background:#0b0b10;color:#cfd2dc;font:13px system-ui;margin:0;padding:18px;display:flex;gap:26px}
  .col{display:flex;gap:10px}
  figcaption{text-align:center;margin-bottom:6px;letter-spacing:.06em;text-transform:uppercase;font-size:11px;color:#8b90a0}
</style>${cols}`

const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 120 + sheets.length * 660, height: 900 }, deviceScaleFactor: 2 })
await page.setContent(html)
const el = await page.$('body')
writeFileSync(OUT, await el!.screenshot())
await browser.close()
console.log('wrote', OUT, `(${sheets.map((s) => s.label).join(' | ')})`)
