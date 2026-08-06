import { useMemo, useState } from 'react'
import { CategoryThumb } from './Icons'
import { CATALOG, categoryOf } from '../data/catalog'
import { muscleLoad, SETS_TARGET_MIN, SETS_TARGET_MAX, type MuscleLoad } from '../lib/stats'
import { cx } from '../lib/util'
import { haptic } from '../lib/haptics'
import type { CustomExerciseRow, SetRow } from '../lib/types'

const WINDOWS: { weeks: number; label: string; caption: string }[] = [
  { weeks: 1, label: 'Week', caption: 'so far this week' },
  { weeks: 4, label: '4wk', caption: 'average over the last 4 complete weeks' },
  { weeks: 12, label: '12wk', caption: 'average over the last 12 complete weeks' },
]

/** cardio has no muscle group of its own, so it has no set target */
const TRACKED = CATALOG.filter((c) => c.key !== 'cardio')

/**
 * Hard sets per muscle group per week, against the 10–20 band.
 *
 * This is the number that actually tracks hypertrophy — total tonnage does not — and it
 * is the one thing the app can tell you that a paper logbook cannot. Hevy shows the same
 * metric but no target range, so the band is the part worth having.
 */
export function SetsPerMuscle({ sets, custom }: { sets: SetRow[]; custom: CustomExerciseRow[] }) {
  const [weeks, setWeeks] = useState(1)
  const win = WINDOWS.find((w) => w.weeks === weeks)!

  const rows = useMemo(
    () => muscleLoad(sets, (ex) => categoryOf(ex, custom)?.key, TRACKED.map((c) => c.key), weeks),
    [sets, custom, weeks],
  )

  // scale always shows the whole target band, even when nothing reaches it
  const max = Math.max(SETS_TARGET_MAX + 4, ...rows.map((r) => r.perWeek))
  const pct = (n: number) => `${Math.min(100, (n / max) * 100)}%`

  const under = rows.filter((r) => r.status === 'under').length
  const onTarget = rows.filter((r) => r.status === 'onTarget').length

  return (
    <section className="card p-4">
      <div className="flex items-center gap-2.5">
        <p className="flex-1 truncate font-heading text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
          Hard sets per muscle
        </p>
        <div className="flex rounded-xl border border-line2 p-0.5" role="tablist">
          {WINDOWS.map((w) => (
            <button
              key={w.weeks}
              role="tab"
              aria-selected={w.weeks === weeks}
              onClick={() => { haptic.select(); setWeeks(w.weeks) }}
              className={cx(
                'min-h-[28px] rounded-lg px-2.5 text-[10px] font-bold transition',
                w.weeks === weeks ? 'bg-cyan text-cyan-ink' : 'text-muted2 hover:text-ink',
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-2 text-[11px] text-muted">
        {win.caption} · target {SETS_TARGET_MIN}–{SETS_TARGET_MAX} per week
      </p>

      <div className="mt-3.5 flex flex-col gap-2.5">
        {rows.map((r) => (
          <Row key={r.category} row={r} pct={pct} max={max} />
        ))}
      </div>

      {/* a chart nobody can read still has to say what it means */}
      <p className="mt-3 text-[11px] leading-snug text-muted">
        {onTarget} of {rows.length} muscle groups in range
        {under > 0 ? `, ${under} under ${SETS_TARGET_MIN} sets` : ''}.
      </p>
    </section>
  )
}

function Row({ row, pct, max }: { row: MuscleLoad; pct: (n: number) => string; max: number }) {
  const cat = CATALOG.find((c) => c.key === row.category)
  const word = row.status === 'onTarget' ? 'in range' : row.status === 'over' ? 'above range' : 'below range'

  return (
    <div
      className="flex min-h-[26px] items-center gap-2"
      aria-label={`${cat?.title ?? row.category}: ${row.perWeek} hard sets per week, ${word}. Target ${SETS_TARGET_MIN} to ${SETS_TARGET_MAX}.`}
    >
      <CategoryThumb icon={row.category} size={16} className="shrink-0 text-muted2" />
      <span className="w-[70px] shrink-0 truncate text-[11px] font-bold text-ink2">{cat?.title ?? row.category}</span>

      <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
        {/* the target band sits behind the bar, so "enough" is a place on the axis
            rather than a number you have to remember */}
        <span
          className="absolute inset-y-0 border-x border-cyan/30 bg-cyan/[0.12]"
          style={{ left: pct(SETS_TARGET_MIN), width: `${((SETS_TARGET_MAX - SETS_TARGET_MIN) / max) * 100}%` }}
        />
        <span
          className={cx(
            'absolute inset-y-0 left-0 rounded-full',
            row.status === 'onTarget' ? 'bg-cyan' : row.status === 'over' ? 'bg-warn' : 'bg-cyan/45',
          )}
          style={{ width: pct(row.perWeek) }}
        />
      </span>

      <span className={cx('w-[30px] shrink-0 text-right text-xs font-bold', row.status === 'under' && 'text-muted')}>
        {row.perWeek}
      </span>
    </div>
  )
}
