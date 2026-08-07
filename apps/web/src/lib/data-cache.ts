/**
 * Last-known-good snapshot of the signed-in user's data, so a return visit paints numbers
 * instead of skeletons while the real fetch is in flight.
 *
 * ## Why this exists
 *
 * `refresh()` fetches seven tables in parallel and nothing renders until the slowest of them
 * lands. On a cold start that is a full network round trip of grey boxes — on Train, most of
 * what was grey did not even need the data.
 *
 * This is stale-while-revalidate and nothing cleverer. The cache is read **once**, when a
 * session appears, and the live fetch always overwrites it. It is never consulted again and
 * never merged with anything, which keeps it well clear of the trap documented in HANDOFF:
 * a snapshot applied over newer local state resurrects rows that were just deleted. There is
 * no write path here at all — only the tail of a successful full refresh writes.
 *
 * ## Why it is keyed by user id
 *
 * Two accounts on one browser must never see each other's training. The stored `uid` is
 * checked against the live session before a single row is handed back, and a mismatch drops
 * the whole entry. `signOut()` clears it outright.
 *
 * ## Why the data is not sensitive to hold here
 *
 * It is the person's own training log, on their own device, in the origin that already holds
 * their session token and their in-progress workout. It contains nothing about anyone else.
 */
import type {
  SetRow,
  SessionRow,
  CustomExerciseRow,
  PlanRow,
  Bodyweight,
  TemplateRow,
  ExercisePR,
} from './types'

/**
 * Bumped whenever the shape below changes. An old entry then fails to parse into the new
 * shape and is simply ignored, which is cheaper and safer than migrating a cache whose only
 * job is to save one round trip.
 */
const KEY = 'gz_data_cache_v1'

/** Anything older than this is not worth painting; refetching is honest instead. */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

/**
 * Structurally identical to the data half of `DataValue` in app-context, but declared here
 * rather than imported from it — app-context imports this module, and importing back would
 * be a cycle.
 */
export interface Snapshot {
  sets: SetRow[]
  sessions: SessionRow[]
  favorites: string[]
  custom: CustomExerciseRow[]
  plan: PlanRow[]
  bodyweights: Bodyweight[]
  templates: TemplateRow[]
  prs: Record<string, ExercisePR>
}
interface Entry {
  uid: string
  at: number
  data: Snapshot
}

/**
 * The snapshot for this user, or null.
 *
 * Returns null rather than throwing on anything unexpected — a corrupt or half-written entry
 * must degrade to "no cache", never to a broken app. A wrong `uid`, a stale timestamp and a
 * parse failure are all the same answer: fetch it properly.
 */
export function readDataCache(uid: string): Snapshot | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const entry = JSON.parse(raw) as Entry
    if (!entry || entry.uid !== uid) return null
    if (!Number.isFinite(entry.at) || Date.now() - entry.at > MAX_AGE_MS) return null
    if (!entry.data || !Array.isArray(entry.data.sets)) return null
    return entry.data
  } catch {
    return null
  }
}

/** Called only after a complete, successful refresh — never after a partial one. */
export function writeDataCache(uid: string, data: Snapshot): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ uid, at: Date.now(), data } satisfies Entry))
  } catch {
    /* quota or private mode — the app is fully functional without it */
  }
}

export function clearDataCache(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing to do; the uid check makes a surviving entry unreadable by anyone else */
  }
}
