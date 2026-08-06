/**
 * Step 4: vectorise every region mask with potrace, then step 5: transform into a
 * shared viewBox. Front and back get ONE scale factor, derived from the union of the
 * two figure bounding boxes, so the two figures stay at identical size.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import potrace from 'potrace'

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const _HERE = dirname(fileURLToPath(import.meta.url))
const T = join(_HERE, 'build') + '/'
const meta = JSON.parse(readFileSync(T + 'meta.json', 'utf8'))

const OPTS = {
  turdSize: 0,          // we already filtered specks with a logged threshold
  turnPolicy: 'minority',
  alphaMax: 1.0,
  optCurve: true,
  optTolerance: 0.2,
  threshold: 128,
  blackOnWhite: true,
}

function traceOne(file, opts) {
  return new Promise((res, rej) => {
    const p = new potrace.Potrace(opts)
    p.loadImage(file, (e) => (e ? rej(e) : res(p.getPathTag())))
  })
}

const dRe = /d="([^"]+)"/

/** parse a potrace path into subpaths of absolute segments */
function parse(d) {
  const toks = d.trim().split(/\s+(?=[MCLZ])|(?<=[MCLZ])\s+/)
  const out = []
  let cur = null
  const nums = (s) => s.trim().split(/[\s,]+/).map(Number)
  const parts = d.match(/[MCLZ][^MCLZ]*/g) || []
  for (const p of parts) {
    const c = p[0]
    const v = p.length > 1 ? nums(p.slice(1)) : []
    if (c === 'M') { cur = { segs: [{ t: 'M', pts: [{ x: v[0], y: v[1] }] }] }; out.push(cur) }
    else if (c === 'L') { for (let i = 0; i < v.length; i += 2) cur.segs.push({ t: 'L', pts: [{ x: v[i], y: v[i + 1] }] }) }
    else if (c === 'C') {
      for (let i = 0; i < v.length; i += 6)
        cur.segs.push({ t: 'C', pts: [{ x: v[i], y: v[i + 1] }, { x: v[i + 2], y: v[i + 3] }, { x: v[i + 4], y: v[i + 5] }] })
    } else if (c === 'Z') { cur.closed = true }
  }
  return out
}

// ---------------------------------------------------------------------------
// shared coordinate system
// ---------------------------------------------------------------------------
const fb = meta.figures.front.bbox // [x0,y0,x1,y1]
const bb = meta.figures.back.bbox
const fw = fb[2] - fb[0], fh = fb[3] - fb[1]
const bw = bb[2] - bb[0], bh = bb[3] - bb[1]

const VB_H = 288
const unionH = Math.max(fh, bh)          // taller figure fills the viewBox height
const unionW = Math.max(fw, bw)
const S = VB_H / unionH                  // ONE scale for both figures
const VB_W = Math.ceil(unionW * S) + 2   // 1 unit of margin each side

// Both figures are top-aligned in the reference (both start at y=9), so preserve that.
// Each figure is centred horizontally inside its own viewBox.
const place = {
  front: { ox: fb[0], oy: fb[1], dx: (VB_W - fw * S) / 2 },
  back: { ox: bb[0], oy: bb[1], dx: (VB_W - bw * S) / 2 },
}
console.log(`figure boxes  front ${fw}x${fh}  back ${bw}x${bh}`)
console.log(`scale ${S.toFixed(6)}  viewBox 0 0 ${VB_W} ${VB_H}  aspect ${(VB_W / VB_H).toFixed(4)}`)
console.log(`front -> ${(fw * S).toFixed(2)}x${(fh * S).toFixed(2)}   back -> ${(bw * S).toFixed(2)}x${(bh * S).toFixed(2)}`)

const r2 = (n) => Math.round(n * 100) / 100
const fmt = (n) => {
  let s = r2(n).toFixed(2).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
  if (s === '-0') s = '0'
  return s.replace(/^(-?)0\./, '$1.')
}
const app = (str, n) => {
  const s = fmt(n)
  return str === '' || /[A-Za-z]$/.test(str) || s.startsWith('-') ? str + s : str + ',' + s
}

/**
 * Emit compact relative path data, rounding absolutes to 2dp first (no drift).
 * `identity` serialises in source-pixel space instead, so the trace can be diffed
 * against the reference PNG with no resampling in between.
 */
function serialize(subs, view, identity = false) {
  const { ox, oy, dx } = identity ? { ox: 0, oy: 0, dx: 0 } : place[view]
  const s = identity ? 1 : S
  const tx = (p) => ({ x: r2((p.x - ox) * s + dx), y: r2((p.y - oy) * s) })
  let out = ''
  let x = 0, y = 0
  for (const sub of subs) {
    let first = true
    for (const seg of sub.segs) {
      const pts = seg.pts.map(tx)
      if (seg.t === 'M') {
        out += first ? 'M' : 'm'
        const p = pts[0]
        if (first) { out = app(out, p.x); out = app(out, p.y) }
        else { out = app(out, r2(p.x - x)); out = app(out, r2(p.y - y)) }
        x = p.x; y = p.y; first = false
      } else if (seg.t === 'L') {
        const p = pts[0], ddx = r2(p.x - x), ddy = r2(p.y - y)
        if (ddy === 0 && ddx !== 0) { out += 'h'; out = app(out, ddx) }
        else if (ddx === 0 && ddy !== 0) { out += 'v'; out = app(out, ddy) }
        else { out += 'l'; out = app(out, ddx); out = app(out, ddy) }
        x = p.x; y = p.y
      } else {
        out += 'c'
        for (const p of pts) { out = app(out, r2(p.x - x)); out = app(out, r2(p.y - y)) }
        x = pts[2].x; y = pts[2].y
      }
    }
    out += 'Z'
  }
  return out
}

const results = []
let holes = 0
for (const r of meta.regions) {
  const tag = await traceOne(`${T}masks/${r.view}__${r.key}.png`, OPTS)
  const d = tag.match(dRe)[1]
  const subs = parse(d)
  if (subs.length > 1) holes++
  results.push({ ...r, subpaths: subs.length, path: serialize(subs, r.view), path_src: serialize(subs, r.view, true) })
}

writeFileSync(T + 'traced.json', JSON.stringify({ viewBox: `0 0 ${VB_W} ${VB_H}`, scale: S, place, regions: results }, null, 1))
console.log(`traced ${results.length} regions; ${holes} have >1 subpath (holes)`)
const byView = {}
for (const r of results) byView[r.view] = (byView[r.view] || 0) + 1
console.log(byView)
console.log('avg path length', Math.round(results.reduce((a, r) => a + r.path.length, 0) / results.length))
