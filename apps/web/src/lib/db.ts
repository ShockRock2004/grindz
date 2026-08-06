import { supabase } from './supabase'
import type { ActiveSession, SessionRow, SetRow, PlanRow, CustomExerciseRow, TemplateRow, TemplateExercise } from './types'
import { DEV_BYPASS } from './dev-auth'
// localStorage stand-in used only under the dev auth bypass. `DEV_BYPASS` is a
// compile-time false in production builds, so every guard below is dead code
// there and this import is tree-shaken away. Grep DEV_BYPASS to find them all.
import * as local from './db-local'

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

/** Persist a finished session + its sets. Only sets with reps>0 are kept. */
export async function saveSession(s: ActiveSession, endedAt = Date.now()): Promise<SavedSession | null> {
  if (DEV_BYPASS) return local.saveSession(s, endedAt)
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
      // keep any set that recorded real work in its mode (reps / time / distance)
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
    console.warn('[cfit] saveSession failed', error)
    return null
  }
  if (setRows.length) {
    const rows = setRows.map((r) => ({ ...r, session_id: sess.id }))
    const { error: setErr } = await supabase.from('workout_sets').insert(rows)
    if (setErr) {
      // The rpe / duration_s / distance_m columns may not exist yet — retry with core columns only
      // so a set still saves even before the migration is run.
      console.warn('[cfit] set insert failed, retrying without new columns', setErr)
      const core = rows.map(({ rpe, duration_s, distance_m, ...rest }) => rest)
      const { error: retryErr } = await supabase.from('workout_sets').insert(core)
      if (retryErr) {
        // Both attempts failed. The parent row landed but carries no sets, so reporting
        // success here would clear the on-device copy and destroy every logged set,
        // leaving a history entry that expands to nothing. Roll the session back and
        // fail loudly so the caller keeps the workout locally.
        console.warn('[cfit] set insert retry failed — rolling back session', retryErr)
        const { error: rollbackErr } = await supabase.from('workout_sessions').delete().eq('id', sess.id)
        if (rollbackErr) console.warn('[cfit] rollback of empty session failed', rollbackErr)
        return null
      }
    }
  }
  return { id: sess.id, volume, sets: count, durationS }
}

export async function listSessions(limit = 300): Promise<SessionRow[]> {
  if (DEV_BYPASS) return local.listSessions(limit)
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
  if (DEV_BYPASS) return local.getSessionSets(sessionId)
  const { data } = await supabase.from('workout_sets').select('*').eq('session_id', sessionId).order('set_index')
  return (data ?? []) as SetRow[]
}

export async function deleteSession(id: string): Promise<void> {
  if (DEV_BYPASS) return local.deleteSession(id)
  await supabase.from('workout_sessions').delete().eq('id', id)
}

/** Every set the user has logged (for progression memory, PRs, charts). */
export async function allSets(): Promise<SetRow[]> {
  if (DEV_BYPASS) return local.allSets()
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
  if (DEV_BYPASS) return local.getPlan()
  const user = await uid()
  if (!user) return []
  const { data } = await supabase.from('workout_plan').select('*').eq('user_id', user)
  return (data ?? []) as PlanRow[]
}

