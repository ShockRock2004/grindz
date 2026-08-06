import { useState } from 'react'
import { dateKey, fmtWeight, cx, type WeightUnit } from '../../lib/util'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/* All charts draw into a fixed viewBox and scale to container width via width:100%. */

const W = 320
const H = 120
const PAD = 8

export function LineChart({
  points,
  height = 120,
}: {
  points: { x: string; y: number }[]
  height?: number
}) {
  if (points.length === 0) return <Empty height={height} />
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
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} preserveAspectRatio="none">
      <defs>
        <linearGradient id="lc-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(0,198,255,0.28)" />
          <stop offset="100%" stopColor="rgba(0,198,255,0)" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#lc-fill)" />
      <path className="chart-line" d={line} pathLength={1} fill="none" stroke="#00c6ff" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={px(n - 1)} cy={py(last.y)} r={3.2} fill="#00c6ff" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function BarChart({ bars, height = 120 }: { bars: { label: string; value: number }[]; height?: number }) {
  if (!bars.length) return <Empty height={height} />
  const max = Math.max(...bars.map((b) => b.value), 1)
  const n = bars.length
  const bw = (W - 2 * PAD) / n
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} preserveAspectRatio="none">
      <defs>
        <linearGradient id="bar-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00c6ff" />
          <stop offset="100%" stopColor="#0072ff" />
        </linearGradient>
      </defs>
      {bars.map((b, i) => {
        const h = (b.value / max) * (H - 2 * PAD)
        const x = PAD + i * bw + bw * 0.16
        const w = bw * 0.68
        return <rect key={i} x={x} y={H - PAD - h} width={w} height={Math.max(h, b.value > 0 ? 2 : 0)} rx={2} fill={b.value > 0 ? 'url(#bar-fill)' : 'rgba(255,255,255,0.06)'} />
      })}
    </svg>
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

function Empty({ height }: { height: number }) {
  return (
    <div className="flex items-center justify-center text-xs text-muted" style={{ height }}>
      Not enough data yet
    </div>
  )
}
