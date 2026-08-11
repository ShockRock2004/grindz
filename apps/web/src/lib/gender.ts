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

/** Pull the preference from the shared profile row. Call after sign-in. */
export async function syncGenderPref(): Promise<Gender> {
  try {
    const uid = (await supabase.auth.getUser()).data.user?.id
    if (!uid) return getGenderPref()
    const { data } = await supabase.from('profiles').select('gender').eq('id', uid).maybeSingle()
    const g: Gender = data?.gender === 'female' ? 'female' : 'male'
    localStorage.setItem(CACHE, g)
    return g
  } catch {
    return getGenderPref()
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
