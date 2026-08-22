import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useData, usePrefs } from '../lib/app-context'
import { CATALOG_BY_KEY } from '../data/catalog'
import { getSessionSets, deleteSession } from '../lib/db'
import { exerciseSeries, previousSameCategory, volumeByExercise, sessionEffort, categorySessionVolumes } from '../lib/stats'
import { sessionInsights } from '../lib/insights'
import { LineChart, ColumnChart } from '../components/charts/Charts'
import { StatTile, MeterBar, InsightCard, LegendSwatch } from '../components/stats'
import { SetLadder } from '../components/SetLadder'
import { Button, EmptyState, Modal } from '../components/ui'
import { CategoryThumb, IconArrowLeft, IconTrash, IconClock, IconGrid, IconScale, IconTrophy, IconChart, IconChevronRight } from '../components/Icons'
import { fmtDuration, fmtWeight, cx, fromKg, type WeightUnit } from '../lib/util'
import { haptic } from '../lib/haptics'
import { BodyMap, useBodyMapVariant, type BodyMapDataset } from '../components/BodyMap'
import { BODY_VIEWBOX as FEMALE_VIEWBOX, FRONT_MUSCLES as FEMALE_FRONT, BACK_MUSCLES as FEMALE_BACK } from '../data/bodyMusclesFemale'
import { musclesFromSets } from '../data/exerciseMuscles'
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

/** "Mon 11" — short label for the comparison column chart. */
function shortDay(iso: string): string {
  const d = new Date(iso)
  return `${DOW[d.getDay()]} ${d.getDate()}`
}

