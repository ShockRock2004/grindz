export type IconKey =
  | 'chest'
  | 'triceps'
  | 'back'
  | 'biceps'
  | 'shoulders'
  | 'legs'
  | 'abs'
  | 'cardio'

export interface Exercise {
  /** user-supplied photo for a custom exercise (built-ins use `img`) */
  imageUri?: string
  name: string
  /** image filename within /assets/images/<categoryKey>/ ; empty for custom */
  img: string
  form: string
  target: string
  /** logging mode; defaults to 'reps' when omitted */
  mode?: 'reps' | 'timed' | 'distance'
  /** present for user-added exercises (row id) */
  customId?: string
  /** YouTube demo attached by whoever added the exercise */
  videoUrl?: string
  /** three coaching pointers from the AI check */
  tips?: string[]
}

export interface Category {
  key: string
  title: string
  subtitle: string
  icon: IconKey
  exercises: Exercise[]
}

/** one logged set inside an in-progress session */
export interface SetEntry {
  weight: number
  reps: number
  done: boolean
  warmup?: boolean
  /** rate of perceived exertion, 6-10; captured when the set is marked done */
  rpe?: number
  /** seconds held - used by timed-mode exercises */
  duration_s?: number
  /** meters covered - used by distance-mode exercises */
  distance_m?: number
}

/** an exercise being worked in the active session */
export interface SessionExercise {
  exercise: string
  sets: SetEntry[]
  note?: string
  /**
   * The muscle category this exercise belongs to.
   *
   * A session can now span several categories, and its own `categoryKey` is then 'mixed'.
   * Every set used to inherit the session's key, so in a mixed session every set would be
   * filed under 'mixed' and the muscle heat map, the per-category hard-set counts and the
   * progress charts would all lose the only field they group by. The set keeps the truth
   * about which muscle it trained; the session keeps the truth about what it was.
   *
   * Undefined on sessions created before this existed — `saveSession` falls back to the
   * session's key, which is correct for the single-category sessions those all were.
   */
  categoryKey?: string
  /**
   * Per-session override of the catalog's logging mode. Abs work is the case
   * that needs it — a plank is timed, crunches are reps, and plenty of people
   * do either for the same movement — so those exercises expose a reps/time
   * toggle. Undefined = use the catalog default.
   */
  mode?: 'reps' | 'timed' | 'distance'
  /**
   * Superset group id. Every exercise in the same chain carries the same id, so
   * membership must be tested with `!== undefined` — `0` is a valid group.
   * undefined = standalone.
   */
  ss?: number
}

/** the whole live session, mirrored to localStorage until saved */
export interface ActiveSession {
  categoryKey: string
  title: string
  startedAt: number
  exercises: SessionExercise[]
}

/* ---- DB rows ---- */
export interface SessionRow {
  id: string
  user_id: string
  category_key: string
  title: string | null
  started_at: string
  ended_at: string | null
  duration_s: number | null
  note: string | null
  total_volume_kg: number | null
  total_sets: number | null
}

export interface SetRow {
  id: string
  session_id: string
  user_id: string
  exercise: string
  category_key: string | null
  set_index: number
  weight_kg: number
  reps: number
  is_warmup: boolean
  rpe: number | null
  duration_s: number | null
  distance_m: number | null
  performed_at: string
}

export interface PlanRow {
  user_id: string
  day: string
  slot: number
  category_key: string
}

export interface CustomExerciseRow {
  id: string
  user_id: string
  category_key: string
  name: string
  target: string | null
  form: string | null
  /** how it is logged — absent on rows created before the column existed */
  mode?: 'reps' | 'timed' | 'distance' | null
  /**
   * Public URL of the user's photo in the `exercise-images` Supabase Storage bucket.
   * Older rows may hold a `data:` URI — that is what this used to store, and why it stopped:
   * a 1-2 MB string in a text column bloats every read and is re-sent to every user the
   * exercise is shared with.
   */
  image_url?: string | null
  /** a YouTube link the author attached as a demo */
  video_url?: string | null
  /** three coaching pointers, so a custom entry reads like a built-in one */
  tips?: string[] | null
  secondary?: string[] | null
  equipment?: string | null
  /** visible to every signed-in user, not just its author */
  is_public?: boolean | null
}

/** one exercise inside a saved workout template */
export interface TemplateExercise {
  name: string
  sets_count: number
  last_weight: number
  last_reps: number
}

export interface TemplateRow {
  id: string
  user_id: string
  category_key: string
  title: string
  exercises: TemplateExercise[]
}

/** best-ever marks for an exercise, computed from set history */
export interface ExercisePR {
  exercise: string
  bestWeight: number
  bestReps: number
  best1rm: number
  bestVolume: number
  lastWeight: number
  lastReps: number
  lastDate: string | null
  /** when the heaviest set was actually performed — not the same as lastDate */
  bestDate: string | null
}
