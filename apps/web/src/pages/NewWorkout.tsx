/*
 * Build one session out of several muscle groups.
 *
 * The old route was Home -> a category -> its exercises -> train. That models a session as
 * belonging to exactly one muscle group, which a planned day frequently is not: chest and
 * triceps on the same day is one trip to the gym, and doing it meant finishing a chest
 * session and starting a triceps one to log the second half of it.
 *
 * So this page is the session builder. It opens pre-armed with whatever today's plan says,
 * lists every exercise grouped by muscle, and hands the whole selection to /session as a
 * single ActiveSession.
 *
 * `/category/:key` is deliberately untouched and still reachable — it is the place to browse
 * a muscle group, read form notes and look at the images, and it is what the planner's
 * "Start <group>" row still opens.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData, useSession } from '../lib/app-context'
import { CATALOG } from '../data/catalog'
import { CategoryThumb, IconCheck, IconPlay, IconClose } from '../components/Icons'
import { WEEKDAYS, cx } from '../lib/util'
import { haptic } from '../lib/haptics'
import type { ActiveSession } from '../lib/types'

/** The key a session gets when it spans more than one muscle group. */
export const MIXED_KEY = 'mixed'

export function NewWorkout() {
  const nav = useNavigate()
  const { plan, custom } = useData()
  const { start } = useSession()

  const todayName = WEEKDAYS[(new Date().getDay() + 6) % 7]
  const planned = useMemo(
    () =>
      plan
        .filter((p) => p.day === todayName)
        .sort((a, b) => a.slot - b.slot)
        .map((p) => p.category_key),
    [plan, todayName],
  )

  /*
   * Groups open in plan order, then everything else. A planned day is the common case and
   * its exercises should be the ones already on screen; the rest stay collapsed rather than
   * absent, because a session is allowed to wander off the plan.
   */
  const ordered = useMemo(() => {
    const inPlan = planned.map((k) => CATALOG.find((c) => c.key === k)).filter(Boolean) as typeof CATALOG
    const rest = CATALOG.filter((c) => !planned.includes(c.key))
    return [...inPlan, ...rest]
  }, [planned])

  const [open, setOpen] = useState<Set<string>>(() => new Set(planned.length ? planned : [CATALOG[0].key]))
  const [picked, setPicked] = useState<{ exercise: string; categoryKey: string }[]>([])
  // whether the reader has opened or closed a group themselves
  const touched = useRef(false)

  /*
   * Open the planned groups once the plan actually arrives.
   *
   * The initial state above runs on the first render, when `plan` is still empty because the
   * data is loading — so it fell through to "open the first category", and a day planned as
   * biceps and triceps opened on chest with everything else collapsed. The whole point of
   * this screen is that today's groups are the ones already in front of you.
   *
   * Guarded by `touched` so this never reopens a group the reader has just collapsed.
   */
  useEffect(() => {
    if (touched.current || !planned.length) return
    setOpen(new Set(planned))
  }, [planned])

  const isPicked = (name: string) => picked.some((p) => p.exercise === name)
  const toggle = (name: string, categoryKey: string) => {
    haptic.select()
    setPicked((p) => (p.some((x) => x.exercise === name) ? p.filter((x) => x.exercise !== name) : [...p, { exercise: name, categoryKey }]))
  }
  const toggleGroup = (key: string) => {
    touched.current = true
    setOpen((s) => {
      const n = new Set(s)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }

  /** Custom exercises are user-authored, so they live alongside the built-ins of their group. */
  const namesFor = (key: string) => {
    const cat = CATALOG.find((c) => c.key === key)
    const builtin = cat?.exercises.map((e) => e.name) ?? []
    const extra = custom.filter((c) => c.category_key === key).map((c) => c.name)
    return [...builtin, ...extra.filter((n) => !builtin.includes(n))]
  }

  const usedCategories = useMemo(() => [...new Set(picked.map((p) => p.categoryKey))], [picked])

  const begin = () => {
    if (!picked.length) return
    haptic.success()
    /*
     * One category -> the session is that category, exactly as before. More than one -> it
     * is 'mixed'. Either way each exercise carries its own category, so every set is filed
     * under the muscle it actually trained and the heat map and per-group stats stay exact.
     */
    const single = usedCategories.length === 1 ? usedCategories[0] : null
    const title = single
      ? (CATALOG.find((c) => c.key === single)?.title ?? 'Workout')
      : usedCategories.map((k) => CATALOG.find((c) => c.key === k)?.title ?? k).join(' + ')
    const s: ActiveSession = {
      categoryKey: single ?? MIXED_KEY,
      title,
      startedAt: Date.now(),
      exercises: picked.map((p) => ({
        exercise: p.exercise,
        categoryKey: p.categoryKey,
        sets: [{ weight: 0, reps: 0, done: false }],
      })),
    }
    start(s)
    nav('/session')
  }

  return (
    <div className="flex flex-col gap-5 pb-28">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight">Build today's session</h1>
          <p className="mt-1 text-sm text-muted">
            {planned.length
              ? `${todayName} is planned as ${planned.map((k) => CATALOG.find((c) => c.key === k)?.title ?? k).join(' + ')}. Pick what you'll actually do.`
              : 'Nothing planned today — pick anything you like.'}
          </p>
        </div>
        <button
          onClick={() => nav(-1)}
          aria-label="Cancel and go back"
          className="shrink-0 rounded-xl border border-line2 p-2 text-muted transition hover:border-bad/50 hover:text-bad"
        >
          <IconClose size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        {ordered.map((cat) => {
          const names = namesFor(cat.key)
          const chosen = picked.filter((p) => p.categoryKey === cat.key).length
          const isOpen = open.has(cat.key)
          return (
            <section key={cat.key} className="overflow-hidden rounded-2xl border border-line bg-panel2/50">
              <button
                onClick={() => toggleGroup(cat.key)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-white/[0.03]"
              >
                <CategoryThumb icon={cat.key} size={34} className="shrink-0 rounded-lg" />
                <span className="min-w-0 flex-1">
                  <span className="block font-heading text-sm font-bold">{cat.title}</span>
                  <span className="block text-[11px] text-muted">
                    {names.length} exercises
                    {planned.includes(cat.key) && <span className="ml-1.5 text-cyan">· planned today</span>}
                  </span>
                </span>
                {chosen > 0 && (
                  <span className="shrink-0 rounded-full bg-cyan px-2 py-0.5 text-[11px] font-bold text-cyan-ink">{chosen}</span>
                )}
                <span aria-hidden className={cx('shrink-0 text-muted transition', isOpen && 'rotate-180')}>▾</span>
              </button>

              {isOpen && (
                <ul className="grid gap-1.5 border-t border-line p-3 sm:grid-cols-2">
                  {names.map((name) => {
                    const on = isPicked(name)
                    return (
                      <li key={name}>
                        <button
                          onClick={() => toggle(name, cat.key)}
                          aria-pressed={on}
                          className={cx(
                            'flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[13px] transition',
                            on ? 'border-cyan bg-cyan/15 font-bold text-cyan' : 'border-line2 text-muted2 hover:border-cyan/40 hover:text-ink',
                          )}
                        >
                          <span
                            className={cx(
                              'grid h-4 w-4 shrink-0 place-items-center rounded border',
                              on ? 'border-cyan bg-cyan text-cyan-ink' : 'border-line2',
                            )}
                          >
                            {on && <IconCheck size={11} />}
                          </span>
                          <span className="truncate">{name}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )
        })}
      </div>

      {/*
        A fixed bar rather than a button at the bottom of a long list: the list is eight
        collapsible groups deep, and a control you have to scroll to find is a control that
        gets missed.
      */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-panel2/95 px-5 py-3 backdrop-blur-xl xl:left-[var(--sidebar,0px)]">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <p className="min-w-0 flex-1 text-[12px] text-muted">
            {picked.length === 0 ? (
              'Choose at least one exercise'
            ) : (
              <>
                <span className="font-bold text-ink">{picked.length}</span> exercise{picked.length === 1 ? '' : 's'}
                {usedCategories.length > 1 && <>{' '}across {usedCategories.length} groups</>}
              </>
            )}
          </p>
          <button
            onClick={begin}
            disabled={!picked.length}
            className={cx(
              'flex shrink-0 items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold transition',
              picked.length ? 'btn-cyan shadow-glow-sm hover:brightness-110' : 'cursor-not-allowed border border-line2 text-muted',
            )}
          >
            <IconPlay size={14} /> Start
          </button>
        </div>
      </div>
    </div>
  )
}
