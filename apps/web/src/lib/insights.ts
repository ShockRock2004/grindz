import type { SessionRow, SetRow, ExercisePR } from './types'
import { volumeByExercise, sessionEffort, type WeekPoint } from './stats'

/**
 * Plain-English summaries of what the numbers on History and Session Detail already show.
 *
 * This file is parity-locked (see scripts/check-parity.mjs) — the sentence a user reads on
 * the phone must be the same sentence they'd read on the web for the same data. Drift here
 * is worse than drift in a chart: a chart disagreeing with itself is a rendering bug, two
 * apps telling a user different things about the same workout is a trust bug.
 *
 * Deliberately does NOT import from `lib/util.ts` — that file is not parity-locked, and
 * coupling a locked file to an unlocked one is how this check starts failing for reasons
 * that have nothing to do with insights. Callers pass a `fmt` function for unit-aware
 * weight formatting instead.
 */

export type InsightTone = 'good' | 'warn' | 'neutral'
export type InsightIcon = 'trophy' | 'trend' | 'flame' | 'scale' | 'alert'

export interface Insight {
  id: string
  icon: InsightIcon
  tone: InsightTone
  text: string
  value?: string
}

/** Percent change from `from` to `to`, or null when `from` is not a usable baseline. */
function pctChange(from: number, to: number): number | null {
  if (!(from > 0)) return null
  return ((to - from) / from) * 100
}

/**
 * Insights for a single completed session, ranked most-interesting-first, capped at 3.
 *
 * Every insight is gated on materiality — a 2% swing is noise, not news — and, where it
 * compares to history, on having enough history to compare against. An insight that fires
 * on nothing is worse than no insight: it teaches the user to stop reading them.
 */
export function sessionInsights(input: {
  session: SessionRow
  rows: SetRow[]
  allSets: SetRow[]
  prs: Record<string, ExercisePR>
  previous?: SessionRow
  fmt: (kg: number) => string
}): Insight[] {
  const { session, rows, prs, previous, fmt } = input
  const out: Insight[] = []

  // PR count — the single most motivating thing a session can report, so it always leads.
  const prExercises = new Set<string>()
  for (const r of rows) {
    if (r.is_warmup || !(r.weight_kg > 0)) continue
    const pr = prs[r.exercise]
    if (pr && r.weight_kg >= pr.bestWeight - 0.001) prExercises.add(r.exercise)
  }
  if (prExercises.size === 1) {
    const [exercise] = prExercises
    out.push({ id: 'pr-one', icon: 'trophy', tone: 'good', text: `New PR on ${exercise}.` })
  } else if (prExercises.size > 1) {
    out.push({ id: 'pr-many', icon: 'trophy', tone: 'good', text: `${prExercises.size} PRs this session.` })
  }

  // Heaviest top-set on record for a given exercise, even short of a formal PR badge.
  const byExercise = volumeByExercise(rows)
  for (const ex of byExercise) {
    const pr = prs[ex.exercise]
    if (!pr || pr.bestWeight <= 0) continue
    const delta = ex.topWeight - pr.bestWeight
    if (ex.topWeight >= pr.bestWeight - 0.001 && delta > 0.001) {
      out.push({
        id: `heaviest-${ex.exercise}`,
        icon: 'trend',
        tone: 'good',
        text: `Heaviest ${ex.exercise} yet — +${fmt(delta)} on your previous best.`,
      })
      break // one is plenty; more reads as a list, not an insight
    }
  }

  // Volume vs the previous same-category session — needs a real baseline to compare against.
  if (previous && previous.total_volume_kg && previous.total_volume_kg > 0) {
    const change = pctChange(previous.total_volume_kg, session.total_volume_kg ?? 0)
    if (change != null && Math.abs(change) >= 5) {
      const up = change > 0
      out.push({
        id: 'volume-delta',
        icon: 'scale',
        tone: up ? 'good' : 'neutral',
        text: `${up ? 'Up' : 'Down'} ${Math.abs(Math.round(change))}% on your last session in this category.`,
      })
    }
  }

  // Effort — only worth a sentence when there's enough RPE data to characterise the session.
  const effort = sessionEffort(rows)
  if (effort.avgRpe != null && effort.workingSets >= 3) {
    if (effort.avgRpe >= 8.5) {
      out.push({ id: 'effort-hard', icon: 'flame', tone: 'warn', text: `Mostly hard sets — average effort @${effort.avgRpe}.` })
    } else if (effort.avgRpe <= 6.5) {
      out.push({ id: 'effort-easy', icon: 'alert', tone: 'neutral', text: `A lighter session — average effort @${effort.avgRpe}.` })
    }
  }

  return out.slice(0, 3)
}

/**
 * Insights for the History page as a whole, ranked most-interesting-first, capped at 3.
 * `weekly` should already be zero-filled and oldest→newest (see `weeklySeries`).
 */
export function historyInsights(input: { sessions: SessionRow[]; weekly: WeekPoint[]; fmt: (kg: number) => string }): Insight[] {
  const { weekly, fmt } = input
  const out: Insight[] = []
  if (weekly.length < 2) return out

  const thisWeek = weekly[weekly.length - 1]
  const priorWeeks = weekly.slice(0, -1)
  const completedPriorWeeks = priorWeeks.filter((w) => w.sessions > 0)

  // Sessions this week vs the trailing average of completed prior weeks — needs a real
  // baseline (at least 2 prior weeks with any training) or the comparison is meaningless.
  if (completedPriorWeeks.length >= 2) {
    const avgSessions = completedPriorWeeks.reduce((a, w) => a + w.sessions, 0) / completedPriorWeeks.length
    const diff = Math.round(thisWeek.sessions - avgSessions)
    if (Math.abs(diff) >= 1) {
      out.push({
        id: 'sessions-vs-avg',
        icon: diff > 0 ? 'trend' : 'alert',
        tone: diff > 0 ? 'good' : 'neutral',
        text: `You've trained ${thisWeek.sessions} time${thisWeek.sessions === 1 ? '' : 's'} this week, ${
          diff > 0 ? `${diff} more` : `${Math.abs(diff)} fewer`
        } than your recent average.`,
      })
    }

    const avgVolume = completedPriorWeeks.reduce((a, w) => a + w.volume, 0) / completedPriorWeeks.length
    const volChange = pctChange(avgVolume, thisWeek.volume)
    if (volChange != null && Math.abs(volChange) >= 10) {
      const up = volChange > 0
      out.push({
        id: 'volume-vs-avg',
        icon: 'scale',
        tone: up ? 'good' : 'neutral',
        text: `Volume this week is ${up ? 'up' : 'down'} ${Math.abs(Math.round(volChange))}% on your recent average.`,
      })
    }
  }

  // Best week on record, only worth calling out when it's actually this week.
  const bestWeek = weekly.reduce((best, w) => (w.volume > best.volume ? w : best), weekly[0])
  if (bestWeek.weekStart === thisWeek.weekStart && thisWeek.volume > 0 && priorWeeks.some((w) => w.volume > 0)) {
    out.push({ id: 'best-week', icon: 'trophy', tone: 'good', text: `Your biggest volume week in this view — ${fmt(thisWeek.volume)} so far.` })
  }

  // Consistency: no training at all this week, with a recent history of training.
  if (thisWeek.sessions === 0 && completedPriorWeeks.length >= 2) {
    out.push({ id: 'no-sessions', icon: 'alert', tone: 'neutral', text: `No sessions logged yet this week.` })
  }

  return out.slice(0, 3)
}
