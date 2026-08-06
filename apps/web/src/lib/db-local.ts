/**
 * localStorage-backed stand-in for the Supabase data layer, used only when
 * `DEV_BYPASS` is on. Mirrors the exported surface of `db.ts` one-for-one so the
 * pages and contexts above it can't tell the difference.
 *
 * Timestamps are stored as UTC ISO strings exactly like Postgres returns them,
 * so day-bucketing (streaks, heatmap, volume bars) behaves identically to prod.
 */
import type { ActiveSession, SessionRow, SetRow, PlanRow, CustomExerciseRow, TemplateRow, TemplateExercise } from './types'
import type { SavedSession, Bodyweight } from './db'
import { DEV_USER_ID } from './dev-auth'
import { DEV_SEED, SEED_VERSION, buildSeed } from './db-seed'

const KEY = 'cfit:devdb'

interface LocalDb {
  sessions: SessionRow[]
  sets: SetRow[]
  plan: PlanRow[]
  custom: CustomExerciseRow[]
  templates: TemplateRow[]
  favorites: string[]
  bodyweights: Bodyweight[]
  /** set only on generated sample data; absent once you log anything yourself */
  seedVersion?: number
}

const blank = (): LocalDb => ({ sessions: [], sets: [], plan: [], custom: [], templates: [], favorites: [], bodyweights: [] })

function read(): LocalDb {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const stored = { ...blank(), ...(JSON.parse(raw) as Partial<LocalDb>) }
      // Regenerate stale sample data, but never touch a store the user has written to
      // (saveSession and friends drop seedVersion, so their data is left alone).
      const stale = DEV_SEED && stored.seedVersion != null && stored.seedVersion !== SEED_VERSION
      if (!stale) return stored
    }
    // Nothing stored yet: drop in sample data so History / Progress / the heatmap
    // have something to draw. Only happens when the store is genuinely absent, so
    // it never overwrites anything you logged. Sign out wipes the store and this
    // re-seeds on the next load; set VITE_DEV_SEED=0 to get the empty-state app.
    if (DEV_SEED) {
      const db: LocalDb = { ...blank(), ...buildSeed() }
      persist(db) // persist, not write — the seed tag has to survive
      console.warn(`[cfit] seeded dev data v${SEED_VERSION}: ${db.sessions.length} sessions, ${db.sets.length} sets`)
      return db
    }
    return blank()
  } catch {
    return blank()
  }
}

function persist(db: LocalDb): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(db))
  } catch {
    /* quota */
  }
}

/**
 * Every user-driven mutation goes through here, and it strips the seed tag —
 * once you've logged anything the blob is yours, and bumping SEED_VERSION must
 * never regenerate over it.
 */
function write(db: LocalDb): void {
  const copy: LocalDb = { ...db }
  delete copy.seedVersion
  persist(copy)
}

function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `dev-${Math.abs(Date.now() ^ (performance.now() * 1000)).toString(36)}-${(performance.now() | 0).toString(36)}`
  }
}

