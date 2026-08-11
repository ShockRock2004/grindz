/**
 * Body-map gender preference — stored on `profiles.gender`, the same table and the same
 * "cache locally, sync to the row" shape as the Groq key (see ./groq.ts). Synced rather
 * than device-local for the same reason: it should follow the person, not the phone.
 *
 * Unset (`null`) means "male" everywhere that reads it — every existing account predates
 * this preference, and the male dataset is what they have always seen, so a silent
 * default keeps their app looking exactly the same until they actively choose otherwise.
 */
import { supabase } from './supabase'
import type { Gender } from '../data/assetCdn'

const CACHE = 'grindz:gender'

export function getGenderPref(): Gender {
  try {
    return localStorage.getItem(CACHE) === 'female' ? 'female' : 'male'
  } catch {
    return 'male'
  }
}

/**
 * Pull the preference from the shared profile row. Call after sign-in.
 *
 * Only ever MOVES the local value toward an explicit server answer; never resets it to
 * the 'male' default on an ambiguous one. That distinction is load-bearing — an earlier
 * version treated "the fetch errored" and "the fetch succeeded and found no preference"
 * as the same case and defaulted both to 'male', which silently flipped a real choice
 * back to male on every token refresh whenever the read failed (missing `gender` column
 * on a project that hadn't run the migration yet, a dropped request, anything). A
 * fetch failure now leaves whatever is already on this device alone — the same "fail
 * soft, keep showing what you had" contract every other sync in this app already uses
 * (see catalogSync.ts, groq.ts).
 */
export async function syncGenderPref(): Promise<Gender> {
  const current = getGenderPref()
  try {
    const uid = (await supabase.auth.getUser()).data.user?.id
    if (!uid) return current
    const { data, error } = await supabase.from('profiles').select('gender').eq('id', uid).maybeSingle()
    if (error) return current // fetch failed — do not touch the local value
    if (data?.gender === 'male' || data?.gender === 'female') {
      // the server has an explicit answer; that's authoritative for cross-device sync
      if (data.gender !== current) localStorage.setItem(CACHE, data.gender)
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
  try {
    localStorage.setItem(CACHE, g)
  } catch {
    /* private mode */
  }
  try {
    const uid = (await supabase.auth.getUser()).data.user?.id
    if (!uid) return false
    const { error } = await supabase.from('profiles').upsert({ id: uid, gender: g }, { onConflict: 'id' })
    return !error
  } catch {
    return false
  }
}
