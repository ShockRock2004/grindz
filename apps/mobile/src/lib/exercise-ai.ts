/**
 * Exercise validation via Groq, using the signed-in user's own key.
 *
 * Same endpoint, same model, same
 * "only name the failure the user can fix" error policy — so the two apps behave
 * identically when a key is missing or rejected.
 *
 * Validation is advisory. The user can always save what they typed; this exists
 * to catch typos, put the exercise in the right muscle group, and write a form
 * cue so a custom exercise looks like a built-in one.
 */
import { getGroqKey } from './groq'
import { CATALOG } from '../data/catalog'

export const NO_KEY = 'Add your Groq API key in Settings to check exercises.'
const BAD_KEY = "Your Groq API key isn't working. Check it in Settings."
const GENERIC = "Couldn't check that exercise. You can still save it."
const TIMEOUT_MS = 30_000
const MODEL = 'llama-3.3-70b-versatile'

/*
 * Length floors for the generated coaching text, measured from the 34 built-in form cues and
 * their tips rather than picked by feel: cues run 30-58 characters (median 36) and tips 45-68.
 * Left to itself the model returns things like "Keep your back straight" — grammatical,
 * useless, and visibly thinner than the catalogue entry beside it on the same screen.
 */
const MIN_CUE = 30
const MAX_CUE = 90
const MIN_TIP = 45
const MAX_TIP = 120
const WANT_TIPS = 3

export interface ExerciseDraft {
  name: string
  categoryKey: string
  equipment: string
  secondary: string[]
  mode: 'reps' | 'timed' | 'distance'
}

export interface Verdict {
  /** false when the model doesn't recognise this as a real exercise */
  recognised: boolean
  /** tidied name, e.g. "incline db press" -> "Incline Dumbbell Press" */
  canonicalName: string
  /** category key it belongs in, if the user picked the wrong one */
  categoryKey: string
  /** muscles worked beyond the primary group */
  secondary: string[]
  /** one-line coaching cue, in the voice of the built-in catalogue */
  formCue: string
  /**
   * Exactly three short "do this better" pointers, so a custom exercise carries the same
   * coaching detail as a built-in catalogue entry instead of looking bare beside one.
   */
  tips: string[]
  /** things worth telling the user before they save */
  notes: string[]
}

const KEYS = CATALOG.map((c) => c.key).join(', ')

const PROMPT = `You are a strength-training reference. You are given a user's draft of a custom gym exercise.

Reply with ONLY a JSON object, no prose, with exactly these keys:
{"recognised": boolean, "canonical_name": string, "category_key": string, "secondary": string[], "form_cue": string, "tips": string[], "notes": string[]}

- "recognised": true if this is a real, sensible resistance or cardio exercise. false for nonsense, joke entries, or something that isn't an exercise.
- "canonical_name": the standard gym name, properly capitalised. Fix typos and expand abbreviations (db -> Dumbbell, bb -> Barbell, ohp -> Overhead Press).
- "category_key": the single primary muscle group, chosen from exactly this list: ${KEYS}
- "secondary": up to 3 other muscles worked, plain words like "Triceps", "Front Delts", "Core". Empty array if none.
- "form_cue": ONE imperative sentence of technique, between 30 and 90 characters. It must name a specific body part or position — not generic advice. GOOD: "Keep elbows at 45 degrees and drive up efficiently." TOO SHORT/VAGUE: "Keep good form.", "Go slow.", "Squeeze."
- "tips": EXACTLY 3 coaching pointers that would improve the lift. Each MUST be between 45 and 120 characters — a full, specific instruction, not a fragment. Cover three different things: setup, execution, and a common mistake to avoid. Each must mention something concrete (a joint, an angle, a tempo, a cue). GOOD: "Set the bench near 30 degrees — steeper shifts the load onto the front delts." TOO SHORT: "Keep your core tight.", "Do not bounce."
- "notes": up to 2 short warnings ONLY if something is actually wrong — a misspelling you corrected, a wrong muscle group, or a safety caveat. Empty array if the draft was fine.`

function extractJson(text: string): Record<string, unknown> {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error(GENERIC)
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    throw new Error(GENERIC)
  }
}

const str = (v: unknown, fallback = '') => (typeof v === 'string' && v.trim() ? v.trim() : fallback)

