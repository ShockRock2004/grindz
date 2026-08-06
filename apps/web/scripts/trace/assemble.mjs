/**
 * Join traced geometry with the verified blob->muscle labels and write the
 * generator's input file, `workout/scripts/traced-muscles.json`.
 */
import { readFileSync, writeFileSync } from 'node:fs'

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const _HERE = dirname(fileURLToPath(import.meta.url))
const T = join(_HERE, 'build') + '/'
const OUT = join(_HERE, '..', 'traced-muscles.json')

const traced = JSON.parse(readFileSync(T + 'traced.json', 'utf8'))
const labels = JSON.parse(readFileSync(T + 'labels.json', 'utf8'))

const pathOf = (view, key) => {
  const r = traced.regions.find((x) => x.view === view && x.key === key)
  if (!r) throw new Error(`no traced region ${view}:${key}`)
  return r.path
}

const TITLE = { head: 'Head', hand: 'Hand', foot: 'Foot' }

const out = { viewBox: traced.viewBox, source: 'muscles-worked-close-neutral-grip-lat-pulldown.png', front: [], back: [] }

for (const view of ['front', 'back']) {
  const rows = []
  // 1. the whole figure: the dark body the muscles sit on, and what shows through
  //    every gap between them
  rows.push({ id: 'body', name: 'Body', category: null, group: 'body', side: 'center', kind: 'silhouette', path: pathOf(view, 'body') })
  // 2. head / hands / feet, individually addressable
  for (const r of traced.regions.filter((x) => x.view === view && x.kind === 'silhouette' && x.key !== 'body')) {
    const [base, side] = r.key.split('_')
    rows.push({
      id: r.key,
      name: side ? `${TITLE[base]} (${side === 'left' ? 'L' : 'R'})` : TITLE[base],
      category: null, group: base, side: side || 'center', kind: 'silhouette', path: pathOf(view, r.key),
    })
  }
  // 3. muscle islands
  const ls = labels[view].slice().sort((a, b) => a.blob - b.blob)
  for (const l of ls) {
    rows.push({ id: l.id, name: l.name, category: l.category, group: l.group, side: l.side, kind: 'muscle', path: pathOf(view, `isl${String(l.blob).padStart(3, '0')}`) })
  }
  out[view] = rows
  const ids = new Set(rows.map((r) => r.id))
  if (ids.size !== rows.length) throw new Error(`${view}: duplicate ids`)
  console.log(`${view}: ${rows.length} shapes (${rows.filter((r) => r.kind === 'muscle').length} muscles, ${rows.filter((r) => r.kind === 'silhouette').length} silhouette)`)
}

writeFileSync(OUT, JSON.stringify(out, null, 1))
console.log('wrote', OUT)
