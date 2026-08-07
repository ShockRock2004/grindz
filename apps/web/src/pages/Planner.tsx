import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../lib/app-context'
import { CATALOG } from '../data/catalog'
import { setPlanSlot, clearPlanSlot, replacePlan } from '../lib/db'
import { CategoryThumb, IconClose, IconPlay } from '../components/Icons'
import { ConfirmDialog } from '../components/ui'
import { WEEKDAYS, cx } from '../lib/util'
import { haptic } from '../lib/haptics'

type Grid = Record<string, Record<number, string>>
/**
 * A day holds up to three blocks, and shows exactly as many as it has plus one empty
 * landing space. It used to render a fixed pair of slots, so an unplanned day advertised
 * two holes and a day could never hold a third session.
 */
const MAX_BLOCKS = 3
/** finger/pointer travel before a press becomes a drag */
const DRAG_SLOP = 8

/** The blocks on a day, in order, with any gaps closed up. */
function blocksOf(grid: Grid, day: string): string[] {
  const d = grid[day]
  if (!d) return []
  const out: string[] = []
  for (let s = 1; s <= MAX_BLOCKS; s++) if (d[s]) out.push(d[s])
  return out
}

/** Rebuild a day from an ordered list, so slots stay contiguous after a removal. */
function withBlocks(grid: Grid, day: string, keys: string[]): Grid {
  const d: Record<number, string> = {}
  keys.slice(0, MAX_BLOCKS).forEach((k, i) => (d[i + 1] = k))
  return { ...grid, [day]: d }
}

const TEMPLATES: { name: string; plan: Record<string, string[]> }[] = [
  {
    name: 'Push / Pull / Legs',
    plan: { Monday: ['chest', 'triceps'], Tuesday: ['back', 'biceps'], Wednesday: ['legs'], Thursday: ['shoulders'], Friday: ['abs', 'cardio'] },
  },
  {
    name: 'Bro Split',
    plan: { Monday: ['chest'], Tuesday: ['back'], Wednesday: ['shoulders'], Thursday: ['legs'], Friday: ['biceps', 'triceps'] },
  },
  {
    name: 'Upper / Lower',
    plan: { Monday: ['chest', 'back'], Tuesday: ['legs'], Thursday: ['shoulders', 'biceps'], Friday: ['legs', 'triceps'] },
  },
  {
    name: 'Full Body',
    plan: { Monday: ['chest', 'legs'], Wednesday: ['back', 'shoulders'], Friday: ['legs', 'abs'] },
  },
  {
    name: 'PPL ×2',
    plan: { Monday: ['chest', 'triceps'], Tuesday: ['back', 'biceps'], Wednesday: ['legs', 'abs'], Thursday: ['shoulders', 'triceps'], Friday: ['back', 'biceps'], Saturday: ['legs', 'cardio'] },
  },
  {
    name: 'Arnold Split',
    plan: { Monday: ['chest', 'back'], Tuesday: ['shoulders', 'triceps'], Wednesday: ['legs', 'abs'], Thursday: ['chest', 'back'], Friday: ['shoulders', 'biceps'], Saturday: ['legs', 'cardio'] },
  },
  {
    name: 'Push / Pull',
    plan: { Monday: ['chest', 'triceps'], Tuesday: ['back', 'biceps'], Wednesday: ['shoulders', 'legs'], Thursday: ['chest', 'triceps'], Friday: ['back', 'biceps'] },
  },
  {
    name: '4-Day Split',
    plan: { Monday: ['chest', 'triceps'], Tuesday: ['back', 'biceps'], Thursday: ['shoulders', 'abs'], Friday: ['legs', 'cardio'] },
  },
  {
    name: 'Chest & Arms',
    plan: { Monday: ['chest', 'triceps'], Tuesday: ['back', 'biceps'], Wednesday: ['legs'], Thursday: ['shoulders', 'abs'], Friday: ['biceps', 'triceps'] },
  },
]

