/**
 * Body-map gender preference — stored on `profiles.gender`, the same table and the same
 * "cache locally, sync to the row" shape as the Groq key (see ./groq.ts). Synced rather
 * than device-local for the same reason: it should follow the person, not the phone.
 * That is also why this is not in ./store.ts alongside the unit preference — the unit is
 * deliberately per-device, this is deliberately per-account.
 *
 * Unset (`null`) means "male" everywhere that reads it — every existing account predates
 * this preference, and the male dataset is what they have always seen, so a silent
 * default keeps their app looking exactly the same until they actively choose otherwise.
 *
 * The web copy of this file (apps/web/src/lib/gender.ts) is the same contract over
 * localStorage. It is not parity-enforced because the storage API differs — localStorage
 * is synchronous, AsyncStorage is not — but the semantics below must stay in step with it,
 * particularly the "never reset on an ambiguous answer" rule.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'
import type { Gender } from '../data/assetCdn'

const CACHE = 'grindz:gender'

/** Cached preference, or 'male'. Hydrated once on mount — see lib/app-context.tsx. */
export async function getGenderPref(): Promise<Gender> {
  try {
    return (await AsyncStorage.getItem(CACHE)) === 'female' ? 'female' : 'male'
  } catch {
    return 'male'
  }
}

/**
 * Pull the preference from the shared profile row. Call after sign-in.
 *
 * Only ever MOVES the local value toward an explicit server answer; never resets it to
 * the 'male' default on an ambiguous one. That distinction is load-bearing — an earlier
 * version of the web copy treated "the fetch errored" and "the fetch succeeded and found
 * no preference" as the same case and defaulted both to 'male', which silently flipped a
 * real choice back to male on every token refresh whenever the read failed (missing
 * `gender` column on a project that hadn't run the migration yet, a dropped request,
 * anything). A fetch failure now leaves whatever is already on this device alone — the
 * same "fail soft, keep showing what you had" contract every other sync in this app
 * already uses (see catalogSync.ts, groq.ts).
 */
export async function syncGenderPref(): Promise<Gender> {
  const current = await getGenderPref()
  try {
    const uid = (await supabase.auth.getUser()).data.user?.id
    if (!uid) return current
    const { data, error } = await supabase.from('profiles').select('gender').eq('id', uid).maybeSingle()
    if (error) return current // fetch failed — do not touch the local value
    if (data?.gender === 'male' || data?.gender === 'female') {
      // the server has an explicit answer; that's authoritative for cross-device sync
      if (data.gender !== current) await AsyncStorage.setItem(CACHE, data.gender).catch(() => {})
      return data.gender
    }
    // row exists but no preference has ever been saved (a genuinely new account, or
    // this device's own write is still in flight) — nothing to adopt, keep local
    return current
  } catch {
    return current
  }
}

/**
 * Save the preference to the user's profile row so it follows them across devices.
 * @returns true when it reached the server; false means local-only for this session.
 */
export async function setGenderPref(g: Gender): Promise<boolean> {
  await AsyncStorage.setItem(CACHE, g).catch(() => {})
  try {
    const uid = (await supabase.auth.getUser()).data.user?.id
    if (!uid) return false
    const { error } = await supabase.from('profiles').upsert({ id: uid, gender: g }, { onConflict: 'id' })
    return !error
  } catch {
    return false
  }
}
