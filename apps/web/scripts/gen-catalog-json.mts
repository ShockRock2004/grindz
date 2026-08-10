/**
 * Generates `cdn/public/catalog.json` from the built-in exercise catalog.
 *
 * `catalog.ts` and `exerciseMuscles.ts` stay the source of truth — typed, autocompleted,
 * checked by `tsc` — so adding an exercise is still just editing those two files. This
 * script is the bridge from "typed source" to "thing the CDN can serve": it imports both
 * modules directly (via tsx, so the TypeScript runs as-is) and writes their exported data
 * as JSON next to the exercise photos.
 *
 * Why this exists: the mobile app bundles its JS at build time, so a new row in `catalog.ts`
 * only reaches a device inside a new APK. Everything else about an exercise (its name, form
 * cue, tips, which muscles it lights up) is just data, and data can be fetched instead of
 * compiled in — see `apps/mobile/src/data/catalogSync.ts`, which pulls this file at runtime
 * and merges it over the bundled fallback. The image was already solved this way (see
 * docs/IMAGES.md); this is the same move for the row describing it.
 *
 * `version` is a content hash of the payload, not a timestamp — the mobile app compares it
 * to the last one it applied and skips the AsyncStorage write (and the re-render) when
 * nothing actually changed, which is the common case for any run that did not touch the
 * catalog.
 *
 * Run:  npx tsx apps/web/scripts/gen-catalog-json.mts
 * (from repo root, or `npm run gen:catalog` inside apps/web)
 */
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CATALOG, EXERCISE_TIPS } from '../src/data/catalog.ts'
import { EXERCISE_MUSCLES } from '../src/data/exerciseMuscles.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '..', '..', '..', 'cdn', 'public', 'catalog.json')

// `img` is a bare filename (e.g. 'wrist-curls.png'), not a URL — both apps already know how
// to turn `(categoryKey, img)` into a CDN URL via their own assetCdn.ts, so shipping the raw
// filename here keeps this payload identical in shape to the local fallback it replaces.
const payload = {
  categories: CATALOG,
  tips: EXERCISE_TIPS,
  muscles: EXERCISE_MUSCLES,
}

const version = createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16)

writeFileSync(OUT, JSON.stringify({ version, ...payload }, null, 2) + '\n')

const exerciseCount = payload.categories.reduce((n, c) => n + c.exercises.length, 0)
console.log(`Wrote ${OUT}`)
console.log(`  ${payload.categories.length} categories, ${exerciseCount} exercises, version ${version}`)
