import type { SetRow, SessionRow, ExercisePR } from './types'
import { epley1rm, dateKey } from './util'

/**
 * Local YYYY-MM-DD for a stored timestamp.
 *
 * Timestamps are persisted as UTC ISO strings, so `iso.slice(0, 10)` is the UTC
 * day — for anyone west of UTC an evening session lands on *tomorrow*, which
 * silently broke streaks, the heatmap and the volume bars while History (which
 * parses to local time) disagreed on the same screen. Every day-bucket below
 * goes through here so the whole app agrees on what "today" means.
 */
function localDay(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : dateKey(d)
}

/** Best-ever + most-recent marks per exercise, from all logged sets. */
/**
 * Hard sets per category this week.
 *
 * Total tonnage is a vanity metric: it does not track hypertrophy, and summing
 * leg-press kilos with curl kilos is not a meaningful quantity. Hard sets per muscle
 * group is what the research uses, so it is what the app leads with.
 *
 * A "hard set" is a working set taken near failure — RPE 8+. RPE is optional in this
 * app, so a set with no RPE still counts: under-counting someone's real work would be
 * worse than including a few easy sets.
 */
export function hardSetsByCategory(
  sets: SetRow[],
  categoryFor: (exercise: string) => string | undefined,
  since = weekStart(),
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const st of sets) {
    if (new Date(st.performed_at).getTime() < since) continue
    if (st.is_warmup) continue
    if (st.rpe != null && st.rpe < 8) continue
    const c = categoryFor(st.exercise)
    if (c) out[c] = (out[c] ?? 0) + 1
  }
  return out
}

/** The evidence-backed band for hypertrophy: below 10 hard sets/week under-delivers, and
 *  returns flatten out past roughly 20. Shown behind the bars rather than as a hard rule. */
export const SETS_TARGET_MIN = 10
export const SETS_TARGET_MAX = 20

export interface MuscleLoad {
  category: string
  /** hard sets per week — a raw count for the current week, an average for longer windows */
  perWeek: number
  status: 'under' | 'onTarget' | 'over'
}

/**
 * Hard sets per muscle group per week.
 *
 * `weeks === 1` is the live count for the current, partial week, so early in the week
 * everything reads "under" — that is honest, not a bug, and the label says so.
 * Longer windows average over **completed** weeks only, excluding the partial one, so
 * the number is not dragged down by a week still in progress.
 */
export function muscleLoad(
  sets: SetRow[],
  categoryFor: (exercise: string) => string | undefined,
  categories: string[],
  weeks = 1,
): MuscleLoad[] {
  const thisWeek = weekStart()
  const from = weeks === 1 ? thisWeek : thisWeek - weeks * 7 * 86400000
  const to = weeks === 1 ? Infinity : thisWeek
  const divisor = weeks === 1 ? 1 : weeks

  const counts: Record<string, number> = {}
  for (const st of sets) {
    const t = new Date(st.performed_at).getTime()
    if (t < from || t >= to) continue
    if (st.is_warmup) continue
    if (st.rpe != null && st.rpe < 8) continue
    const c = categoryFor(st.exercise)
    if (c) counts[c] = (counts[c] ?? 0) + 1
  }

  return categories.map((category) => {
    const perWeek = Math.round(((counts[category] ?? 0) / divisor) * 10) / 10
    return {
      category,
      perWeek,
      status: perWeek < SETS_TARGET_MIN ? 'under' : perWeek > SETS_TARGET_MAX ? 'over' : 'onTarget',
    }
  })
}

export function buildPRs(sets: SetRow[]): Record<string, ExercisePR> {
  const map: Record<string, ExercisePR> = {}
  // sets arrive newest-first
  for (const s of sets) {
    const reps = s.reps || 0
    const w = s.weight_kg || 0
    if (reps <= 0) continue
    const e = map[s.exercise] ?? {
      exercise: s.exercise,
      bestWeight: 0,
      bestReps: 0,
      best1rm: 0,
      bestVolume: 0,
      lastWeight: 0,
      lastReps: 0,
      lastDate: null,
      bestDate: null,
    }
    const oneRm = epley1rm(w, reps)
    const vol = w * reps
    if (w > e.bestWeight) {
      e.bestWeight = w
      // the date the record was set, which is the interesting one on a PR board
      e.bestDate = s.performed_at
    }
    if (reps > e.bestReps) e.bestReps = reps
    if (oneRm > e.best1rm) e.best1rm = oneRm
    if (vol > e.bestVolume) e.bestVolume = vol
    if (!e.lastDate) {
      // first time we see it = most recent (newest-first order)
      e.lastDate = s.performed_at
      e.lastWeight = w
      e.lastReps = reps
    }
    map[s.exercise] = e
  }
  return map
}

