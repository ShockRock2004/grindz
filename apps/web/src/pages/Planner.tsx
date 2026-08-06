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
const SLOTS = [1, 2]
/** finger/pointer travel before a press becomes a drag */
const DRAG_SLOP = 8

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

  useEffect(() => {
    const g: Grid = {}
    for (const p of plan) {
      ;(g[p.day] ??= {})[p.slot] = p.category_key
    }
    setGrid(g)
  }, [plan])

  const todayName = WEEKDAYS[(new Date().getDay() + 6) % 7]

  const assign = async (day: string, slot: number, key: string) => {
    haptic.success()
    setGrid((g) => ({ ...g, [day]: { ...g[day], [slot]: key } }))
    setSelected(null)
    await setPlanSlot(day, slot, key)
    refresh()
  }
  const clear = async (day: string, slot: number) => {
    haptic.select()
    setGrid((g) => {
      const d = { ...g[day] }
      delete d[slot]
      return { ...g, [day]: d }
    })
    await clearPlanSlot(day, slot)
    refresh()
  }
  /** Applies a split for real; the confirmation lives in `applyTemplate` below. */
  const doApplyTemplate = async (tpl: (typeof TEMPLATES)[number]) => {
    haptic.success()
    const entries: { day: string; slot: number; category_key: string }[] = []
    for (const [day, keys] of Object.entries(tpl.plan)) {
      keys.slice(0, 2).forEach((key, i) => entries.push({ day, slot: i + 1, category_key: key }))
    }
    const g: Grid = {}
    entries.forEach((e) => ((g[e.day] ??= {})[e.slot] = e.category_key))
    setGrid(g)
    await replacePlan(entries)
    refresh()
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

  const doClearAll = async () => {
    setGrid({})
    await replacePlan([])
    refresh()
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

  /** Which slot is under the pointer, ignoring anything the sticky palette covers. */
  const slotAt = (x: number, y: number): { day: string; slot: number } | null => {
    const pal = document.getElementById('plan-palette')?.getBoundingClientRect()
    if (pal && y <= pal.bottom) return null
    for (const el of document.querySelectorAll<HTMLElement>('[data-slot]')) {
      const r = el.getBoundingClientRect()
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        const [day, slot] = (el.dataset.slot ?? '').split(':')
        if (day && slot) return { day, slot: Number(slot) }
      }
    }
    return null
  }

  useEffect(() => {
    if (!dragKey) return
    const move = (e: PointerEvent) => {
      setGhostPos({ x: e.clientX, y: e.clientY })
      const hit = slotAt(e.clientX, e.clientY)
      setHover(hit ? `${hit.day}:${hit.slot}` : null)
    }
    const up = (e: PointerEvent) => {
      const hit = slotAt(e.clientX, e.clientY)
      if (hit) assign(hit.day, hit.slot, dragKey)
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
        Desktop splits into a palette rail and a seven-column week, so the whole plan is
        visible at once and every day is a drop target without scrolling. Below xl the
        palette goes back to being a sticky bar above a stacked week, as on the phone.
      */}
      <div className="grid gap-5 xl:grid-cols-[212px_minmax(0,1fr)] xl:items-start">

      {/* palette — floating card so you can drop onto any day, including the weekend */}
      <div className="sticky top-[72px] z-30 mb-1 xl:static xl:mb-0">
        <div id="plan-palette" className="rounded-2xl border border-line2 bg-panel2/95 px-3 py-2.5 shadow-card backdrop-blur-xl">
          <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wide text-muted">
            {dragKey ? 'Drop on a day' : selected ? 'Tap a day to assign' : 'Drag onto a day — or tap, then tap a day'}
          </p>
          <div className="grid grid-cols-4 gap-[5px] xl:grid-cols-2">
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

      {/* week */}
      {/*
        Two-up, matching the tablet layout.
        Seven columns looked orderly in a wireframe and was useless in practice: minus the
        sidebar and the palette rail each day got ~110px, so every assigned group truncated to
        "C…" / "Sh…" and the week became unreadable. A wide two-column week shows the full name
        and both slots at once, which is what a day card is for.
      */}
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {WEEKDAYS.map((day) => (
          <div key={day} className={cx('rounded-2xl border p-3', day === todayName ? 'border-cyan/30 bg-cyan/[0.04]' : 'border-line')}>
            <div className="mb-2 flex items-center justify-between">
              <p className="font-heading text-sm font-bold">
                {day} {day === todayName && <span className="ml-1 rounded bg-cyan/15 px-1.5 py-0.5 text-[10px] font-bold text-cyan">TODAY</span>}
              </p>
            </div>
            {/* both slots side by side, as on the tablet — the day card is wide enough now */}
            <div className="grid grid-cols-2 gap-2">
              {SLOTS.map((slot) => {
                const key = grid[day]?.[slot]
                const cat = key ? CATALOG.find((c) => c.key === key) : undefined
                return (
                  <div
                    key={slot}
                    data-slot={`${day}:${slot}`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      const k = e.dataTransfer.getData('text/plain')
                      // a slot is a drop target for anything the browser can drag —
                      // text, links, images — so only accept a real category key,
                      // otherwise the payload gets persisted as category_key
                      if (k && CATALOG.some((c) => c.key === k)) assign(day, slot, k)
                    }}
                    onClick={() => {
                      if (selected) assign(day, slot, selected)
                    }}
                    className={cx(
                      'flex min-h-[52px] items-center justify-between gap-1 rounded-xl px-3 py-2 text-sm transition',
                      cat ? 'bg-cyan/[0.1] ring-1 ring-cyan/25' : selected || dragKey ? 'cursor-pointer border border-dashed border-cyan/40 text-cyan/60' : 'border border-dashed border-line2 text-muted/50',
                      hover === `${day}:${slot}` && 'border-solid border-cyan bg-cyan/20 ring-1 ring-cyan',
                    )}
                  >
                    {cat ? (
                      <>
                        <span className="flex min-w-0 items-center gap-1.5">
                          <CategoryThumb icon={cat.key} size={22} className="rounded-md" />
                          <span className="truncate font-bold">{cat.title}</span>
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            clear(day, slot)
                          }}
                          aria-label={`Remove ${cat?.title ?? 'workout'} from ${day}`}
                          className="shrink-0 text-muted2 hover:text-bad"
                        >
                          <IconClose size={14} />
                        </button>
                      </>
                    ) : (
                      <span className="mx-auto text-xs">{dragKey ? 'Drop here' : selected ? 'Tap to add' : 'Empty'}</span>
                    )}
                  </div>
                )
              })}
            </div>
            {grid[day]?.[1] && (
              <button
                onClick={() => nav(`/category/${grid[day][1]}`)}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-white/5 py-2 text-xs font-bold text-cyan-soft transition hover:bg-cyan/10"
              >
                <IconPlay size={13} /> Start {CATALOG.find((c) => c.key === grid[day][1])?.title}
              </button>
            )}
          </div>
        ))}
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
