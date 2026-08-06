import AsyncStorage from '@react-native-async-storage/async-storage'
import type { ActiveSession } from './types'

/*
 * Web used synchronous localStorage; AsyncStorage is promise-based, so every
 * accessor here is async and the context hydrates them once on mount rather than
 * reading during render.
 */
const ACTIVE = 'cfit:active'
const UNIT = 'cfit:unitPref'

export type WeightUnitPref = 'kg' | 'lbs'

/** In-progress session, mirrored locally so a crash / kill never loses it. */
export async function loadActive(): Promise<ActiveSession | null> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE)
    return raw ? (JSON.parse(raw) as ActiveSession) : null
  } catch {
    return null
  }
}

export async function saveActive(s: ActiveSession): Promise<void> {
  try {
    await AsyncStorage.setItem(ACTIVE, JSON.stringify(s))
  } catch {
    /* quota / unavailable */
  }
}

export async function clearActive(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ACTIVE)
  } catch {
    /* unavailable */
  }
}

/** Preferred display unit. Canonical storage stays in kilograms. */
export async function getUnitPref(): Promise<WeightUnitPref> {
  try {
    return (await AsyncStorage.getItem(UNIT)) === 'lbs' ? 'lbs' : 'kg'
  } catch {
    return 'kg'
  }
}

export async function setUnitPref(v: WeightUnitPref): Promise<void> {
  try {
    await AsyncStorage.setItem(UNIT, v)
  } catch {
    /* unavailable */
  }
}
