import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData, usePrefs } from '../lib/app-context'
import { CATALOG, CATALOG_BY_KEY, categoryOf, mergeCustom } from '../data/catalog'
import { saveBodyweight } from '../lib/db'
import { BarChart, LineChart } from '../components/charts/Charts'
import { CategoryThumb, IconTrophy, IconScale, IconChart, IconPlay, IconChevronDown } from '../components/Icons'
import { exerciseSeries, splitByCategory, volumeByDay } from '../lib/stats'
import { dateKey, fmtWeight, cx, clamp, fromKg, relativeDay, toKg } from '../lib/util'
import { Button, EmptyState, Modal, Select } from '../components/ui'
import { BodyMap, useBodyMapVariant, type BodyMapDataset } from '../components/BodyMap'
import { legendRim, legendStops, type BodyMapVariant, type IslandLayer } from '../data/bodyMapStyle'
import { BODY_VIEWBOX as FEMALE_VIEWBOX, FRONT_MUSCLES as FEMALE_FRONT, BACK_MUSCLES as FEMALE_BACK } from '../data/bodyMusclesFemale'
import { musclesFromSets } from '../data/exerciseMuscles'
import { SetsPerMuscle } from '../components/SetsPerMuscle'
import { haptic } from '../lib/haptics'
import { SkelPanel, LoadingRegion } from '../components/Skeleton'

/** One legend entry, painted from the same source the figure reads. */
function LegendSwatch({ variant, layer, label }: { variant: BodyMapVariant; layer: IslandLayer; label: string }) {
  const rim = legendRim(variant, layer)
  // 135deg matches the ramp direction the islands are painted along; a flat tier returns
  // the same colour twice, so this renders as a solid chip for those
  const [from, to] = legendStops(variant, layer)
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-2.5 w-2.5 rounded-sm ring-1 ring-inset"
        style={{
          backgroundImage: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
          // the tier's own rim when it has one, else a neutral edge so a near-black
          // resting swatch is still findable on the card
          ['--tw-ring-color' as string]: rim ?? 'rgba(255,255,255,0.15)',
        }}
      />{' '}
      {label}
    </span>
  )
}

