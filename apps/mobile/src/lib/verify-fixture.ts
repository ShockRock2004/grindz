import type { Session } from '@supabase/supabase-js'
import type { SessionRow, SetRow, PlanRow, ExercisePR } from './types'
import type { Bodyweight } from './db'
import type { Profile } from './auth'
import { buildPRs } from './stats'

/**
 * VERIFICATION ONLY — not part of the product.
 *
 * The emulator this was verified on has no working NAT, and Google sign-in needs
 * real credentials, so there is no way to reach the signed-in screens through the
 * real auth path in CI/offline. Setting EXPO_PUBLIC_VERIFY=1 injects a stub
 * session plus sample rows so every screen can be screenshotted and compared
 * against the web app.
 *
 * Gated on an env var that is absent from .env, so a normal build can't enable it.
 * Nothing here is persisted — it lives in memory for the run only.
 */
export const VERIFY: boolean = process.env.EXPO_PUBLIC_VERIFY === '1'

export const VERIFY_PROFILE: Profile = { name: 'Verify User', avatar: '', email: 'verify@local' }

export const VERIFY_SESSION = {
  access_token: 'verify', refresh_token: 'verify', token_type: 'bearer',
  expires_in: 3600, expires_at: 4102444800,
  user: { id: '00000000-0000-4000-8000-0000000verif', aud: 'authenticated', role: 'authenticated', email: VERIFY_PROFILE.email, app_metadata: {}, user_metadata: {}, created_at: new Date(0).toISOString() },
} as unknown as Session

const UID = '00000000-0000-4000-8000-0000000verif'

/** 20:00 local, `daysAgo` back — the case that used to break day-bucketing. */
function evening(daysAgo: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(20, 0, 0, 0)
  const cutoff = Date.now() - 30 * 60 * 1000
  return d.getTime() > cutoff ? new Date(cutoff) : d
}

const PLANS = [
  { key: 'chest', title: 'Chest', lifts: [
    { name: 'Flat Bench Press', base: 60, reps: [8, 8, 6], step: 2.5 },
    { name: 'Incline Bench Press', base: 45, reps: [10, 9, 8], step: 2.5 },
    { name: 'Pec Fly', base: 22.5, reps: [12, 12, 10], step: 1.25 },
  ] },
  { key: 'back', title: 'Back', lifts: [
    { name: 'Lat Pulldown', base: 50, reps: [10, 10, 8], step: 2.5 },
    { name: 'Seated Cable Row', base: 47.5, reps: [10, 10, 9], step: 2.5 },
    { name: 'Dumbbell Row', base: 27.5, reps: [12, 10, 10], step: 1.25 },
  ] },
  { key: 'legs', title: 'Legs', lifts: [
    { name: 'Barbell Squats', base: 80, reps: [8, 6, 5], step: 5 },
    { name: 'Dumbbell Romanian Deadlift', base: 55, reps: [10, 10, 8], step: 2.5 },
    { name: 'Leg Press', base: 120, reps: [12, 12, 10], step: 5 },
  ] },
]

let seq = 0
const id = (p: string) => `vf-${p}-${(seq++).toString(36)}`

export interface VerifyData {
  sessions: SessionRow[]
  sets: SetRow[]
  plan: PlanRow[]
  favorites: string[]
  bodyweights: Bodyweight[]
  prs: Record<string, ExercisePR>
}

/**
 * VERIFY runs have no network, so plan writes cannot round-trip through Supabase.
 * Edits are held here instead, letting a verification build show that assigning a
 * slot actually took effect. Production never reaches this - VERIFY is false and
 * metro.config.js swaps this whole module for its stub.
 */
let planOverride: PlanRow[] | null = null

export function verifySetPlanSlot(day: string, slot: number, categoryKey: string): void {
  const base = planOverride ?? buildVerifyData().plan
  planOverride = [...base.filter((p) => !(p.day === day && p.slot === slot)), { user_id: UID, day, slot, category_key: categoryKey }]
}

export function verifyClearPlanSlot(day: string, slot: number): void {
  const base = planOverride ?? buildVerifyData().plan
  planOverride = base.filter((p) => !(p.day === day && p.slot === slot))
}

export function verifyReplacePlan(entries: { day: string; slot: number; category_key: string }[]): void {
  planOverride = entries.map((e) => ({ user_id: UID, day: e.day, slot: e.slot, category_key: e.category_key }))
}

export function buildVerifyData(): VerifyData {
  seq = 0
  const sessions: SessionRow[] = []
  const sets: SetRow[] = []
  const WEEKS = 6

  const days = [0, 1, 2]
  for (let d = 4; d <= WEEKS * 7; d += 2) days.push(d)

  days.forEach((daysAgo, i) => {
    const p = PLANS[i % PLANS.length]
    const start = evening(daysAgo)
    const weeksBack = Math.floor(daysAgo / 7)
    const sid = id('s')
    let volume = 0, count = 0, durationS = 0

    p.lifts.forEach((lift) => {
      const weight = Math.max(lift.step, lift.base + (WEEKS - 1 - weeksBack) * lift.step)
      lift.reps.forEach((reps, si) => {
        const performed = new Date(start.getTime() + durationS * 1000)
        durationS += 210
        volume += weight * reps
        count++
        sets.push({
          id: id('x'), session_id: sid, user_id: UID, exercise: lift.name, category_key: p.key,
          set_index: si, weight_kg: weight, reps, is_warmup: false,
          rpe: si === lift.reps.length - 1 ? 9 : si === lift.reps.length - 2 ? 8 : 7,
          duration_s: null, distance_m: null, performed_at: performed.toISOString(),
        })
      })
    })

    sessions.push({
      id: sid, user_id: UID, category_key: p.key, title: p.title,
      started_at: start.toISOString(), ended_at: new Date(start.getTime() + durationS * 1000).toISOString(),
      duration_s: durationS, note: null,
      total_volume_kg: Math.round(volume * 10) / 10, total_sets: count,
    })
  })

  const plan: PlanRow[] = planOverride ?? [
    { user_id: UID, day: 'Monday', slot: 1, category_key: 'chest' },
    { user_id: UID, day: 'Tuesday', slot: 1, category_key: 'back' },
    { user_id: UID, day: 'Wednesday', slot: 1, category_key: 'legs' },
    { user_id: UID, day: 'Thursday', slot: 1, category_key: 'shoulders' },
    { user_id: UID, day: 'Friday', slot: 1, category_key: 'biceps' },
    { user_id: UID, day: 'Friday', slot: 2, category_key: 'triceps' },
    { user_id: UID, day: 'Saturday', slot: 1, category_key: 'abs' },
  ]

  const bodyweights: Bodyweight[] = []
  for (let i = WEEKS * 7; i >= 0; i -= 3) {
    const t = (WEEKS * 7 - i) / (WEEKS * 7)
    const d = evening(i)
    bodyweights.push({
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      kg: Math.round((84 - 3.5 * t) * 10) / 10,
      bodyFat: Math.round((18.5 - 2.6 * t) * 10) / 10,
    })
  }

  return {
    sessions, sets, plan,
    favorites: ['Flat Bench Press', 'Barbell Squats', 'Lat Pulldown'],
    bodyweights,
    prs: buildPRs(sets),
  }
}
