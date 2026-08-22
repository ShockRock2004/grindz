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
const MODEL = 'gemini-2.5-flash'
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

/** One request to Gemini. */
export async function generateInsights(payload: InsightsPayload): Promise<AIInsightsResult> {
  const key = await getGeminiKey()
  if (!key) throw new Error(NO_KEY)

  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }],
        generationConfig: { temperature: 0.4, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
      }),
      signal: ctl.signal,
    })
  } catch {
    throw new Error(GENERIC)
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    // Gemini reports an invalid key as a 400 with reason API_KEY_INVALID, not a 401/403 —
    // check the actual reason so a genuine bad key is distinguished from any other 400
    // (e.g. a malformed request on our side), which would otherwise wrongly tell the user
    // to go check a key that was fine all along.
    const body = (await res.json().catch(() => null)) as { error?: { status?: string; message?: string } } | null
    const reason = `${body?.error?.status ?? ''} ${body?.error?.message ?? ''}`
    if (res.status === 401 || res.status === 403 || /API_KEY_INVALID|PERMISSION_DENIED|UNAUTHENTICATED/i.test(reason)) {
      throw new Error(BAD_KEY)
    }
    throw new Error(GENERIC)
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