function toVerdict(o: Record<string, unknown>, draft: ExerciseDraft): Verdict {
  const cat = str(o.category_key).toLowerCase()
  return {
    recognised: o.recognised !== false,
    canonicalName: str(o.canonical_name, draft.name).slice(0, 60),
    // never let the model invent a category that isn't in the catalogue
    categoryKey: CATALOG.some((c) => c.key === cat) ? cat : draft.categoryKey,
    secondary: Array.isArray(o.secondary)
      ? o.secondary.filter((x): x is string => typeof x === 'string' && !!x.trim()).slice(0, 3).map((x) => x.trim())
      : [],
    formCue: str(o.form_cue).slice(0, MAX_CUE),
    tips: Array.isArray(o.tips)
      ? o.tips.filter((x): x is string => typeof x === 'string' && !!x.trim()).slice(0, WANT_TIPS).map((x) => x.trim().slice(0, MAX_TIP))
      : [],
    notes: Array.isArray(o.notes)
      ? o.notes.filter((x): x is string => typeof x === 'string' && !!x.trim()).slice(0, 2).map((x) => x.trim())
      : [],
  }
}

/** Ask Groq to sanity-check a draft. Throws with a user-facing message on failure. */
/**
 * What is too thin to sit beside a built-in exercise, as a sentence the model can act on.
 * Returns null when the verdict is good enough.
 */
function shortfall(v: Verdict): string | null {
  const problems: string[] = []
  if (v.formCue.length < MIN_CUE) {
    problems.push(`form_cue was only ${v.formCue.length} characters ("${v.formCue}") — it must be at least ${MIN_CUE}`)
  }
  if (v.tips.length < WANT_TIPS) {
    problems.push(`you returned ${v.tips.length} tips — there must be exactly ${WANT_TIPS}`)
  }
  const thin = v.tips.filter((t) => t.length < MIN_TIP)
  if (thin.length) {
    problems.push(`these tips are too short (minimum ${MIN_TIP} characters): ${thin.map((t) => `"${t}" (${t.length})`).join(', ')}`)
  }
  return problems.length ? problems.join('; ') : null
}

/** One request to Groq. Shared by the first attempt and the corrective retry. */
async function askGroq(
  key: string,
  draft: ExerciseDraft,
  opts: { temperature?: number; extra?: string } = {},
): Promise<Record<string, unknown>> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: opts.temperature ?? 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: PROMPT },
          {
            role: 'user',
            content: `Exercise: ${draft.name}
Primary group the user picked: ${draft.categoryKey}
Equipment: ${draft.equipment || 'unspecified'}
Logged as: ${draft.mode}${opts.extra ? `

${opts.extra}` : ''}`,
          },
        ],
      }),
      signal: ctl.signal,
    })
  } catch {
    throw new Error(GENERIC)
  } finally {
    clearTimeout(timer)
  }

  if (res.status === 401 || res.status === 403) throw new Error(BAD_KEY)
  if (!res.ok) throw new Error(GENERIC)

  const j = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null
  return extractJson(j?.choices?.[0]?.message?.content ?? '')
}

/** Ask Groq to sanity-check a draft. Throws with a user-facing message on failure. */
export async function validateExercise(draft: ExerciseDraft): Promise<Verdict> {
  const key = await getGroqKey()
  if (!key) throw new Error(NO_KEY)

  const first = toVerdict(await askGroq(key, draft), draft)

  /*
   * One corrective retry when the coaching text comes back thinner than the catalogue.
   * Quoting the model's own too-short output back with its measured character count works far
   * better than restating the rule, and a higher temperature stops it repeating itself.
   * Exactly one retry, and the original is kept if the second is no better — this is advisory,
   * so a thin cue must never block someone from saving their exercise.
   */
  const missing = shortfall(first)
  if (!missing) return first

  const retry = await askGroq(key, draft, {
    temperature: 0.5,
    extra: `Your previous answer did not meet the length requirements: ${missing}. Rewrite ALL of form_cue and tips so every one is specific and long enough. Do not pad with filler — add real technical detail (a joint angle, a tempo, a bar path, a common failure).`,
  }).catch(() => null)
  if (!retry) return first

  const second = toVerdict(retry, draft)
  return shortfall(second) && !shortfall(first) ? first : second
}

/** Cheap round-trip to confirm a pasted key actually works before we store it. */
export async function testGroqKey(key: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${key.trim()}` },
    })
    return res.ok
  } catch {
    return false
  }
}
