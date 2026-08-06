/*
 * Production stand-in for verify-fixture.ts.
 *
 * metro.config.js swaps this in whenever EXPO_PUBLIC_VERIFY !== '1', so the
 * sample-data fixture is never resolved into a shipping bundle at all — not
 * even as unreachable dead code. Keep the exported shape identical to the real
 * module or the swap will break the build.
 */
import type { SessionRow, SetRow, PlanRow, ExercisePR } from './types'
import type { Bodyweight } from './db'
import type { Profile } from './auth'

export const VERIFY = false as const

export const VERIFY_PROFILE: Profile = { name: '', avatar: '', email: '' }

export const VERIFY_SESSION = null

export interface VerifyData {
  sessions: SessionRow[]
  sets: SetRow[]
  plan: PlanRow[]
  favorites: string[]
  bodyweights: Bodyweight[]
  prs: Record<string, ExercisePR>
}

/* eslint-disable @typescript-eslint/no-unused-vars */
export function verifySetPlanSlot(_day: string, _slot: number, _categoryKey: string): void {}
export function verifyClearPlanSlot(_day: string, _slot: number): void {}
export function verifyReplacePlan(_entries: { day: string; slot: number; category_key: string }[]): void {}

/** Unreachable in production — VERIFY is a literal false, so no caller runs this. */
export function buildVerifyData(): VerifyData {
  return { sessions: [], sets: [], plan: [], favorites: [], bodyweights: [], prs: {} }
}
