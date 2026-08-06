import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cx } from '../lib/util'
import { IconCheck, IconChevronDown, IconClose, IconMinus, IconPlus, IconTrophy } from './Icons'
import { haptic } from '../lib/haptics'

export function Button({
  variant = 'cyan',
  className,
  children,
  ...rest
}: {
  variant?: 'cyan' | 'outline' | 'ghost' | 'danger'
  className?: string
  children: ReactNode
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 font-heading font-bold text-[15px] transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none'
  const styles = {
    cyan: 'btn-cyan',
    outline: 'border border-line2 text-ink hover:border-cyan/70 hover:bg-cyan/10',
    ghost: 'text-muted2 hover:text-ink hover:bg-white/5',
    danger: 'border border-bad/40 text-bad hover:bg-bad/10',
  }[variant]
  return (
    <button className={cx(base, styles, className)} {...rest}>
      {children}
    </button>
  )
}

export function IconButton({
  className,
  children,
  ...rest
}: { className?: string; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cx('grid h-10 w-10 place-items-center rounded-full glass text-muted2 transition hover:text-ink active:scale-95', className)}
      {...rest}
    >
      {children}
    </button>
  )
}

/**
 * Open-dialog stack.
 *
 * Escape used to be handled by every mounted Modal at once, so opening "Add exercise" from
 * inside Settings and pressing Escape dismissed BOTH — you landed back on the page instead of
 * back in Settings. Only the topmost dialog should react, which needs a shared notion of
 * which one that is.
 */
const modalStack: symbol[] = []

export function Modal({
  open,
  onClose,
  title,
  children,
  maxW = 'max-w-md',
  layer = 'base',
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  maxW?: string
  /**
   * 'over' for a dialog opened from inside another one. It sits above and uses a much more
   * opaque scrim, because two stacked translucent glass panels read as a rendering glitch
   * rather than as depth.
   */
  layer?: 'base' | 'over'
}) {
  const idRef = useRef<symbol | null>(null)
  if (idRef.current === null) idRef.current = Symbol('modal')

  useEffect(() => {
    if (!open) return
    const id = idRef.current!
    modalStack.push(id)
    const onKey = (e: KeyboardEvent) => {
      // only the dialog on top of the stack closes
      if (e.key === 'Escape' && modalStack[modalStack.length - 1] === id) {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const i = modalStack.lastIndexOf(id)
      if (i !== -1) modalStack.splice(i, 1)
    }
  }, [open, onClose])

  // The body must not scroll behind an open dialog — on desktop the page visibly slid around
  // under the scrim when the wheel was used over it.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null
  const over = layer === 'over'
  return (
    <div
      className={cx('fixed inset-0 flex items-end justify-center sm:items-center', over ? 'z-[70]' : 'z-50')}
      role="dialog"
      aria-modal
      aria-label={title}
    >
      <div
        className={cx('absolute inset-0 animate-fadeIn', over ? 'bg-black/85 backdrop-blur-md' : 'bg-black/70 backdrop-blur-sm')}
        onClick={onClose}
      />
      <div
        className={cx(
          'relative z-10 flex max-h-[92dvh] w-full flex-col glass-strong rounded-t-3xl p-5 shadow-card animate-fadeUp sm:max-h-[86dvh] sm:rounded-3xl',
          maxW,
        )}
      >
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <h2 className="font-heading text-lg font-extrabold">{title}</h2>
          <IconButton onClick={onClose} aria-label="Close">
            <IconClose size={18} />
          </IconButton>
        </div>
        {/* long dialogs (Settings, the add-exercise wizard) scroll inside themselves rather
            than growing past the viewport and stranding their own action buttons */}
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">{children}</div>
      </div>
    </div>
  )
}

/**
 * In-app replacement for `window.confirm`.
 *
 * The native dialog is styled by the browser, not the app: it appears at the top of the
 * window in Chrome's own chrome, prefixed with "localhost:5173 says", with OS buttons. In a
 * dark full-screen app it reads as a browser error rather than as a decision the app is
 * asking you to make — and it blocks the main thread while it is open.
 *
 * `tone="danger"` colours the confirm button for destructive actions.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  body?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} maxW="max-w-sm" layer="over">
      {body && <div className="text-sm leading-relaxed text-muted2">{body}</div>}
      <div className="mt-5 flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={tone === 'danger' ? 'danger' : 'cyan'} className="flex-1" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}

export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  suffix,
  big,
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  suffix?: string
  big?: boolean
}) {
  const set = (v: number) => {
    haptic.select()
    onChange(Math.max(min, Math.round(v * 100) / 100))
  }
  return (
    <div className="flex items-center gap-2">
      <button className="grid h-9 w-9 place-items-center rounded-xl border border-line2 text-muted2 active:scale-90" onClick={() => set(value - step)} type="button" aria-label="Decrease">
        <IconMinus size={16} />
      </button>
      <div className={cx('flex items-baseline justify-center tnum', big ? 'min-w-[64px]' : 'min-w-[52px]')}>
        <input
          type="number"
          inputMode="decimal"
          value={value === 0 ? '' : value}
          placeholder="0"
          onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))}
          className={cx('w-full bg-transparent text-center font-heading font-extrabold text-ink outline-none', big ? 'text-3xl' : 'text-xl')}
        />
        {suffix && <span className="ml-0.5 text-xs text-muted">{suffix}</span>}
      </div>
      <button className="grid h-9 w-9 place-items-center rounded-xl border border-line2 text-muted2 active:scale-90" onClick={() => set(value + step)} type="button" aria-label="Increase">
        <IconPlus size={16} />
      </button>
    </div>
  )
}

export interface SelectOption {
  value: string
  label: string
  /** optional right-aligned detail, e.g. a category or a count */
  hint?: string
}

