import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData, usePrefs } from '../lib/app-context'
import { CATALOG, CATALOG_BY_KEY } from '../data/catalog'
import { Heatmap } from '../components/charts/Charts'
import { CategoryThumb, IconChevronRight, IconChevronLeft, IconFlame, IconHistory, IconPlay, IconSearch, IconClose} from '../components/Icons'
import { currentStreak, volumeByDay } from '../lib/stats'
import { relativeDay, fmtDuration, fmtWeight, dateKey, cx } from '../lib/util'
import { Button } from '../components/ui'
import { SkelRows, LoadingRegion } from '../components/Skeleton'
import { haptic } from '../lib/haptics'
import type { SessionRow } from '../lib/types'

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Week groups shown per page. */
const WEEKS_PER_PAGE = 4

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

export function History() {
  const nav = useNavigate()
  const { sessions, loading } = useData()
  const { unit } = usePrefs()
  const streak = currentStreak(sessions)
  const heat = volumeByDay(sessions)
  /*
   * Filter + search.
   *
   * History was a flat reverse-chronological list with a pager. Finding "that leg day
   * where I hit 105" meant paging through every week. Filtering by muscle group and
   * searching by title narrows first, then the weeks regroup around what is left.
   */
  const [cat, setCat] = useState<string | null>(null)
  const [q, setQ] = useState('')

  /** only offer groups the user has actually trained */
  const cats = useMemo(() => {
    const keys = new Set(sessions.map((x) => x.category_key))
    return CATALOG.filter((c) => keys.has(c.key))
  }, [sessions])

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

  const [page, setPage] = useState(0)
  useEffect(() => { setPage(0) }, [cat, q])
  const pageCount = Math.max(1, Math.ceil(groups.length / WEEKS_PER_PAGE))
  // deleting the last session on a page (or a data refresh) can shrink the list
  // out from under us — clamp rather than render an empty page
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1)
  }, [page, pageCount])

  const visible = groups.slice(page * WEEKS_PER_PAGE, page * WEEKS_PER_PAGE + WEEKS_PER_PAGE)
  const go = (next: number) => {
    haptic.pageTurn()
    setPage(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

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

      {/*
        Desktop keeps the heatmap and the filters pinned in a rail while the list scrolls
        beside them — on the phone they sat on top and were scrolled away the moment you
        started looking for a session, which is exactly when you want them.
      */}
      <div className="grid gap-5 xl:grid-cols-[336px_minmax(0,1fr)] xl:items-start">
      <aside className="flex flex-col gap-4 xl:sticky xl:top-6">

      <section className="card p-4">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted">Last 16 weeks</p>
        <Heatmap dayVolumes={heat} unit={unit} />
      </section>

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
            <div className="flex gap-1.5 overflow-x-auto px-0.5 pb-1" role="tablist">
              <button
                role="tab"
                aria-selected={cat === null}
                onClick={() => { haptic.select(); setCat(null) }}
                className={cx(
                  'min-h-[32px] shrink-0 rounded-full border px-3.5 text-[11px] font-bold transition',
                  cat === null ? 'border-cyan bg-cyan text-cyan-ink' : 'border-line2 text-muted2 hover:text-ink',
                )}
              >
                All
              </button>
              {cats.map((c) => (
                <button
                  key={c.key}
                  role="tab"
                  aria-selected={cat === c.key}
                  onClick={() => { haptic.select(); setCat(cat === c.key ? null : c.key) }}
                  className={cx(
                    'min-h-[32px] shrink-0 rounded-full border px-3.5 text-[11px] font-bold transition',
                    cat === c.key ? 'border-cyan bg-cyan text-cyan-ink' : 'border-line2 text-muted2 hover:text-ink',
                  )}
                >
                  {c.title}
                </button>
              ))}
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
          {visible.map((g) => (
            <section key={g.key} className="flex flex-col gap-2">
              {/*
                The header is a flex sibling of the grid below, NOT a cell in it. Putting a
                header inside a wrapping grid is what makes week labels collide with cards
                once the container goes multi-column.
              */}
              <div className="flex items-baseline justify-between gap-2 px-0.5">
                <h2 className="min-w-0 truncate font-heading text-sm font-bold">{g.label}</h2>
                <p className="tnum shrink-0 text-xs text-muted">
                  {g.sessions.length} session{g.sessions.length === 1 ? '' : 's'} · {fmtWeight(g.volume, unit)}{unit}
                </p>
              </div>
              <div className="grid gap-2 2xl:grid-cols-2">
              {g.sessions.map((s) => {
                const cat = CATALOG_BY_KEY[s.category_key]
                return (
                  <button
                    key={s.id}
                    data-testid="session-row"
                    onClick={() => {
                      haptic.select()
                      nav(`/history/${s.id}`)
                    }}
                    className="flex items-center gap-3 rounded-2xl glass p-3.5 text-left transition active:scale-[0.99]"
                  >
                    {cat ? (
                      <CategoryThumb icon={s.category_key} size={44} />
                    ) : (
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cyan/[0.12] text-cyan">
                        <IconHistory size={20} />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-heading font-bold">{s.title || cat?.title || 'Workout'}</p>
                      <p className="text-xs text-muted">
                        {relativeDay(s.started_at)} · {fmtDuration(s.duration_s ?? 0)} · {s.total_sets ?? 0} sets
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="tnum font-heading text-sm font-extrabold text-cyan-soft">{fmtWeight(s.total_volume_kg ?? 0, unit)}</p>
                      <p className="text-[10px] text-muted">{unit} vol</p>
                    </div>
                    <IconChevronRight size={16} className="text-muted" />
                  </button>
                )
              })}
              </div>
            </section>
          ))}

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
