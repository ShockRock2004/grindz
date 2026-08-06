/**
 * Train — the landing surface once you are signed in.
 *
 * On a phone this was one scrolling column: stats, then today, then a stack of full-width
 * category cards. A browser gives us horizontal room, so the page splits into a working area
 * (the categories you came here to pick from) and a rail that keeps the week's numbers and
 * today's plan permanently in view instead of scrolled off the top.
 *
 * The rail is `position: sticky`, so on a tall monitor it stays put while the grid scrolls;
 * below `xl` it drops back above the grid, which is the phone order.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../lib/app-context'
import { CATALOG, categoryOf } from '../data/catalog'
import { cdnHero } from '../data/assetCdn'
import { Ring } from '../components/Ring'
import { CategoryThumb, IconCheck, IconFlame, IconDumbbell, IconClock } from '../components/Icons'
import { CountUp } from '../components/CountUp'
import { currentStreak, weekSummary, hardSetsByCategory } from '../lib/stats'
import { WEEKDAYS, dateKey, fmtCount, cx } from '../lib/util'
import { haptic } from '../lib/haptics'
import { SkelCard, SkelWeekCard, SkelTodayCard, LoadingRegion } from '../components/Skeleton'
import { Kbd, ModK } from '../components/Kbd'

const GROUPS = [
  { key: 'all', label: 'All' },
  { key: 'push', label: 'Push' },
  { key: 'pull', label: 'Pull' },
  { key: 'legs', label: 'Legs' },
  { key: 'core', label: 'Core' },
  { key: 'cardio', label: 'Cardio' },
]
const CAT_GROUP: Record<string, string> = { chest: 'push', shoulders: 'push', triceps: 'push', back: 'pull', biceps: 'pull', legs: 'legs', abs: 'core', cardio: 'cardio' }
/*
 * Card imagery.
 *
 * This used to be three per-category magic-number maps (HERO_ZOOM / HERO_ANCHOR / HERO_X)
 * feeding a 240%-tall image centred on the card. Two things were wrong with it:
 *
 *   1. Only six of the eight categories used the pre-cropped single-figure hero — chest and
 *      cardio fell back to a two-figure exercise photo, so those cards framed a dumbbell or a
 *      handlebar rather than an athlete. All eight heroes exist on the CDN (verified), so every
 *      card now uses one and the framing is consistent by construction.
 *   2. A cutout centred vertically has no perceptual anchor, which is what made the crops look
 *      arbitrary. Sharing a GROUND LINE — bottom-aligned, feet sinking just past the card edge —
 *      is what makes a cutout read as placed rather than randomly sliced.
 *
 * One rule for all eight now, with no per-category tuning left to maintain.
 */
const HERO_SCRIM =
  'linear-gradient(to right, #101018 0%, rgba(16,16,24,0.985) 12%, rgba(16,16,24,0.94) 24%, rgba(16,16,24,0.86) 35%, rgba(16,16,24,0.74) 45%, rgba(16,16,24,0.58) 56%, rgba(16,16,24,0.40) 67%, rgba(16,16,24,0.20) 80%, rgba(16,16,24,0) 100%)'
// pools darkness under the headline specifically, so contrast survives whatever the figure does
const HERO_POOL =
  'radial-gradient(120% 100% at 0% 100%, rgba(5,5,5,0.72) 0%, rgba(5,5,5,0.32) 45%, transparent 72%)'
// dissolves the figure into the card edge instead of hard-clipping it
const HERO_MASK = 'linear-gradient(to bottom, #000 0%, #000 80%, rgba(0,0,0,0.4) 93%, transparent 100%)'
// cyan backlight + a contact shadow; the second is what stops a cutout looking like a sticker
const HERO_FILTER = 'drop-shadow(-8px 0 18px rgba(0,198,255,0.16)) drop-shadow(0 16px 20px rgba(0,0,0,0.55))'