/**
 * Dropdown that actually matches the app.
 *
 * A native `<select>` renders its option list through the OS, so it can't be
 * themed — on the dark UI it popped up as a white/blue system list. This is a
 * listbox built from real elements, identical on mobile and desktop: tap or
 * click to open, full keyboard support (arrows / Home / End / Enter / Escape /
 * type-ahead), closes on outside press, and flips above the trigger when there
 * isn't room below.
 */
export function Select({
  value,
  options,
  onChange,
  placeholder = 'Select…',
  className,
  buttonClassName,
  'aria-label': ariaLabel,
}: {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  buttonClassName?: string
  'aria-label'?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [flip, setFlip] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const typed = useRef({ buf: '', at: 0 })

  const selectedIndex = options.findIndex((o) => o.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined

  const openList = () => {
    if (!options.length) return
    haptic.select()
    // open upward when the trigger sits low enough that a list below would be clipped
    const r = rootRef.current?.getBoundingClientRect()
    if (r) setFlip(window.innerHeight - r.bottom < 260 && r.top > 260)
    setActive(selectedIndex >= 0 ? selectedIndex : 0)
    setOpen(true)
  }

  const commit = (i: number) => {
    const opt = options[i]
    if (!opt) return
    haptic.select()
    onChange(opt.value)
    setOpen(false)
  }

  // outside press + Escape
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation() // don't also close a surrounding Modal
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  // keep the highlighted row in view
  useLayoutEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openList()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(options.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(options.length - 1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      commit(active)
    } else if (e.key === 'Tab') {
      setOpen(false)
    } else if (e.key.length === 1) {
      // type-ahead, same as a native select
      const now = Date.now()
      typed.current.buf = now - typed.current.at > 700 ? e.key : typed.current.buf + e.key
      typed.current.at = now
      const q = typed.current.buf.toLowerCase()
      const hit = options.findIndex((o) => o.label.toLowerCase().startsWith(q))
      if (hit >= 0) setActive(hit)
    }
  }

  return (
    <div ref={rootRef} className={cx('relative', className)}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onTriggerKey}
        disabled={!options.length}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={cx(
          'flex w-full items-center gap-2 rounded-xl border bg-panel2 px-3 py-2.5 text-left text-sm font-bold text-ink transition disabled:opacity-40',
          open ? 'border-cyan/60 shadow-glow-sm' : 'border-line2 hover:border-cyan/40',
          buttonClassName,
        )}
      >
        <span className={cx('min-w-0 flex-1 truncate', !selected && 'font-normal text-muted')}>{selected?.label ?? placeholder}</span>
        <IconChevronDown size={16} className={cx('shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          aria-label={ariaLabel}
          className={cx(
            'absolute z-50 max-h-64 w-full overflow-y-auto overscroll-contain rounded-xl border border-line2 bg-panel2/95 p-1 shadow-card backdrop-blur-xl animate-fadeUp no-scrollbar',
            flip ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
          )}
        >
          {options.map((o, i) => {
            const isSel = o.value === value
            return (
              <button
                key={o.value}
                type="button"
                data-i={i}
                role="option"
                aria-selected={isSel}
                onPointerEnter={() => setActive(i)}
                onClick={() => commit(i)}
                className={cx(
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition',
                  i === active ? 'bg-cyan/15 text-ink' : 'text-ink2',
                  isSel && 'font-bold',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.hint && <span className="shrink-0 text-[11px] text-muted">{o.hint}</span>}
                {isSel && <IconCheck size={15} className="shrink-0 text-cyan" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function EmptyState({ icon, title, sub }: { icon?: ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-line2 px-6 py-12 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <p className="font-heading text-base font-bold text-ink2">{title}</p>
      {sub && <p className="max-w-[34ch] text-sm text-muted">{sub}</p>}
    </div>
  )
}

export function Celebration({ prs, onDone }: { prs: { exercise: string; text: string }[] | null; onDone: () => void }) {
  useEffect(() => {
    if (!prs || !prs.length) return
    haptic.pr()
    const t = setTimeout(onDone, 2600 + prs.length * 400)
    return () => clearTimeout(t)
  }, [prs, onDone])
  if (!prs || !prs.length) return null
  const count = Math.min(40, 20 + prs.length * 4)
  const multi = prs.length > 1
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={onDone}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: count }).map((_, i) => (
          <span
            key={i}
            className="absolute top-[-10px] h-2 w-2 rounded-[1px]"
            style={{
              left: `${(i * 37) % 100}%`,
              background: ['#00c6ff', '#0072ff', '#5fdcff', '#ffffff'][i % 4],
              animation: `confetti ${1.4 + (i % 5) * 0.25}s cubic-bezier(0.4,0.6,0.5,1) ${(i % 7) * 0.06}s forwards`,
            }}
          />
        ))}
      </div>
      <div className="relative z-10 w-[min(22rem,90vw)] animate-pop rounded-3xl glass-strong px-8 py-7 text-center shadow-glow">
        <div className="mx-auto mb-2 grid h-14 w-14 place-items-center rounded-2xl bg-cyan text-cyan-ink">
          <IconTrophy size={30} />
        </div>
        <p className="font-heading text-xl font-extrabold text-ink">{multi ? 'New PRs!' : 'New PR!'}</p>
        {multi ? (
          <div className="mt-3 flex max-h-[46vh] flex-col gap-1.5 overflow-y-auto no-scrollbar text-left">
            {prs.map((p, i) => (
              <div key={i} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2">
                <span className="min-w-0 truncate text-sm font-bold text-ink">{p.exercise}</span>
                <span className="shrink-0 text-xs text-muted2">{p.text}</span>
              </div>
            ))}
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-cyan-soft">{prs[0].exercise}</p>
            <p className="mt-0.5 text-sm text-muted2">{prs[0].text}</p>
          </>
        )}
      </div>
      <style>{`@keyframes confetti{to{transform:translateY(105vh) rotate(540deg);opacity:.9}}`}</style>
    </div>
  )
}
