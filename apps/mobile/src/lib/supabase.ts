import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

/*
 * Grindz's own Supabase project — identical `workout_*`
 * tables, so the two clients see the same data for the same account.
 *
 * Differences from web: the session is persisted in AsyncStorage rather than
 * localStorage, and detectSessionInUrl is off because there's no URL bar to read
 * an OAuth fragment from — the native flow hands the tokens over explicitly
 * (see auth.ts).
 */
// EXPO_PUBLIC_* vars are inlined into the bundle at build time from .env
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[grindz] Supabase config missing — check apps/mobile/.env')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})
