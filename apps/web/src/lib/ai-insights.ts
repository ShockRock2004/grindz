/**
 * AI Insights via Gemini, using the signed-in user's own key.
 *
 * Same shape as exercise-ai.ts: client calls Gemini directly with the user's key, the
 * response is advisory only, and every failure mode names something the user can fix.
 *
 * The one rule this file exists to enforce: **Gemini never sees raw rows.** Every number
 * in the payload below is already computed by lib/stats.ts / lib/insights.ts — the same
 * functions the History and Session Detail screens render from — so the model is asked to
 * explain numbers it was handed, not to add up hundreds of sets itself. An LLM doing
 * arithmetic over a long list of rows is exactly the shape of task that produces confident,
 * wrong totals; an LLM being handed "volume this week: 21,635kg, up 34% on your 4-week
 * average" and asked to comment on it is not. This is also why the payload is small: more
 * *reasoning* context per number (comparisons, trends, targets) beats more raw rows.
 */
import { getGeminiKey } from './gemini'
import { CATALOG_BY_KEY } from '../data/catalog'
import {
  weeklySeries,
  currentStreak,
  longestStreak,
  muscleLoad,
  splitByCategory,
  volumeByExercise,
  sessionEffort,
  SETS_TARGET_MIN,
  SETS_TARGET_MAX,
} from './stats'
import type { SessionRow, SetRow, ExercisePR } from './types'
import type { Bodyweight } from './db'

export const NO_KEY = 'Add your Gemini API key in Settings to generate insights.'
const BAD_KEY = "Your Gemini API key isn't working. Check it in Settings."
const GENERIC = "Couldn't generate insights. Try again in a moment."
const TIMEOUT_MS = 30_000
/**
 * Google retires Gemini model ids faster than this file gets touched: gemini-2.5-flash went
 * first, then gemini-3.6-flash shut down on 19 Nov 2026 and took AI Insights with it. Pinning
 * one id is a time bomb, so a 404 walks a short chain instead of failing: MODEL, then Google's
 * own `gemini-flash-latest` alias (hot-swapped to each new Flash release), then the newest
 * stable Flash id this key can actually see via models.list. Bump MODEL when a new stable
 * Flash ships; the chain only exists so the screen keeps working until someone does.
 */
const MODEL = 'gemini-3.8-flash'
const ALIAS = 'gemini-flash-latest'
const API = 'https://generativelanguage.googleapis.com/v1beta'
/** Whichever model last answered, so a retired MODEL costs the fallback walk once per session, not every time. */
let workingModel: string | null = null
const RECENT_SESSIONS = 8
const TOP_PRS = 12

export type InsightTone = 'good' | 'warn' | 'neutral'
export type InsightIcon = 'trophy' | 'trend' | 'flame' | 'scale' | 'alert'

export interface AIInsight {
  title: string
  body: string
  tone: InsightTone
  icon: InsightIcon
}

export interface AIInsightsResult {
  headline: string
  insights: AIInsight[]
  focus: string
}

/** Everything Gemini is given. Every field is a pre-computed aggregate — never a raw set row. */
interface InsightsPayload {
  today: string
  unit: 'kg' | 'lbs'
  totalSessionsAllTime: number
  streak: { currentDays: number; longestDays: number }
  weeklyLast12: { weekStart: string; sessions: number; sets: number; volume: number; minutes: number }[]
  muscleLoad4wk: { category: string; hardSetsPerWeek: number; status: string; targetMin: number; targetMax: number }[]
  splitLast30d: { category: string; sessions: number }[]
  recentSessions: {
    date: string
    category: string
    durationMin: number
    totalSets: number
    totalVolume: number
    avgRpe: number | null
    topExercises: { exercise: string; volume: number; topWeight: number; sets: number }[]
  }[]
  notablePRs: { exercise: string; bestWeight: number; best1rm: number; bestDate: string | null }[]
  bodyweight: { first: { date: string; value: number } | null; last: { date: string; value: number } | null; change: number | null } | null
}

/**
 * Builds the payload. Every value here comes from a function the rest of the app already
 * trusts (stats.ts) or from data already in memory via useData() — no extra fetches.
 */