/* ----------------------------- sessions ----------------------------- */
export async function saveSession(s: ActiveSession, endedAt = Date.now()): Promise<SavedSession | null> {
  const db = read()
  const performedAt = new Date(endedAt).toISOString()
  const sessionId = newId()
  let volume = 0
  let count = 0
  const rows: SetRow[] = []

  s.exercises.forEach((ex) => {
    ex.sets.forEach((st, i) => {
      const reps = st.reps || 0
      const dur = st.duration_s || 0
      const dist = st.distance_m || 0
      if (reps <= 0 && dur <= 0 && dist <= 0) return // same "did any work?" rule as the real impl
      const w = st.weight || 0
      volume += w * reps
      count++
      rows.push({
        id: newId(),
        session_id: sessionId,
        user_id: DEV_USER_ID,
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

  const durationS = Math.max(0, Math.round((endedAt - s.startedAt) / 1000))
  db.sessions.unshift({
    id: sessionId,
    user_id: DEV_USER_ID,
    category_key: s.categoryKey,
    title: s.title,
    started_at: new Date(s.startedAt).toISOString(),
    ended_at: performedAt,
    duration_s: durationS,
    note: null,
    total_volume_kg: volume,
    total_sets: count,
  })
  db.sets.unshift(...rows)
  write(db)
  return { id: sessionId, volume, sets: count, durationS }
}

export async function listSessions(limit = 300): Promise<SessionRow[]> {
  return read()
    .sessions.slice()
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, limit)
}

export async function getSessionSets(sessionId: string): Promise<SetRow[]> {
  return read()
    .sets.filter((r) => r.session_id === sessionId)
    .sort((a, b) => a.set_index - b.set_index)
}

export async function deleteSession(id: string): Promise<void> {
  const db = read()
  db.sessions = db.sessions.filter((s) => s.id !== id)
  db.sets = db.sets.filter((s) => s.session_id !== id) // cascade, like the FK does in Postgres
  write(db)
}

/** Newest-first, matching the real query's ordering (buildPRs depends on it). */
export async function allSets(): Promise<SetRow[]> {
  return read()
    .sets.slice()
    .sort((a, b) => b.performed_at.localeCompare(a.performed_at))
}

/* ------------------------------- plan ------------------------------- */
export async function getPlan(): Promise<PlanRow[]> {
  return read().plan
}

export async function setPlanSlot(day: string, slot: number, categoryKey: string): Promise<void> {
  const db = read()
  db.plan = db.plan.filter((p) => !(p.day === day && p.slot === slot))
  db.plan.push({ user_id: DEV_USER_ID, day, slot, category_key: categoryKey })
  write(db)
}

export async function clearPlanSlot(day: string, slot: number): Promise<void> {
  const db = read()
  db.plan = db.plan.filter((p) => !(p.day === day && p.slot === slot))
  write(db)
}

export async function replacePlan(entries: { day: string; slot: number; category_key: string }[]): Promise<void> {
  const db = read()
  db.plan = entries.map((e) => ({ ...e, user_id: DEV_USER_ID }))
  write(db)
}

/* --------------------------- custom exercises ----------------------- */
export async function listCustom(): Promise<CustomExerciseRow[]> {
  return read().custom
}

export async function addCustom(input: {
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
}): Promise<CustomExerciseRow | null> {
  const db = read()
  const row: CustomExerciseRow = {
    id: newId(),
    user_id: DEV_USER_ID,
    category_key: input.categoryKey,
    name: input.name,
    target: input.target || null,
    form: input.form || null,
    equipment: input.equipment || null,
    secondary: input.secondary?.length ? input.secondary : null,
    tips: input.tips?.length ? input.tips : null,
    image_url: input.imageUrl || null,
    video_url: input.videoUrl || null,
    mode: input.mode ?? 'reps',
    is_public: true,
  }
  db.custom.push(row)
  write(db)
  return row
}

export async function deleteCustom(id: string): Promise<void> {
  const db = read()
  db.custom = db.custom.filter((c) => c.id !== id)
  write(db)
}

/* ------------------------------ templates --------------------------- */
export async function listTemplates(): Promise<TemplateRow[]> {
  return read().templates
}

export async function saveTemplate(categoryKey: string, title: string, exercises: TemplateExercise[]): Promise<TemplateRow | null> {
  const db = read()
  db.templates = db.templates.filter((t) => t.category_key !== categoryKey) // one template per category
  const row: TemplateRow = { id: newId(), user_id: DEV_USER_ID, category_key: categoryKey, title, exercises }
  db.templates.unshift(row)
  write(db)
  return row
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = read()
  db.templates = db.templates.filter((t) => t.id !== id)
  write(db)
}

/* ------------------------------ favorites --------------------------- */
export async function listFavorites(): Promise<string[]> {
  return read().favorites
}

export async function setFavorite(exercise: string, on: boolean): Promise<void> {
  const db = read()
  const has = db.favorites.includes(exercise)
  if (on && !has) db.favorites.push(exercise)
  if (!on && has) db.favorites = db.favorites.filter((f) => f !== exercise)
  write(db)
}

/* ---------------------------- bodyweight ---------------------------- */
export async function listBodyweights(): Promise<Bodyweight[]> {
  return read()
    .bodyweights.slice()
    .sort((a, b) => a.date.localeCompare(b.date))
}

export async function saveBodyweight(dateKey: string, kg: number, bodyFatPct?: number): Promise<boolean> {
  const db = read()
  const existing = db.bodyweights.find((b) => b.date === dateKey)
  if (existing) {
    existing.kg = kg
    // only overwrite body fat when a value was supplied — same rule as the real upsert
    if (bodyFatPct != null) existing.bodyFat = bodyFatPct
  } else {
    db.bodyweights.push({ date: dateKey, kg, bodyFat: bodyFatPct ?? null })
  }
  write(db)
  return true
}
