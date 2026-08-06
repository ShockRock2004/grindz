import { supabase } from './supabase'
import { VERIFY, buildVerifyData, verifySetPlanSlot, verifyClearPlanSlot, verifyReplacePlan } from './verify-fixture'
import type { ActiveSession, SessionRow, SetRow, PlanRow, CustomExerciseRow, TemplateRow, TemplateExercise } from './types'

/*
 * ===== SCHEMA ===========================================================
 * Every table and column this file touches is defined in one place:
 *
 *   supabase/migrations/0001_init.sql
 *
 * Paste that into the Supabase SQL editor when standing up a project. It is
 * idempotent, so re-running it is safe.
 *
 * The retry/degrade paths below stay regardless: if a column is missing on a
 * project that has drifted from the migration, an insert fails and the workout
 * must be kept on-device rather than silently lost.
 * ========================================================================
 */

export async function uid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

/* ----------------------------- sessions ----------------------------- */
export interface SavedSession {
  id: string
  volume: number
  sets: number
  durationS: number
}

/** Persist a finished session + its sets. Only sets that recorded real work are kept. */
export async function saveSession(s: ActiveSession, endedAt = Date.now()): Promise<SavedSession | null> {
  const user = await uid()
  if (!user) return null

  const performedAt = new Date(endedAt).toISOString()
  const setRows: Omit<SetRow, 'id' | 'session_id'>[] = []
  let volume = 0
  let count = 0
  s.exercises.forEach((ex) => {
    ex.sets.forEach((st, i) => {
      const reps = st.reps || 0
      const dur = st.duration_s || 0
      const dist = st.distance_m || 0
      if (reps <= 0 && dur <= 0 && dist <= 0) return
      const w = st.weight || 0
      volume += w * reps
      count++
      setRows.push({
        user_id: user,
        exercise: ex.exercise,
        category_key: s.categoryKey,
        set_index: i,
        weight_kg: w,
        reps,
        is_warmup: !!st.warmup,
        rpe: st.rpe ?? null,
        duration_s: st.duration_s ?? null,
        distance_m: st.distance_m ?? null,
        performed_at: performedAt,
      })
    })
  })

  /*
    * Duration is wall-clock, so a session left open overnight recorded hours of
    * "training" and inflated every weekly minutes figure that used it. No gym session
    * runs past four hours; beyond that the session was abandoned, not performed.
    */
  const MAX_SESSION_S = 4 * 60 * 60
  const wallClock = Math.max(0, Math.round((endedAt - s.startedAt) / 1000))
  const durationS = Math.min(wallClock, MAX_SESSION_S)
  const { data: sess, error } = await supabase
    .from('workout_sessions')
    .insert({
      user_id: user,
      category_key: s.categoryKey,
      title: s.title,
      started_at: new Date(s.startedAt).toISOString(),
      ended_at: performedAt,
      duration_s: durationS,
      total_volume_kg: volume,
      total_sets: count,
    })
    .select('id')
    .single()
  if (error || !sess) {
    console.warn('[grindz] saveSession failed', error)
    return null
  }

  if (setRows.length) {
    const rows = setRows.map((r) => ({ ...r, session_id: sess.id }))
    const { error: setErr } = await supabase.from('workout_sets').insert(rows)
    if (setErr) {
      // rpe / duration_s / distance_m may not exist yet — retry with core columns
      console.warn('[grindz] set insert failed, retrying without new columns', setErr)
      const core = rows.map(({ rpe, duration_s, distance_m, ...rest }) => rest)
      const { error: retryErr } = await supabase.from('workout_sets').insert(core)
      if (retryErr) {
        // Both attempts failed. The parent row landed but carries no sets, so
        // reporting success would clear the on-device copy and destroy every
        // logged set. Roll back and fail loudly.
        console.warn('[grindz] set insert retry failed — rolling back session', retryErr)
        const { error: rb } = await supabase.from('workout_sessions').delete().eq('id', sess.id)
        if (rb) console.warn('[grindz] rollback of empty session failed', rb)
        return null
      }
    }
  }
  return { id: sess.id, volume, sets: count, durationS }
}

