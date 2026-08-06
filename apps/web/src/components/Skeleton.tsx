/**
 * Loading placeholders.
 *
 * The app fetches sessions, sets and custom exercises on mount, so every data page has a
 * window where it renders structurally-complete but empty — a streak of 0, an empty chart, a
 * "No workouts logged yet" card. That reads as *data loss* rather than as loading, which is
 * worse than a spinner: the user believes a wrong answer instead of waiting for the right one.
 *
 * These mirror the real layout so nothing jumps when the content arrives — the whole point is
 * to reserve the same box, which also keeps cumulative layout shift at zero.
 *
 * `animate-pulse` is a Tailwind opacity keyframe, and the global reduced-motion rule in
 * index.css already collapses it to a static tint, so no extra handling is needed here.
 */
import { cx } from '../lib/util'
import { IconDumbbell } from './Icons'

/**
 * The brand dumbbell, used as the placeholder inside any box that will hold an image.
 * A plain grey rectangle says "something is missing"; the mark says "a picture belongs here
 * and is on its way", which is the same glyph the app uses everywhere else.
 */
export function SkelImage({ className, size = 26 }: { className?: string; size?: number }) {
  return (
    <span
      className={cx('grid animate-pulse place-items-center rounded-xl bg-white/[0.05] text-cyan/30', className)}
      aria-hidden
    >
      <IconDumbbell size={size} />
    </span>
  )
}

/** One grey block. `className` sets the size — this deliberately has no default dimensions. */
export function Skel({ className }: { className?: string }) {
  return <span className={cx('block animate-pulse rounded-md bg-white/[0.06]', className)} />
}

/** Text lines of decreasing width, which is what a paragraph actually looks like. */
export function SkelText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <span className={cx('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skel key={i} className={cx('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </span>
  )
}

/**
 * Placeholder for a Train category card.
 *
 * Mirrors the real card element for element — same h-56 box, same rounded-3xl, same padding,
 * a chip where the subtitle badge goes, a title bar, and the two meta items — so the swap to
 * real content moves nothing. A featureless grey slab technically "reserves the space" but
 * still reads as a jump, because every piece of text arrives somewhere the eye was not
 * already looking.
 */
export function SkelCard({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cx('relative flex h-56 overflow-hidden rounded-3xl bg-panel2 shadow-card', className)}
    >
      {/* stands where the athlete cutout will be */}
      <span className="absolute bottom-4 right-5 text-cyan/[0.10]">
        <IconDumbbell size={72} />
      </span>
      <div className="relative z-10 flex flex-1 flex-col justify-between p-5">
        <Skel className="h-[22px] w-24 rounded-full" />
        <div>
          <Skel className="h-6 w-32" />
          <div className="mt-3 flex items-center gap-3">
            <Skel className="h-3 w-20" />
            <Skel className="h-3 w-16" />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Mirrors the "This week" rail card: ring, then a 2x2 block of stat tiles. */
export function SkelWeekCard() {
  return (
    <section className="card p-5" aria-hidden>
      <Skel className="h-3 w-24" />
      <div className="mt-4 flex items-center gap-4">
        <Skel className="h-[104px] w-[104px] shrink-0 rounded-full" />
        <div className="grid flex-1 grid-cols-2 gap-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skel key={i} className="h-[52px] rounded-xl" />
          ))}
        </div>
      </div>
    </section>
  )
}

/** Mirrors the "Today" rail card: heading plus two plan rows. */
export function SkelTodayCard() {
  return (
    <section className="card p-5" aria-hidden>
      <Skel className="h-3 w-32" />
      <div className="mt-3 flex flex-col gap-2">
        <Skel className="h-[58px] rounded-2xl" />
        <Skel className="h-[58px] rounded-2xl" />
      </div>
    </section>
  )
}

/** A card with a heading and body, used for the Progress and History panels. */
export function SkelPanel({ height = 'h-48', label }: { height?: string; label?: string }) {
  return (
    <section className="card p-4" aria-hidden>
      <Skel className="h-3 w-32" />
      <Skel className={cx('mt-4 w-full rounded-xl', height)} />
      {label && <span className="sr-only">{label}</span>}
    </section>
  )
}

/** Rows in a list — History sessions, PR entries. */
export function SkelRows({ rows = 4, height = 'h-[72px]' }: { rows?: number; height?: string }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <Skel key={i} className={cx(height, 'rounded-2xl')} />
      ))}
    </div>
  )
}

/**
 * Announces loading once, for assistive tech, while the visual skeletons stay `aria-hidden`.
 * A screen reader should hear "Loading history" — not forty anonymous grey boxes.
 */
export function LoadingRegion({ label }: { label: string }) {
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {label}
    </p>
  )
}
