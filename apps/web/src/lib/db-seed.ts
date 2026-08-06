/**
 * Realistic sample data for the dev bypass, so History / Progress / PRs / the
 * heatmap have something to draw instead of eight empty states.
 *
 * Only runs under `DEV_BYPASS` when `VITE_DEV_SEED=1`, and only when the local
 * store is empty — once you log a real set it never touches your data again.
 *
 * Sessions are stamped at 20:00 **local** time on purpose: that is exactly the
 * case that used to break streaks and the heatmap, because `.toISOString()`
 * pushes an evening workout onto the next UTC day for anyone west of UTC.
 * Seeding this way means the day-bucketing fix is exercised on every load.
 */
import type { SessionRow, SetRow, PlanRow } from './types'
import type { Bodyweight } from './db'
import { DEV_USER_ID } from './dev-auth'
import { dateKey } from './util'

export const DEV_SEED: boolean = String(import.meta.env.VITE_DEV_SEED ?? '') === '1'

/**
 * Bump this whenever the generated data changes shape or content. A stored blob
 * tagged with an older version is treated as stale and regenerated, so you don't
 * have to clear site data by hand every time the sample set is tweaked.
 * Only ever discards *seeded* blobs — anything you logged yourself is untagged
 * and left alone (see db-local.read).
 */
export const SEED_VERSION = 2

export interface SeedData {
  sessions: SessionRow[]
  sets: SetRow[]
  plan: PlanRow[]
  favorites: string[]
  bodyweights: Bodyweight[]
  /** marks this blob as generated; absent on anything the user logged */
  seedVersion: number
}

/**
 * 20:00 local time, `daysAgo` days back — clamped so today's entry can never
 * land in the future if you happen to load this in the morning.
 */
function eveningOf(daysAgo: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(20, 0, 0, 0)
  const cutoff = Date.now() - 30 * 60 * 1000
  return d.getTime() > cutoff ? new Date(cutoff) : d
}

let seq = 0
const id = (p: string) => `seed-${p}-${(seq++).toString(36)}`

/** One workout: a category, its exercises, and a per-week progression step. */
interface Template {
  daysAgo: number
  key: string
  title: string
  lifts: { name: string; base: number; reps: number[]; step: number }[]
}

/*
 * A 6-week push/pull/legs block, 3 sessions a week, plus the last four days
 * consecutive so the streak badge has something to show.
 */
const WEEKS = 6
const PLAN: { key: string; title: string; lifts: Template['lifts'] }[] = [
  {
    key: 'chest',
    title: 'Chest',
    lifts: [
      { name: 'Flat Bench Press', base: 60, reps: [8, 8, 6], step: 2.5 },
      { name: 'Incline Bench Press', base: 45, reps: [10, 9, 8], step: 2.5 },
      { name: 'Pec Fly', base: 22.5, reps: [12, 12, 10], step: 1.25 },
    ],
  },
  {
    key: 'back',
    title: 'Back',
    lifts: [
      { name: 'Lat Pulldown', base: 50, reps: [10, 10, 8], step: 2.5 },
      { name: 'Seated Cable Row', base: 47.5, reps: [10, 10, 9], step: 2.5 },
      { name: 'Dumbbell Row', base: 27.5, reps: [12, 10, 10], step: 1.25 },
    ],
  },
  {
    key: 'legs',
    title: 'Legs',
    lifts: [
      { name: 'Barbell Squats', base: 80, reps: [8, 6, 5], step: 5 },
      { name: 'Dumbbell Romanian Deadlift', base: 55, reps: [10, 10, 8], step: 2.5 },
      { name: 'Leg Press', base: 120, reps: [12, 12, 10], step: 5 },
    ],
  },
]

function rpeFor(setIndex: number, total: number): number {
  // ramps up across a lift: last set is the hard one
  if (setIndex === total - 1) return 9
  if (setIndex === total - 2) return 8
  return 7
}

export function buildSeed(): SeedData {
  seq = 0
  const sessions: SessionRow[] = []
  const sets: SetRow[] = []

  /*
   * One session per day, never two. Days 0/1/2 are consecutive so the streak
   * badge has something to show; before that it settles into every-other-day,
   * which lands at a believable ~3 sessions a week.
   */
  const days = [0, 1, 2]
  for (let d = 4; d <= WEEKS * 7; d += 2) days.push(d)

  const schedule: Template[] = days.map((daysAgo, i) => {
    const p = PLAN[i % PLAN.length]
    return { daysAgo, key: p.key, title: p.title, lifts: p.lifts }
  })

  for (const s of schedule) {
    const start = eveningOf(s.daysAgo)
    const weeksBack = Math.floor(s.daysAgo / 7)
    const startedAt = start.toISOString()
    const sessionId = id('sess')
    let volume = 0
    let count = 0
    let durationS = 0

    s.lifts.forEach((lift) => {
      // linear progression: heavier the closer to today
      const weight = Math.max(lift.step, lift.base + (WEEKS - 1 - weeksBack) * lift.step)
      lift.reps.forEach((reps, si) => {
        const performed = new Date(start.getTime() + durationS * 1000)
        durationS += 210 // ~3.5 min per set including rest
        volume += weight * reps
        count++
        sets.push({
          id: id('set'),
          session_id: sessionId,
          user_id: DEV_USER_ID,
          exercise: lift.name,
          category_key: s.key,
          set_index: si,
          weight_kg: weight,
          reps,
          is_warmup: false,
          rpe: rpeFor(si, lift.reps.length),
          duration_s: null,
          distance_m: null,
          performed_at: performed.toISOString(),
        })
      })
    })

    sessions.push({
      id: sessionId,
      user_id: DEV_USER_ID,
      category_key: s.key,
      title: s.title,
      started_at: startedAt,
      ended_at: new Date(start.getTime() + durationS * 1000).toISOString(),
      duration_s: durationS,
      note: null,
      total_volume_kg: Math.round(volume * 10) / 10,
      total_sets: count,
    })
  }

  const plan: PlanRow[] = [
    { user_id: DEV_USER_ID, day: 'Monday', slot: 0, category_key: 'chest' },
    { user_id: DEV_USER_ID, day: 'Tuesday', slot: 0, category_key: 'back' },
    { user_id: DEV_USER_ID, day: 'Wednesday', slot: 0, category_key: 'legs' },
    { user_id: DEV_USER_ID, day: 'Thursday', slot: 0, category_key: 'shoulders' },
    { user_id: DEV_USER_ID, day: 'Friday', slot: 0, category_key: 'biceps' },
    { user_id: DEV_USER_ID, day: 'Friday', slot: 1, category_key: 'triceps' },
    { user_id: DEV_USER_ID, day: 'Saturday', slot: 0, category_key: 'abs' },
  ]

  // slow cut: 84 kg -> ~80.5 kg with body fat trending down
  const bodyweights: Bodyweight[] = []
  for (let i = WEEKS * 7; i >= 0; i -= 3) {
    const t = (WEEKS * 7 - i) / (WEEKS * 7)
    bodyweights.push({
      date: dateKey(eveningOf(i)),
      kg: Math.round((84 - 3.5 * t) * 10) / 10,
      bodyFat: Math.round((18.5 - 2.6 * t) * 10) / 10,
    })
  }

  return {
    sessions,
    sets,
    plan,
    favorites: ['Flat Bench Press', 'Barbell Squats', 'Lat Pulldown'],
    bodyweights,
    seedVersion: SEED_VERSION,
  }
}