export function Home() {
  const nav = useNavigate()
  const { sessions, sets, custom, plan, loading } = useData()

  const week = weekSummary(sessions)

  // hard sets, not tonnage — see hardSetsByCategory for why
  const hardSets = useMemo(() => {
    const by = hardSetsByCategory(sets, (ex) => categoryOf(ex, custom)?.key)
    return Object.values(by).reduce((a, n) => a + n, 0)
  }, [sets, custom])

  /** categories already trained today, so a finished plan row stops saying "Start" */
  const doneToday = useMemo(() => {
    const today = dateKey()
    const out = new Set<string>()
    for (const x of sessions) if (dateKey(new Date(x.started_at)) === today) out.add(x.category_key)
    return out
  }, [sessions])
  const streak = currentStreak(sessions)
  const plannedDays = new Set(plan.map((p) => p.day)).size
  const goal = Math.max(plannedDays, 3)

  const todayName = WEEKDAYS[(new Date().getDay() + 6) % 7]
  const todaysPlan = plan
    .filter((p) => p.day === todayName)
    .sort((a, b) => a.slot - b.slot)
    .map((p) => CATALOG.find((c) => c.key === p.category_key))
    .filter(Boolean)

  const go = (key: string) => {
    haptic.select()
    nav(`/category/${key}`)
  }

  const [filter, setFilter] = useState('all')
  const visibleCats = filter === 'all' ? CATALOG : CATALOG.filter((c) => CAT_GROUP[c.key] === filter)

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_336px]">
      {/* ------------------------------------------------------------------ working area */}
      <section className="order-2 min-w-0 xl:order-1">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-extrabold tracking-tight">Train</h1>
            <p className="mt-1 text-sm text-muted">Pick a muscle group to build today's session.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {GROUPS.map((g) => (
              <button
                key={g.key}
                onClick={() => {
                  haptic.select()
                  setFilter(g.key)
                }}
                aria-pressed={filter === g.key}
                className={cx(
                  'rounded-full px-4 py-2 text-xs font-bold transition',
                  filter === g.key ? 'btn-cyan shadow-glow-sm' : 'border border-line2 text-muted2 hover:border-cyan/40 hover:text-ink',
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {/* one per real category, so the grid does not reflow when the data lands */}
          {loading &&
            Array.from({ length: CATALOG.length }).map((_, i) => <SkelCard key={`s${i}`} />)}
          {!loading &&
            visibleCats.map((c, i) => (
            <button
              key={c.key}
              onClick={() => go(c.key)}
              className="group relative flex h-56 animate-fadeUp overflow-hidden rounded-3xl bg-panel2 text-left shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-raise focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
              style={{ animationDelay: `${i * 45}ms` }}
            >
              {/* the figure — bottom-aligned so every card shares a ground line */}
              <img
                src={cdnHero(c.key)}
                alt=""
                loading="lazy"
                style={{
                  filter: HERO_FILTER,
                  maskImage: HERO_MASK,
                  WebkitMaskImage: HERO_MASK,
                }}
                className="pointer-events-none absolute bottom-0 right-0 h-[118%] max-w-none translate-x-[7%] translate-y-[5%] select-none object-contain object-bottom transition duration-300 group-hover:translate-y-[3%] group-hover:scale-[1.02]"
              />
              {/*
                Nine-stop eased scrim rather than a three-stop wash: on a near-black surface a
                short gradient bands visibly, and a flat wash dims the whole photo instead of
                just the side the text sits on.
              */}
              <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: HERO_SCRIM }} />
              <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: HERO_POOL }} />
              <div className="relative z-10 flex flex-1 flex-col justify-between p-5">
                <span className="w-fit rounded-full bg-cyan/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan ring-1 ring-cyan/25">
                  {c.subtitle.split(' / ')[0]}
                </span>
                <div>
                  <h3 className="font-heading text-[26px] font-extrabold leading-none">{c.title}</h3>
                  <div className="mt-2.5 flex items-center gap-3 text-xs text-muted2">
                    <span className="flex items-center gap-1.5">
                      <IconDumbbell size={13} className="text-cyan-soft" /> {c.exercises.length} exercises
                    </span>
                    <span className="flex items-center gap-1.5">
                      <IconClock size={13} className="text-cyan-soft" /> ~{c.exercises.length * 8} min
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {loading && <LoadingRegion label="Loading your workouts" />}
      </section>

      {/* -------------------------------------------------------------------------- rail */}
      <aside className="order-1 flex flex-col gap-5 xl:order-2 xl:sticky xl:top-6 xl:self-start">
        {loading && (
          <>
            <SkelWeekCard />
            <SkelTodayCard />
          </>
        )}
        {!loading && (
        <>
        <section className="animate-fadeUp card p-5">
          <h2 className="font-heading text-xs font-bold uppercase tracking-[0.14em] text-muted">This week</h2>
          <div className="mt-4 flex items-center gap-4">
            <Ring value={week.sessions / goal} size={104} stroke={10}>
              <CountUp value={week.sessions} className="tnum font-heading text-[30px] font-extrabold leading-none" />
              <span className="text-[10px] font-semibold text-muted">of {goal}</span>
            </Ring>
            <div className="grid flex-1 grid-cols-2 gap-2.5">
              <StatTile label="Streak" value={<CountUp value={streak} />} unit="d" icon={<IconFlame size={14} className="text-cyan" />} />
              <StatTile label="Hard sets" value={<CountUp value={hardSets} />} />
              <StatTile label="Sets" value={<CountUp value={week.sets} />} />
              <StatTile label="Minutes" value={<CountUp value={week.minutes} format={fmtCount} />} />
            </div>
          </div>
        </section>

        <section className="animate-fadeUp card p-5">
          <h2 className="font-heading text-xs font-bold uppercase tracking-[0.14em] text-muted">
            Today · {todayName}
          </h2>
          {todaysPlan.length === 0 ? (
            <div className="mt-3">
              <p className="text-[13px] leading-relaxed text-muted">
                Nothing planned for today. Pick anything from the grid, or set a split.
              </p>
              <button
                onClick={() => nav('/planner')}
                className="mt-3 w-full rounded-xl border border-line2 py-2 text-[13px] font-bold text-cyan transition hover:border-cyan/40"
              >
                Open the planner
              </button>
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {todaysPlan.map((c, i) => {
                const done = doneToday.has(c!.key)
                return (
                  <button
                    key={i}
                    onClick={() => go(c!.key)}
                    aria-label={done ? `${c!.title}, done today. Train it again` : `Start ${c!.title}`}
                    className={cx(
                      'flex items-center gap-3 overflow-hidden rounded-2xl p-2.5 pr-3 text-left transition hover:brightness-125',
                      done ? 'bg-white/5 ring-1 ring-line' : 'bg-cyan/[0.1] ring-1 ring-cyan/25',
                    )}
                  >
                    <CategoryThumb icon={c!.key} size={42} />
                    <div className="min-w-0 flex-1">
                      <p className={cx('truncate font-heading text-sm font-bold leading-tight', done && 'text-muted2')}>{c!.title}</p>
                      <p className="truncate text-[11px] text-muted2">{done ? 'Done today' : c!.subtitle}</p>
                    </div>
                    {done ? (
                      <span className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-cyan ring-1 ring-cyan/35">
                        <IconCheck size={12} /> Again
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-lg bg-cyan px-2.5 py-1 text-[11px] font-bold text-cyan-ink">Start</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </section>
        </>
        )}

        <p className="hidden px-1 text-[11px] leading-relaxed text-muted xl:block">
          Press <ModK className="align-middle" /> to jump to any exercise, or <Kbd className="align-middle">?</Kbd> for
          every shortcut.
        </p>
      </aside>
    </div>
  )
}

function StatTile({ label, value, unit, icon }: { label: string; value: React.ReactNode; unit?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/[0.05] px-3 py-2.5">
      <div className="flex items-center gap-1">
        {icon}
        <p className="tnum font-heading text-base font-extrabold leading-none">
          {value}
          {unit && <span className="ml-0.5 text-[11px] font-semibold text-muted">{unit}</span>}
        </p>
      </div>
      <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</p>
    </div>
  )
}