export function buildInsightsPayload(input: {
  sessions: SessionRow[]
  sets: SetRow[]
  prs: Record<string, ExercisePR>
  bodyweights: Bodyweight[]
  unit: 'kg' | 'lbs'
}): InsightsPayload {
  const { sessions, sets, prs, bodyweights, unit } = input
  const categoryFor = (exercise: string) => sets.find((s) => s.exercise === exercise)?.category_key ?? undefined
  const categories = Array.from(new Set(sessions.map((s) => s.category_key)))

  const weekly = weeklySeries(sessions, 12)
  const recent = sessions.slice().sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, RECENT_SESSIONS)

  const recentSessions = recent.map((s) => {
    const rows = sets.filter((x) => x.session_id === s.id)
    const byEx = volumeByExercise(rows).slice(0, 3)
    const effort = sessionEffort(rows)
    return {
      date: s.started_at.slice(0, 10),
      category: CATALOG_BY_KEY[s.category_key]?.title ?? s.category_key,
      durationMin: Math.round((s.duration_s ?? 0) / 60),
      totalSets: s.total_sets ?? 0,
      totalVolume: Math.round(s.total_volume_kg ?? 0),
      avgRpe: effort.avgRpe,
      topExercises: byEx.map((e) => ({ exercise: e.exercise, volume: Math.round(e.volume), topWeight: e.topWeight, sets: e.sets })),
    }
  })

  const notablePRs = Object.values(prs)
    .filter((p) => p.best1rm > 0)
    .sort((a, b) => (b.bestDate ?? '').localeCompare(a.bestDate ?? ''))
    .slice(0, TOP_PRS)
    .map((p) => ({ exercise: p.exercise, bestWeight: p.bestWeight, best1rm: Math.round(p.best1rm * 10) / 10, bestDate: p.bestDate }))

  const bw = bodyweights.slice().sort((a, b) => a.date.localeCompare(b.date))
  const bodyweight =
    bw.length >= 2
      ? {
          first: { date: bw[0].date, value: bw[0].kg },
          last: { date: bw[bw.length - 1].date, value: bw[bw.length - 1].kg },
          change: Math.round((bw[bw.length - 1].kg - bw[0].kg) * 10) / 10,
        }
      : null

  return {
    today: new Date().toISOString().slice(0, 10),
    unit,
    totalSessionsAllTime: sessions.length,
    streak: { currentDays: currentStreak(sessions), longestDays: longestStreak(sessions) },
    weeklyLast12: weekly.map((w) => ({ weekStart: w.weekStart, sessions: w.sessions, sets: w.sets, volume: Math.round(w.volume), minutes: w.minutes })),
    muscleLoad4wk: muscleLoad(sets, categoryFor, categories, 4).map((m) => ({
      category: CATALOG_BY_KEY[m.category]?.title ?? m.category,
      hardSetsPerWeek: m.perWeek,
      status: m.status,
      targetMin: SETS_TARGET_MIN,
      targetMax: SETS_TARGET_MAX,
    })),
    splitLast30d: splitByCategory(sessions, 30).map((s) => ({ category: CATALOG_BY_KEY[s.key]?.title ?? s.key, sessions: s.count })),
    recentSessions,
    notablePRs,
    bodyweight,
  }
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    insights: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
          tone: { type: 'string', enum: ['good', 'warn', 'neutral'] },
          icon: { type: 'string', enum: ['trophy', 'trend', 'flame', 'scale', 'alert'] },
        },
        required: ['title', 'body', 'tone', 'icon'],
      },
    },
    focus: { type: 'string' },
  },
  required: ['headline', 'insights', 'focus'],
}

const SYSTEM_PROMPT = `You are a knowledgeable, encouraging strength-training coach reading a lifter's own training data.

You will be given pre-computed statistics — weekly volume and session counts, hard sets per muscle group against the evidence-backed 10-20/week band, recent session summaries, and personal records. Every number is already correct; do not recompute, estimate, or guess at any figure. Reference the numbers you were given directly (e.g. "up 34% on your 4-week average" rather than inventing a new percentage).

Reply with ONLY a JSON object matching the given schema.
- "headline": one sentence, the single most important takeaway from this data right now.
- "insights": 3 to 6 short observations. Each "title" is a few words, each "body" is one or two sentences, specific and grounded in the numbers given — never generic gym advice. "tone" is "good" for things going well, "warn" for something worth a lifter's attention (not alarming, just notable), "neutral" for plain observations. "icon" should fit the observation.
- "focus": one concrete, specific suggestion for what to prioritise next, based on the muscle load / split data given (e.g. an under-trained category, or acknowledging balance if nothing is under-target).

Do not give medical advice, do not discuss nutrition or supplements unless directly asked, and do not invent numbers, dates, or exercises that are not in the data provided. If the data is sparse (few sessions), say so honestly rather than overreaching.`

