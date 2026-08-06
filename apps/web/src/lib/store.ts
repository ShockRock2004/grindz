import type { ActiveSession } from './types'

const ACTIVE = 'cfit:active'

/** In-progress session, mirrored locally so a refresh / offline blip never loses it. */
export function loadActive(): ActiveSession | null {
  try {
    const raw = localStorage.getItem(ACTIVE)
    return raw ? (JSON.parse(raw) as ActiveSession) : null
  } catch {
    return null
  }
}

export function saveActive(s: ActiveSession): void {
  try {
    localStorage.setItem(ACTIVE, JSON.stringify(s))
  } catch {
    /* quota */
  }
}

export function clearActive(): void {
  try {
    localStorage.removeItem(ACTIVE)
  } catch {
    /* blocked storage */
  }
}

const UNIT = 'cfit:unitPref'

/** Preferred display unit for weights. Canonical storage stays in kilograms. */
export function getUnitPref(): 'kg' | 'lbs' {
  try {
    return localStorage.getItem(UNIT) === 'lbs' ? 'lbs' : 'kg'
  } catch {
    return 'kg'
  }
}

export function setUnitPref(v: 'kg' | 'lbs'): void {
  try {
    localStorage.setItem(UNIT, v)
  } catch {
    /* quota */
  }
}
