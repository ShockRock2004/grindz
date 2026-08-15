/**
 * Every exercise must light the right muscles on BOTH body maps.
 *
 * The male and female sheets are traced from different artwork, so they do not carry the
 * same set of shapes: the female source draws one forearm region where the male splits
 * three, and it has no sartorius or pectineus at all. `intensityOf` resolves an exercise's
 * muscle keys most-specific-first — muscle id, then group, then category — which means a
 * key that matches nothing on one sheet does not error, it silently lights nothing, or
 * falls back to lighting the exercise's whole category. Both failure modes look like a
 * working app and a wrong picture.
 *
 * That is exactly how the female map shipped with a lat pulldown lighting a forearm shape
 * that the label table had called an oblique. Nothing threw. It just pointed at the wrong
 * muscle.
 *
 * So this checks the claim directly, per exercise, per view, per sheet:
 *
 *   1. an exercise's primaries light at least one shape on each sheet, matched by id or by
 *      group and NEVER by category fallback — falling back to the category is exactly the
 *      "lights the whole group instead of the muscle" behaviour this table exists to fix;
 *   2. at least one of those lit shapes carries the exercise's OWN catalogue category, so
 *      a chest press cannot pass by lighting only the triceps. Cardio is exempt: no shape
 *      on either sheet is categorised 'cardio', by design — those lifts light the legs;
 *   3. no shape on either sheet carries a category the catalogue does not have.
 *
 * Individual keys that match nothing are reported but not fatal, and are expected: the
 * alias arrays in exerciseMuscles.ts deliberately name every id a muscle has on EITHER
 * sheet, so 'triceps_lateral_head' (male-only) and 'forearm' (female-only) each miss on
 * the other sheet by construction. What must never happen is every key in a group missing
 * at once, which is what rule 1 catches.
 *
 * Run: npx tsx scripts/check-body-map-mapping.mts
 */
import { FRONT_MUSCLES, BACK_MUSCLES } from '../src/data/bodyMuscles'
import { FRONT_MUSCLES as F_FRONT, BACK_MUSCLES as F_BACK } from '../src/data/bodyMusclesFemale'
import { EXERCISE_MUSCLES } from '../src/data/exerciseMuscles'
import { CATALOG } from '../src/data/catalog'
import type { BodyMuscle } from '../src/data/bodyMuscles'

type Sheet = { name: string; front: BodyMuscle[]; back: BodyMuscle[] }

const SHEETS: Sheet[] = [
  { name: 'male', front: FRONT_MUSCLES, back: BACK_MUSCLES },
  { name: 'female', front: F_FRONT as BodyMuscle[], back: F_BACK as BodyMuscle[] },
]

const CATEGORIES = new Set(CATALOG.map((c) => c.key))
const failures: string[] = []
const notes: string[] = []

/** Shapes a single key lights on one view, by id or group only — never by category. */
function shapesFor(view: BodyMuscle[], key: string): BodyMuscle[] {
  return view.filter((m) => m.kind !== 'silhouette' && (m.id === key || m.group === key))
}

for (const sheet of SHEETS) {
  const views: [string, BodyMuscle[]][] = [['front', sheet.front], ['back', sheet.back]]

  // 4. category sanity
  for (const [vn, v] of views) {
    for (const m of v) {
      if (m.kind === 'silhouette' || !m.category) continue
      if (!CATEGORIES.has(m.category)) failures.push(`${sheet.name}/${vn}: ${m.id} has unknown category '${m.category}'`)
    }
  }

  for (const [exercise, work] of Object.entries(EXERCISE_MUSCLES)) {
    const lit: BodyMuscle[] = []
    for (const key of work.primary) {
      const hits = [...shapesFor(sheet.front, key), ...shapesFor(sheet.back, key)]
      lit.push(...hits)
      if (hits.length === 0) notes.push(`${sheet.name}: '${exercise}' primary '${key}' matches no shape`)
    }
    // 1. the exercise must light something
    if (lit.length === 0) {
      failures.push(`${sheet.name}: '${exercise}' primaries [${work.primary.join(', ')}] light NOTHING`)
      continue
    }
    // 2. and at least one lit shape must belong to the exercise's own category
    const own = CATALOG.find((c) => c.exercises.some((e) => e.name === exercise))?.key
    if (own && own !== 'cardio' && !lit.some((m) => m.category === own)) {
      failures.push(
        `${sheet.name}: '${exercise}' is a '${own}' exercise but lights only ` +
          `[${[...new Set(lit.map((m) => `${m.group}:${m.category}`))].join(', ')}]`,
      )
    }

    for (const key of work.secondary) {
      const hits = [...shapesFor(sheet.front, key), ...shapesFor(sheet.back, key)]
      if (hits.length === 0) notes.push(`${sheet.name}: '${exercise}' secondary '${key}' matches no shape`)
    }
  }
}

/* Per-exercise report: what actually lights on the female sheet, so the mapping can be
 * read and judged by eye rather than trusted. */
console.log('=== female sheet: what each exercise lights ===')
for (const cat of CATALOG) {
  for (const ex of cat.exercises) {
    const work = EXERCISE_MUSCLES[ex.name]
    if (!work) {
      notes.push(`no muscle work listed for '${ex.name}' (${cat.key}) — falls back to category`)
      continue
    }
    const groups = new Set<string>()
    for (const key of work.primary) {
      for (const m of [...shapesFor(F_FRONT as BodyMuscle[], key), ...shapesFor(F_BACK as BodyMuscle[], key)]) groups.add(m.group)
    }
    console.log(`  ${cat.key.padEnd(10)} ${ex.name.padEnd(46)} -> ${[...groups].join(', ') || '!! nothing'}`)
  }
}

console.log(`\n=== notes (${notes.length}) ===`)
for (const n of notes) console.log('  -', n)

console.log(`\n=== failures (${failures.length}) ===`)
for (const f of failures) console.log('  !!', f)

if (failures.length) {
  console.log('\nFAILED')
  process.exit(1)
}
console.log('\nAll exercises resolve to real shapes on both sheets.')
