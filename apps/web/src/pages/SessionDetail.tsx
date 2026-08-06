import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useData, usePrefs } from '../lib/app-context'
import { CATALOG_BY_KEY } from '../data/catalog'
import { getSessionSets, deleteSession } from '../lib/db'
import { exerciseSeries } from '../lib/stats'
import { LineChart } from '../components/charts/Charts'
import { Button, EmptyState, Modal } from '../components/ui'
import {
  CategoryThumb,
  IconArrowLeft,
  IconTrash,
  IconClock,
  IconGrid,
  IconScale,
  IconTrophy,
  IconChart,
  IconChevronRight,
} from '../components/Icons'
import { fmtDuration, fmtWeight, cx, rpeTextClass, epley1rm, fromKg, type WeightUnit } from '../lib/util'
import { haptic } from '../lib/haptics'
import type { SetRow, SessionRow } from '../lib/types'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Tue 16 Jun 2026" — the year matters once history goes back far enough. */
function fullDate(iso: string): string {
  const d = new Date(iso)
  return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`
}

/** "3 weeks ago" — in a history view, how long ago is the first thing you want. */
function howLongAgo(iso: string): string {
  const then = new Date(iso)
  const a = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime()
  const n = new Date()
  const b = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()
  const days = Math.round((b - a) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) {
    const w = Math.round(days / 7)
    return `${w} week${w === 1 ? '' : 's'} ago`
  }
  const m = Math.round(days / 30)
  return m < 12 ? `${m} month${m === 1 ? '' : 's'} ago` : `${Math.round(days / 365)}y ago`
}

/** Human label for a logged set, mode-aware (reps / timed / distance). */
function setLabel(r: SetRow, unit: WeightUnit): string {
  if ((r.distance_m ?? 0) > 0) {
    const mins = (r.duration_s ?? 0) > 0 ? ` · ${Math.round(((r.duration_s ?? 0) / 60) * 10) / 10}min` : ''
    return `${r.distance_m}m${mins}`
  }
  if ((r.duration_s ?? 0) > 0) {
    const load = r.weight_kg > 0 ? ` · ${fmtWeight(r.weight_kg, unit)}${unit}` : ''
    return `${r.duration_s}s${load}`
  }
  return `${fmtWeight(r.weight_kg, unit)}×${r.reps}`
}

export function SessionDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { sessions, sets: allSets, prs, loading, refresh } = useData()
  const { unit } = usePrefs()

  const [rows, setRows] = useState<SetRow[] | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [chartFor, setChartFor] = useState<string | null>(null)

  const session = sessions.find((s) => s.id === id)

  useEffect(() => {
    let live = true
    setRows(null)
    getSessionSets(id).then((r) => {
      if (live) setRows(r)
    })
    return () => {
      live = false
    }
  }, [id])

  const grouped = useMemo(() => {
    const map: Record<string, SetRow[]> = {}
    for (const s of rows ?? []) (map[s.exercise] ??= []).push(s)
    return Object.entries(map).map(([exercise, list]) => {
      const ordered = list.slice().sort((a, b) => a.set_index - b.set_index)
      const working = ordered.filter((r) => !r.is_warmup)
      const volume = working.reduce((a, r) => a + r.weight_kg * r.reps, 0)
      const top = working.reduce((best, r) => (r.weight_kg > best ? r.weight_kg : best), 0)
      const best1rm = working.reduce((best, r) => Math.max(best, epley1rm(r.weight_kg, r.reps)), 0)
      return { exercise, rows: ordered, volume, top, best1rm }
    })
  }, [rows])

  /* FEATURE 1 — the previous time this same workout was trained, for deltas. */
  const previous: SessionRow | undefined = useMemo(() => {
    if (!session) return undefined
    return sessions
      .filter((s) => s.category_key === session.category_key && s.started_at < session.started_at)
      .sort((a, b) => b.started_at.localeCompare(a.started_at))[0]
  }, [sessions, session])

  const cat = session ? CATALOG_BY_KEY[session.category_key] : undefined

  const del = async () => {
    setDeleting(true)
    haptic.warn()
    await deleteSession(id)
    await refresh()
    nav('/history')
  }

  /* REFINEMENT 8 — a bad :id used to render an empty title over three zeroed tiles. */
  if (!session && !loading) {
    return (
      <div className="flex flex-col gap-4">
        <BackRow onBack={() => nav('/history')} />
        <EmptyState title="Workout not found" sub="It may have been deleted, or the link is out of date." />
        <Button variant="outline" className="mx-auto" onClick={() => nav('/history')}>
          Back to history
        </Button>
      </div>
    )
  }

  const dVolume = previous ? (session?.total_volume_kg ?? 0) - (previous.total_volume_kg ?? 0) : null
  const dSets = previous ? (session?.total_sets ?? 0) - (previous.total_sets ?? 0) : null
  const dTime = previous ? (session?.duration_s ?? 0) - (previous.duration_s ?? 0) : null

  const hasRpe = (rows ?? []).some((r) => r.rpe != null)
  const hasWarmup = (rows ?? []).some((r) => r.is_warmup)

  return (
    <div className="flex flex-col gap-4">
      <BackRow onBack={() => nav('/history')} onDelete={session ? () => setConfirmDel(true) : undefined} />

      {/*
        Two columns on desktop: what the session WAS stays pinned on the left while the
        set-by-set breakdown scrolls beside it. Stacked, the totals scroll away exactly when
        you start comparing them against the sets below.
      */}
      <div data-testid="session-detail" className="grid gap-6 xl:grid-cols-[330px_minmax(0,1fr)] xl:items-start">
      <aside className="flex flex-col gap-4 xl:sticky xl:top-6">

      <div className="flex items-center gap-3">
        {cat ? <CategoryThumb icon={session!.category_key} size={48} /> : <span className="h-12 w-12 shrink-0 rounded-xl bg-panel2" />}
        <div className="min-w-0">
          <h1 className="truncate font-heading text-xl font-extrabold leading-none">{session?.title || cat?.title || 'Workout'}</h1>
          {/* REFINEMENT 4 — full date plus how long ago, not just "Tue 16 Jun" */}
          {session && (
            <p className="mt-1.5 text-xs text-muted">
              {fullDate(session.started_at)} <span className="text-muted/60">·</span>{' '}
              <span className="text-cyan-soft/80">{howLongAgo(session.started_at)}</span>
            </p>
          )}
        </div>
      </div>

      {/* REFINEMENT 5 + FEATURE 1 — iconography, and deltas vs the last time you trained this */}
      <div className="grid grid-cols-3 gap-3">
        <Tile icon={<IconClock size={12} />} label="Time" value={fmtDuration(session?.duration_s ?? 0)} delta={dTime == null ? null : { n: dTime, text: fmtDuration(Math.abs(dTime)) }} />
        <Tile icon={<IconGrid size={12} />} label="Sets" value={String(session?.total_sets ?? 0)} delta={dSets == null ? null : { n: dSets, text: String(Math.abs(dSets)) }} />
        <Tile
          icon={<IconScale size={12} />}
          label="Volume"
          value={fmtWeight(session?.total_volume_kg ?? 0, unit)}
          sub={unit}
          delta={dVolume == null ? null : { n: dVolume, text: fmtWeight(Math.abs(dVolume), unit) }}
        />
      </div>
      {previous && (
        <p className="-mt-1.5 px-1 text-[11px] text-muted">
          Compared with your previous {cat?.title ?? 'workout'} session, {howLongAgo(previous.started_at)}.
        </p>
      )}
      </aside>

      <div className="min-w-0">
      {rows === null ? (
        <SkeletonList />
      ) : grouped.length === 0 ? (
        <EmptyState title="No sets recorded" sub="This session was saved without any completed sets." />
      ) : (
        <div className="flex flex-col gap-2.5">
          {grouped.map((g) => {
            const pr = prs[g.exercise]
            // a set holds the record when it matches the all-time best for that lift
            const isPrSet = (r: SetRow) => !r.is_warmup && r.weight_kg > 0 && pr != null && r.weight_kg >= pr.bestWeight - 0.001
            const cardIsPr = g.rows.some(isPrSet)
            return (
              /* FEATURE 3 — tap through to this lift's progression */
              <button
                key={g.exercise}
                onClick={() => {
                  haptic.nav()
                  setChartFor(g.exercise)
                }}
                className={cx(
                  'w-full rounded-2xl glass p-3.5 text-left transition active:scale-[0.99]',
                  cardIsPr && 'ring-1 ring-cyan/30',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 font-heading text-[15px] font-bold">
                      <span className="min-w-0 truncate">{g.exercise}</span>
                      {/* FEATURE 2 — PR badge */}
                      {cardIsPr && (
                        <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-cyan/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-cyan">
                          <IconTrophy size={9} /> PR
                        </span>
                      )}
                    </p>
                    {/* scannable summary so the card is worth tapping */}
                    <p className="tnum mt-0.5 text-[11px] text-muted">
                      {g.rows.length} set{g.rows.length === 1 ? '' : 's'}
                      {g.top > 0 && <> · top {fmtWeight(g.top, unit)}{unit}</>}
                      {g.volume > 0 && <> · {fmtWeight(g.volume, unit)}{unit} vol</>}
                      {g.best1rm > 0 && <> · e1RM {fmtWeight(g.best1rm, unit)}{unit}</>}
                    </p>
                  </div>
                  <IconChevronRight size={15} className="mt-0.5 shrink-0 text-muted" />
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {g.rows.map((r, i) => (
                    <span
                      key={r.id}
                      className={cx(
                        'tnum inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold',
                        r.is_warmup ? 'bg-warn/15 text-warn' : isPrSet(r) ? 'bg-cyan/15 text-cyan-soft ring-1 ring-cyan/25' : 'bg-white/5',
                      )}
                    >
                      {isPrSet(r) && <IconTrophy size={10} className="shrink-0" />}
                      {r.is_warmup ? 'W' : i + 1}: {setLabel(r, unit)}
                      {r.rpe != null && <span className={cx('ml-0.5', rpeTextClass(r.rpe))}>@{r.rpe}</span>}
                    </span>
                  ))}
                </div>
              </button>
            )
          })}

          {/* REFINEMENT 6 — decode the notation instead of assuming it's obvious */}
          {(hasRpe || hasWarmup) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pt-1 text-[10px] text-muted">
              {hasWarmup && (
                <span className="flex items-center gap-1.5">
                  <span className="rounded bg-warn/15 px-1 py-0.5 font-bold text-warn">W</span> warm-up set
                </span>
              )}
              {hasRpe && (
                <span className="flex items-center gap-1.5">
                  <span className="font-bold text-good">@6</span>–<span className="font-bold text-bad">@10</span> effort (RPE), higher = harder
                </span>
              )}
            </div>
          )}
        </div>
      )}
      </div>
      </div>

      {/* REFINEMENT 1 — the app's own Modal, not a native confirm() */}
      <Modal open={confirmDel} onClose={() => setConfirmDel(false)} title="Delete this workout?" maxW="max-w-sm">
        <p className="text-sm leading-relaxed text-muted2">
          {session?.title || cat?.title || 'This workout'} from {session ? fullDate(session.started_at) : ''} will be permanently removed,
          along with its {session?.total_sets ?? 0} logged set{(session?.total_sets ?? 0) === 1 ? '' : 's'}. This can't be undone.
        </p>
        <div className="mt-5 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => setConfirmDel(false)} disabled={deleting}>
            Keep it
          </Button>
          <Button variant="danger" className="flex-1" onClick={del} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </Modal>

      {/* FEATURE 3 — progression for the tapped lift */}
      <Modal open={!!chartFor} onClose={() => setChartFor(null)} title={chartFor ?? ''} maxW="max-w-lg">
        {chartFor && <Progression exercise={chartFor} allSets={allSets} unit={unit} onClose={() => setChartFor(null)} nav={nav} />}
      </Modal>
    </div>
  )
}

/** Header row. Delete is optional so the not-found state can reuse it. */
function BackRow({ onBack, onDelete }: { onBack: () => void; onDelete?: () => void }) {
  return (
    <div className="flex items-center justify-between">
      {/* REFINEMENT 2 — icon-only buttons need accessible names */}
      <button onClick={onBack} aria-label="Back to history" className="grid h-9 w-9 place-items-center rounded-full glass text-muted2 transition hover:text-ink active:scale-95">
        <IconArrowLeft size={18} />
      </button>
      {onDelete && (
        /* REFINEMENT 3 — a destructive action shouldn't look identical to navigation */
        <button
          onClick={onDelete}
          aria-label="Delete this workout"
          className="grid h-9 w-9 place-items-center rounded-full border border-transparent text-muted2 transition hover:border-bad/30 hover:bg-bad/10 hover:text-bad active:scale-95"
        >
          <IconTrash size={17} />
        </button>
      )}
    </div>
  )
}

function Tile({ icon, label, value, sub, delta }: { icon: ReactNode; label: string; value: string; sub?: string; delta?: { n: number; text: string } | null }) {
  const dir = delta == null ? 0 : delta.n > 0 ? 1 : delta.n < 0 ? -1 : 0
  return (
    <div className="rounded-2xl bg-white/5 px-3 py-3 text-center">
      <p className="tnum font-heading text-lg font-extrabold leading-none">
        {value}
        {sub && <span className="ml-0.5 text-xs text-muted">{sub}</span>}
      </p>
      <p className="mt-1 flex items-center justify-center gap-1 text-[10px] uppercase tracking-wide text-muted">
        <span className="text-cyan/70">{icon}</span>
        {label}
      </p>
      {delta != null && (
        <p className={cx('tnum mt-1 text-[10px] font-bold', dir > 0 ? 'text-good' : dir < 0 ? 'text-bad' : 'text-muted')}>
          {dir === 0 ? '±0' : `${dir > 0 ? '↑' : '↓'}${delta.text}`}
        </p>
      )}
    </div>
  )
}

/** REFINEMENT 7 — shimmer matching the real layout, like Category.tsx does. */
function SkeletonList() {
  return (
    <div className="flex flex-col gap-2.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl glass p-3.5">
          <div className="h-4 w-2/5 animate-pulse rounded bg-white/[0.07]" />
          <div className="mt-2 h-3 w-3/5 animate-pulse rounded bg-white/[0.05]" />
          <div className="mt-3 flex gap-1.5">
            {[0, 1, 2].map((k) => (
              <div key={k} className="h-6 w-20 animate-pulse rounded-lg bg-white/[0.05]" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Est-1RM progression for one lift, across every session it appears in. */
function Progression({
  exercise,
  allSets,
  unit,
  onClose,
  nav,
}: {
  exercise: string
  allSets: SetRow[]
  unit: WeightUnit
  onClose: () => void
  nav: (to: string) => void
}) {
  const series = useMemo(() => exerciseSeries(allSets, exercise), [allSets, exercise])
  const best = series.reduce((m, s) => Math.max(m, s.est1rm), 0)
  const first = series[0]
  const last = series[series.length - 1]
  const change = first && last && first.est1rm > 0 ? ((last.est1rm - first.est1rm) / first.est1rm) * 100 : 0

  if (series.length < 2) {
    return (
      <div className="py-2">
        <EmptyState title="Not enough history yet" sub={`Log ${exercise} once more and the progression chart appears here.`} />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Estimated 1RM</p>
          <p className="tnum font-heading text-2xl font-extrabold text-cyan-soft">
            {fmtWeight(best, unit)}
            <span className="ml-1 text-sm font-bold text-muted">{unit}</span>
          </p>
        </div>
        <p className={cx('tnum text-sm font-bold', change > 0 ? 'text-good' : change < 0 ? 'text-bad' : 'text-muted')}>
          {change === 0 ? '±0%' : `${change > 0 ? '↑' : '↓'}${Math.abs(change).toFixed(1)}%`}
          <span className="ml-1 text-[10px] font-semibold text-muted">all time</span>
        </p>
      </div>
      <LineChart points={series.map((s) => ({ x: s.date, y: Math.round(fromKg(s.est1rm, unit) * 10) / 10 }))} height={130} />
      <p className="mt-2 text-center text-[11px] text-muted">
        {series.length} sessions · {series[0].date} → {series[series.length - 1].date}
      </p>
      <Button
        variant="outline"
        className="mt-4 w-full"
        onClick={() => {
          onClose()
          nav('/progress')
        }}
      >
        <IconChart size={16} /> See all progress
      </Button>
    </div>
  )
}
