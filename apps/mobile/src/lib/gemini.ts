/**
 * Gemini API key — Grindz's own, stored on `profiles.gemini_key`.
 *
 * Entirely optional, same shape as groq.ts. Nothing in the app requires it except the
 * AI Insights screen (see ai-insights.ts); every other feature works without one.
 * The key is per-user and never leaves their own row.
 *
 * The key is a bearer token for a third-party service, so it is cached locally
 * only to survive going offline, and is wiped on sign-out.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

const CACHE = 'grindz:gemini_key'

let memo: string | null = null

/*
 * Settings (where the key is saved) is an overlay Modal, not a screen swap — the tab
 * behind it (Insights) never unmounts while it's open. Insights only fetched the key
 * once on mount, so saving it in Settings and closing back to an already-mounted
 * Insights left that screen showing "no key" forever, even though the key really did
 * save. Every write below notifies these listeners so any mounted consumer picks it
 * up immediately.
 */
const listeners = new Set<(key: string) => void>()
export function onGeminiKeyChange(fn: (key: string) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function notify(key: string) {
  for (const fn of listeners) fn(key)
}

/** Cached key, or '' — safe to call on every render. */
export async function getGeminiKey(): Promise<string> {
  if (memo !== null) return memo
  memo = (await AsyncStorage.getItem(CACHE).catch(() => null)) ?? ''
  return memo
}

/** Pull the key from the shared profile row. Call after sign-in. */
export async function syncGeminiKey(): Promise<string> {
  try {
    const uid = (await supabase.auth.getUser()).data.user?.id
    if (!uid) return getGeminiKey()
    const { data } = await supabase.from('profiles').select('gemini_key').eq('id', uid).maybeSingle()
    const key = (data?.gemini_key as string | null) ?? ''
    memo = key
    await AsyncStorage.setItem(CACHE, key).catch(() => {})
    notify(key)
    return key
  } catch {
    // offline — fall back to whatever was cached
    return getGeminiKey()
  }
}

/**
 * Save a key to the user's profile row so it follows them across devices.
 * @returns true when it reached the server; false means local-only (offline).
 */
export async function setGeminiKey(key: string): Promise<boolean> {
  const k = key.trim()
  memo = k
  await AsyncStorage.setItem(CACHE, k).catch(() => {})
  notify(k)
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
export async function clearGeminiKey(): Promise<void> {
  memo = ''
  await AsyncStorage.removeItem(CACHE).catch(() => {})
  notify('')
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
