#!/usr/bin/env node
/**
 * Fails if the files that must stay byte-identical between the web app and the mobile app
 * have drifted apart.
 *
 * Grindz ships the same product on two stacks. Most files legitimately differ — a Tailwind
 * `<div>` is not a React Native `<View>` — but a handful encode facts that MUST agree, or
 * the two surfaces silently disagree about what the user is looking at:
 *
 *   data/assetCdn.ts       the CDN origin and URL shape. If these drift, a device that
 *                          already downloaded a photo in one app re-downloads it in the
 *                          other, which defeats the entire point of the CDN move.
 *   data/bodyMapStyle.ts   every colour in the muscle heat map. Drift here means "worked"
 *                          means one thing on the phone and another on the web.
 *   data/bodyMuscles.ts    the traced SVG geometry (generated — see
 *                          apps/web/scripts/gen-body-muscles.mjs, which writes both copies).
 *   data/exerciseMuscles.ts which muscles each exercise trains.
 *   lib/stats.ts           PR / est-1RM / volume maths. Drift means the same history
 *                          produces different numbers on each surface.
 *
 * Run:  node scripts/check-parity.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const SHARED = [
  'data/assetCdn.ts',
  'data/bodyMapStyle.ts',
  'data/bodyMuscles.ts',
  'data/exerciseMuscles.ts',
  'lib/stats.ts',
]

let failed = 0

for (const rel of SHARED) {
  const web = join(root, 'apps/web/src', rel)
  const mobile = join(root, 'apps/mobile/src', rel)

  let a, b
  try {
    a = readFileSync(web)
  } catch {
    console.error(`MISSING  apps/web/src/${rel}`)
    failed++
    continue
  }
  try {
    b = readFileSync(mobile)
  } catch {
    console.error(`MISSING  apps/mobile/src/${rel}`)
    failed++
    continue
  }

  if (a.equals(b)) {
    console.log(`ok       ${rel}`)
  } else {
    // Report the first differing line rather than just "they differ" — with files this
    // long, "not identical" on its own tells you nothing about what to fix.
    const la = a.toString('utf8').split('\n')
    const lb = b.toString('utf8').split('\n')
    let i = 0
    while (i < la.length && i < lb.length && la[i] === lb[i]) i++
    console.error(`DRIFTED  ${rel}  (first difference at line ${i + 1})`)
    console.error(`   web:    ${JSON.stringify(la[i] ?? '<end of file>')}`)
    console.error(`   mobile: ${JSON.stringify(lb[i] ?? '<end of file>')}`)
    failed++
  }
}

if (failed) {
  console.error(
    `\n${failed} shared file(s) out of sync. Copy the correct version across both apps ` +
      `— do not hand-edit one side to match.`,
  )
  process.exit(1)
}
console.log(`\nAll ${SHARED.length} shared files are byte-identical.`)