export function Progress() {
  const nav = useNavigate()
  const { sessions, sets, prs, bodyweights, custom, refresh, loading } = useData()
  const { unit, gender } = usePrefs()
  // resolved once here so the figure and its legend cannot disagree
  const bodyMapVariant = useBodyMapVariant()
  // BodyMap defaults to the male dataset internally; only pass one explicitly for female
  const bodyMapDataset: BodyMapDataset | undefined =
    gender === 'female' ? { BODY_VIEWBOX: FEMALE_VIEWBOX, FRONT_MUSCLES: FEMALE_FRONT, BACK_MUSCLES: FEMALE_BACK } : undefined

  /* muscles trained this (Mon-start) week -> category keys, for the body map */
  const [muscleCat, setMuscleCat] = useState<string | null>(null)
  const weekStartMs = (() => {
    const x = new Date()
    x.setHours(0, 0, 0, 0)
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
    return x.getTime()
  })()
  // per-exercise, not per-category: a bench press should light the triceps and front
  // delts it actually works, not just the pecs
  const trainedThisWeek = useMemo(
    () => musclesFromSets(sets.filter((st) => new Date(st.performed_at).getTime() >= weekStartMs), custom),
    [sets, weekStartMs, custom],
  )
  const nothingTrainedYet = trainedThisWeek.size === 0

  /* volume last 14 days */
  const volMap = volumeByDay(sessions)
  const volBars = useMemo(() => {
    const out: { label: string; value: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      out.push({ label: dateKey(d), value: volMap[dateKey(d)] ?? 0 })
    }
    return out
  }, [volMap])

  /* per-exercise progression */
  const exercisesWithData = useMemo(
    () => Object.values(prs).sort((a, b) => (b.lastDate ?? '').localeCompare(a.lastDate ?? '')).map((p) => p.exercise),
    [prs],
  )
  const [exercise, setExercise] = useState('')
  const chosen = exercise || exercisesWithData[0] || ''
  const [metric, setMetric] = useState<'est1rm' | 'topWeight'>('est1rm')
  const series = chosen ? exerciseSeries(sets, chosen) : []

  /* muscle split */
  const split = splitByCategory(sessions)
  const splitMax = Math.max(1, ...split.map((s) => s.count))

  /*
   * PR board.
   *
   * The old board was an arbitrary top-8 by estimated 1RM, which meant your best lifts
   * crowded out everything else — a chest-heavy lifter could never see a single leg PR.
   * Now it filters by muscle group and pages, so every record is reachable.
   */
  const [prCat, setPrCat] = useState<string | null>(null)
  const [prPage, setPrPage] = useState(0)
  const PR_PER_PAGE = 6

  const allPRs = useMemo(
    () => Object.values(prs).filter((p) => p.bestWeight > 0).sort((a, b) => b.best1rm - a.best1rm),
    [prs],
  )
  /** only offer filters for groups that actually have a record */
  const prCats = useMemo(() => {
    const keys = new Set<string>()
    for (const x of allPRs) {
      const c = categoryOf(x.exercise, custom)?.key
      if (c) keys.add(c)
    }
    return CATALOG.filter((c) => keys.has(c.key))
  }, [allPRs, custom])

  const prFiltered = useMemo(
    () => (prCat ? allPRs.filter((x) => categoryOf(x.exercise, custom)?.key === prCat) : allPRs),
    [allPRs, prCat, custom],
  )
  const prPages = Math.max(1, Math.ceil(prFiltered.length / PR_PER_PAGE))
  useEffect(() => { if (prPage > prPages - 1) setPrPage(prPages - 1) }, [prPage, prPages])
  const prBoard = prFiltered.slice(prPage * PR_PER_PAGE, prPage * PR_PER_PAGE + PR_PER_PAGE)

  /* relative strength (bodyweight integration) */
  const latestBW = bodyweights[bodyweights.length - 1]?.kg
  const bigThree = [
    { name: 'Bench Press', pr: prs['Flat Bench Press'] ?? prs['Incline Bench Press'] },
    { name: 'Squat', pr: prs['Barbell Squats'] },
    { name: 'Deadlift', pr: prs['Dumbbell Romanian Deadlift'] },
  ].filter((x) => x.pr && x.pr.best1rm > 0)

  /* bodyweight */
  const [bw, setBw] = useState('')
  const [bf, setBf] = useState('')
  const [bfOpen, setBfOpen] = useState(false)
  const bfSeries = bodyweights.filter((b) => b.bodyFat != null)
  const logWeight = async () => {
    const typed = Number(bw)
    if (!typed) return
    // the field is labelled with the active unit, so convert before storing (always kg)
    const kg = toKg(typed, unit)
    haptic.success()
    // Only send a body-fat value when one was actually typed. `Number(bf) || undefined`
    // threw away a legitimate 0, and passing undefined through to a null in the upsert
    // wiped a reading logged earlier the same day.
    const bfNum = bf.trim() === '' ? undefined : Number(bf)
    await saveBodyweight(dateKey(), kg, bfNum != null && Number.isFinite(bfNum) ? bfNum : undefined)
    setBw('')
    setBf('')
    await refresh()
  }

  if (sessions.length === 0 && bodyweights.length === 0) {
    return (
      <div className="flex min-h-[68vh] flex-col">
        <h1 className="font-heading text-2xl font-extrabold">Progress</h1>
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-2 text-center animate-fadeUp">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-cyan/10 text-cyan shadow-glow-sm">
            <IconChart size={30} />
          </div>
          <div>
            <p className="font-heading text-lg font-extrabold text-ink">Your progress starts here</p>
            <p className="mx-auto mt-2 max-w-[34ch] text-sm leading-relaxed text-muted2">
              Log your first workout and your PRs, weekly volume, streak and charts build automatically — nothing to set up.
            </p>
          </div>
          <Button onClick={() => nav('/')} className="shadow-glow">
            <IconPlay size={18} /> Start a workout
          </Button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <LoadingRegion label="Loading your progress" />
        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight">Progress</h1>
          <p className="mt-1 text-sm text-muted">Where the work has actually gone, and what it moved.</p>
        </div>
        <div className="grid gap-5 xl:grid-cols-12">
          <div className="xl:col-span-5"><SkelPanel height="h-[420px]" /></div>
          <div className="flex flex-col gap-5 xl:col-span-7">
            <SkelPanel height="h-[200px]" />
            <SkelPanel height="h-[150px]" />
          </div>
          <div className="xl:col-span-12"><SkelPanel height="h-[150px]" /></div>
          <div className="xl:col-span-6"><SkelPanel height="h-[220px]" /></div>
          <div className="xl:col-span-6"><SkelPanel height="h-[220px]" /></div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">Progress</h1>
        <p className="mt-1 text-sm text-muted">Where the work has actually gone, and what it moved.</p>
      </div>

      {/*
        A 12-column dashboard rather than one tall column. The spans are chosen so the
        sections tile in DOM order (5+7, 12, 12, 6+6, 5+7); a conditional section dropping
        out just reflows, it never leaves a hole.
      */}
      <div className="grid gap-5 xl:grid-cols-12">
      <section className="card p-4 xl:col-span-5">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted">Muscles worked this week · tap for detail</p>
        {/*
          Bounded on purpose. Given the whole viewport the two figures scale to ~1400px and
          push every chart below the fold — the exact "phone layout stretched wide" failure
          this rebuild exists to avoid.
        */}
        <div className="mx-auto max-w-[420px]">
          <BodyMap trained={trainedThisWeek} onPick={setMuscleCat} variant={bodyMapVariant} dataset={bodyMapDataset} />
        </div>
        {nothingTrainedYet ? (
          <p className="mt-3 text-center text-[11px] text-muted">
            Nothing logged this week yet — muscles light up as you train them. Tap any muscle to see its progress.
          </p>
        ) : (
          <div className="mt-3 flex items-center justify-center gap-4 text-[11px] text-muted">
            {/* Every swatch is read out of the same paint the figure is drawn with, for the
                same variant the figure resolved — a legend that does not match the fill it
                labels is worse than no legend. The ring is there because an honest resting
                swatch is nearly black; without an edge you could not find it on the card. */}
            <LegendSwatch variant={bodyMapVariant} layer="primary" label="Worked" />
            <LegendSwatch variant={bodyMapVariant} layer="secondary" label="Assisting" />
            <LegendSwatch variant={bodyMapVariant} layer="rest" label="Not yet" />
          </div>
        )}
      </section>

      {/*
        These two share the right-hand column so they fill the height of the body map beside
        them — on its own the sets card left roughly 400px of dead space underneath.
      */}
      <div className="flex flex-col gap-5 xl:col-span-7">
        <SetsPerMuscle sets={sets} custom={custom} />
        <section className="card flex flex-1 flex-col p-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">Volume · last 14 days</p>
          <div className="flex-1">
            <BarChart bars={volBars} height={150} />
          </div>
        </section>
      </div>

      {/* per-exercise progression */}
      {chosen ? (
        <section className="card p-4 xl:col-span-12">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Select
              className="min-w-0 flex-1"
              aria-label="Choose an exercise"
              value={chosen}
              onChange={setExercise}
              options={exercisesWithData.map((e) => ({ value: e, label: e }))}
            />
            <div className="flex rounded-xl border border-line2 p-0.5 text-xs font-bold">
              <button onClick={() => setMetric('est1rm')} className={cx('rounded-lg px-2.5 py-1.5', metric === 'est1rm' ? 'bg-cyan text-cyan-ink' : 'text-muted')}>
                1RM
              </button>
              <button onClick={() => setMetric('topWeight')} className={cx('rounded-lg px-2.5 py-1.5', metric === 'topWeight' ? 'bg-cyan text-cyan-ink' : 'text-muted')}>
                Top
              </button>
            </div>
          </div>
          <LineChart
            points={series.map((s) => ({
              x: s.date,
              y: Math.round(fromKg(metric === 'est1rm' ? s.est1rm : s.topWeight, unit) * 10) / 10,
            }))}
            height={130}
          />
          {series.length > 0 && (
            <p className="mt-2 text-center text-xs text-muted">
              {series[0].date} → today · best {fmtWeight(Math.max(...series.map((s) => (metric === 'est1rm' ? s.est1rm : s.topWeight))), unit)} {unit}
            </p>
          )}
        </section>
      ) : (
        <div className="xl:col-span-12">
          <EmptyState title="No progression yet" sub="Complete a few workouts to see your progression here." />
        </div>
      )}

      {/* PR board */}
      {prBoard.length > 0 ? (
        <section className="xl:col-span-6">
          <h2 className="mb-2 flex items-center gap-2 px-1 font-heading text-sm font-bold uppercase tracking-wide text-muted">
            <IconTrophy size={16} className="text-cyan" />
            <span className="flex-1">Personal records</span>
            <span className="text-xs font-bold text-muted">{prFiltered.length}</span>
          </h2>

          {prCats.length > 1 && (
            <div className="mb-2.5 flex gap-1.5 overflow-x-auto px-0.5 pb-1" role="tablist">
              <button
                role="tab"
                aria-selected={prCat === null}
                onClick={() => { haptic.select(); setPrCat(null); setPrPage(0) }}
                className={cx(
                  'min-h-[30px] shrink-0 rounded-full border px-3 text-[11px] font-bold transition',
                  prCat === null ? 'border-cyan bg-cyan text-cyan-ink' : 'border-line2 text-muted2 hover:text-ink',
                )}
              >
                All
              </button>
              {prCats.map((c) => (
                <button
                  key={c.key}
                  role="tab"
                  aria-selected={prCat === c.key}
                  onClick={() => { haptic.select(); setPrCat(prCat === c.key ? null : c.key); setPrPage(0) }}
                  className={cx(
                    'min-h-[30px] shrink-0 rounded-full border px-3 text-[11px] font-bold transition',
                    prCat === c.key ? 'border-cyan bg-cyan text-cyan-ink' : 'border-line2 text-muted2 hover:text-ink',
                  )}
                >
                  {c.title}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-2">
            {prBoard.map((p) => (
              <div key={p.exercise} className="flex items-center justify-between rounded-2xl glass px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 truncate font-heading text-sm font-bold">{p.exercise}</span>
                  {p.bestDate && (
                    <span className="shrink-0 text-[10px] text-muted">{relativeDay(p.bestDate)}</span>
                  )}
                  {latestBW ? (
                    <span className="shrink-0 rounded-full bg-cyan/[0.12] px-2 py-0.5 text-[10px] font-bold text-cyan">{(p.best1rm / latestBW).toFixed(1)}×BW</span>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-4 text-right">
                  <div>
                    <p className="tnum font-heading text-sm font-extrabold text-cyan-soft">{fmtWeight(p.bestWeight, unit)}{unit}</p>
                    <p className="text-[10px] text-muted">×{p.bestReps} best</p>
                  </div>
                  <div>
                    <p className="tnum font-heading text-sm font-extrabold">{fmtWeight(p.best1rm, unit)}</p>
                    <p className="text-[10px] text-muted">est 1RM</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <div className="xl:col-span-6">
          <EmptyState icon={<IconTrophy size={26} />} title="No PRs yet" sub="Hit your first PR and it'll show up here." />
        </div>
      )}

      {/* strength standards */}
      {latestBW && bigThree.length > 0 && (
        <section className="card p-4 xl:col-span-6">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted">Strength standards</p>
          <div className="flex flex-col gap-4">
            {bigThree.map(({ name, pr }) => {
              const ratio = pr!.best1rm / latestBW
              const pct = clamp(ratio / 2, 0, 1) * 100
              return (
                <div key={name}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-bold text-ink2">{name}</span>
                    <span className="tnum font-bold text-cyan-soft">{ratio.toFixed(2)}×BW</span>
                  </div>
                  <div className="relative h-2.5 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-cyan transition-[width] duration-500" style={{ width: `${pct}%` }} />
                    {[25, 50, 75].map((m) => (
                      <span key={m} className="absolute top-0 h-full w-px bg-black/40" style={{ left: `${m}%` }} />
                    ))}
                  </div>
                  <div className="relative mt-1 h-3 text-[9px] font-semibold text-muted">
                    {([[25, '0.5×'], [50, '1×'], [75, '1.5×'], [100, '2×']] as [number, string][]).map(([pos, lab]) => (
                      <span key={lab} className="absolute -translate-x-1/2" style={{ left: `${pos}%` }}>{lab}</span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* muscle split */}
      {split.length > 0 && (
        <section className="card p-4 xl:col-span-5">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted">Split · last 30 days</p>
          <div className="flex flex-col gap-2.5">
            {split.map((s) => {
              const cat = CATALOG_BY_KEY[s.key]
              return (
                <div key={s.key} className="flex items-center gap-3">
                  <CategoryThumb icon={s.key} size={28} className="rounded-lg" />
                  <span className="w-24 shrink-0 truncate text-xs text-muted2">{cat?.title ?? s.key}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-cyan" style={{ width: `${(s.count / splitMax) * 100}%` }} />
                  </div>
                  <span className="tnum w-5 text-right text-xs font-bold">{s.count}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* bodyweight */}
      <section className="card p-4 xl:col-span-7">
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted">
            <IconScale size={15} /> Bodyweight
          </p>
          {bodyweights.length > 0 && <p className="tnum text-sm font-bold text-cyan-soft">{fmtWeight(bodyweights[bodyweights.length - 1].kg, unit)} {unit}</p>}
        </div>
        {bodyweights.length > 1 ? (
          <LineChart points={bodyweights.map((b) => ({ x: b.date, y: Math.round(fromKg(b.kg, unit) * 10) / 10 }))} height={110} />
        ) : (
          <p className="py-3 text-center text-xs text-muted">Log your weight to start the trend.</p>
        )}

        {bfSeries.length > 1 && (
          <div className="mt-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">Body fat · %</p>
            <LineChart points={bfSeries.map((b) => ({ x: b.date, y: b.bodyFat as number }))} height={90} />
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            value={bw}
            onChange={(e) => setBw(e.target.value)}
            placeholder={`Today's weight (${unit})`}
            className="flex-1 rounded-xl border border-line2 bg-panel2 px-3 py-2.5 text-sm outline-none placeholder:text-muted"
          />
          <Button variant="outline" onClick={logWeight} disabled={!Number(bw)}>
            Log
          </Button>
        </div>

        <button
          onClick={() => { haptic.select(); setBfOpen((v) => !v) }}
          className="mt-2 flex items-center gap-1 text-xs font-semibold text-muted hover:text-muted2"
          aria-expanded={bfOpen}
        >
          <IconChevronDown size={14} className={cx('transition', bfOpen && 'rotate-180')} /> Log body fat %
        </button>
        {bfOpen && (
          <input
            type="number"
            inputMode="decimal"
            value={bf}
            onChange={(e) => setBf(e.target.value)}
            placeholder="Body fat % (saved with your weight)"
            className="animate-fadeUp mt-2 w-full rounded-xl border border-line2 bg-panel2 px-3 py-2.5 text-sm outline-none placeholder:text-muted"
          />
        )}
      </section>
      </div>

      <Modal open={!!muscleCat} onClose={() => setMuscleCat(null)} title={muscleCat ? `${CATALOG_BY_KEY[muscleCat]?.title ?? ''} · progress` : ''} maxW="max-w-lg">
        {muscleCat &&
          (() => {
            const cat = mergeCustom(custom).find((c) => c.key === muscleCat)
            const exs = cat?.exercises ?? []
            return (
              <div className="flex max-h-[66vh] flex-col gap-3 overflow-y-auto no-scrollbar">
                {exs.map((e) => {
                  const pr = prs[e.name]
                  const series = pr ? exerciseSeries(sets, e.name) : []
                  return (
                    <div key={e.name} className="rounded-2xl glass p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate font-heading text-sm font-bold">{e.name}</span>
                        {pr ? (
                          <span className="tnum shrink-0 text-xs font-bold text-cyan-soft">
                            {fmtWeight(pr.best1rm, unit)}{unit} <span className="text-muted">1RM</span>
                          </span>
                        ) : (
                          <span className="shrink-0 text-[11px] font-semibold text-muted">Not logged yet</span>
                        )}
                      </div>
                      {pr && series.length > 1 ? (
                        <div className="mt-2">
                          <LineChart points={series.map((sp) => ({ x: sp.date, y: Math.round(fromKg(sp.est1rm, unit) * 10) / 10 }))} height={64} />
                        </div>
                      ) : pr ? (
                        <p className="mt-1 text-xs text-muted">
                          Best {fmtWeight(pr.bestWeight, unit)}{unit} × {pr.bestReps} · one session logged
                        </p>
                      ) : null}
                    </div>
                  )
                })}
                <Button
                  className="mt-1 w-full"
                  onClick={() => {
                    setMuscleCat(null)
                    nav(`/category/${muscleCat}`)
                  }}
                >
                  <IconPlay size={17} /> Start {cat?.title} workout
                </Button>
              </div>
            )
          })()}
      </Modal>
    </div>
  )
}