/** The sets from the most recent time this exercise was performed. */
export function lastPerformance(sets: SetRow[], exercise: string): { date: string; sets: { weight: number; reps: number }[] } | null {
  const rows = sets.filter((s) => s.exercise === exercise && (s.reps || 0) > 0)
  if (!rows.length) return null
  const latestDay = localDay(rows[0].performed_at)
  const sameDay = rows.filter((s) => localDay(s.performed_at) === latestDay)
  return {
    date: rows[0].performed_at,
    sets: sameDay
      .sort((a, b) => a.set_index - b.set_index)
      .map((s) => ({ weight: s.weight_kg, reps: s.reps })),
  }
}

/** Per-day series for one exercise: top set weight, est 1RM, total volume. Oldest→newest. */
export function exerciseSeries(sets: SetRow[], exercise: string): { date: string; topWeight: number; est1rm: number; volume: number }[] {
  const byDay: Record<string, { topWeight: number; est1rm: number; volume: number }> = {}
  for (const s of sets) {
    if (s.exercise !== exercise || (s.reps || 0) <= 0) continue
    const d = localDay(s.performed_at)
    if (!d) continue
    const cur = byDay[d] ?? { topWeight: 0, est1rm: 0, volume: 0 }
    cur.topWeight = Math.max(cur.topWeight, s.weight_kg)
    cur.est1rm = Math.max(cur.est1rm, epley1rm(s.weight_kg, s.reps))
    cur.volume += s.weight_kg * s.reps
    byDay[d] = cur
  }
  return Object.entries(byDay)
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Total training volume (kg) per calendar day from sessions. */
export function volumeByDay(sessions: SessionRow[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of sessions) {
    const d = localDay(s.started_at)
    if (!d) continue
    out[d] = (out[d] ?? 0) + (s.total_volume_kg ?? 0)
  }
  return out
}

/** Consecutive-day training streak ending today or yesterday. */
export function currentStreak(sessions: SessionRow[]): number {
  const days = new Set(sessions.map((s) => localDay(s.started_at)).filter(Boolean))
  if (!days.size) return 0
  const today = new Date()
  const startOffset = days.has(dateKey(today)) ? 0 : 1 // allow streak to count if last trained yesterday
  let streak = 0
  for (let i = startOffset; ; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    if (days.has(dateKey(d))) streak++
    else break
  }
  return streak
}

/** Session count per category over the last `days`, for the split ring. */
export function splitByCategory(sessions: SessionRow[], days = 30): { key: string; count: number }[] {
  const cutoff = Date.now() - days * 86400000
  const counts: Record<string, number> = {}
  for (const s of sessions) {
    if (new Date(s.started_at).getTime() < cutoff) continue
    counts[s.category_key] = (counts[s.category_key] ?? 0) + 1
  }
  return Object.entries(counts)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
}

export interface WeekSummary {
  sessions: number
  sets: number
  volume: number
  minutes: number
}

/** Local midnight on the Monday of the current week — the same boundary History groups by. */
export function weekStart(now = new Date()): number {
  const x = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x.getTime()
}

/**
 * This week's totals, on the **calendar** week starting Monday.
 *
 * This used to be a rolling 7 days while History grouped by calendar weeks, so the
 * Home ring and the History header could disagree about the same week — three sessions
 * on Home, four under "This week" in History, with no way for the user to reconcile them.
 */
export function weekSummary(sessions: SessionRow[]): WeekSummary {
  const cutoff = weekStart()
  const recent = sessions.filter((s) => new Date(s.started_at).getTime() >= cutoff)
  return {
    sessions: recent.length,
    sets: recent.reduce((a, s) => a + (s.total_sets ?? 0), 0),
    volume: recent.reduce((a, s) => a + (s.total_volume_kg ?? 0), 0),
    minutes: Math.round(recent.reduce((a, s) => a + (s.duration_s ?? 0), 0) / 60),
  }
}

export interface WeekPoint {
  /** local YYYY-MM-DD of the Monday this point covers */
  weekStart: string
  volume: number
  sessions: number
  sets: number
  minutes: number
}

/**
 * The last `weeks` calendar weeks (Monday-start, the same boundary as `weekStart()`),
 * zero-filled and oldest→newest — so a week with no training is a real zero point on a
 * trend chart, not a gap that silently interpolates across it.
 */
export function weeklySeries(sessions: SessionRow[], weeks = 12, now = new Date()): WeekPoint[] {
  const thisWeek = weekStart(now)
  const buckets: WeekPoint[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const ms = thisWeek - i * 7 * 86400000
    buckets.push({ weekStart: dateKey(new Date(ms)), volume: 0, sessions: 0, sets: 0, minutes: 0 })
  }
  const indexByWeek = new Map(buckets.map((b, i) => [b.weekStart, i]))
  for (const s of sessions) {
    const t = new Date(s.started_at).getTime()
    if (Number.isNaN(t)) continue
    const bucketMs = weekStart(new Date(t))
    if (bucketMs < thisWeek - weeks * 7 * 86400000 || bucketMs > thisWeek) continue
    const idx = indexByWeek.get(dateKey(new Date(bucketMs)))
    if (idx == null) continue
    const b = buckets[idx]
    b.volume += s.total_volume_kg ?? 0
    b.sessions += 1
    b.sets += s.total_sets ?? 0
    b.minutes += Math.round((s.duration_s ?? 0) / 60)
  }
  return buckets
}

/**
 * Trailing mean over the last `window` values (inclusive of the current point), same
 * length as the input. Ramps in at the head rather than requiring a full window, so a
 * 4-week rolling average is still meaningful on week 2 of a user's history.
 */
export function rollingMean(values: number[], window = 4): number[] {
  const out: number[] = []
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= window) sum -= values[i - window]
    const n = Math.min(i + 1, window)
    out.push(sum / n)
  }
  return out
}

