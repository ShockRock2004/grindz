import { useEffect, useState } from 'react'
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native'
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { C, alpha } from '../theme'
import { T } from './ui'
import { dateKey, fmtWeight, type WeightUnit } from '../lib/util'
import {
  BODY_VIEWBOX,
  FRONT_MUSCLES,
  BACK_MUSCLES,
  intensityOf,
  type BodyMuscle,
  type TrainedInput,
} from '../data/bodyMuscles'
import { BODY_MAP_PAINT, ISLAND_LAYERS, isGradient, type BodyMapVariant, type IslandLayer } from '../data/bodyMapStyle'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/* All charts draw into a fixed viewBox and scale to container width. */
const W = 320
const H = 120
const PAD = 8

/*
 * Chart accessibility.
 *
 * Every chart here was colour-and-position only: a screen reader announced nothing, and
 * the shapes carry the entire message. Each chart now exposes a one-line summary of the
 * trend it is drawing, which is also the honest test of whether the chart says anything —
 * if the sentence is empty, the chart was decoration.
 */
function describeLine(points: { x: string; y: number }[]): string {
  if (!points.length) return 'Progression chart, no data yet'
  const ys = points.map((p) => p.y)
  const first = ys[0]
  const last = ys[ys.length - 1]
  const dir = last > first ? 'up' : last < first ? 'down' : 'flat'
  return `Progression chart, ${points.length} sessions from ${points[0].x} to ${points[points.length - 1].x}. `
    + `Trending ${dir}: started ${first}, now ${last}. Lowest ${Math.min(...ys)}, highest ${Math.max(...ys)}.`
}

function describeBars(bars: { label: string; value: number }[]): string {
  if (!bars.length) return 'Bar chart, no data yet'
  const worked = bars.filter((b) => b.value > 0)
  if (!worked.length) return `Bar chart over ${bars.length} days, nothing logged.`
  const top = worked.reduce((a, b) => (b.value > a.value ? b : a))
  return `Bar chart over ${bars.length} days. ${worked.length} with training, `
    + `${bars.length - worked.length} rest. Highest on ${top.label}.`
}

