import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData, usePrefs } from '../lib/app-context'
import { CATALOG, CATALOG_BY_KEY } from '../data/catalog'
import { Heatmap, ColumnChart, HEATMAP_LEVEL_COLORS } from '../components/charts/Charts'
import { StatTile, MeterBar, InsightCard } from '../components/stats'
import { CategoryThumb, IconChevronRight, IconChevronLeft, IconFlame, IconHistory, IconPlay, IconSearch, IconClose, IconTrophy, IconGrid, IconChart } from '../components/Icons'
import { currentStreak, volumeByDay, weeklySeries, rollingMean, type WeekPoint } from '../lib/stats'
import { historyInsights } from '../lib/insights'
import { relativeDay, fmtDuration, fmtWeight, dateKey, cx, fromKg } from '../lib/util'
import { Button } from '../components/ui'
import { SkelRows, LoadingRegion } from '../components/Skeleton'
import { haptic } from '../lib/haptics'
import type { SessionRow, SetRow, ExercisePR } from '../lib/types'

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Week groups shown per page. */
const WEEKS_PER_PAGE = 4
/** How many weeks the momentum strip and trend chart look back over. */
const TREND_WEEKS = 12

/** Monday (local) of the week containing the given date. */
function mondayOf(iso: string | Date): Date {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

function ordinal(n: number): string {
  const suffix = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0]}`
}

/**
 * "This week" / "Last week" / "2nd week of July 2026".
 * The ordinal counts weeks within the month the group's Monday falls in, so the
 * 1st–7th is the 1st week, the 8th–14th the 2nd, and so on.
 */
function weekLabel(monday: Date, thisKey: string, lastKey: string): string {
  const key = dateKey(monday)
  if (key === thisKey) return 'This week'
  if (key === lastKey) return 'Last week'
  const nth = ordinal(Math.ceil(monday.getDate() / 7))
  return `${nth} week of ${MONTHS_LONG[monday.getMonth()]} ${monday.getFullYear()}`
}

/** Short label for the trend chart's x-axis, e.g. "3 Jun". */
function shortWeekLabel(weekStartKey: string): string {
  const [y, m, d] = weekStartKey.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return `${date.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][date.getMonth()]}`
}

interface WeekGroup {
  key: string
  label: string
  sessions: SessionRow[]
  volume: number
}

function groupByWeek(sessions: SessionRow[]): WeekGroup[] {
  const thisKey = dateKey(mondayOf(new Date()))
  const lastMon = mondayOf(new Date())
  lastMon.setDate(lastMon.getDate() - 7)
  const lastKey = dateKey(lastMon)

  const map = new Map<string, SessionRow[]>()
  for (const s of sessions) {
    const k = dateKey(mondayOf(s.started_at))
    const list = map.get(k)
    if (list) list.push(s)
    else map.set(k, [s])
  }

  const groups: WeekGroup[] = []
  for (const [k, list] of map) {
    const [y, m, dd] = k.split('-').map(Number)
    const mon = new Date(y, m - 1, dd)
    groups.push({
      key: k,
      label: weekLabel(mon, thisKey, lastKey),
      sessions: list.slice().sort((a, b) => b.started_at.localeCompare(a.started_at)),
      volume: list.reduce((a, s) => a + (s.total_volume_kg ?? 0), 0),
    })
  }
  return groups.sort((a, b) => b.key.localeCompare(a.key))
}

/** A group's volume vs the immediately preceding *calendar* week — null if that week isn't in view (skipped, or off the front of history), since comparing across a gap would mislead. */
function weekOverWeekDelta(groups: WeekGroup[], index: number): number | null {
  const cur = groups[index]
  const prev = groups[index + 1]
  if (!cur || !prev) return null
  const [cy, cm, cd] = cur.key.split('-').map(Number)
  const [py, pm, pd] = prev.key.split('-').map(Number)
  const gapDays = Math.round((new Date(cy, cm - 1, cd).getTime() - new Date(py, pm - 1, pd).getTime()) / 86400000)
  if (gapDays !== 7 || !(prev.volume > 0)) return null
  return ((cur.volume - prev.volume) / prev.volume) * 100
}

/** Count of exercises where a working set in this session matched the all-time PR at save time — the same test Session Detail uses, applied per-row so the History list can show it too. */
function prCountForSession(sessionSets: SetRow[], prs: Record<string, ExercisePR>): number {
  const hit = new Set<string>()
  for (const r of sessionSets) {
    if (r.is_warmup || !(r.weight_kg > 0)) continue
    const pr = prs[r.exercise]
    if (pr && r.weight_kg >= pr.bestWeight - 0.001) hit.add(r.exercise)
  }
  return hit.size
}

export function History() {
  const nav = useNavigate()
  const { sessions, sets, prs, loading } = useData()
  const { unit } = usePrefs()
  const streak = currentStreak(sessions)
  const heat = volumeByDay(sessions)

  const [cat, setCat] = useState<string | null>(null)
  const [q, setQ] = useState('')

  /** only offer groups the user has actually trained */
  const cats = useMemo(() => {
    const keys = new Set(sessions.map((x) => x.category_key))
    return CATALOG.filter((c) => keys.has(c.key))
  }, [sessions])

  /** All-time session count per category — the loaded chips read this, not the filtered
   *  set, so a chip's own fill doesn't shift as you use it to filter. */
  const catCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const s of sessions) m[s.category_key] = (m[s.category_key] ?? 0) + 1
    return m
  }, [sessions])
  const maxCatCount = Math.max(1, ...Object.values(catCounts))

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return sessions.filter((x) => {
      if (cat && x.category_key !== cat) return false
      if (!needle) return true
      const title = (x.title || CATALOG_BY_KEY[x.category_key]?.title || '').toLowerCase()
      return title.includes(needle)
    })
  }, [sessions, cat, q])

  const groups = useMemo(() => groupByWeek(filtered), [filtered])
  const filtering = !!cat || q.trim().length > 0
  const maxGroupVolume = Math.max(1, ...groups.map((g) => g.volume))
  const maxSessionVolume = Math.max(1, ...filtered.map((s) => s.total_volume_kg ?? 0))

  const [page, setPage] = useState(0)
  useEffect(() => { setPage(0) }, [cat, q])
  const pageCount = Math.max(1, Math.ceil(groups.length / WEEKS_PER_PAGE))
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1)
  }, [page, pageCount])

  const visible = groups.slice(page * WEEKS_PER_PAGE, page * WEEKS_PER_PAGE + WEEKS_PER_PAGE)
  const go = (next: number) => {
    haptic.pageTurn()
    setPage(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /* ---------------------------------------------------------------- momentum + trend */
  const weekly: WeekPoint[] = useMemo(() => weeklySeries(sessions, TREND_WEEKS), [sessions])
  const thisWeek = weekly[weekly.length - 1]
  const completedPriorWeeks = weekly.slice(0, -1).filter((w) => w.sessions > 0)
  const avgOf = (pick: (w: WeekPoint) => number) =>
    completedPriorWeeks.length ? completedPriorWeeks.reduce((a, w) => a + pick(w), 0) / completedPriorWeeks.length : null

  const avgSessions = avgOf((w) => w.sessions)
  const avgVolume = avgOf((w) => w.volume)
  const avgSets = avgOf((w) => w.sets)

  const trendBars = useMemo(
    () => weekly.map((w) => ({ label: shortWeekLabel(w.weekStart), value: Math.round(fromKg(w.volume, unit)) })),
    [weekly, unit],
  )
  const trendOverlay = useMemo(() => rollingMean(trendBars.map((b) => b.value), 4), [trendBars])

  const insights = useMemo(
    () => historyInsights({ sessions: filtered, weekly, fmt: (kg) => `${fmtWeight(kg, unit)}${unit}` }),
    [filtered, weekly, unit],
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight">History</h1>
          <p className="mt-1 text-sm text-muted">Every session you have finished, newest first.</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-cyan/[0.12] px-3 py-1.5 text-sm font-bold text-cyan">
          <IconFlame size={16} /> {streak}
        </span>
      </div>

      {sessions.length > 0 && !loading && (
        <>
          {/* Momentum strip — "am I doing more or less than usual", answered in one glance
              rather than by scrolling through every week below. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              icon={<IconGrid size={12} />}
              label="Sessions/wk"
              value={thisWeek.sessions}
              delta={avgSessions == null ? undefined : { n: Math.round(thisWeek.sessions - avgSessions), text: String(Math.abs(Math.round(thisWeek.sessions - avgSessions))) }}
              spark={weekly.map((w) => w.sessions)}
            />
            <StatTile
              icon={<IconChart size={12} />}
              label="Volume/wk"
              value={fmtWeight(thisWeek.volume, unit)}
              unit={unit}
              delta={avgVolume == null ? undefined : { n: Math.round(thisWeek.volume - avgVolume), text: fmtWeight(Math.abs(thisWeek.volume - avgVolume), unit) }}
              spark={weekly.map((w) => w.volume)}
            />
            <StatTile
              icon={<IconGrid size={12} />}
              label="Sets/wk"
              value={thisWeek.sets}
              delta={avgSets == null ? undefined : { n: Math.round(thisWeek.sets - avgSets), text: String(Math.abs(Math.round(thisWeek.sets - avgSets))) }}
              spark={weekly.map((w) => w.sets)}
            />
            <StatTile icon={<IconFlame size={12} />} label="Streak" value={streak} unit="d" />
          </div>

          {/* The one chart on the page with an axis — volume, week over week. */}
          <section className="card p-4">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted">
              Volume · last {TREND_WEEKS} weeks
            </p>
            <ColumnChart bars={trendBars} overlay={trendOverlay} height={140} highlightIndex={trendBars.length - 1} overlayLabel="4-week average" />
          </section>

          {insights.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-3">
              {insights.map((ins) => (
                <InsightCard key={ins.id} icon={ins.icon} tone={ins.tone} text={ins.text} value={ins.value} />
              ))}
            </div>
          )}

          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Last 16 weeks</p>
              <div className="flex items-center gap-1.5 text-[10px] text-muted">
                Less
                {HEATMAP_LEVEL_COLORS.map((c, i) => (
                  <span key={i} className="h-2 w-2 rounded-[2px]" style={{ background: c }} />
                ))}
                More
              </div>
            </div>
            <Heatmap dayVolumes={heat} unit={unit} />
          </section>
        </>
      )}

      {/*
        Desktop keeps the filters pinned in a rail while the list scrolls beside them.
      */}
      <div className="grid gap-5 xl:grid-cols-[336px_minmax(0,1fr)] xl:items-start">
      <aside className="flex flex-col gap-4 xl:sticky xl:top-6">

      {sessions.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <label className="flex min-h-[44px] items-center gap-2 rounded-xl border border-line2 bg-panel px-3">
            <IconSearch size={15} className="shrink-0 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search workouts"
              aria-label="Search workouts by name"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
            />
            {q.length > 0 && (
              <button onClick={() => { haptic.toggleOff(); setQ('') }} aria-label="Clear search" className="shrink-0 text-muted2 hover:text-ink">
                <IconClose size={15} />
              </button>
            )}
          </label>

          {cats.length > 1 && (
            <div className="flex flex-col gap-1.5" role="tablist" aria-label="Filter by category">
              <button
                role="tab"
                aria-selected={cat === null}
                onClick={() => { haptic.select(); setCat(null) }}
                className={cx(
                  'min-h-[32px] rounded-xl border px-3 text-left text-[11px] font-bold transition',
                  cat === null ? 'border-cyan bg-cyan/[0.08] text-ink' : 'border-line2 text-muted2 hover:text-ink',
                )}
              >
                All · {sessions.length}
              </button>
              {/* Loaded chips: each carries its own share of your history as a fill, so the
                  filter row doubles as the split breakdown without a second chart. */}
              {cats.map((c) => {
                const count = catCounts[c.key] ?? 0
                const pct = (count / maxCatCount) * 100
                const on = cat === c.key
                return (
                  <button
                    key={c.key}
                    role="tab"
                    aria-selected={on}
                    onClick={() => { haptic.select(); setCat(on ? null : c.key) }}
                    className={cx(
                      'relative min-h-[32px] overflow-hidden rounded-xl border px-3 text-left text-[11px] font-bold transition',
                      on ? 'border-cyan text-ink' : 'border-line2 text-muted2 hover:text-ink',
                    )}
                  >
                    <span className="absolute inset-y-0 left-0 bg-cyan/[0.14]" style={{ width: `${pct}%` }} aria-hidden="true" />
                    <span className="relative flex items-center justify-between gap-2">
                      <span className="truncate">{c.title}</span>
                      <span className="tnum shrink-0 text-muted">{count}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {filtering && (
            <p aria-live="polite" className="px-1 text-[11px] font-semibold text-muted">
              {filtered.length} of {sessions.length} workouts
              {cat ? ` · ${CATALOG_BY_KEY[cat]?.title}` : ''}
            </p>
          )}
        </div>
      )}
      </aside>

      <div className="min-w-0">

      {loading ? (
        <>
          <LoadingRegion label="Loading your workout history" />
          <SkelRows rows={5} />
        </>
      ) : sessions.length === 0 ? (
        !loading && (
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-line2 px-6 py-12 text-center animate-fadeUp">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-cyan/10 text-cyan">
              <IconHistory size={26} />
            </div>
            <div>
              <p className="font-heading text-base font-extrabold text-ink">No workouts logged yet</p>
              <p className="mx-auto mt-1.5 max-w-[30ch] text-sm text-muted2">Finish your first session and it'll appear here, building your streak and heatmap.</p>
            </div>
            <Button onClick={() => nav('/')} className="shadow-glow">
              <IconPlay size={18} /> Start a workout
            </Button>
          </div>
        )
      ) : (
        <div className="flex flex-col gap-5">
          {visible.map((g, gi) => {
            const groupIndex = page * WEEKS_PER_PAGE + gi
            const wow = weekOverWeekDelta(groups, groupIndex)
            return (
            <section key={g.key} className="flex flex-col gap-2">
              {/*
                The header is a flex sibling of the grid below, NOT a cell in it. Putting a
                header inside a wrapping grid is what makes week labels collide with cards
                once the container goes multi-column.
              */}
              <div className="flex flex-col gap-1 px-0.5">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="min-w-0 truncate font-heading text-sm font-bold">{g.label}</h2>
                  <p className="tnum shrink-0 text-xs text-muted">
                    {g.sessions.length} session{g.sessions.length === 1 ? '' : 's'} · {fmtWeight(g.volume, unit)}{unit}
                    {wow != null && (
                      <span className={cx('ml-1.5 font-bold', wow > 0 ? 'text-good' : wow < 0 ? 'text-bad' : 'text-muted')}>
                        {wow === 0 ? '±0%' : `${wow > 0 ? '↑' : '↓'}${Math.abs(Math.round(wow))}%`}
                      </span>
                    )}
                  </p>
                </div>
                <MeterBar label="" value={g.volume} max={maxGroupVolume} size="sm" />
              </div>
              <div className="grid gap-2 2xl:grid-cols-2">
              {g.sessions.map((s) => {
                const cat = CATALOG_BY_KEY[s.category_key]
                const sessionSets = sets.filter((x) => x.session_id === s.id)
                const prCount = prCountForSession(sessionSets, prs)
                const volPct = Math.max(4, ((s.total_volume_kg ?? 0) / maxSessionVolume) * 100)
                return (
                  <button
                    key={s.id}
                    data-testid="session-row"
                    onClick={() => {
                      haptic.select()
                      nav(`/history/${s.id}`)
                    }}
                    className="flex flex-col gap-2 rounded-2xl glass p-3.5 text-left transition active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-3">
                      {cat ? (
                        <CategoryThumb icon={s.category_key} size={44} />
                      ) : (
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cyan/[0.12] text-cyan">
                          <IconHistory size={20} />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate font-heading font-bold">
                          <span className="min-w-0 truncate">{s.title || cat?.title || 'Workout'}</span>
                          {prCount > 0 && (
                            <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-cyan/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-cyan">
                              <IconTrophy size={9} /> {prCount}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted">
                          {relativeDay(s.started_at)} · {fmtDuration(s.duration_s ?? 0)} · {s.total_sets ?? 0} sets
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="tnum font-heading text-sm font-extrabold text-cyan-soft">{fmtWeight(s.total_volume_kg ?? 0, unit)}</p>
                        <p className="text-[10px] text-muted">{unit} vol</p>
                      </div>
                      <IconChevronRight size={16} className="text-muted" />
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.05]">
                      <div className="h-full rounded-full bg-cyan/60" style={{ width: `${volPct}%` }} />
                    </div>
                  </button>
                )
              })}
              </div>
            </section>
          )})}

          {pageCount > 1 && (
            <nav className="flex items-center justify-between gap-3 pt-1" aria-label="History pages">
              <button
                onClick={() => go(page - 1)}
                disabled={page === 0}
                aria-label="Newer workouts"
                className={cx(
                  'flex items-center gap-1.5 rounded-xl border border-line2 px-3.5 py-2 text-xs font-bold transition',
                  page === 0 ? 'cursor-not-allowed text-muted/35' : 'text-ink2 hover:border-cyan/60 hover:text-cyan active:scale-95',
                )}
              >
                <IconChevronLeft size={15} /> Newer
              </button>
              <p className="tnum text-xs font-semibold text-muted" aria-live="polite">
                Page {page + 1} of {pageCount}
              </p>
              <button
                onClick={() => go(page + 1)}
                disabled={page >= pageCount - 1}
                aria-label="Older workouts"
                className={cx(
                  'flex items-center gap-1.5 rounded-xl border border-line2 px-3.5 py-2 text-xs font-bold transition',
                  page >= pageCount - 1 ? 'cursor-not-allowed text-muted/35' : 'text-ink2 hover:border-cyan/60 hover:text-cyan active:scale-95',
                )}
              >
                Older <IconChevronRight size={15} />
              </button>
            </nav>
          )}
        </div>
      )}
      </div>
      </div>
    </div>
  )
}
