/**
 * Groq API key — Grindz's own, stored on `profiles.groq_key`.
 *
 * Entirely optional. Nothing in the app requires it except AI-assisted authoring of a
 * new custom exercise (see exercise-ai.ts); every other feature works without one.
 * The key is per-user and never leaves their own row.
 *
 * The key is a bearer token for a third-party service, so the local copy exists
 * only to survive going offline and is wiped on sign-out.
 */
import { supabase } from './supabase'

const CACHE = 'grindz:groq_key'

export function getGroqKey(): string {
  try {
    return localStorage.getItem(CACHE) ?? ''
  } catch {
    return ''
  }
}

/** Pull the key from the shared profile row. Call after sign-in. */
export async function syncGroqKey(): Promise<string> {
  try {
    const uid = (await supabase.auth.getUser()).data.user?.id
    if (!uid) return getGroqKey()
    const { data, error } = await supabase.from('profiles').select('groq_key').eq('id', uid).maybeSingle()
    // supabase-js resolves query failures into `error`, it does not throw — a naive
    // `const { data } = await ...` treats a failed query the same as "no key saved" and
    // wipes whatever was cached locally. A key that just saved fine must survive a sync
    // that couldn't reach the server, not get erased by it.
    if (error) return getGroqKey()
    const key = ((data?.groq_key as string | null) ?? '')
    localStorage.setItem(CACHE, key)
    return key
  } catch {
    return getGroqKey()
  }
}

/**
 * Save a key to the user's profile row so it follows them across devices.
 * @returns true when it reached the server; false means local-only.
 */
export async function setGroqKey(key: string): Promise<boolean> {
  const k = key.trim()
  try {
    localStorage.setItem(CACHE, k)
  } catch {
    /* private mode */
  }
  try {
    const uid = (await supabase.auth.getUser()).data.user?.id
    if (!uid) return false
    const { error } = await supabase.from('profiles').upsert({ id: uid, groq_key: k || null }, { onConflict: 'id' })
    return !error
  } catch {
    return false
  }
}

/** A bearer token for another service must not outlive the session. */
export function clearGroqKey(): void {
  try {
    localStorage.removeItem(CACHE)
  } catch {
    /* ignore */
  }
}

/** `gsk_abcd…wxyz` — enough to recognise, not enough to leak. */
export function maskKey(key: string): string {
  if (!key) return ''
  if (key.length <= 12) return `${key.slice(0, 4)}…`
  return `${key.slice(0, 8)}…${key.slice(-4)}`
}