export function LineChart({ points, height = 120 }: { points: { x: string; y: number }[]; height?: number }) {
  if (points.length === 0) return <Empty height={height} />
  const label = describeLine(points)
  const ys = points.map((p) => p.y)
  const min = Math.min(...ys)
  const max = Math.max(...ys)
  const span = max - min || 1
  const n = points.length
  const px = (i: number) => (n === 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (n - 1))
  const py = (y: number) => H - PAD - ((y - min) / span) * (H - 2 * PAD)
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(p.y).toFixed(1)}`).join(' ')
  const area = `${line} L${px(n - 1).toFixed(1)},${H - PAD} L${px(0).toFixed(1)},${H - PAD} Z`
  const last = points[n - 1]
  return (
    <Svg
      width="100%"
      height={height}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      <Defs>
        <LinearGradient id="lcfill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.cyan} stopOpacity={0.28} />
          <Stop offset="1" stopColor={C.cyan} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={area} fill="url(#lcfill)" />
      <Path d={line} fill="none" stroke={C.cyan} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <Circle cx={px(n - 1)} cy={py(last.y)} r={3.2} fill={C.cyan} />
    </Svg>
  )
}

export function BarChart({ bars, height = 120 }: { bars: { label: string; value: number }[]; height?: number }) {
  if (!bars.length) return <Empty height={height} />
  const label = describeBars(bars)
  const max = Math.max(...bars.map((b) => b.value), 1)
  const n = bars.length
  const bw = (W - 2 * PAD) / n
  return (
    <Svg
      width="100%"
      height={height}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      <Defs>
        <LinearGradient id="barfill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.cyan} />
          <Stop offset="1" stopColor={C.cyanDeep} />
        </LinearGradient>
      </Defs>
      {bars.map((b, i) => {
        const h = (b.value / max) * (H - 2 * PAD)
        return (
          <Rect
            key={i}
            x={PAD + i * bw + bw * 0.16}
            y={H - PAD - h}
            width={bw * 0.68}
            height={Math.max(h, b.value > 0 ? 2 : 0)}
            rx={2}
            fill={b.value > 0 ? 'url(#barfill)' : 'rgba(255,255,255,0.06)'}
          />
        )
      })}
    </Svg>
  )
}

/** Last `weeks` weeks of training-day intensity, GitHub-style. */
export function Heatmap({ dayVolumes, unit, weeks = 16 }: { dayVolumes: Record<string, number>; unit: WeightUnit; weeks?: number }) {
  const [tapped, setTapped] = useState<string | null>(null)
  // a 112-cell colour grid says nothing to a screen reader without this
  const trained = Object.values(dayVolumes).filter((v) => v > 0).length
  const gridLabel = `Training heatmap, last ${weeks} weeks. ${trained} days trained.`
  const cols: Date[][] = []
  const today = new Date()
  const start = new Date(today)
  start.setDate(today.getDate() - (weeks * 7 - 1))
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  const cur = new Date(start)
  const maxVol = Math.max(1, ...Object.values(dayVolumes))
  while (cur <= today) {
    const col: Date[] = []
    for (let d = 0; d < 7; d++) {
      col.push(new Date(cur))
      cur.setDate(cur.getDate() + 1)
    }
    cols.push(col)
  }
  const level = (v: number) => {
    if (v <= 0) return 0
    const r = v / maxVol
    return r < 0.34 ? 1 : r < 0.67 ? 2 : 3
  }
  const colors = ['rgba(255,255,255,0.05)', alpha(C.cyan, 0.35), alpha(C.cyan, 0.62), C.cyan]
  const label = tapped
    ? (() => {
        const [y, m, d] = tapped.split('-').map(Number)
        return `${MONTHS[m - 1]} ${d} — ${fmtWeight(dayVolumes[tapped] ?? 0, unit)}${unit}`
      })()
    : null
  return (
    <View>
      {/* the grid is announced as one summary rather than 112 unlabelled cells */}
      <View
        style={{ flexDirection: 'row', gap: 3 }}
        accessible
        accessibilityRole="image"
        accessibilityLabel={gridLabel}
      >
        {cols.map((col, ci) => (
          <View key={ci} style={{ gap: 3 }}>
            {col.map((d, di) => {
              const key = dateKey(d)
              const future = d > today
              return (
                <Pressable
                  key={di}
                  onPress={() => !future && setTapped((t) => (t === key ? null : key))}
                  style={{
                    width: 11, height: 11, borderRadius: 3,
                    backgroundColor: future ? 'transparent' : colors[level(dayVolumes[key] ?? 0)],
                    borderWidth: tapped === key ? 1 : 0, borderColor: C.cyanSoft,
                  }}
                />
              )
            })}
          </View>
        ))}
      </View>
      {label ? <T style={{ marginTop: 8, fontSize: 11, color: C.muted2, textAlign: 'center' }}>{label}</T> : null}
    </View>
  )
}

function Empty({ height }: { height: number }) {
  return (
    <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
      <T style={{ fontSize: 12, color: C.muted }}>Not enough data yet</T>
    </View>
  )
}

/* ----------------------------- body map ---------------------------- */
/** True when the OS asks for reduced transparency; glass falls back to solid. */
function useReducedTransparency() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    let alive = true
    AccessibilityInfo.isReduceTransparencyEnabled?.().then((v) => alive && setReduced(!!v))
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', (v) => setReduced(!!v))
    return () => {
      alive = false
      sub?.remove?.()
    }
  }, [])
  return reduced
}

/**
 * Which palette the map will paint with right now.
 *
 * Exported because the legend has to name the same colours the figure uses. When this
 * resolution lived privately inside BodyMap, a viewer with reduced transparency got an
 * opaque figure next to a legend still showing the translucent glass tiers — a key that
 * matched nothing on screen, for exactly the people least able to tolerate that. Callers
 * that render a legend should call this once and pass the result into BodyMap.
 */
export function useBodyMapVariant(): BodyMapVariant {
  return useReducedTransparency() ? 'solid' : 'glass'
}

/**
 * Front + back anatomy map. Pass `trained` as a Set of category keys to light every
 * muscle in those categories, or as a Map for two-tier highlighting — see
 * `intensityOf` in ../data/bodyMuscles.
 *
 * `variant` defaults to whatever `useBodyMapVariant` resolves; pass 'flat' to render the
 * reference artwork's own palette (used by the parity test).
 */
export function BodyMap({ trained, onPick, variant }: { trained: TrainedInput; onPick: (category: string) => void; variant?: BodyMapVariant }) {
  const resolved = useBodyMapVariant()
  const v: BodyMapVariant = variant ?? resolved
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 8 }}>
      <BodyView label="Front" muscles={FRONT_MUSCLES} trained={trained} onPick={onPick} variant={v} />
      <BodyView label="Back" muscles={BACK_MUSCLES} trained={trained} onPick={onPick} variant={v} />
    </View>
  )
}

/**
 * react-native-svg drops the alpha channel from an `rgba()` string in `<Stop stopColor>`
 * and in stroke colours — it wants the opacity as its own prop. Web CSS parses rgba()
 * natively, which is why the web body map rendered correctly and this one came out
 * inverted: every translucent fill was painting fully opaque, so resting muscles and the
 * dark-glass separators both rendered near-white.
 */
function rgba(c: string): { color: string; opacity: number } {
  const m = /^rgba?\(([^)]+)\)$/.exec(c.trim())
  if (!m) return { color: c, opacity: 1 }
  const p = m[1].split(',').map((x) => x.trim())
  const a = p.length > 3 ? Number(p[3]) : 1
  return { color: `rgb(${p[0]},${p[1]},${p[2]})`, opacity: Number.isFinite(a) ? a : 1 }
}

function BodyView({ label, muscles, trained, onPick, variant }: { label: string; muscles: BodyMuscle[]; trained: TrainedInput; onPick: (c: string) => void; variant: BodyMapVariant }) {
  const [w, setW] = useState(0)
  const [, , vw, vh] = BODY_VIEWBOX.split(' ').map(Number)
  const h = w ? (w * vh) / vw : 0
  const paint = BODY_MAP_PAINT[variant]
  // ids must be unique per figure, or the Front map's gradients would also paint the Back one
  const gid = (k: string) => `bm${label}${variant}${k}`
  // only the tiers that actually carry a ramp get a def
  const gradientLayers = ISLAND_LAYERS.filter((k) => isGradient(paint[k].fill))

  const silhouettes = muscles.filter((m) => m.kind === 'silhouette')
  const body = muscles.find((m) => m.id === 'body')
  const islands = muscles.filter((m) => m.kind !== 'silhouette')
  const layerOf = (m: BodyMuscle): IslandLayer => intensityOf(m, trained) ?? 'rest'

  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 6 }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && (
        <Svg width={w} height={h} viewBox={BODY_VIEWBOX}>
          {gradientLayers.length > 0 && (
            <Defs>
              {gradientLayers.map((k) => {
                const [from, to] = paint[k].fill as readonly [string, string]
                const a = rgba(from)
                const b = rgba(to)
                /* 0,0 -> 1,1 in objectBoundingBox units is CSS `135deg`, per island */
                return (
                  <LinearGradient key={k} id={gid(k)} x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor={a.color} stopOpacity={a.opacity} />
                    <Stop offset="1" stopColor={b.color} stopOpacity={b.opacity} />
                  </LinearGradient>
                )
              })}
            </Defs>
          )}

          {/* layer 2 — dark glass: the body, and what shows through every gap.
              Composited as one group so the translucent fill does not double up
              where head/hands/feet overlap the body. */}
          <G fill={paint.body.color} fillRule="evenodd" opacity={paint.body.opacity}>
            {silhouettes.map((m) => (
              <Path key={`base-${m.id}`} d={m.path} />
            ))}
          </G>
          {/* rim light on the outer edge only, outside the group so the group's
              opacity does not dim it */}
          {body && paint.body.rim && (
            <Path
              d={body.path}
              fill="none"
              stroke={rgba(paint.body.rim).color}
              strokeOpacity={rgba(paint.body.rim).opacity}
              strokeWidth={paint.body.rimWidth}
            />
          )}

          {/* layers 3/4 — flat islands. Colour and alpha are split apart because
              react-native-svg ignores the alpha channel of an `rgba()` string. */}
          {islands.map((m) => {
            const k = layerOf(m)
            const p = paint[k]
            const grad = isGradient(p.fill)
            const f = grad ? null : rgba(p.fill as string)
            const r = p.rim ? rgba(p.rim) : null
            return (
              <Path
                key={m.id}
                d={m.path}
                fill={grad ? `url(#${gid(k)})` : f!.color}
                fillOpacity={grad ? undefined : f!.opacity}
                fillRule="evenodd"
                stroke={r ? r.color : 'none'}
                strokeOpacity={r ? r.opacity : undefined}
                strokeWidth={p.rimWidth}
                onPress={m.category ? () => onPick(m.category as string) : undefined}
              />
            )
          })}
        </Svg>
      )}
      <T style={s.bmLabel}>{label}</T>
    </View>
  )
}

const s = StyleSheet.create({
  bmLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, color: C.muted, textTransform: 'uppercase' },
})