export async function setPlanSlot(day: string, slot: number, categoryKey: string): Promise<void> {
  if (DEV_BYPASS) return local.setPlanSlot(day, slot, categoryKey)
  const user = await uid()
  if (!user) return
  await supabase.from('workout_plan').upsert(
    { user_id: user, day, slot, category_key: categoryKey, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,day,slot' },
  )
}

export async function clearPlanSlot(day: string, slot: number): Promise<void> {
  if (DEV_BYPASS) return local.clearPlanSlot(day, slot)
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
  if (DEV_BYPASS) { await local.replacePlan(entries); return true }
  const user = await uid()
  if (!user) return false

  const { data: prev, error: readErr } = await supabase.from('workout_plan').select('*').eq('user_id', user)
  if (readErr) {
    console.warn('[cfit] replacePlan: could not snapshot the current plan, refusing to wipe it', readErr)
    return false
  }

  const { error: delErr } = await supabase.from('workout_plan').delete().eq('user_id', user)
  if (delErr) {
    console.warn('[cfit] replacePlan: delete failed', delErr)
    return false
  }
  if (!entries.length) return true

  const { error: insErr } = await supabase.from('workout_plan').insert(entries.map((e) => ({ ...e, user_id: user })))
  if (!insErr) return true

  console.warn('[cfit] replacePlan: insert failed — restoring the previous plan', insErr)
  if (prev?.length) {
    const { error: rbErr } = await supabase.from('workout_plan').insert(prev)
    if (rbErr) console.warn('[cfit] replacePlan: restore failed, plan may be empty', rbErr)
  }
  return false
}

/* --------------------------- custom exercises ----------------------- */
/**
 * Everything a new custom exercise can carry. Only the first four are guaranteed to survive:
 * the rest need the columns from docs/SUPABASE-MIGRATION.md, and `addCustom` falls back
 * without them rather than failing the save.
 */
export interface NewCustomExercise {
  categoryKey: string
  name: string
  target: string
  form: string
  equipment?: string
  secondary?: string[]
  tips?: string[]
  imageUrl?: string | null
  videoUrl?: string | null
  mode?: 'reps' | 'timed' | 'distance'
}

/**
 * Custom exercises are shared: RLS returns every row flagged `is_public` plus your own.
 *
 * Two people can legitimately add "Zercher Squat", so the list is de-duplicated on
 * name + category with your own row winning — otherwise a popular lift would appear several
 * times in the picker. A unique constraint in the database would instead *reject* the second
 * person's save, which is worse.
 *
 * `.select('*')` means a database without the migration simply returns the old columns and
 * the extra fields come back undefined, which every consumer already treats as "not set".
 */
export async function listCustom(): Promise<CustomExerciseRow[]> {
  if (DEV_BYPASS) return local.listCustom()
  const user = await uid()
  if (!user) return []
  const { data, error } = await supabase.from('workout_custom_exercises').select('*').order('created_at')
  if (error) {
    // pre-migration the read policy is still owner-only, which is not an error worth surfacing
    const { data: mine } = await supabase.from('workout_custom_exercises').select('*').eq('user_id', user).order('created_at')
    return (mine ?? []) as CustomExerciseRow[]
  }
  const rows = (data ?? []) as CustomExerciseRow[]
  const byKey = new Map<string, CustomExerciseRow>()
  for (const r of rows) {
    const k = `${r.category_key}::${r.name.trim().toLowerCase()}`
    const seen = byKey.get(k)
    if (!seen || (r.user_id === user && seen.user_id !== user)) byKey.set(k, r)
  }
  return [...byKey.values()]
}

export async function addCustom(input: NewCustomExercise): Promise<CustomExerciseRow | null> {
  if (DEV_BYPASS) return local.addCustom(input)
  const user = await uid()
  if (!user) return null

  const legacy = {
    user_id: user,
    category_key: input.categoryKey,
    name: input.name,
    target: input.target || null,
    form: input.form || null,
  }
  const full = {
    ...legacy,
    equipment: input.equipment || null,
    secondary: input.secondary?.length ? input.secondary : null,
    tips: input.tips?.length ? input.tips : null,
    image_url: input.imageUrl || null,
    video_url: input.videoUrl || null,
    mode: input.mode ?? 'reps',
    is_public: true,
  }

  const first = await supabase.from('workout_custom_exercises').insert(full).select('*').single()
  if (!first.error) return (first.data as CustomExerciseRow) ?? null

  /*
   * PostgREST rejects the WHOLE insert if any column is unknown (PGRST204 / 42703), so before
   * the migration has been applied the rich payload fails outright. Retry with just the
   * columns that have always existed: the exercise still saves, minus the photo and tips,
   * which is far better than telling the user their exercise could not be created.
   */
  const unknownColumn = first.error.code === 'PGRST204' || first.error.code === '42703'
  if (!unknownColumn) return null
  const retry = await supabase.from('workout_custom_exercises').insert(legacy).select('*').single()
  return (retry.data as CustomExerciseRow) ?? null
}

export async function deleteCustom(id: string): Promise<void> {
  if (DEV_BYPASS) return local.deleteCustom(id)
  await supabase.from('workout_custom_exercises').delete().eq('id', id)
}

/* ------------------------------ templates --------------------------- */
export async function listTemplates(): Promise<TemplateRow[]> {
  if (DEV_BYPASS) return local.listTemplates()
  const user = await uid()
  if (!user) return []
  const { data } = await supabase
    .from('workout_templates')
    .select('*')
    .eq('user_id', user)
    .order('updated_at', { ascending: false })
  return (data ?? []) as TemplateRow[]
}

/** Save (replacing any existing template for the category) a quick-start template. */
export async function saveTemplate(categoryKey: string, title: string, exercises: TemplateExercise[]): Promise<TemplateRow | null> {
  if (DEV_BYPASS) return local.saveTemplate(categoryKey, title, exercises)
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
    console.warn('[cfit] saveTemplate failed — restoring the previous template', error)
    if (prev?.length) {
      const { error: rbErr } = await supabase.from('workout_templates').insert(prev)
      if (rbErr) console.warn('[cfit] saveTemplate: restore failed', rbErr)
    }
    return null
  }
  return (data as TemplateRow) ?? null
}

export async function deleteTemplate(id: string): Promise<void> {
  if (DEV_BYPASS) return local.deleteTemplate(id)
  await supabase.from('workout_templates').delete().eq('id', id)
}

/* ------------------------------ favorites --------------------------- */
export async function listFavorites(): Promise<string[]> {
  if (DEV_BYPASS) return local.listFavorites()
  const user = await uid()
  if (!user) return []
  const { data } = await supabase.from('workout_favorites').select('exercise').eq('user_id', user)
  return (data ?? []).map((r) => r.exercise as string)
}

export async function setFavorite(exercise: string, on: boolean): Promise<void> {
  if (DEV_BYPASS) return local.setFavorite(exercise, on)
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
  if (DEV_BYPASS) return local.listBodyweights()
  const user = await uid()
  if (!user) return []
  const { data } = await supabase
    .from('body_metrics')
    .select('measured_on, weight_kg, body_fat_pct')
    .eq('user_id', user)
    .not('weight_kg', 'is', null)
    .order('measured_on', { ascending: true })
  return ((data ?? []) as { measured_on: string; weight_kg: number; body_fat_pct: number | null }[]).map((r) => ({ date: r.measured_on, kg: r.weight_kg, bodyFat: r.body_fat_pct }))
}

/**
 * Upsert today's bodyweight. `bodyFatPct` is only written when a value was
 * actually entered — sending `null` on conflict would wipe a body-fat reading
 * logged earlier the same day (the field is collapsed by default, so re-logging
 * just the weight in the evening used to silently erase the morning's %).
 */
export async function saveBodyweight(dateKey: string, kg: number, bodyFatPct?: number): Promise<boolean> {
  if (DEV_BYPASS) return local.saveBodyweight(dateKey, kg, bodyFatPct)
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
