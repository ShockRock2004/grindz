import type { ReactNode } from 'react'
import { cx, clamp } from '../lib/util'
import { Sparkline } from './charts/Charts'
import { IconAlert, IconChart, IconFlame, IconScale, IconTrophy } from './Icons'
import { legendRim, legendStops, type BodyMapVariant, type IslandLayer } from '../data/bodyMapStyle'
import type { InsightIcon, InsightTone } from '../lib/insights'

/**
 * Shared visual primitives for the History and Session Detail redesign.
 *
 * Each was previously a private, slightly-different copy inside one or two page files —
 * `Tile` in both SessionDetail.tsx (web + mobile) and a third variant in Home.tsx,
 * `LegendSwatch` inside Progress.tsx, and three different hand-rolled progress-bar rows
 * (SetsPerMuscle, Progress's split rows, Progress's strength gauge). Promoted here so the
 * next screen that needs a stat tile or a meter bar reuses one implementation.
 */

/* ------------------------------------------------------------------------ StatTile */

export interface TileDelta {
  /** signed magnitude; sign picks the arrow and color, `text` is what's actually shown */
  n: number
  text: string
}

export function StatTile({
  icon,
  label,
  value,
  unit,
  delta,
  spark,
  sparkTone = 'cyan',
}: {
  icon?: ReactNode
  label: string
  value: ReactNode
  unit?: string
  delta?: TileDelta | null
  /** oldest→newest; when present, renders under the value as directional context */
  spark?: number[]
  sparkTone?: 'cyan' | 'good' | 'bad' | 'muted'
}) {
  return (
    <div className="rounded-2xl bg-white/5 px-3 py-3 text-center">
      <div className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
        {icon}
        {label}
      </div>
      <p className="tnum mt-1 font-heading text-lg font-extrabold leading-none">
        {value}
        {unit && <span className="ml-0.5 text-[11px] font-semibold text-muted">{unit}</span>}
      </p>
      {delta !== undefined &&
        (delta ? (
          <p className={cx('tnum mt-1 text-[11px] font-semibold', delta.n > 0 ? 'text-good' : delta.n < 0 ? 'text-bad' : 'text-muted')}>
            {delta.n === 0 ? '±0' : `${delta.n > 0 ? '↑' : '↓'}${delta.text}`}
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-muted">—</p>
        ))}
      {spark && spark.length >= 2 && (
        <div className="mt-1.5">
          <Sparkline values={spark} height={22} tone={sparkTone} />
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------------ MeterBar */

export function MeterBar({
  label,
  value,
  max,
  band,
  tone = 'cyan',
  trailing,
  size = 'md',
}: {
  label: ReactNode
  value: number
  max: number
  /** an evidence band (e.g. 10–20 hard sets) drawn behind the bar, not a hard rule */
  band?: [number, number]
  tone?: 'cyan' | 'good' | 'warn' | 'bad'
  trailing?: ReactNode
  size?: 'sm' | 'md'
}) {
  const pct = clamp(max > 0 ? value / max : 0, 0, 1) * 100
  const fill = tone === 'good' ? 'bg-good' : tone === 'warn' ? 'bg-warn' : tone === 'bad' ? 'bg-bad' : 'bg-cyan'
  const bandStyle: React.CSSProperties | undefined = band
    ? { left: `${clamp((band[0] / max) * 100, 0, 100)}%`, right: `${100 - clamp((band[1] / max) * 100, 0, 100)}%` }
    : undefined
  return (
    <div className={size === 'sm' ? 'py-1' : 'py-1.5'}>
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
        <span className="min-w-0 truncate font-semibold text-ink2">{label}</span>
        {trailing && <span className="shrink-0 tnum text-muted">{trailing}</span>}
      </div>
      <div className={cx('relative w-full overflow-hidden rounded-full bg-white/[0.06]', size === 'sm' ? 'h-1.5' : 'h-2')}>
        {bandStyle && <div className="absolute inset-y-0 rounded-full bg-white/[0.05]" style={bandStyle} />}
        <div className={cx('absolute inset-y-0 left-0 rounded-full transition-[width]', fill)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------ InsightCard */

const TONE_STYLES: Record<InsightTone, string> = {
  good: 'bg-good/[0.10] text-good ring-1 ring-good/20',
  warn: 'bg-warn/[0.10] text-warn ring-1 ring-warn/20',
  neutral: 'bg-white/5 text-ink2 ring-1 ring-line',
}

const TONE_ICON_BG: Record<InsightTone, string> = {
  good: 'bg-good/15 text-good',
  warn: 'bg-warn/15 text-warn',
  neutral: 'bg-white/10 text-muted',
}

function InsightGlyph({ icon }: { icon: InsightIcon }) {
  const size = 13
  switch (icon) {
    case 'trophy':
      return <IconTrophy size={size} />
    case 'trend':
      return <IconChart size={size} />
    case 'flame':
      return <IconFlame size={size} />
    case 'scale':
      return <IconScale size={size} />
    case 'alert':
    default:
      return <IconAlert size={size} />
  }
}

export function InsightCard({ icon, tone, text, value }: { icon: InsightIcon; tone: InsightTone; text: string; value?: string }) {
  return (
    <div className={cx('flex items-start gap-2.5 rounded-2xl px-3.5 py-3 text-xs font-medium leading-snug', TONE_STYLES[tone])}>
      <span className={cx('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full', TONE_ICON_BG[tone])}>
        <InsightGlyph icon={icon} />
      </span>
      <span className="min-w-0">
        {text}
        {value && <span className="ml-1 font-heading font-extrabold text-ink">{value}</span>}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------------ Legend */

export function Legend({ items }: { items: { swatch: ReactNode; label: string }[] }) {
  if (!items.length) return null
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-muted">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {it.swatch} {it.label}
        </span>
      ))}
    </div>
  )
}

/**
 * One legend entry painted from the same source a muscle-map island reads, so the key
 * can never drift from the figure. Moved here from Progress.tsx (was private) so Session
 * Detail's per-session muscle map can share it rather than re-deriving the same swatch.
 */
export function LegendSwatch({ variant, layer, label }: { variant: BodyMapVariant; layer: IslandLayer; label: string }) {
  const rim = legendRim(variant, layer)
  const [from, to] = legendStops(variant, layer)
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-2.5 w-2.5 rounded-sm ring-1 ring-inset"
        style={{
          backgroundImage: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
          ['--tw-ring-color' as string]: rim ?? 'rgba(255,255,255,0.15)',
        }}
      />{' '}
      {label}
    </span>
  )
}
