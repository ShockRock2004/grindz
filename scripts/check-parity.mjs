#!/usr/bin/env node
/**
 * Fails if files that must stay byte-identical across the three apps have drifted apart.
 *
 * Grindz ships the same product on two stacks and pitches it from a third deployment. Most
 * files legitimately differ — a Tailwind `<div>` is not a React Native `<View>` — but a
 * handful encode facts that MUST agree, or the surfaces silently disagree about what the
 * user is looking at:
 *
 *   data/assetCdn.ts        the CDN origin and URL shape. If these drift, a device that
 *                           already downloaded a photo in one app re-downloads it in the
 *                           other, which defeats the entire point of the CDN move.
 *   data/bodyMapStyle.ts    every colour in the muscle heat map. Drift here means "worked"
 *                           means one thing on the phone and another on the web.
 *   data/bodyMuscles.ts     the traced SVG geometry (generated — see
 *                           apps/web/scripts/gen-body-muscles.mjs, which writes both copies).
 *   data/exerciseMuscles.ts which muscles each exercise trains.
 *   lib/stats.ts            PR / est-1RM / volume maths. Drift means the same history
 *                           produces different numbers on each surface.
 *   components/BodyMap.tsx  the renderer itself. Only web and landing — mobile draws the
 *                           same geometry through react-native-svg, so it cannot share the
 *                           DOM implementation.
 *   theme.ts                the palette bodyMapStyle.ts is expressed in.
 *
 * ## Why apps/landing has copies at all
 *
 * grindz.dev and app.grindz.dev are separate Vercel projects, so the landing page cannot
 * import across the workspace boundary at build time without coupling the two deploys. The
 * hero muscle map is the single strongest thing on that page, so it renders the real
 * component rather than a screenshot — which means the geometry, the palette and the
 * renderer have to exist on both sides.
 *
 * Copies are a real cost, and this script is the thing that stops them being a silent one:
 * a marketing page that paints "trained" in a colour the app no longer uses is worse than
 * no marketing page.
 *
 * Run:  node scripts/check-parity.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Each group names one file and every app that must hold an identical copy of it.
 * The first entry is the reference — the one to copy FROM when something drifts.
 */
const GROUPS = [
  { file: 'data/assetCdn.ts', apps: ['web', 'mobile'] },
  { file: 'data/femaleAssets.ts', apps: ['web', 'mobile'] },
  { file: 'data/bodyMusclesFemale.ts', apps: ['web', 'mobile'] },
  { file: 'data/exerciseMuscles.ts', apps: ['web', 'mobile'] },
  { file: 'lib/stats.ts', apps: ['web', 'mobile'] },
  // The sentence a user reads on the phone must be the sentence they'd read on the web for
  // the same workout — drift here is a trust bug, not just a rendering one. See the file's
  // own header comment for why it deliberately doesn't import from the unlocked lib/util.ts.
  { file: 'lib/insights.ts', apps: ['web', 'mobile'] },
  { file: 'data/bodyMuscles.ts', apps: ['web', 'mobile', 'landing'] },
  { file: 'data/bodyMapStyle.ts', apps: ['web', 'mobile', 'landing'] },
  { file: 'theme.ts', apps: ['web', 'landing'] },
  { file: 'components/BodyMap.tsx', apps: ['web', 'landing'] },
]

let failed = 0
let checked = 0

for (const { file, apps } of GROUPS) {
  const [refApp, ...others] = apps
  const refPath = join(root, `apps/${refApp}/src`, file)

  let ref
  try {
    ref = readFileSync(refPath)
  } catch {
    console.error(`MISSING  apps/${refApp}/src/${file}`)
    failed++
    continue
  }

  let groupOk = true
  for (const app of others) {
    const p = join(root, `apps/${app}/src`, file)
    let other
    try {
      other = readFileSync(p)
    } catch {
      console.error(`MISSING  apps/${app}/src/${file}`)
      failed++
      groupOk = false
      continue
    }
    if (other.equals(ref)) continue

    // Report the first differing line rather than just "they differ" — with files this
    // long, "not identical" on its own tells you nothing about what to fix.
    const la = ref.toString('utf8').split('\n')
    const lb = other.toString('utf8').split('\n')
    let i = 0
    while (i < la.length && i < lb.length && la[i] === lb[i]) i++
    console.error(`DRIFTED  ${file}  (${refApp} vs ${app}, first difference at line ${i + 1})`)
    console.error(`   ${refApp.padEnd(7)} ${JSON.stringify(la[i] ?? '<end of file>')}`)
    console.error(`   ${app.padEnd(7)} ${JSON.stringify(lb[i] ?? '<end of file>')}`)
    failed++
    groupOk = false
  }

  if (groupOk) {
    console.log(`ok       ${file.padEnd(26)} ${apps.join(' = ')}`)
    checked++
  }
}

if (failed) {
  console.error(
    `\n${failed} copy/copies out of sync. Copy the reference version across ` +
      `— do not hand-edit one side to match.`,
  )
  process.exit(1)
}
console.log(`\nAll ${checked} shared files are byte-identical across their apps.`)
