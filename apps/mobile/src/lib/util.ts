export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

/** Epley 1-rep-max estimate. */
export function epley1rm(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0
  return reps === 1 ? weight : weight * (1 + reps / 30)
}

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

/** local YYYY-MM-DD (not UTC). */
export function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fmtDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  if (m >= 60) {
    const h = Math.floor(m / 60)
    return `${h}h ${m % 60}m`
  }
  return `${m}:${String(sec).padStart(2, '0')}`
}

export type WeightUnit = 'kg' | 'lbs'

const LBS_PER_KG = 2.20462

/** Canonical kg -> the user's display unit. */
export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === 'lbs' ? kg * LBS_PER_KG : kg
}

/** A value typed in the display unit -> canonical kg (what we always store). */
export function toKg(v: number, unit: WeightUnit): number {
  return unit === 'lbs' ? v / LBS_PER_KG : v
}

/**
 * Format a weight (always stored in kg) for display.
 * `unit` is required so a caller can never silently render kg numbers under an
 * lbs label — read it from `usePrefs()` rather than from storage at render time.
 */
export function fmtWeight(kg: number, unit: WeightUnit): string {
  const r = Math.round(fromKg(kg, unit) * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

/**
 * Group thousands. A weekly volume reads `26,205`, not `26205` — and in lbs the same
 * number is six digits, which is where the stat tiles started to overflow.
 */
export function fmtCount(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

/** RPE (6-10) -> tailwind bg+text classes on a good->cyan->warn->bad scale. */
export function rpeClasses(rpe: number): string {
  if (rpe <= 7) return 'bg-good/20 text-good'
  if (rpe === 8) return 'bg-cyan/20 text-cyan'
  if (rpe === 9) return 'bg-warn/20 text-warn'
  return 'bg-bad/20 text-bad'
}

/** RPE (6-10) -> text-only color class (same scale) for inline @N marks. */
export function rpeTextClass(rpe: number): string {
  if (rpe <= 7) return 'text-good'
  if (rpe === 8) return 'text-cyan'
  if (rpe === 9) return 'text-warn'
  return 'text-bad'
}

/** "Today" / "Yesterday" / "Mon 3 Jun" */
export function relativeDay(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const today = new Date()
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diff = Math.round((t0 - d0) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]
  return `${dow} ${d.getDate()} ${mon}`
}

export function greeting(hour = new Date().getHours()): string {
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? ''
}

/**
 * RPE (6-10) -> colour on a good->cyan->warn->bad scale.
 * The web version returned Tailwind class names; native needs the raw value.
 */
export function rpeColor(rpe: number): string {
  if (rpe <= 7) return '#00e0a4'
  if (rpe === 8) return '#00c6ff'
  if (rpe === 9) return '#ffb020'
  return '#ff5c7a'
}
