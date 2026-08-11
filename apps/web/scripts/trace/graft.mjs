/**
 * Grafts specific male muscle groups onto the female figure, in place of (or in
 * addition to) the traced female geometry, for regions where the photo source
 * couldn't be traced cleanly: the source has no drawn boundary at all for the
 * forearms (see labels-female.py's docstring), and its thigh/trap lines are soft
 * enough that the traced shapes read as blobbier than the male vector art.
 *
 * A graft takes every male shape in a set of groups (one view, one side), scales
 * them ONE uniform factor + translation (a similarity transform, so the male
 * shapes keep their own proportions -- no stretching) to fit the bounding box the
 * female shapes they replace/sit within occupied, and re-emits their path data in
 * the female coordinate space. Male paths never leave the male dataset; this reads
 * traced-muscles.json and only ever writes traced-muscles-female.json.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const MALE = JSON.parse(readFileSync(join(HERE, '..', 'traced-muscles.json'), 'utf8'))
const FEMALE_PATH = join(HERE, '..', 'traced-muscles-female.json')
const FEMALE = JSON.parse(readFileSync(FEMALE_PATH, 'utf8'))

// ---------------------------------------------------------------------------
// path parsing: M (abs) then relative m/l/h/v/c segments, one or more Z-closed
// subpaths -- exactly what trace.mjs's serialize() emits (see that file).
// ---------------------------------------------------------------------------
function parseD(d) {
  const chunks = d.match(/[MmLlHhVvCcZz][^MmLlHhVvCcZz]*/g) || []
  return chunks.map((c) => ({ cmd: c[0], nums: (c.slice(1).match(/-?\d*\.?\d+/g) || []).map(Number) }))
}

function bboxOf(d) {
  let x = 0, y = 0
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const see = (px, py) => { minX = Math.min(minX, px); minY = Math.min(minY, py); maxX = Math.max(maxX, px); maxY = Math.max(maxY, py) }
  for (const { cmd, nums } of parseD(d)) {
    if (cmd === 'Z' || cmd === 'z') continue
    if (cmd === 'M') { x = nums[0]; y = nums[1]; see(x, y) }
    else if (cmd === 'm') { x += nums[0]; y += nums[1]; see(x, y) }
    else if (cmd === 'h') { x += nums[0]; see(x, y) }
    else if (cmd === 'v') { y += nums[0]; see(x, y) }
    else if (cmd === 'l') { x += nums[0]; y += nums[1]; see(x, y) }
    else if (cmd === 'c') {
      see(x + nums[0], y + nums[1]); see(x + nums[2], y + nums[3])
      x += nums[4]; y += nums[5]; see(x, y)
    }
  }
  return { x0: minX, y0: minY, x1: maxX, y1: maxY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 }
}

function bboxUnion(boxes) {
  return {
    x0: Math.min(...boxes.map((b) => b.x0)), y0: Math.min(...boxes.map((b) => b.y0)),
    x1: Math.max(...boxes.map((b) => b.x1)), y1: Math.max(...boxes.map((b) => b.y1)),
    get w() { return this.x1 - this.x0 }, get h() { return this.y1 - this.y0 },
    get cx() { return (this.x0 + this.x1) / 2 }, get cy() { return (this.y0 + this.y1) / 2 },
  }
}

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

/** Apply one uniform scale + translation to every coordinate in a path. */
function transformD(d, scale, tx, ty) {
  let x = 0, y = 0
  let out = ''
  let first = true
  for (const { cmd, nums } of parseD(d)) {
    if (cmd === 'Z' || cmd === 'z') { out += 'Z'; continue }
    if (cmd === 'M') {
      x = nums[0]; y = nums[1]
      const px = x * scale + tx, py = y * scale + ty
      out += first ? 'M' : 'm'
      out = app(out, px); out = app(out, py)
      first = false
    } else if (cmd === 'm') {
      x += nums[0]; y += nums[1]
      out += 'm'; out = app(out, nums[0] * scale); out = app(out, nums[1] * scale)
    } else if (cmd === 'h') {
      x += nums[0]
      out += 'h'; out = app(out, nums[0] * scale)
    } else if (cmd === 'v') {
      y += nums[0]
      out += 'v'; out = app(out, nums[0] * scale)
    } else if (cmd === 'l') {
      x += nums[0]; y += nums[1]
      out += 'l'; out = app(out, nums[0] * scale); out = app(out, nums[1] * scale)
    } else if (cmd === 'c') {
      out += 'c'
      for (let i = 0; i < 6; i += 2) { out = app(out, nums[i] * scale); out = app(out, nums[i + 1] * scale) }
      x += nums[4]; y += nums[5]
    }
  }
  return out
}

/**
 * Graft male groups (one view, one side) onto the female figure, sized to fit the
 * bounding box the given female groups occupy. Removes those female shapes and any
 * `removeAlso` ids (satellite fragments with no name of their own), appends the
 * transformed male shapes as new female entries. `categoryOverride` lets a call
 * re-map category the way the female category audit requires.
 */