/** Working-set volume per exercise for a set of rows (e.g. one session), desc by volume. */
export function volumeByExercise(
  sets: SetRow[],
): { exercise: string; volume: number; sets: number; topWeight: number; best1rm: number }[] {
  const by: Record<string, { volume: number; sets: number; topWeight: number; best1rm: number }> = {}
  for (const s of sets) {
    if (s.is_warmup) continue
    const cur = by[s.exercise] ?? { volume: 0, sets: 0, topWeight: 0, best1rm: 0 }
    cur.volume += (s.weight_kg || 0) * (s.reps || 0)
    cur.sets += 1
    cur.topWeight = Math.max(cur.topWeight, s.weight_kg || 0)
    if ((s.reps || 0) > 0) cur.best1rm = Math.max(cur.best1rm, epley1rm(s.weight_kg || 0, s.reps))
    by[s.exercise] = cur
  }
  return Object.entries(by)
    .map(([exercise, v]) => ({ exercise, ...v }))
    .sort((a, b) => b.volume - a.volume)
}

/** Effort summary for a set of rows. `avgRpe` is null when nothing in the set was rated. */
export function sessionEffort(sets: SetRow[]): { avgRpe: number | null; hardSets: number; workingSets: number; warmupSets: number } {
  let rpeSum = 0
  let rpeCount = 0
  let hardSets = 0
  let workingSets = 0
  let warmupSets = 0
  for (const s of sets) {
    if (s.is_warmup) {
      warmupSets++
      continue
    }
    workingSets++
    if (s.rpe != null) {
      rpeSum += s.rpe
      rpeCount++
      if (s.rpe >= 8) hardSets++
    }
  }
  return { avgRpe: rpeCount ? Math.round((rpeSum / rpeCount) * 10) / 10 : null, hardSets, workingSets, warmupSets }
}

/** Longest consecutive-day training run ever — the streak tile's "best" context line. */
export function longestStreak(sessions: SessionRow[]): number {
  const days = Array.from(new Set(sessions.map((s) => localDay(s.started_at)).filter(Boolean))).sort()
  if (!days.length) return 0
  let best = 1
  let run = 1
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1])
    const cur = new Date(days[i])
    const gapDays = Math.round((cur.getTime() - prev.getTime()) / 86400000)
    run = gapDays === 1 ? run + 1 : 1
    if (run > best) best = run
  }
  return best
}

/** The most recent earlier session in the same category — de-dupes logic that used to be copy-pasted per app. */
export function previousSameCategory(sessions: SessionRow[], session: SessionRow): SessionRow | undefined {
  return sessions
    .filter((s) => s.category_key === session.category_key && s.started_at < session.started_at)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))[0]
}

/**
 * This session plus its `limit` predecessors in the same category, oldest→newest — the
 * shape a "this session vs your last few" comparison chart wants.
 */
export function categorySessionVolumes(
  sessions: SessionRow[],
  categoryKey: string,
  upToIso: string,
  limit = 5,
): { id: string; date: string; volume: number }[] {
  const priorAndSelf = sessions
    .filter((s) => s.category_key === categoryKey && s.started_at <= upToIso)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, limit + 1)
  return priorAndSelf
    .map((s) => ({ id: s.id, date: s.started_at, volume: s.total_volume_kg ?? 0 }))
    .reverse()
}
