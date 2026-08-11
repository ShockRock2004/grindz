import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData, usePrefs, useSession } from '../lib/app-context'
import { mergeCustom, exerciseMode, exerciseImage, categoryOf, CATALOG_BY_KEY } from '../data/catalog'
import { lastPerformance } from '../lib/stats'
import { epley1rm, fmtDuration, fmtWeight, cx, rpeClasses, fromKg, toKg } from '../lib/util'
import { useWakeLock } from '../lib/useWakeLock'
import { haptic } from '../lib/haptics'
import { saveTemplate } from '../lib/db'
import { Button, Modal, Celebration, EmptyState, ConfirmDialog } from '../components/ui'
import { ExerciseImage } from '../components/ExerciseImage'
import {
  IconArrowLeft,
  IconCheck,
  IconPlus,
  IconClose,
  IconTrophy,
  IconLink,
  IconDumbbell,
  IconStar,
} from '../components/Icons'
import type { ActiveSession, SetEntry, TemplateExercise } from '../lib/types'

export function Session() {
  const nav = useNavigate()
  const { active, update, finish, discard } = useSession()
  const { sets, prs, custom, favorites } = useData()
  const { unit, gender } = usePrefs()
  useWakeLock(!!active)

  const [now, setNow] = useState(Date.now())
  const [picker, setPicker] = useState(false)
  const [summary, setSummary] = useState(false)
  const [celebrate, setCelebrate] = useState<{ exercise: string; text: string }[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState(false)
  const [asTemplate, setAsTemplate] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const earnedPRs = useMemo(() => {
    const out: { exercise: string; text: string }[] = []
    if (!active) return out
    active.exercises.forEach((e) => {
      const logged = e.sets.filter((s) => s.reps > 0 && !s.warmup)
      if (!logged.length) return
      const maxW = Math.max(...logged.map((s) => s.weight))
      const max1 = Math.max(...logged.map((s) => epley1rm(s.weight, s.reps)))
      const prev = prs[e.exercise]
      if (maxW > 0 && (!prev || maxW > prev.bestWeight + 0.001)) out.push({ exercise: e.exercise, text: `${fmtWeight(maxW, unit)} ${unit} top set` })
      else if (prev && max1 > prev.best1rm + 0.5) out.push({ exercise: e.exercise, text: `Est. 1RM ${fmtWeight(max1, unit)} ${unit}` })
    })
    return out
  }, [active, prs, unit])

  if (!active) {
    return celebrate ? (
      <Celebration prs={celebrate} onDone={() => { setCelebrate(null); nav('/') }} />
    ) : (
      <div data-testid="session" className="flex min-h-full items-center justify-center p-6">
        <EmptyState title="No active workout" sub="Pick a muscle group and hit Start Workout." />
      </div>
    )
  }

  const elapsed = Math.floor((now - active.startedAt) / 1000)

  /* ---- mutators ---- */
  const mutEx = (i: number, fn: (e: ActiveSession['exercises'][number]) => ActiveSession['exercises'][number]) =>
    update((s) => ({ ...s, exercises: s.exercises.map((e, k) => (k === i ? fn(e) : e)) }))

  const setSetField = (ei: number, si: number, patch: Partial<SetEntry>) =>
    mutEx(ei, (e) => ({ ...e, sets: e.sets.map((st, k) => (k === si ? { ...st, ...patch } : st)) }))

  const toggleDone = (ei: number, si: number) => {
    const st = active.exercises[ei].sets[si]
    const nextDone = !st.done
    haptic.select()
    setSetField(ei, si, nextDone ? { done: true } : { done: false, rpe: undefined })
  }

  /** Abs work can be logged either way, so those cards expose a reps/time toggle. */
  const setMode = (ei: number, mode: 'reps' | 'timed') => {
    haptic.select()
    mutEx(ei, (e) => ({ ...e, mode }))
  }

  const setRpe = (ei: number, si: number, rpe: number) => {
    haptic.select()
    setSetField(ei, si, { rpe })
  }

  const addSet = (ei: number) => {
    haptic.select()
    mutEx(ei, (e) => {
      const last = e.sets[e.sets.length - 1]
      return { ...e, sets: [...e.sets, { weight: last?.weight ?? 0, reps: last?.reps ?? 0, done: false, duration_s: last?.duration_s, distance_m: last?.distance_m }] }
    })
  }
  const removeSet = (ei: number, si: number) => mutEx(ei, (e) => ({ ...e, sets: e.sets.filter((_, k) => k !== si) }))
  const removeExercise = (ei: number) => update((s) => ({ ...s, exercises: s.exercises.filter((_, k) => k !== ei) }))
  const setNote = (ei: number, note: string) => mutEx(ei, (e) => ({ ...e, note }))
  /**
   * Pair an exercise with the one above it (the button reads "Superset with previous").
   * Group ids are shared by every member of a chain and checked with `!== undefined`,
   * so group 0 is a real group rather than a falsy no-op — the old `e.ss ? … : ei`
   * gave each exercise its own id and left index 0 permanently un-supersettable.
   */
  const toggleSuperset = (ei: number) => {
    if (ei === 0) return // nothing above to pair with
    haptic.select()
    update((s) => {
      const exs = s.exercises
      const cur = exs[ei]
      if (cur.ss !== undefined) {
        // leaving the chain — dissolve it too if that would strand a single member
        const gid = cur.ss
        const others = exs.filter((e, k) => k !== ei && e.ss === gid)
        const dissolve = others.length <= 1
        return {
          ...s,
          exercises: exs.map((e, k) => (k === ei || (dissolve && e.ss === gid) ? { ...e, ss: undefined } : e)),
        }
      }
      const prev = exs[ei - 1]
      const gid = prev.ss ?? Math.max(-1, ...exs.map((e) => e.ss ?? -1)) + 1
      return {
        ...s,
        exercises: exs.map((e, k) => (k === ei || k === ei - 1 ? { ...e, ss: gid } : e)),
      }
    })
  }
  const addExercise = (name: string) => {
    haptic.select()
    update((s) => ({ ...s, exercises: [...s.exercises, { exercise: name, sets: [{ weight: 0, reps: 0, done: false }] }] }))
    setPicker(false)
  }

  /* ---- finish ---- */
  const setHasWork = (s: SetEntry) => s.reps > 0 || (s.duration_s ?? 0) > 0 || (s.distance_m ?? 0) > 0
  const doneSets = active.exercises.reduce((a, e) => a + e.sets.filter(setHasWork).length, 0)
  const volume = active.exercises.reduce((a, e) => a + e.sets.reduce((b, s) => b + (s.reps > 0 ? s.weight * s.reps : 0), 0), 0)

  const save = async () => {
    setSaving(true)
    setSaveErr(false)
    if (asTemplate && active) {
      const tmpl: TemplateExercise[] = active.exercises.map((e) => {
        const working = e.sets.filter((s) => !s.warmup)
        const last = working[working.length - 1] ?? e.sets[e.sets.length - 1]
        return { name: e.exercise, sets_count: e.sets.length, last_weight: last?.weight ?? 0, last_reps: last?.reps ?? 0 }
      })
      await saveTemplate(active.categoryKey, active.title, tmpl)
    }
    const saved = await finish()
    setSaving(false)
    if (!saved) {
      // save failed — the session is kept on-device, tell the user and stay put
      setSaveErr(true)
      return
    }
    setSummary(false)
    if (earnedPRs.length) setCelebrate(earnedPRs)
    else nav('/')
  }

  return (
    <div data-testid="session" className="flex min-h-full flex-col">
      {/*
        Logging is a focused mode, so it keeps the whole viewport and drops the app rail.
        The header spans the full width on desktop and the body splits: the cards stay a
        readable measure (they are dense numeric forms — stretching them to 1600px would put
        the weight input a mouse-journey away from the reps input), and the freed space
        carries a sticky rail with the running totals and a jump list.
      */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[rgba(7,7,11,0.72)] px-5 py-3 backdrop-blur-xl" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-3">
          <button onClick={() => nav('/')} className="grid h-9 w-9 shrink-0 place-items-center rounded-full glass text-muted2 transition hover:text-ink" aria-label="Minimize">
            <IconArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1 text-center lg:text-left">
            <p className="truncate font-heading text-sm font-extrabold leading-none">{active.title}</p>
            <p className="tnum mt-0.5 text-xs text-cyan-soft">
              {fmtDuration(elapsed)} · {doneSets} sets
              {volume > 0 && <span className="text-muted"> · {fmtWeight(volume, unit)}{unit}</span>}
            </p>
          </div>
          <Button className="!px-4 !py-2 text-sm" onClick={() => setSummary(true)}>
            Finish
          </Button>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1280px] flex-1 gap-8 px-5 pb-40 pt-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:pb-14">
        {/* ------------------------------------------------------------------- rail */}
        <aside className="order-1 hidden lg:order-2 lg:block">
          <div className="sticky top-24 flex flex-col gap-4">
            <div className="card p-4">
              <h2 className="font-heading text-xs font-bold uppercase tracking-[0.14em] text-muted">Session</h2>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-white/[0.05] px-2 py-2.5">
                  <dd className="tnum font-heading text-base font-extrabold leading-none">{fmtDuration(elapsed)}</dd>
                  <dt className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Time</dt>
                </div>
                <div className="rounded-xl bg-white/[0.05] px-2 py-2.5">
                  <dd className="tnum font-heading text-base font-extrabold leading-none">{doneSets}</dd>
                  <dt className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Sets</dt>
                </div>
                <div className="rounded-xl bg-white/[0.05] px-2 py-2.5">
                  <dd className="tnum font-heading text-base font-extrabold leading-none">{fmtWeight(volume, unit)}</dd>
                  <dt className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{unit}</dt>
                </div>
              </dl>
            </div>

            <nav className="card p-4">
              <h2 className="font-heading text-xs font-bold uppercase tracking-[0.14em] text-muted">Exercises</h2>
              <ol className="mt-3 flex flex-col gap-1">
                {active.exercises.map((e, ei) => {
                  const done = e.sets.filter((s) => s.done).length
                  const all = done > 0 && done === e.sets.length
                  return (
                    <li key={`${e.exercise}-${ei}`}>
                      <a
                        href={`#ex-${ei}`}
                        onClick={(ev) => {
                          ev.preventDefault()
                          document.getElementById(`ex-${ei}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition hover:bg-white/[0.05]"
                      >
                        <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', all ? 'bg-cyan' : done > 0 ? 'bg-cyan/40' : 'bg-white/15')} />
                        <span className={cx('min-w-0 flex-1 truncate', all ? 'text-muted' : 'text-ink2')}>{e.exercise}</span>
                        <span className="tnum shrink-0 text-[11px] text-muted">
                          {done}/{e.sets.length}
                        </span>
                      </a>
                    </li>
                  )
                })}
              </ol>
              <button
                onClick={() => setPicker(true)}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line2 py-2 text-[13px] font-bold text-muted2 transition hover:border-cyan/50 hover:text-cyan"
              >
                <IconPlus size={15} /> Add exercise
              </button>
            </nav>

            <button
              onClick={() => setConfirmDiscard(true)}
              className="rounded-xl py-2 text-center text-[13px] text-muted transition hover:text-bad"
            >
              Discard workout
            </button>
          </div>
        </aside>

        {/* ------------------------------------------------------------------ cards */}
        <div className="order-2 flex min-w-0 flex-col gap-3 lg:order-1">
        {active.exercises.map((e, ei) => (
          // scroll-mt clears the sticky header when the rail's jump list targets this card
          <div key={`${e.exercise}-${ei}`} id={`ex-${ei}`} className="scroll-mt-24">
          <ExerciseCard
            index={ei}
            name={e.exercise}
            sets={e.sets}
            note={e.note ?? ''}
            superset={e.ss !== undefined}
            canSuperset={ei > 0}
            lastPerf={lastPerformance(sets, e.exercise)}
            best={prs[e.exercise]?.bestWeight ?? 0}
            onToggleDone={(si) => toggleDone(ei, si)}
            onField={(si, patch) => setSetField(ei, si, patch)}
            onAddSet={() => addSet(ei)}
            onRemoveSet={(si) => removeSet(ei, si)}
            onWarmup={(si, w) => setSetField(ei, si, { warmup: w })}
            onNote={(n) => setNote(ei, n)}
            onSuperset={() => toggleSuperset(ei)}
            onRemove={() => removeExercise(ei)}
            img={exerciseImage(e.exercise, custom, gender)}
            /* the session override wins over the catalog default */
            mode={e.mode ?? exerciseMode(e.exercise)}
            canChooseMode={categoryOf(e.exercise, custom)?.key === 'abs'}
            onMode={(m) => setMode(ei, m)}
            onRpe={(si, rpe) => setRpe(ei, si, rpe)}
          />
          </div>
        ))}

        {/* below lg there is no rail, so these live inline as they do on the phone */}
        <button
          onClick={() => setPicker(true)}
          className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-line2 py-4 font-heading text-sm font-bold text-muted2 transition hover:border-cyan/50 hover:text-cyan lg:hidden"
        >
          <IconPlus size={18} /> Add exercise
        </button>

        <button onClick={() => setConfirmDiscard(true)} className="mt-2 py-2 text-center text-sm text-muted hover:text-bad lg:hidden">
          Discard workout
        </button>
        </div>
      </div>

      {/* exercise picker */}
      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={addExercise} custom={custom} sets={sets} favorites={favorites} categoryKey={active.categoryKey} />

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard this workout?"
        body={`Nothing from this session will be saved${doneSets > 0 ? `, including the ${doneSets} set${doneSets === 1 ? '' : 's'} you have already logged` : ''}. This can't be undone.`}
        confirmLabel="Discard"
        cancelLabel="Keep going"
        tone="danger"
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false)
          discard()
          nav('/')
        }}
      />

      {/* finish summary */}
      <Modal open={summary} onClose={() => setSummary(false)} title="Finish workout?">
        <div className="grid grid-cols-3 gap-3">
          <Tile label="Time" value={fmtDuration(elapsed)} />
          <Tile label="Sets" value={String(doneSets)} />
          <Tile label="Volume" value={`${fmtWeight(volume, unit)}`} sub={unit} />
        </div>
        {earnedPRs.length > 0 && (
          <div className="mt-4 rounded-2xl border border-cyan/30 bg-cyan/[0.1] p-3">
            <p className="flex items-center gap-2 font-heading text-sm font-bold text-cyan-soft">
              <IconTrophy size={16} /> {earnedPRs.length} new PR{earnedPRs.length > 1 ? 's' : ''}
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {earnedPRs.map((p, i) => (
                <li key={i} className="text-sm text-ink2">
                  <span className="font-semibold">{p.exercise}</span> — {p.text}
                </li>
              ))}
            </ul>
          </div>
        )}
        {doneSets === 0 && <p className="mt-4 text-center text-sm text-muted">Log at least one set (reps &gt; 0) to save.</p>}
        {saveErr && (
          <p className="mt-4 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2.5 text-center text-sm text-warn">
            Couldn't sync right now — your workout is safe on this device. Check your connection and tap Save again.
          </p>
        )}
        <button
          type="button"
          onClick={() => { haptic.select(); setAsTemplate((v) => !v) }}
          className="mt-4 flex w-full items-center justify-between rounded-2xl border border-line px-4 py-3 text-left"
          aria-pressed={asTemplate}
        >
          <div>
            <p className="font-heading text-sm font-bold">Save as template</p>
            <p className="text-xs text-muted">Quick-start this workout next time</p>
          </div>
          <span className={cx('relative h-6 w-11 shrink-0 rounded-full transition', asTemplate ? 'bg-cyan' : 'bg-white/10')}>
            <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all', asTemplate ? 'left-[22px]' : 'left-0.5')} />
          </span>
        </button>
        <div className="mt-5 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => setSummary(false)} disabled={saving}>
            Keep going
          </Button>
          <Button className="flex-1" onClick={save} disabled={doneSets === 0 || saving}>
            {saving ? 'Saving…' : saveErr ? 'Try again' : 'Save workout'}
          </Button>
        </div>
      </Modal>

    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-white/5 px-3 py-3 text-center">
      <p className="tnum font-heading text-xl font-extrabold leading-none">
        {value}
        {sub && <span className="ml-0.5 text-xs text-muted">{sub}</span>}
      </p>
      <p className="mt-1 text-[10px] uppercase tracking-wide text-muted">{label}</p>
    </div>
  )
}

/* ------------------------- exercise card ------------------------- */
function ExerciseCard(props: {
  index: number
  name: string
  img: string | null
  mode: 'reps' | 'timed' | 'distance'
  sets: SetEntry[]
  note: string
  superset: boolean
  canSuperset: boolean
  /** abs exercises can be logged as reps or as time — everything else is fixed */
  canChooseMode: boolean
  onMode: (m: 'reps' | 'timed') => void
  lastPerf: { date: string; sets: { weight: number; reps: number }[] } | null
  best: number
  onToggleDone: (si: number) => void
  onField: (si: number, patch: Partial<SetEntry>) => void
  onAddSet: () => void
  onRemoveSet: (si: number) => void
  onWarmup: (si: number, w: boolean) => void
  onNote: (n: string) => void
  onSuperset: () => void
  onRemove: () => void
  onRpe: (si: number, rpe: number) => void
}) {
  const [showNote, setShowNote] = useState(!!props.note)
  const { unit } = usePrefs()
  const mode = props.mode
  // the load column is labelled with the active unit — the inputs below read and
  // write in that same unit and convert to kg on the way into the session
  const unitLabel = unit === 'lbs' ? 'Lbs' : 'Kg'
  const headers = mode === 'timed' ? ['Sec', unitLabel] : mode === 'distance' ? ['Dist (m)', 'Min'] : [unitLabel, 'Reps']
  const lp = props.lastPerf
  const lastText = mode === 'reps' && lp ? lp.sets.map((s) => `${fmtWeight(s.weight, unit)}×${s.reps}`).join('  ') : null
  const lastWeightIn = (si: number) => {
    const w = lp?.sets[si]?.weight
    return w == null ? undefined : Math.round(fromKg(w, unit) * 10) / 10
  }

  return (
    <div className={cx('relative overflow-hidden rounded-2xl glass p-3.5', props.superset && 'ring-1 ring-cyan/30')}>
      <div
        className="absolute left-0 top-0 h-0.5 bg-cyan transition-[width] duration-300"
        style={{ width: `${(props.sets.filter((s) => s.done).length / Math.max(1, props.sets.length)) * 100}%` }}
      />
      <div className="flex gap-3.5">
        <div className="relative grid h-28 w-28 shrink-0 self-start place-items-center overflow-hidden rounded-2xl bg-black">
          <ExerciseImage src={props.img} alt="" size={30} eager />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-heading text-[15px] font-bold leading-tight">{props.name}</p>
                {props.superset && <span className="shrink-0 rounded bg-cyan/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-cyan">Superset</span>}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
                {mode === 'reps' ? (
                  lastText ? <span className="text-cyan-soft">Last: {lastText}</span> : <span className="text-muted">First time — set the bar</span>
                ) : (
                  <span className="text-muted">{mode === 'timed' ? 'Hold for time' : 'Distance & time'}</span>
                )}
                {props.best > 0 && mode === 'reps' && <span className="text-muted">PR {fmtWeight(props.best, unit)}{unit}</span>}
              </div>
              {/* abs: log this movement however you actually train it */}
              {props.canChooseMode && (
                <div className="mt-2 inline-flex rounded-lg border border-line2 p-0.5" role="group" aria-label="Logging mode">
                  {(['reps', 'timed'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => props.onMode(m)}
                      aria-pressed={mode === m}
                      className={cx(
                        'rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition',
                        mode === m ? 'bg-cyan text-cyan-ink' : 'text-muted hover:text-ink2',
                      )}
                    >
                      {m === 'reps' ? 'Reps' : 'Time'}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                onClick={props.onSuperset}
                disabled={!props.canSuperset}
                className={cx(
                  'grid h-8 w-8 place-items-center rounded-lg',
                  props.superset ? 'bg-cyan/15 text-cyan' : 'text-muted2 hover:text-ink2',
                  !props.canSuperset && 'cursor-not-allowed opacity-30 hover:text-muted/60',
                )}
                title={props.canSuperset ? 'Superset with previous' : 'Add an exercise above to superset with'}
                aria-label="Superset with previous exercise"
              >
                <IconLink size={16} />
              </button>
              <button onClick={props.onRemove} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:text-bad" aria-label="Remove exercise">
                <IconClose size={16} />
              </button>
            </div>
          </div>

          {/* set rows */}
          <div className="mt-3 flex flex-col gap-1.5">
        <div className="grid grid-cols-[28px_1fr_1fr_44px] items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-wide text-muted">
          <span>Set</span>
          <span className="text-center">{headers[0]}</span>
          <span className="text-center">{headers[1]}</span>
          <span className="text-center">Done</span>
        </div>
        {props.sets.map((st, si) => (
          /*
           * data-kb-scroll marks this row as what src/lib/keyboard.ts scrolls to when one of
           * its inputs is focused. It targets the ROW, not the input: scrollIntoView measures
           * only the element box and ignores surrounding padding, so aiming at the bare input
           * clips the set number and the done-toggle beside it. scroll-my-20 keeps the row off
           * the very edge of the visible area once it lands.
           */
          <div key={si} data-kb-scroll className="scroll-my-20">
            <SwipeRow onDelete={props.sets.length > 1 ? () => props.onRemoveSet(si) : undefined}>
            <div className={cx('grid grid-cols-[28px_1fr_1fr_44px] items-center gap-2 rounded-xl px-1 py-1', st.done && 'bg-cyan/[0.07]')}>
              <button
                onClick={() => props.onWarmup(si, !st.warmup)}
                className={cx('grid h-7 w-7 place-items-center rounded-lg text-xs font-bold', st.warmup ? 'bg-warn/20 text-warn' : 'bg-white/5 text-muted2')}
                title={st.warmup ? 'Warm-up set' : 'Mark warm-up'}
              >
                {st.warmup ? 'W' : si + 1}
              </button>
              {mode === 'timed' ? (
                <>
                  <NumInput value={st.duration_s ?? 0} onChange={(v) => props.onField(si, { duration_s: v })} placeholder="sec" suffix="s" integer />
                  <NumInput value={fromKg(st.weight, unit)} onChange={(v) => props.onField(si, { weight: toKg(v, unit) })} placeholder={lastWeightIn(si)} />
                </>
              ) : mode === 'distance' ? (
                <>
                  <NumInput value={st.distance_m ?? 0} onChange={(v) => props.onField(si, { distance_m: v })} placeholder="m" suffix="m" integer />
                  <NumInput value={st.duration_s ? Math.round((st.duration_s / 60) * 10) / 10 : 0} onChange={(v) => props.onField(si, { duration_s: Math.round(v * 60) })} placeholder="min" suffix="min" />
                </>
              ) : (
                <>
                  <NumInput value={fromKg(st.weight, unit)} onChange={(v) => props.onField(si, { weight: toKg(v, unit) })} placeholder={lastWeightIn(si)} />
                  <NumInput value={st.reps} onChange={(v) => props.onField(si, { reps: v })} placeholder={lp?.sets[si]?.reps} integer />
                </>
              )}
              <div className="flex items-center justify-center gap-1">
                <button
                  onClick={() => props.onToggleDone(si)}
                  className={cx('grid h-8 w-8 place-items-center rounded-lg transition', st.done ? 'bg-cyan text-cyan-ink' : 'border border-line2 text-muted/50')}
                  aria-label={st.done ? 'Mark set not done' : 'Mark set done'}
                >
                  <IconCheck size={16} />
                </button>
                {props.sets.length > 1 && (
                  <button onClick={() => props.onRemoveSet(si)} className="text-muted2 hover:text-bad" aria-label="Remove set">
                    <IconClose size={13} />
                  </button>
                )}
              </div>
            </div>
            </SwipeRow>
            {st.done && (
              <div className="animate-fadeUp mt-1.5 flex items-center gap-1.5 pl-9">
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted">RPE</span>
                {[6, 7, 8, 9, 10].map((n) => (
                  <button
                    key={n}
                    onClick={() => props.onRpe(si, n)}
                    className={cx('grid h-7 w-7 place-items-center rounded-full text-xs font-bold transition', st.rpe === n ? rpeClasses(n) : 'bg-white/5 text-muted')}
                    aria-label={`RPE ${n}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

          <div className="mt-2 flex items-center gap-3">
            <button onClick={props.onAddSet} className="flex items-center gap-1 text-xs font-bold text-cyan-soft">
              <IconPlus size={14} /> Add set
            </button>
            <button onClick={() => setShowNote((v) => !v)} className="text-xs font-semibold text-muted hover:text-muted2">
              {showNote ? 'Hide note' : 'Note'}
            </button>
          </div>
          {showNote && (
            <input
              value={props.note}
              onChange={(e) => props.onNote(e.target.value)}
              placeholder="Note (e.g. felt heavy, drop set…)"
              className="mt-2 w-full rounded-xl border border-line2 bg-panel2 px-3 py-2 text-sm outline-none placeholder:text-muted"
            />
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Numeric field that keeps the raw keystrokes in a local draft while focused.
 *
 * A controlled `type="number"` coerced with `Number()` on every keystroke makes
 * decimals impossible: "2." reads back as `2` (or as "" in Chrome, which is why
 * the value vanished), so the trailing dot is dropped and the next digit lands
 * in the wrong column — 2.5 became 25 and 0.5 could not be typed at all. Half
 * plates and every lbs-derived load depend on this working, so the draft string
 * is preserved verbatim until blur and only *parsed* for the committed value.
 * `type="text"` + inputMode keeps the numeric keypad while giving us the raw string.
 */
function NumInput({ value, onChange, placeholder, integer, suffix }: { value: number; onChange: (v: number) => void; placeholder?: number | string; integer?: boolean; suffix?: string }) {
  const [draft, setDraft] = useState<string | null>(null)

  const display = (n: number) => {
    if (!n) return ''
    const r = integer ? Math.round(n) : Math.round(n * 100) / 100
    return String(r)
  }
  const sanitize = (raw: string) => {
    let s = raw.replace(integer ? /[^0-9]/g : /[^0-9.]/g, '')
    const dot = s.indexOf('.')
    if (dot >= 0) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '') // at most one point
    return s
  }

  return (
    <div className="relative">
      <input
        type="text"
        inputMode={integer ? 'numeric' : 'decimal'}
        enterKeyHint="done"
        value={draft ?? display(value)}
        placeholder={placeholder != null ? String(placeholder) : '0'}
        onChange={(e) => {
          const s = sanitize(e.target.value)
          setDraft(s)
          const n = Number(s)
          // "" and a lone "." are valid mid-typing states that mean "nothing yet"
          onChange(s === '' || s === '.' || !Number.isFinite(n) ? 0 : integer ? Math.round(n) : n)
        }}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => setDraft(null)}
        className={cx('tnum w-full rounded-xl border border-line2 bg-panel2 py-2 text-center font-heading text-base font-bold text-ink outline-none focus:border-cyan/60 placeholder:font-normal placeholder:text-muted/50', suffix && 'pr-6')}
      />
      {suffix && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-normal text-muted">{suffix}</span>}
    </div>
  )
}

/** Left-swipe to reveal a Delete action on touch devices. The × button remains as a fallback. */
function SwipeRow({ onDelete, children }: { onDelete?: () => void; children: ReactNode }) {
  const [dx, setDx] = useState(0)
  const startX = useRef<number | null>(null)
  return (
    <div className="relative overflow-hidden rounded-xl">
      {onDelete && dx < -4 && (
        <div className="absolute inset-y-0 right-0 flex items-center rounded-r-xl bg-bad/20 px-4 text-xs font-bold text-bad">Delete</div>
      )}
      <div
        style={{ transform: `translateX(${dx}px)`, transition: startX.current === null ? 'transform 0.2s' : 'none' }}
        onTouchStart={(e) => { if (onDelete) startX.current = e.touches[0].clientX }}
        onTouchMove={(e) => {
          if (startX.current === null) return
          setDx(Math.max(-96, Math.min(0, e.touches[0].clientX - startX.current)))
        }}
        onTouchEnd={() => {
          if (startX.current === null) return
          startX.current = null
          if (dx < -60) onDelete?.()
          setDx(0)
        }}
      >
        {children}
      </div>
    </div>
  )
}

/* ------------------------- picker ------------------------- */
function ExercisePicker({ open, onClose, onPick, custom, sets, favorites, categoryKey }: {
  open: boolean
  onClose: () => void
  onPick: (name: string) => void
  custom: import('../lib/types').CustomExerciseRow[]
  sets: import('../lib/types').SetRow[]
  favorites: string[]
  categoryKey: string
}) {
  const [q, setQ] = useState('')
  const cats = mergeCustom(custom)
  const query = q.trim().toLowerCase()

  /*
   * A session that spans several muscle groups is filed as 'mixed', which is not a key in
   * the catalog. Narrowing "recent" and "favourites" to that key would return nothing and
   * leave the add-exercise sheet looking broken on exactly the sessions most likely to need
   * it. A mixed session is not about one group, so neither list is narrowed.
   */
  const spansAll = !CATALOG_BY_KEY[categoryKey]

  // last 5 unique exercises logged in this category, newest first
  const recent = (() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const st of sets) {
      if ((!spansAll && st.category_key !== categoryKey) || seen.has(st.exercise)) continue
      seen.add(st.exercise)
      out.push(st.exercise)
      if (out.length >= 5) break
    }
    return out
  })()
  // favorited exercises that belong to this category
  const favInCat = (() => {
    if (spansAll) return favorites
    const cat = CATALOG_BY_KEY[categoryKey]
    const names = new Set<string>([
      ...(cat?.exercises.map((e) => e.name) ?? []),
      ...custom.filter((c) => c.category_key === categoryKey).map((c) => c.name),
    ])
    return favorites.filter((f) => names.has(f))
  })()

  return (
    <Modal open={open} onClose={onClose} title="Add exercise" maxW="max-w-md">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search exercises…"
        className="mb-3 w-full rounded-xl border border-line2 bg-panel2 px-3 py-2.5 text-sm outline-none placeholder:text-muted"
      />
      {!query && (recent.length > 0 || favInCat.length > 0) && (
        <div className="mb-3 flex flex-col gap-3 border-b border-line pb-3">
          {recent.length > 0 && (
            <div>
              <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-muted">Recently used</p>
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {recent.map((name) => (
                  <button key={name} onClick={() => onPick(name)} className="shrink-0 whitespace-nowrap rounded-full bg-white/5 px-3 py-1.5 text-xs font-semibold text-ink2 transition hover:bg-cyan/10">
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {favInCat.length > 0 && (
            <div>
              <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-muted">Favorites</p>
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {favInCat.map((name) => (
                  <button key={name} onClick={() => onPick(name)} className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-white/5 px-3 py-1.5 text-xs font-semibold text-ink2 transition hover:bg-cyan/10">
                    <IconStar size={12} className="text-cyan" /> {name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="max-h-[55vh] space-y-4 overflow-y-auto no-scrollbar">
        {cats.map((c) => {
          const list = c.exercises.filter((e) => !query || e.name.toLowerCase().includes(query))
          if (!list.length) return null
          return (
            <div key={c.key}>
              <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-muted">{c.title}</p>
              <div className="flex flex-col gap-1">
                {list.map((e) => (
                  <button key={e.name} onClick={() => onPick(e.name)} className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2.5 text-left text-sm transition hover:bg-cyan/10">
                    <IconDumbbell size={15} className="text-cyan/70" />
                    <span className="flex-1 truncate">{e.name}</span>
                    <IconPlus size={15} className="text-muted" />
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
