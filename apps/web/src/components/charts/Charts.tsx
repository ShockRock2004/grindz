import { useMemo, useState } from 'react'
import { dateKey, fmtWeight, cx, type WeightUnit } from '../../lib/util'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/* All charts draw into a fixed viewBox and scale to container width via width:100%. */

const W = 320
const H = 120
const PAD = 8

/**
 * Every gradient fill needs an id unique to its own <svg>, or two charts on the same page
 * silently share whichever <defs> mounted first — this used to be a single hardcoded
 * `lc-fill` / `bar-fill` per chart type, which was invisible with one chart per page and
 * wrong the moment a page (History's momentum strip) mounts several at once.
 */
let gid = 0
function useGradientId(prefix: string): string {
  return useMemo(() => `${prefix}-${(gid++).toString(36)}`, [prefix])
}

function describeLine(points: { x: string; y: number }[]): string {
  if (!points.length) return 'Line chart, no data yet'
  const ys = points.map((p) => p.y)
  const first = ys[0]
  const last = ys[ys.length - 1]
  const dir = last > first ? 'up' : last < first ? 'down' : 'flat'
  return (
    `Line chart, ${points.length} points from ${points[0].x} to ${points[points.length - 1].x}. ` +
    `Trending ${dir}: started ${first}, now ${last}. Lowest ${Math.min(...ys)}, highest ${Math.max(...ys)}.`
  )
}

function describeBars(bars: { label: string; value: number }[]): string {
  if (!bars.length) return 'Bar chart, no data yet'
  const worked = bars.filter((b) => b.value > 0)
  if (!worked.length) return `Bar chart over ${bars.length} entries, nothing logged.`
  const top = worked.reduce((a, b) => (b.value > a.value ? b : a))
  return (
    `Bar chart over ${bars.length} entries. ${worked.length} with training, ` +
    `${bars.length - worked.length} without. Highest on ${top.label}.`
  )
}

export function LineChart({ points, height = 120 }: { points: { x: string; y: number }[]; height?: number }) {
  const fillId = useGradientId('lc-fill')
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
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label={label}>
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(0,198,255,0.28)" />
          <stop offset="100%" stopColor="rgba(0,198,255,0)" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${fillId})`} />
      <path className="chart-line" d={line} pathLength={1} fill="none" stroke="#00c6ff" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={px(n - 1)} cy={py(last.y)} r={3.2} fill="#00c6ff" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function BarChart({ bars, height = 120 }: { bars: { label: string; value: number }[]; height?: number }) {
  const fillId = useGradientId('bar-fill')
  if (!bars.length) return <Empty height={height} />
  const label = describeBars(bars)
  const max = Math.max(...bars.map((b) => b.value), 1)
  const n = bars.length
  const bw = (W - 2 * PAD) / n
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label={label}>
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00c6ff" />
          <stop offset="100%" stopColor="#0072ff" />
        </linearGradient>
      </defs>
      {bars.map((b, i) => {
        const h = (b.value / max) * (H - 2 * PAD)
        const x = PAD + i * bw + bw * 0.16
        const w = bw * 0.68
        return <rect key={i} x={x} y={H - PAD - h} width={w} height={Math.max(h, b.value > 0 ? 2 : 0)} rx={2} fill={b.value > 0 ? `url(#${fillId})` : 'rgba(255,255,255,0.06)'} />
      })}
    </svg>
  )
}

/**
 * A tiny trend line with no axis, no grid, no labels — the "is this going up or down"
 * shape, not a chart you read values off. Meant to sit inside a StatTile under a number
 * that already states the value; the sparkline supplies the direction the number can't.
 */