export function SessionDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { sessions, sets: allSets, custom, prs, loading, refresh } = useData()
  const { unit, gender } = usePrefs()

  const [rows, setRows] = useState<SetRow[] | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [chartFor, setChartFor] = useState<string | null>(null)

  const session = sessions.find((s) => s.id === id)

  useEffect(() => {
    let live = true
    // instant first paint from what's already in memory (every set carries session_id),
    // then the network fetch overwrites it — never trust the in-memory filter alone, since
    // `sets` is a client cache that could one day be capped server-side
    setRows(allSets.filter((s) => s.session_id === id).sort((a, b) => a.set_index - b.set_index))
    getSessionSets(id).then((r) => {
      if (live) setRows(r)
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const grouped = useMemo(() => {
    const map: Record<string, SetRow[]> = {}
    for (const s of rows ?? []) (map[s.exercise] ??= []).push(s)
    const byExVolume = new Map(volumeByExercise(rows ?? []).map((v) => [v.exercise, v]))
    return Object.entries(map).map(([exercise, list]) => {
      const ordered = list.slice().sort((a, b) => a.set_index - b.set_index)
      const agg = byExVolume.get(exercise)
      return { exercise, rows: ordered, volume: agg?.volume ?? 0, top: agg?.topWeight ?? 0, best1rm: agg?.best1rm ?? 0 }
    })
  }, [rows])

  const previous: SessionRow | undefined = useMemo(() => (session ? previousSameCategory(sessions, session) : undefined), [sessions, session])

  const cat = session ? CATALOG_BY_KEY[session.category_key] : undefined

  const bodyMapVariant = useBodyMapVariant()
  const bodyMapDataset: BodyMapDataset | undefined =
    gender === 'female' ? { BODY_VIEWBOX: FEMALE_VIEWBOX, FRONT_MUSCLES: FEMALE_FRONT, BACK_MUSCLES: FEMALE_BACK } : undefined
  const trainedMuscles = useMemo(() => musclesFromSets(rows ?? [], custom), [rows, custom])

  const volumeSpark = useMemo(() => {
    if (!session) return undefined
    const points = categorySessionVolumes(sessions, session.category_key, session.started_at, 5)
    return points.length >= 2 ? points.map((p) => p.volume) : undefined
  }, [sessions, session])

  const comparisonBars = useMemo(() => {
    if (!session) return { bars: [] as { label: string; value: number }[], highlightIndex: undefined as number | undefined }
    const points = categorySessionVolumes(sessions, session.category_key, session.started_at, 5)
    return {
      bars: points.map((p) => ({ label: shortDay(p.date), value: Math.round(fromKg(p.volume, unit)) })),
      highlightIndex: points.length ? points.length - 1 : undefined,
    }
  }, [sessions, session, unit])

  const insights = useMemo(() => {
    if (!session || rows == null) return []
    return sessionInsights({
      session,
      rows,
      allSets,
      prs,
      previous,
      fmt: (kg) => `${fmtWeight(kg, unit)}${unit}`,
    })
  }, [session, rows, allSets, prs, previous, unit])

  const byExercise = useMemo(() => (rows ? volumeByExercise(rows) : []), [rows])
  const totalExVolume = byExercise.reduce((a, e) => a + e.volume, 0)

  const effort = useMemo(() => (rows ? sessionEffort(rows) : null), [rows])

  const del = async () => {
    setDeleting(true)
    haptic.warn()
    await deleteSession(id)
    await refresh()
    nav('/history')
  }

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
  const nothingTrained = trainedMuscles.size === 0

  return (
    <div className="flex flex-col gap-4">
      <BackRow onBack={() => nav('/history')} onDelete={session ? () => setConfirmDel(true) : undefined} />

      {/*
        Two columns on desktop: what the session WAS stays pinned on the left while the
        breakdown scrolls beside it. The aside caps its own height and scrolls internally —
        it now carries a muscle map and a comparison chart, tall enough to exceed a short
        viewport, and `xl:sticky` misbehaves once its content overflows the screen.
      */}
      <div data-testid="session-detail" className="grid gap-6 xl:grid-cols-[330px_minmax(0,1fr)] xl:items-start">
        <aside className="flex flex-col gap-4 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto xl:pr-1 no-scrollbar">
          <div className="flex items-center gap-3">
            {cat ? <CategoryThumb icon={session!.category_key} size={48} /> : <span className="h-12 w-12 shrink-0 rounded-xl bg-panel2" />}
            <div className="min-w-0">
              <h1 className="truncate font-heading text-xl font-extrabold leading-none">{session?.title || cat?.title || 'Workout'}</h1>
              {session && (
                <p className="mt-1.5 text-xs text-muted">
                  {fullDate(session.started_at)} <span className="text-muted/60">·</span>{' '}
                  <span className="text-cyan-soft/80">{howLongAgo(session.started_at)}</span>
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <StatTile icon={<IconClock size={12} />} label="Time" value={fmtDuration(session?.duration_s ?? 0)} delta={dTime == null ? null : { n: dTime, text: fmtDuration(Math.abs(dTime)) }} />
            <StatTile icon={<IconGrid size={12} />} label="Sets" value={String(session?.total_sets ?? 0)} delta={dSets == null ? null : { n: dSets, text: String(Math.abs(dSets)) }} />
            <StatTile
              icon={<IconScale size={12} />}
              label="Volume"
              value={fmtWeight(session?.total_volume_kg ?? 0, unit)}
              unit={unit}
              delta={dVolume == null ? null : { n: dVolume, text: fmtWeight(Math.abs(dVolume), unit) }}
              spark={volumeSpark}
            />
          </div>
          {previous && (
            <p className="-mt-1.5 px-1 text-[11px] text-muted">
              Compared with your previous {cat?.title ?? 'workout'} session, {howLongAgo(previous.started_at)}.
            </p>
          )}

          {/* Per-session muscle map — one line of data (musclesFromSets accepts anything
              shaped like {exercise}, and a session's own rows satisfy that structurally). */}
          {rows !== null && rows.length > 0 && (
            <section className="card p-4">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted">Muscles worked</p>
              <div className="mx-auto max-w-[300px]">
                <BodyMap trained={trainedMuscles} onPick={() => {}} variant={bodyMapVariant} dataset={bodyMapDataset} />
              </div>
              {!nothingTrained && (
                <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-muted">
                  <LegendSwatch variant={bodyMapVariant} layer="primary" label="Worked" />
                  <LegendSwatch variant={bodyMapVariant} layer="secondary" label="Assisting" />
                </div>
              )}
            </section>
          )}

          {/* This session vs your last few in the same category — one axis, one highlighted bar. */}
          {comparisonBars.bars.length >= 2 && (
            <section className="card p-4">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted">vs your last {comparisonBars.bars.length - 1} {cat?.title ?? 'workout'} sessions</p>
              <ColumnChart bars={comparisonBars.bars} height={110} highlightIndex={comparisonBars.highlightIndex} />
            </section>
          )}
        </aside>

        <div className="min-w-0">
          {rows === null ? (
            <SkeletonList />
          ) : grouped.length === 0 ? (
            <EmptyState title="No sets recorded" sub="This session was saved without any completed sets." />
          ) : (
            <div className="flex flex-col gap-4">
              {insights.length > 0 && (
                <div className="flex flex-col gap-2">
                  {insights.map((ins) => (
                    <InsightCard key={ins.id} icon={ins.icon} tone={ins.tone} text={ins.text} value={ins.value} />
                  ))}
                </div>
              )}

              {/* Where the work actually went — a ranked answer to a question the old
                  text summaries made you do arithmetic for. */}
              {byExercise.length > 1 && (
                <section className="card p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Volume by exercise</p>
                    {effort?.avgRpe != null && <p className="text-[11px] text-muted">avg effort @{effort.avgRpe}</p>}
                  </div>
                  <div className="flex flex-col">
                    {byExercise.map((e) => (
                      <MeterBar
                        key={e.exercise}
                        label={e.exercise}
                        value={e.volume}
                        max={Math.max(1, byExercise[0].volume)}
                        trailing={`${fmtWeight(e.volume, unit)}${unit} · ${totalExVolume > 0 ? Math.round((e.volume / totalExVolume) * 100) : 0}%`}
                      />
                    ))}
                  </div>
                </section>
              )}

              <div className="flex flex-col gap-2.5">
                {grouped.map((g) => {
                  const pr = prs[g.exercise]
                  const isPrSet = (r: SetRow) => !r.is_warmup && r.weight_kg > 0 && pr != null && r.weight_kg >= pr.bestWeight - 0.001
                  const cardIsPr = g.rows.some(isPrSet)
                  return (
                    <div key={g.exercise} className={cx('w-full rounded-2xl glass p-3.5', cardIsPr && 'ring-1 ring-cyan/30')}>
                      <button
                        onClick={() => {
                          haptic.nav()
                          setChartFor(g.exercise)
                        }}
                        className="flex w-full items-start justify-between gap-2 text-left transition active:scale-[0.99]"
                      >
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 font-heading text-[15px] font-bold">
                            <span className="min-w-0 truncate">{g.exercise}</span>
                            {cardIsPr && (
                              <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-cyan/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-cyan">
                                <IconTrophy size={9} /> PR
                              </span>
                            )}
                          </p>
                          <p className="tnum mt-0.5 text-[11px] text-muted">
                            {g.rows.length} set{g.rows.length === 1 ? '' : 's'}
                            {g.top > 0 && <> · top {fmtWeight(g.top, unit)}{unit}</>}
                            {g.best1rm > 0 && <> · e1RM {fmtWeight(g.best1rm, unit)}{unit}</>}
                          </p>
                        </div>
                        <IconChevronRight size={15} className="mt-0.5 shrink-0 text-muted" />
                      </button>

                      <div className="mt-2.5">
                        <SetLadder rows={g.rows} unit={unit} isPrSet={isPrSet} />
                      </div>
                    </div>
                  )
                })}

                {(hasRpe || hasWarmup) && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pt-1 text-[10px] text-muted">
                    {hasWarmup && (
                      <span className="flex items-center gap-1.5">
                        <span className="rounded bg-warn/15 px-1 py-0.5 font-bold text-warn">W</span> warm-up set
                      </span>
                    )}
                    {hasRpe && (
                      <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-good" /> easy
                        <span className="h-2.5 w-2.5 rounded-full bg-cyan" />
                        <span className="h-2.5 w-2.5 rounded-full bg-warn" />
                        <span className="h-2.5 w-2.5 rounded-full bg-bad" /> near failure — effort (RPE)
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

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
      <button onClick={onBack} aria-label="Back to history" className="grid h-9 w-9 place-items-center rounded-full glass text-muted2 transition hover:text-ink active:scale-95">
        <IconArrowLeft size={18} />
      </button>
      {onDelete && (
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

function SkeletonList() {
  return (
    <div className="flex flex-col gap-2.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl glass p-3.5">
          <div className="h-4 w-2/5 animate-pulse rounded bg-white/[0.07]" />
          <div className="mt-2 h-3 w-3/5 animate-pulse rounded bg-white/[0.05]" />
          <div className="mt-3 flex flex-col gap-1.5">
            {[0, 1, 2].map((k) => (
              <div key={k} className="h-6 w-full animate-pulse rounded-lg bg-white/[0.05]" />
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