const str = (v: unknown, fallback = '') => (typeof v === 'string' && v.trim() ? v.trim() : fallback)
const TONES: InsightTone[] = ['good', 'warn', 'neutral']
const ICONS: InsightIcon[] = ['trophy', 'trend', 'flame', 'scale', 'alert']

function toResult(o: Record<string, unknown>): AIInsightsResult {
  const insights = Array.isArray(o.insights) ? o.insights : []
  return {
    headline: str(o.headline).slice(0, 220),
    insights: insights
      .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
      .slice(0, 6)
      .map((x) => ({
        title: str(x.title).slice(0, 60),
        body: str(x.body).slice(0, 260),
        tone: TONES.includes(x.tone as InsightTone) ? (x.tone as InsightTone) : 'neutral',
        icon: ICONS.includes(x.icon as InsightIcon) ? (x.icon as InsightIcon) : 'trend',
      }))
      .filter((x) => x.title && x.body),
    focus: str(o.focus).slice(0, 260),
  }
}

/** Newest stable plain-Flash id (`gemini-<n>-flash`) that supports generateContent, or null. */
async function discoverFlashModel(key: string): Promise<string | null> {
  try {
    const res = await fetch(`${API}/models?pageSize=1000&key=${encodeURIComponent(key)}`)
    if (!res.ok) return null
    const j = (await res.json()) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] }
    // Lite, preview, live, tts and image variants are all filtered out by the exact-shape match.
    const found = (j.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => /^models\/(gemini-(\d+)(?:\.(\d+))?-flash)$/.exec(m.name ?? ''))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => ({ id: m[1], major: Number(m[2]), minor: Number(m[3] ?? 0) }))
      .sort((a, b) => b.major - a.major || b.minor - a.minor)
    return found[0]?.id ?? null
  } catch {
    return null
  }
}

async function post(model: string, key: string, body: string): Promise<Response> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    return await fetch(`${API}/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: ctl.signal,
    })
  } catch {
    throw new Error(GENERIC)
  } finally {
    clearTimeout(timer)
  }
}

/** One request to Gemini, plus the retired-model fallback walk described above MODEL. */
export async function generateInsights(payload: InsightsPayload): Promise<AIInsightsResult> {
  const key = getGeminiKey()
  if (!key) throw new Error(NO_KEY)

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }],
    generationConfig: { temperature: 0.4, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
  })

  let model = workingModel ?? MODEL
  const tried = new Set([model])
  let res = await post(model, key, body)
  // 404 is how Gemini reports a retired or unknown model id. Anything else is not a model problem.
  while (res.status === 404) {
    const next = tried.has(ALIAS) ? await discoverFlashModel(key) : ALIAS
    if (!next || tried.has(next)) break
    tried.add(next)
    model = next
    res = await post(model, key, body)
  }
  if (res.ok) workingModel = model

  if (!res.ok) {
    // Gemini reports an invalid key as a 400 with reason API_KEY_INVALID, not a 401/403 —
    // check the actual reason so a genuine bad key is distinguished from any other 400
    // (e.g. a malformed request on our side), which would otherwise wrongly tell the user
    // to go check a key that was fine all along.
    const err = (await res.json().catch(() => null)) as { error?: { status?: string; message?: string } } | null
    const reason = `${err?.error?.status ?? ''} ${err?.error?.message ?? ''}`.trim()
    if (res.status === 401 || res.status === 403 || /API_KEY_INVALID|PERMISSION_DENIED|UNAUTHENTICATED/i.test(reason)) {
      throw new Error(BAD_KEY)
    }
    // Everything else (a retired model id, a malformed request, a transient 5xx) collapsed
    // into one opaque message here originally — which is exactly what hid a real model
    // deprecation (gemini-2.5-flash 404ing with "no longer available to new users") behind
    // "try again in a moment" instead of a diagnosable reason. Surface what Google actually
    // said; it costs nothing when the message is empty and saves a guessing session when it isn't.
    throw new Error(reason ? `${GENERIC} (${reason})` : GENERIC)
  }

  const j = (await res.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null
  const text = j?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error(GENERIC)

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(GENERIC)
  }

  const result = toResult(parsed)
  if (!result.headline || !result.insights.length) throw new Error(GENERIC)
  return result
}