function graft({ view, side, maleGroups, femaleTargetGroups, removeAlso = [], categoryOverride, idPrefix }) {
  const maleArr = MALE[view]
  const femaleArr = FEMALE[view]
  const maleShapes = maleArr.filter((m) => m.side === side && maleGroups.includes(m.group))
  if (maleShapes.length === 0) throw new Error(`no male shapes for ${view}/${side}/${maleGroups}`)
  const maleUnion = bboxUnion(maleShapes.map((m) => bboxOf(m.path)))

  const femaleOld = femaleArr.filter((m) => m.side === side && femaleTargetGroups.includes(m.group))
  if (femaleOld.length === 0) throw new Error(`no female target shapes for ${view}/${side}/${femaleTargetGroups}`)
  const femaleTarget = bboxUnion(femaleOld.map((m) => bboxOf(m.path)))

  const scale = Math.min(femaleTarget.w / maleUnion.w, femaleTarget.h / maleUnion.h)
  const tx = femaleTarget.cx - maleUnion.cx * scale
  const ty = femaleTarget.cy - maleUnion.cy * scale

  const removeIds = new Set([...femaleOld.map((m) => m.id), ...removeAlso])
  FEMALE[view] = femaleArr.filter((m) => !removeIds.has(m.id))

  for (const m of maleShapes) {
    FEMALE[view].push({
      id: `${idPrefix}_${m.group}_${side}`,
      name: m.name,
      category: categoryOverride ?? m.category,
      group: `${idPrefix}_${m.group}`,
      side,
      kind: 'muscle',
      path: transformD(m.path, scale, tx, ty),
    })
  }
  console.log(`grafted ${view}/${side}: ${maleShapes.length} male shape(s) from [${maleGroups}] -> replacing ${femaleOld.length} female shape(s) (+${removeAlso.length} satellite) from [${femaleTargetGroups}], scale ${scale.toFixed(3)}`)
}

// ---------------------------------------------------------------------------
// 1. Thighs -- replace the female's traced quad/TFL/adductor blobs with the
//    male's full front-thigh set (TFL, rectus femoris, pectineus, sartorius,
//    vastus lateralis, vastus medialis), matching the male map's detail level.
// ---------------------------------------------------------------------------
const THIGH_MALE_GROUPS = ['tensor_fasciae_latae', 'rectus_femoris', 'pectineus', 'sartorius', 'vastus_lateralis', 'vastus_medialis']
const THIGH_FEMALE_GROUPS = ['tensor_fasciae_latae', 'quadriceps', 'vastus_lateralis', 'adductors', 'hip_flexors']
for (const side of ['left', 'right']) {
  graft({ view: 'front', side, maleGroups: THIGH_MALE_GROUPS, femaleTargetGroups: THIGH_FEMALE_GROUPS, idPrefix: 'thigh' })
}

// ---------------------------------------------------------------------------
// 2. Traps. The male BACK trapezius grafts in cleanly (verified by eye), but the
//    male FRONT trapezius is a small angular chevron that -- fine on the male's
//    own more angular art -- reads as a jagged zigzag against the female figure's
//    softer style right at the collarbone. The female's own traced front trap
//    shape was already clean, so front just gets a category fix (male categorises
//    trapezius_upper as 'shoulders', the female trace had put all trap under
//    'back'); only the back view gets the male's geometry grafted in.
// ---------------------------------------------------------------------------
for (const m of FEMALE.front) {
  if (m.group === 'trapezius_upper') m.category = 'shoulders'
}
for (const side of ['left', 'right']) {
  // female back labelled both the upper trap (7,8) and middle trap (9,10) blobs under
  // the SAME 'trapezius_upper' group, so this one call's target-bbox already spans
  // both -- and picks up both male shapes (upper -> shoulders, middle/lower -> back)
  graft({ view: 'back', side, maleGroups: ['trapezius_upper', 'trapezius_middle_lower'], femaleTargetGroups: ['trapezius_upper'], idPrefix: 'trap' })
}

// ---------------------------------------------------------------------------
// 3. Forearms -- the female source drew no wrist crease (see labels-female.py),
//    so the whole forearm+hand traced as one silhouette blob. Graft the male's
//    forearm muscles into the (upper ~65%, i.e. non-hand) portion of that blob,
//    on top of the silhouette -- the hand portion is untouched.
// ---------------------------------------------------------------------------
function forearmTargetBBox(view, side) {
  const blob = FEMALE[view].find((m) => m.side === side && m.kind === 'silhouette' && /forearm_hand/.test(m.group))
  const b = bboxOf(blob.path)
  // limb is taller than wide; the hand is the far end from the shoulder, i.e. the
  // bottom of the bbox (both views are top-aligned, arms hang down) -- keep the
  // top 65% as the forearm target, leave the bottom 35% (hand) alone.
  const cutY = b.y0 + b.h * 0.65
  return { x0: b.x0, y0: b.y0, x1: b.x1, y1: cutY, w: b.x1 - b.x0, h: cutY - b.y0, cx: (b.x0 + b.x1) / 2, cy: (b.y0 + cutY) / 2 }
}

function graftForearm(view, side, maleGroups) {
  const maleShapes = MALE[view].filter((m) => m.side === side && maleGroups.includes(m.group))
  const maleUnion = bboxUnion(maleShapes.map((m) => bboxOf(m.path)))
  const target = forearmTargetBBox(view, side)
  const scale = Math.min(target.w / maleUnion.w, target.h / maleUnion.h)
  const tx = target.cx - maleUnion.cx * scale
  const ty = target.cy - maleUnion.cy * scale
  for (const m of maleShapes) {
    FEMALE[view].push({
      id: `forearm_${m.group}_${side}`,
      name: m.name,
      category: m.category, // male keeps every forearm muscle under 'biceps', front or back
      group: `forearm_${m.group}`,
      side,
      kind: 'muscle',
      path: transformD(m.path, scale, tx, ty),
    })
  }
  console.log(`grafted forearm ${view}/${side}: ${maleShapes.length} shape(s), scale ${scale.toFixed(3)}`)
}
for (const side of ['left', 'right']) {
  graftForearm('front', side, ['wrist_flexors', 'brachioradialis'])
  graftForearm('back', side, ['extensor_carpi_ulnaris', 'brachioradialis'])
}

writeFileSync(FEMALE_PATH, JSON.stringify(FEMALE, null, 1))
console.log('wrote', FEMALE_PATH)
