/**
 * Gemini API key — Grindz's own, stored on `profiles.gemini_key`.
 *
 * Entirely optional, same shape as groq.ts. Nothing in the app requires it except the
 * AI Insights screen (see ai-insights.ts); every other feature works without one.
 * The key is per-user and never leaves their own row.
 *
 * The key is a bearer token for a third-party service, so the local copy exists
 * only to survive going offline and is wiped on sign-out.
 */
import { supabase } from './supabase'

const CACHE = 'grindz:gemini_key'

export function getGeminiKey(): string {
  try {
    return localStorage.getItem(CACHE) ?? ''
  } catch {
    return ''
  }
}

/** Pull the key from the shared profile row. Call after sign-in. */
export async function syncGeminiKey(): Promise<string> {
  try {
    const uid = (await supabase.auth.getUser()).data.user?.id
    if (!uid) return getGeminiKey()
    const { data } = await supabase.from('profiles').select('gemini_key').eq('id', uid).maybeSingle()
    const key = ((data?.gemini_key as string | null) ?? '')
    localStorage.setItem(CACHE, key)
    return key
  } catch {
    return getGeminiKey()
  }
}

/**
 * Save a key to the user's profile row so it follows them across devices.
 * @returns true when it reached the server; false means local-only.
 */
export async function setGeminiKey(key: string): Promise<boolean> {
  const k = key.trim()
  try {
    localStorage.setItem(CACHE, k)
  } catch {
    /* private mode */
  }
  try {
    const uid = (await supabase.auth.getUser()).data.user?.id
    if (!uid) return false
    const { error } = await supabase.from('profiles').upsert({ id: uid, gemini_key: k || null }, { onConflict: 'id' })
    return !error
  } catch {
    return false
  }
}

/** A bearer token for another service must not outlive the session. */
export function clearGeminiKey(): void {
  try {
    localStorage.removeItem(CACHE)
  } catch {
    /* ignore */
  }
}

/** `AIzaSy…wxyz` — enough to recognise, not enough to leak. */
export function maskKey(key: string): string {
  if (!key) return ''
  if (key.length <= 12) return `${key.slice(0, 4)}…`
  return `${key.slice(0, 8)}…${key.slice(-4)}`
}

/** Cheap round-trip to confirm a pasted key actually works before we store it. */
export async function testGeminiKey(key: string): Promise<boolean> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key.trim())}`)
    return res.ok
  } catch {
    return false
  }
}