export function Planner() {
  const nav = useNavigate()
  const { plan, refresh } = useData()
  const [grid, setGrid] = useState<Grid>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [pendingTpl, setPendingTpl] = useState<(typeof TEMPLATES)[number] | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  /*
   * Writes are queued, and server snapshots are ignored while any write is in flight.
   *
   * Every edit is optimistic and then persisted. Without these two guards, deleting two
   * blocks quickly made the second one come back: the first delete's refresh() returned a
   * snapshot taken before the second delete, and this effect applied it wholesale over the
   * newer local state — so the block reappeared, then vanished again when its own response
   * landed. Adds flickered the same way.
   *
   * `inflight` counts unfinished writes; the effect only re-hydrates at zero, when the
   * server and the screen are describing the same moment. The queue serialises the writes
   * themselves, so an add and a delete on one slot can never be applied out of order.
   */
  const inflight = useRef(0)
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  const enqueue = (op: () => Promise<unknown>) => {
    inflight.current += 1
    queue.current = queue.current
      .then(op)
      .catch(() => { /* keep the optimistic state; the next refresh reconciles */ })
      .finally(() => {
        inflight.current -= 1
        if (inflight.current === 0) refresh()
      })
  }

  useEffect(() => {
    if (inflight.current > 0) return
    const g: Grid = {}
    for (const p of plan) {
      ;(g[p.day] ??= {})[p.slot] = p.category_key
    }
    setGrid(g)
  }, [plan])

  const todayName = WEEKDAYS[(new Date().getDay() + 6) % 7]

  /** Persist a day as an ordered list, clearing whatever the shorter list leaves behind. */
  const writeDay = (day: string, keys: string[], prevLen: number) =>
    enqueue(async () => {
      for (let i = 0; i < keys.length; i++) await setPlanSlot(day, i + 1, keys[i])
      for (let s = keys.length + 1; s <= prevLen; s++) await clearPlanSlot(day, s)
    })

  /** Append a block to a day. Nothing happens once the day is full. */
  const addBlock = (day: string, key: string) => {
    const prev = blocksOf(grid, day)
    if (prev.length >= MAX_BLOCKS) return
    const next = [...prev, key]
    haptic.success()
    setGrid((g) => withBlocks(g, day, next))
    setSelected(null)
    writeDay(day, next, prev.length)
  }

  const removeBlock = (day: string, index: number) => {
    const prev = blocksOf(grid, day)
    const next = prev.filter((_, i) => i !== index)
    haptic.select()
    setGrid((g) => withBlocks(g, day, next))
    writeDay(day, next, prev.length)
  }

  /** Applies a split for real; the confirmation lives in `applyTemplate` below. */
  const doApplyTemplate = (tpl: (typeof TEMPLATES)[number]) => {
    haptic.success()
    const entries: { day: string; slot: number; category_key: string }[] = []
    for (const [day, keys] of Object.entries(tpl.plan)) {
      keys.slice(0, MAX_BLOCKS).forEach((key, i) => entries.push({ day, slot: i + 1, category_key: key }))
    }
    const g: Grid = {}
    entries.forEach((e) => ((g[e.day] ??= {})[e.slot] = e.category_key))
    setGrid(g)
    enqueue(() => replacePlan(entries))
  }
  /*
   * Both of these destroy planned work, so they ask first — through the app's own dialog
   * rather than `window.confirm`, which renders as browser chrome ("localhost says…"),
   * ignores the app's styling entirely, and blocks the main thread while it is open.
   */
  const applyTemplate = (tpl: (typeof TEMPLATES)[number]) => {
    // replaces the whole week, including days the template does not cover
    if (filled > 0) setPendingTpl(tpl)
    else void doApplyTemplate(tpl)
  }

  const doClearAll = () => {
    setGrid({})
    enqueue(() => replacePlan([]))
  }

  /*
   * Pointer-based drag.
   *
   * HTML5 `draggable`/dataTransfer never fires on touch, so the drag affordance
   * existed on desktop only while the native app had real touch drag. Pointer
   * Events cover mouse, pen and touch alike, keeping the two surfaces the same.
   */
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 })
  const dragging = useRef(false)
  const startPt = useRef({ x: 0, y: 0 })
  const pending = useRef<string | null>(null)

  /**
   * Which day is under the pointer, ignoring anything the sticky palette covers.
   *
   * The whole day is the target, not an individual slot. Aiming at one of two fixed holes
   * meant the drop point moved depending on what was already planned; now a day accepts a
   * block anywhere on it and appends, which is also what lets the existing blocks shrink to
   * open a landing space as you approach.
   */
  const dayAt = (x: number, y: number): string | null => {
    const pal = document.getElementById('plan-palette')?.getBoundingClientRect()
    if (pal && y <= pal.bottom) return null
    for (const el of document.querySelectorAll<HTMLElement>('[data-day]')) {
      const r = el.getBoundingClientRect()
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el.dataset.day ?? null
    }
    return null
  }

  useEffect(() => {
    if (!dragKey) return
    const move = (e: PointerEvent) => {
      setGhostPos({ x: e.clientX, y: e.clientY })
      setHover(dayAt(e.clientX, e.clientY))
    }
    const up = (e: PointerEvent) => {
      const day = dayAt(e.clientX, e.clientY)
      if (day) addBlock(day, dragKey)
      dragging.current = false
      pending.current = null
      setDragKey(null)
      setHover(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [dragKey])

  // arm on press, promote to a drag once the pointer travels
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (dragging.current || !pending.current) return
      if (Math.abs(e.clientX - startPt.current.x) < DRAG_SLOP && Math.abs(e.clientY - startPt.current.y) < DRAG_SLOP) return
      dragging.current = true
      haptic.select()
      setGhostPos({ x: e.clientX, y: e.clientY })
      setDragKey(pending.current)
    }
    const up = () => { if (!dragging.current) pending.current = null }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  const filled = useMemo(() => Object.values(grid).reduce((a, d) => a + Object.keys(d).length, 0), [grid])

  return (
    <div className="flex flex-col gap-5" onDragEnd={() => setSelected(null)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight">Weekly Plan</h1>
          <p className="mt-1 text-sm text-muted">
            Drag a muscle group onto a day — or click one, then click the day.
          </p>
        </div>
        {filled > 0 && (
          <button
            onClick={() => setConfirmClear(true)}
            className="shrink-0 rounded-xl border border-line2 px-3 py-2 text-xs font-semibold text-muted transition hover:border-bad/50 hover:text-bad"
          >
            Clear all
          </button>
        )}
      </div>

      {/* templates — wrap on desktop instead of scrolling horizontally */}
      <div className="flex flex-wrap gap-2 xl:pb-1">
        {TEMPLATES.map((t) => (
          <button key={t.name} onClick={() => applyTemplate(t)} className="shrink-0 rounded-full border border-line2 px-3.5 py-2 text-xs font-bold text-muted2 transition hover:border-cyan/50 hover:text-cyan">
            {t.name}
          </button>
        ))}
      </div>

      {/*
        The palette is a rail across the top on every width, and the week sits below it in
        two columns.

        It used to become a narrow left-hand column at xl, which is what made this page look
        lopsided on a desktop: a 212px rail of stacked chips against a three-column week left
        a tall ragged gap down the right, and the chips themselves were a two-wide grid that
        matched nothing else on the page. A full-width rail reads as what it is — a tool
        strip you pull from — and two wide day columns keep every category name legible
        instead of truncating to "Sh…".

        Tablet and phone already worked and are untouched: the rail is sticky there, and the
        week goes single-column below sm.
      */}
      <div className="flex flex-col gap-5">

      {/* palette — sticky so you can drop onto any day, including the weekend */}
      <div className="sticky top-[72px] z-30 mb-1">
        <div id="plan-palette" className="rounded-2xl border border-line2 bg-panel2/95 px-3 py-2.5 shadow-card backdrop-blur-xl">
          <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wide text-muted">
            {dragKey ? 'Drop on a day' : selected ? 'Tap a day to assign' : 'Drag onto a day — or tap, then tap a day'}
          </p>
          {/* four-up on phone and tablet exactly as before; one row of eight only on desktop */}
          <div className="grid grid-cols-4 gap-[5px] xl:grid-cols-8">
          {CATALOG.map((c) => (
            <button
              key={c.key}
              onPointerDown={(e) => {
                pending.current = c.key
                startPt.current = { x: e.clientX, y: e.clientY }
              }}
              onClick={() => {
                // a completed drag also fires click; ignore that one
                if (dragging.current) return
                haptic.select()
                setSelected((s) => (s === c.key ? null : c.key))
              }}
              className={cx(
                // stacked icon over label, 4 per row — identical to the native palette
                'flex min-h-[44px] min-w-0 touch-none select-none flex-col items-center justify-center gap-0.5 rounded-xl border px-0.5 py-1.5 text-[9px] font-bold leading-tight transition',
                selected === c.key ? 'border-cyan bg-cyan/15 text-cyan shadow-glow-sm' : 'border-line2 bg-white/5 text-muted2 hover:text-ink',
                dragKey === c.key && 'opacity-40',
              )}
            >
              <CategoryThumb icon={c.key} size={16} className="shrink-0 text-cyan" />
              <span className="truncate">{c.title}</span>
            </button>
          ))}
          </div>
        </div>
      </div>

      {/* week — two columns below the rail */}
      <div className="grid gap-3 sm:grid-cols-2">
        {WEEKDAYS.map((day) => {
          const blocks = blocksOf(grid, day)
          const armed = !!dragKey || !!selected
          const isHover = hover === day
          const full = blocks.length >= MAX_BLOCKS
          /*
           * A day shows what it holds, plus one landing space while you are carrying a
           * block. The blocks share the row, so the third one appearing squeezes the other
           * two rather than pushing anything out of the card — that squeeze IS the feedback
           * that there is room, which is why the placeholder only exists while armed.
           */
          const showGhost = armed && !full
          return (
            <div
              key={day}
              data-day={day}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const k = e.dataTransfer.getData('text/plain')
                // a day is a drop target for anything the browser can drag — text, links,
                // images — so only accept a real category key, otherwise the payload gets
                // persisted as category_key
                if (k && CATALOG.some((c) => c.key === k)) addBlock(day, k)
              }}
              onClick={() => { if (selected) addBlock(day, selected) }}
              className={cx(
                'rounded-2xl border p-3 transition',
                day === todayName ? 'border-cyan/30 bg-cyan/[0.04]' : 'border-line',
                isHover && !full && 'border-cyan bg-cyan/10 ring-1 ring-cyan',
                isHover && full && 'border-warn/60 ring-1 ring-warn/40',
                armed && !isHover && 'cursor-pointer',
              )}
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="font-heading text-sm font-bold">
                  {day} {day === todayName && <span className="ml-1 rounded bg-cyan/15 px-1.5 py-0.5 text-[10px] font-bold text-cyan">TODAY</span>}
                </p>
                {isHover && full && <span className="text-[10px] font-bold uppercase tracking-wide text-warn">Day is full</span>}
              </div>

              <div className="flex items-stretch gap-2">
                {blocks.map((key, i) => {
                  const cat = CATALOG.find((c) => c.key === key)
                  return (
                    <div
                      key={`${key}-${i}`}
                      className="flex min-w-0 flex-1 items-center justify-between gap-1 rounded-xl bg-cyan/[0.1] px-3 py-2 text-sm ring-1 ring-cyan/25 transition-all"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <CategoryThumb icon={key} size={22} className="shrink-0 rounded-md" />
                        <span className="truncate font-bold">{cat?.title ?? key}</span>
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeBlock(day, i) }}
                        aria-label={`Remove ${cat?.title ?? 'workout'} from ${day}`}
                        className="shrink-0 text-muted2 hover:text-bad"
                      >
                        <IconClose size={14} />
                      </button>
                    </div>
                  )
                })}

                {/* the landing space: present only while carrying, and only if there is room */}
                {showGhost && (
                  <div
                    className={cx(
                      // solid, never dashed — a dashed rule reads as "disabled" next to the
                      // solid blocks beside it, and on the native side Android will not
                      // repaint a border whose style changes, so both surfaces stay solid
                      'flex min-h-[52px] flex-1 items-center justify-center rounded-xl border text-xs transition-all',
                      isHover ? 'border-cyan bg-cyan/20 text-cyan' : 'border-cyan/40 text-cyan/60',
                    )}
                  >
                    {isHover ? 'Drop here' : selected ? 'Tap to add' : 'Drop here'}
                  </div>
                )}

                {/* an untouched day still needs to look like somewhere a block can go */}
                {!blocks.length && !showGhost && (
                  <div className="flex min-h-[52px] flex-1 items-center justify-center rounded-xl border border-line2 text-xs text-muted/50">
                    Rest day
                  </div>
                )}
              </div>

              {blocks.length > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); nav(`/category/${blocks[0]}`) }}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-white/5 py-2 text-xs font-bold text-cyan-soft transition hover:bg-cyan/10"
                >
                  <IconPlay size={13} /> Start {CATALOG.find((c) => c.key === blocks[0])?.title}
                  {blocks.length > 1 && <span className="text-muted"> +{blocks.length - 1}</span>}
                </button>
              )}
            </div>
          )
        })}
      </div>
      </div>

      {/* dragged chip follows the pointer */}
      {dragKey && (
        <div
          className="pointer-events-none fixed z-50 flex items-center gap-2 rounded-xl border border-cyan bg-panel2 px-3 py-2.5 text-xs font-bold shadow-glow"
          style={{ left: ghostPos.x - 60, top: ghostPos.y - 64 }}
        >
          <CategoryThumb icon={dragKey} size={18} className="shrink-0 text-cyan" />
          {CATALOG.find((c) => c.key === dragKey)?.title}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingTpl}
        title={`Apply ${pendingTpl?.name ?? ''}?`}
        body={`This replaces your current week. ${filled} planned session${filled === 1 ? '' : 's'} will be removed, including any day the split does not cover. This can't be undone.`}
        confirmLabel="Replace week"
        tone="danger"
        onCancel={() => setPendingTpl(null)}
        onConfirm={() => {
          const t = pendingTpl
          setPendingTpl(null)
          if (t) void doApplyTemplate(t)
        }}
      />

      <ConfirmDialog
        open={confirmClear}
        title="Clear the whole week?"
        body={`All ${filled} planned session${filled === 1 ? '' : 's'} will be removed. This can't be undone.`}
        confirmLabel="Clear week"
        tone="danger"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false)
          void doClearAll()
        }}
      />
    </div>
  )
}