export async function listSessions(limit = 300): Promise<SessionRow[]> {
  const user = await uid()
  if (!user) return []
  const { data } = await supabase
    .from('workout_sessions')
    .select('*')
    .eq('user_id', user)
    .order('started_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as SessionRow[]
}

export async function getSessionSets(sessionId: string): Promise<SetRow[]> {
  // VERIFICATION ONLY - stripped from production builds (EXPO_PUBLIC_VERIFY unset there)
  if (VERIFY) return buildVerifyData().sets.filter((r) => r.session_id === sessionId)
  const { data } = await supabase.from('workout_sets').select('*').eq('session_id', sessionId).order('set_index')
  return (data ?? []) as SetRow[]
}

export async function deleteSession(id: string): Promise<void> {
  await supabase.from('workout_sessions').delete().eq('id', id)
}

/** Every set the user has logged (progression memory, PRs, charts). */
export async function allSets(): Promise<SetRow[]> {
  const user = await uid()
  if (!user) return []
  const { data } = await supabase
    .from('workout_sets')
    .select('*')
    .eq('user_id', user)
    .order('performed_at', { ascending: false })
  return (data ?? []) as SetRow[]
}

/* ------------------------------- plan ------------------------------- */
export async function getPlan(): Promise<PlanRow[]> {
  const user = await uid()
  if (!user) return []
  const { data } = await supabase.from('workout_plan').select('*').eq('user_id', user)
  return (data ?? []) as PlanRow[]
}

export async function setPlanSlot(day: string, slot: number, categoryKey: string): Promise<void> {
  if (VERIFY) return verifySetPlanSlot(day, slot, categoryKey)
  const user = await uid()
  if (!user) return
  await supabase.from('workout_plan').upsert(
    { user_id: user, day, slot, category_key: categoryKey, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,day,slot' },
  )
}

export async function clearPlanSlot(day: string, slot: number): Promise<void> {
  if (VERIFY) return verifyClearPlanSlot(day, slot)
  const user = await uid()
  if (!user) return
  await supabase.from('workout_plan').delete().eq('user_id', user).eq('day', day).eq('slot', slot)
}

/**
 * Swap the whole week in one go.
 *
 * This wipes every plan row before writing the new ones, so a failed insert used
 * to leave the user with no plan at all — the same trap saveSession guards against.
 * The old rows are snapshotted first and put back if the insert fails.
 *
 * @returns true when the new plan is stored, false when nothing changed.
 */
export async function replacePlan(entries: { day: string; slot: number; category_key: string }[]): Promise<boolean> {
  if (VERIFY) { verifyReplacePlan(entries); return true }
  const user = await uid()
  if (!user) return false

  const { data: prev, error: readErr } = await supabase.from('workout_plan').select('*').eq('user_id', user)
  if (readErr) {
    console.warn('[grindz] replacePlan: could not snapshot the current plan, refusing to wipe it', readErr)
    return false
  }

  const { error: delErr } = await supabase.from('workout_plan').delete().eq('user_id', user)
  if (delErr) {
    console.warn('[grindz] replacePlan: delete failed', delErr)
    return false
  }
  if (!entries.length) return true

  const { error: insErr } = await supabase.from('workout_plan').insert(entries.map((e) => ({ ...e, user_id: user })))
  if (!insErr) return true

  console.warn('[grindz] replacePlan: insert failed — restoring the previous plan', insErr)
  if (prev?.length) {
    const { error: rbErr } = await supabase.from('workout_plan').insert(prev)
    if (rbErr) console.warn('[grindz] replacePlan: restore failed, plan may be empty', rbErr)
  }
  return false
}

/* --------------------------- custom exercises ----------------------- */
export async function listCustom(): Promise<CustomExerciseRow[]> {
  const user = await uid()
  if (!user) return []
  const { data } = await supabase.from('workout_custom_exercises').select('*').eq('user_id', user).order('created_at')
  return (data ?? []) as CustomExerciseRow[]
}

/**
 * Add a custom exercise.
 *
 * `mode` and `image_url` are newer columns (see the migration block at the top of
 * this file). If they don't exist yet the insert is retried without them so the
 * exercise itself is never lost — `degraded` says so, and the caller tells the
 * user rather than silently dropping their photo.
 */
export async function addCustom(
  categoryKey: string,
  name: string,
  target: string,
  form: string,
  extra?: {
    mode?: 'reps' | 'timed' | 'distance'
    imageUrl?: string
    videoUrl?: string
    secondary?: string[]
    tips?: string[]
    equipment?: string
  },
): Promise<{ row: CustomExerciseRow | null; degraded: boolean }> {
  const user = await uid()
  if (!user) return { row: null, degraded: false }

  const core = { user_id: user, category_key: categoryKey, name, target: target || null, form: form || null }
  const full = {
    ...core,
    ...(extra?.mode ? { mode: extra.mode } : {}),
    ...(extra?.imageUrl ? { image_url: extra.imageUrl } : {}),
    ...(extra?.videoUrl ? { video_url: extra.videoUrl } : {}),
    ...(extra?.secondary?.length ? { secondary: extra.secondary } : {}),
    ...(extra?.tips?.length ? { tips: extra.tips } : {}),
    ...(extra?.equipment ? { equipment: extra.equipment } : {}),
    is_public: true,
  }

  const first = await supabase.from('workout_custom_exercises').insert(full).select('*').single()
  if (!first.error) return { row: first.data as CustomExerciseRow, degraded: false }

  // the new columns may not exist on this project yet — keep the exercise
  console.warn('[grindz] addCustom: retrying without mode/image columns', first.error)
  const retry = await supabase.from('workout_custom_exercises').insert(core).select('*').single()
  if (retry.error) {
    console.warn('[grindz] addCustom failed', retry.error)
    return { row: null, degraded: false }
  }
  return { row: retry.data as CustomExerciseRow, degraded: !!(extra?.mode || extra?.imageUrl) }
}

export async function deleteCustom(id: string): Promise<void> {
  await supabase.from('workout_custom_exercises').delete().eq('id', id)
}

/* ------------------------------ templates --------------------------- */
export async function listTemplates(): Promise<TemplateRow[]> {
  const user = await uid()
  if (!user) return []
  const { data } = await supabase
    .from('workout_templates')
    .select('*')
    .eq('user_id', user)
    .order('updated_at', { ascending: false })
  return (data ?? []) as TemplateRow[]
}

export async function saveTemplate(categoryKey: string, title: string, exercises: TemplateExercise[]): Promise<TemplateRow | null> {
  const user = await uid()
  if (!user) return null
  // same delete-then-insert trap as replacePlan: keep the old row so a failed
  // insert doesn't leave the category with no template at all
  const { data: prev } = await supabase
    .from('workout_templates').select('*').eq('user_id', user).eq('category_key', categoryKey)
  await supabase.from('workout_templates').delete().eq('user_id', user).eq('category_key', categoryKey)
  const { data, error } = await supabase
    .from('workout_templates')
    .insert({ user_id: user, category_key: categoryKey, title, exercises, updated_at: new Date().toISOString() })
    .select('*')
    .single()
  if (error) {
    console.warn('[grindz] saveTemplate failed — restoring the previous template', error)
    if (prev?.length) {
      const { error: rbErr } = await supabase.from('workout_templates').insert(prev)
      if (rbErr) console.warn('[grindz] saveTemplate: restore failed', rbErr)
    }
    return null
  }
  return (data as TemplateRow) ?? null
}

export async function deleteTemplate(id: string): Promise<void> {
  await supabase.from('workout_templates').delete().eq('id', id)
}

/* ------------------------------ favorites --------------------------- */
export async function listFavorites(): Promise<string[]> {
  const user = await uid()
  if (!user) return []
  const { data } = await supabase.from('workout_favorites').select('exercise').eq('user_id', user)
  return (data ?? []).map((r) => r.exercise as string)
}

export async function setFavorite(exercise: string, on: boolean): Promise<void> {
  const user = await uid()
  if (!user) return
  if (on) await supabase.from('workout_favorites').upsert({ user_id: user, exercise }, { onConflict: 'user_id,exercise' })
  else await supabase.from('workout_favorites').delete().eq('user_id', user).eq('exercise', exercise)
}

/* ---------------------- bodyweight (shared body_metrics) ------------ */
export interface Bodyweight {
  date: string
  kg: number
  bodyFat?: number | null
}

export async function listBodyweights(): Promise<Bodyweight[]> {
  const user = await uid()
  if (!user) return []
  const { data } = await supabase
    .from('body_metrics')
    .select('measured_on, weight_kg, body_fat_pct')
    .eq('user_id', user)
    .not('weight_kg', 'is', null)
    .order('measured_on', { ascending: true })
  return ((data ?? []) as { measured_on: string; weight_kg: number; body_fat_pct: number | null }[]).map((r) => ({
    date: r.measured_on,
    kg: r.weight_kg,
    bodyFat: r.body_fat_pct,
  }))
}

/**
 * body_fat_pct is only written when a value was entered — sending null on
 * conflict would wipe a reading logged earlier the same day.
 */
export async function saveBodyweight(dateKey: string, kg: number, bodyFatPct?: number): Promise<boolean> {
  const user = await uid()
  if (!user) return false
  const row: { user_id: string; measured_on: string; weight_kg: number; body_fat_pct?: number } = {
    user_id: user,
    measured_on: dateKey,
    weight_kg: kg,
  }
  if (bodyFatPct != null) row.body_fat_pct = bodyFatPct
  const { error } = await supabase.from('body_metrics').upsert(row, { onConflict: 'user_id,measured_on' })
  return !error
}