export function Sparkline({ values, height = 32, tone = 'cyan' }: { values: number[]; height?: number; tone?: 'cyan' | 'good' | 'bad' | 'muted' }) {
  const fillId = useGradientId('spark-fill')
  const color = tone === 'good' ? '#00e0a4' : tone === 'bad' ? '#ff5c7a' : tone === 'muted' ? '#8b8b94' : '#00c6ff'
  if (values.length < 2) return <div style={{ height }} aria-hidden="true" />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const n = values.length
  const sw = 96
  const sh = 28
  const px = (i: number) => (i * sw) / (n - 1)
  const py = (v: number) => sh - ((v - min) / span) * sh
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ')
  const area = `${line} L${px(n - 1).toFixed(1)},${sh} L0,${sh} Z`
  const dir = values[n - 1] > values[0] ? 'up' : values[n - 1] < values[0] ? 'down' : 'flat'
  return (
    <svg viewBox={`0 0 ${sw} ${sh}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label={`Trend, ${dir}`}>
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${fillId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={px(n - 1)} cy={py(values[n - 1])} r={2} fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/**
 * Vertical bars with an optional rolling-mean overlay line — the one chart on either
 * redesigned page that carries a real axis, because it's the one place a trend actually
 * needs reading rather than just glancing at. `highlightIndex` paints one bar at full
 * strength and dims the rest, for "this one vs the others" comparisons.
 */
export function ColumnChart({
  bars,
  overlay,
  height = 140,
  highlightIndex,
  overlayLabel = 'Rolling average',
}: {
  bars: { label: string; value: number }[]
  overlay?: number[]
  height?: number
  highlightIndex?: number
  overlayLabel?: string
}) {
  const fillId = useGradientId('col-fill')
  const [hover, setHover] = useState<number | null>(null)
  if (!bars.length) return <Empty height={height} />
  const values = bars.map((b) => b.value)
  const max = Math.max(...values, ...(overlay ?? []), 1)
  const n = bars.length
  const bw = (W - 2 * PAD) / n
  const yFor = (v: number) => H - PAD - (v / max) * (H - 2 * PAD)
  const overlayPath =
    overlay && overlay.length === n
      ? overlay.map((v, i) => `${i === 0 ? 'M' : 'L'}${(PAD + i * bw + bw / 2).toFixed(1)},${yFor(v).toFixed(1)}`).join(' ')
      : null
  const label = describeBars(bars)
  // Tooltip is hover-only — `highlightIndex` already calls the bar out by color, so an
  // ever-present floating tooltip would be redundant AND, positioned above a short chart,
  // can overlap whatever heading sits just above the card (as it did here until fixed).
  const active = hover
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label={label}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00c6ff" />
            <stop offset="100%" stopColor="#0072ff" />
          </linearGradient>
        </defs>
        {/* recessive baseline */}
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="rgba(255,255,255,0.08)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {bars.map((b, i) => {
          const h = (b.value / max) * (H - 2 * PAD)
          const x = PAD + i * bw + bw * 0.16
          const w = bw * 0.68
          const dim = highlightIndex != null && i !== highlightIndex
          return (
            <rect
              key={i}
              x={x}
              y={H - PAD - h}
              width={w}
              height={Math.max(h, b.value > 0 ? 2 : 0)}
              rx={2}
              fill={b.value > 0 ? `url(#${fillId})` : 'rgba(255,255,255,0.06)'}
              opacity={dim ? 0.32 : 1}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          )
        })}
        {overlayPath && <path d={overlayPath} fill="none" stroke="#5fdcff" strokeWidth={1.4} strokeDasharray="3 3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
      </svg>
      {active != null && bars[active] && (
        <div className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-full rounded-md border border-line2 bg-panel2 px-2 py-1 text-[10px] font-semibold text-ink2 shadow-card">
          {bars[active].label}: {bars[active].value.toLocaleString()}
        </div>
      )}
      {overlay && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted">
          <span className="inline-block h-0.5 w-3 rounded-full border-t border-dashed border-cyan-soft" />
          {overlayLabel}
        </div>
      )}
    </div>
  )
}

/** Last `weeks` weeks of training-day intensity, GitHub-style. */
export function Heatmap({ dayVolumes, unit, weeks = 16 }: { dayVolumes: Record<string, number>; unit: WeightUnit; weeks?: number }) {
  const [tapped, setTapped] = useState<string | null>(null)
  const cols: Date[][] = []
  const today = new Date()
  const start = new Date(today)
  start.setDate(today.getDate() - (weeks * 7 - 1))
  // align start to Monday
  const dow = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - dow)
  let cur = new Date(start)
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
    if (r < 0.34) return 1
    if (r < 0.67) return 2
    return 3
  }
  const colors = ['rgba(255,255,255,0.05)', 'rgba(0,198,255,0.35)', 'rgba(0,198,255,0.62)', '#00c6ff']
  return (
    <div className="flex gap-[3px] overflow-x-auto no-scrollbar">
      {cols.map((col, ci) => (
        <div key={ci} className="flex flex-col gap-[3px]">
          {col.map((d, di) => {
            const key = dateKey(d)
            if (d > today) return <div key={di} className="h-[11px] w-[11px] rounded-[3px]" style={{ background: 'transparent' }} />
            const vol = dayVolumes[key] ?? 0
            const label = `${MONTHS[d.getMonth()]} ${d.getDate()} — ${fmtWeight(vol, unit)}${unit}`
            const open = tapped === key
            return (
              <div key={di} className="group relative">
                <button
                  type="button"
                  onClick={() => setTapped((t) => (t === key ? null : key))}
                  className="block h-[11px] w-[11px] rounded-[3px]"
                  style={{ background: colors[level(vol)] }}
                  aria-label={label}
                />
                <span
                  className={cx(
                    'pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 -translate-x-1/2 animate-pop whitespace-nowrap rounded-md border border-line2 bg-panel2 px-2 py-1 text-[10px] font-semibold text-ink2 shadow-card',
                    open ? 'block' : 'hidden group-hover:block',
                  )}
                >
                  {label}
                </span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** Reads the same 4-stop cyan ramp `Heatmap` paints with, for a "less → more" legend key. */
export const HEATMAP_LEVEL_COLORS = ['rgba(255,255,255,0.05)', 'rgba(0,198,255,0.35)', 'rgba(0,198,255,0.62)', '#00c6ff'] as const

function Empty({ height }: { height: number }) {
  return (
    <div className="flex items-center justify-center text-xs text-muted" style={{ height }}>
      Not enough data yet
    </div>
  )
}
