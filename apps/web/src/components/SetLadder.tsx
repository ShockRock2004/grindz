import { cx, fmtWeight, type WeightUnit } from '../lib/util'
import { IconTrophy } from './Icons'
import type { SetRow } from '../lib/types'

/**
 * Replaces the small text chips ("1: 32×15 @8") a session's sets used to be rendered as.
 * Bar length is the set's weight relative to the heaviest working set in the exercise, so
 * fatigue across a set — the top set, then two backdowns — becomes a shape you read at a
 * glance instead of three numbers you have to compare by hand. RPE stays a small status dot
 * rather than its own bar: it's a state (good/hard/near-failure), not a magnitude to plot.
 *
 * Plain divs, not SVG — sidesteps both the `preserveAspectRatio="none"` distortion the SVG
 * charts have at desktop width and the react-native-svg alpha bug on the mobile side.
 */

function rpeDotClass(rpe: number): string {
  if (rpe <= 7) return 'bg-good'
  if (rpe === 8) return 'bg-cyan'
  if (rpe === 9) return 'bg-warn'
  return 'bg-bad'
}

/** Same mode-aware label the chips used ("400m · 2.5min", "45s · 20kg", "32×15"). */
function setLabel(r: SetRow, unit: WeightUnit): string {
  if ((r.distance_m ?? 0) > 0) {
    const mins = (r.duration_s ?? 0) > 0 ? ` · ${Math.round(((r.duration_s ?? 0) / 60) * 10) / 10}min` : ''
    return `${r.distance_m}m${mins}`
  }
  if ((r.duration_s ?? 0) > 0) {
    const load = r.weight_kg > 0 ? ` · ${fmtWeight(r.weight_kg, unit)}${unit}` : ''
    return `${r.duration_s}s${load}`
  }
  return `${fmtWeight(r.weight_kg, unit)}${unit} × ${r.reps}`
}

export function SetLadder({ rows, unit, isPrSet }: { rows: SetRow[]; unit: WeightUnit; isPrSet: (r: SetRow) => boolean }) {
  if (!rows.length) return null
  const maxWeight = Math.max(1, ...rows.map((r) => r.weight_kg || 0))
  const isTimedOrDistance = rows.some((r) => (r.duration_s ?? 0) > 0 || (r.distance_m ?? 0) > 0)

  return (
    <div className="flex flex-col gap-1">
      {rows.map((r, i) => {
        const pr = isPrSet(r)
        const pct = isTimedOrDistance || r.weight_kg <= 0 ? 100 : Math.max(8, (r.weight_kg / maxWeight) * 100)
        return (
          <div key={r.id} className="flex items-center gap-2">
            <span
              className={cx(
                'tnum flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                r.is_warmup ? 'bg-warn/15 text-warn' : 'bg-white/[0.06] text-muted',
              )}
            >
              {r.is_warmup ? 'W' : i + 1}
            </span>
            <div className="relative h-6 min-w-0 flex-1 overflow-hidden rounded-lg bg-white/[0.04]">
              <div
                className={cx(
                  'absolute inset-y-0 left-0 rounded-lg transition-[width]',
                  r.is_warmup ? 'border border-dashed border-warn/40 bg-transparent' : pr ? 'bg-gradient-to-r from-cyan to-cyan-deep' : 'bg-white/[0.10]',
                )}
                style={{ width: `${pct}%` }}
              />
              <span className="tnum relative flex h-full items-center gap-1 px-2 text-[11px] font-semibold">
                {pr && <IconTrophy size={10} className="shrink-0 text-cyan-ink" />}
                <span className={pr ? 'text-cyan-ink' : 'text-ink2'}>{setLabel(r, unit)}</span>
              </span>
            </div>
            {r.rpe != null ? (
              <span
                className={cx('h-2.5 w-2.5 shrink-0 rounded-full', rpeDotClass(r.rpe))}
                title={`RPE ${r.rpe}`}
                aria-label={`Effort ${r.rpe} out of 10`}
              />
            ) : (
              <span className="w-2.5 shrink-0" aria-hidden="true" />
            )}
          </div>
        )
      })}
    </div>
  )
}

export { rpeDotClass }
