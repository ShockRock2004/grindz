import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import { supabase } from './supabase'
import { clearGroqKey } from './groq'

WebBrowser.maybeCompleteAuthSession()

/**
 * Google sign-in, native flow.
 *
 * The web app just called `signInWithOAuth({ redirectTo: window.location.origin })`
 * and let the browser navigate. That can't work here: Google refuses OAuth inside
 * an embedded WebView (`disallowed_useragent`). So instead we ask Supabase for the
 * authorize URL with `skipBrowserRedirect`, open it in the system browser via an
 * auth session, and catch the redirect back on the `grindz://` scheme — then hand
 * the returned tokens to the Supabase client ourselves.
 *
 * SETUP REQUIRED (one-time, in the Supabase dashboard):
 *   Authentication → URL Configuration → Redirect URLs → add  grindz://auth
 */
export const REDIRECT_URL = Linking.createURL('auth')

export async function signInWithGoogle(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: REDIRECT_URL,
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' },
      },
    })
    if (error || !data?.url) return { ok: false, error: error?.message ?? 'No authorize URL returned' }

    const result = await WebBrowser.openAuthSessionAsync(data.url, REDIRECT_URL)
    if (result.type !== 'success' || !result.url) {
      return { ok: false, error: result.type === 'cancel' ? 'Sign-in cancelled' : 'Sign-in did not complete' }
    }

    // Supabase returns the tokens either in the fragment (implicit) or as ?code= (PKCE)
    const url = result.url
    const frag = url.includes('#') ? url.slice(url.indexOf('#') + 1) : ''
    const fragParams = new URLSearchParams(frag)
    const access_token = fragParams.get('access_token')
    const refresh_token = fragParams.get('refresh_token')

    if (access_token && refresh_token) {
      const { error: sErr } = await supabase.auth.setSession({ access_token, refresh_token })
      return sErr ? { ok: false, error: sErr.message } : { ok: true }
    }

    const code = new URL(url).searchParams.get('code')
    if (code) {
      const { error: cErr } = await supabase.auth.exchangeCodeForSession(code)
      return cErr ? { ok: false, error: cErr.message } : { ok: true }
    }

    return { ok: false, error: 'Redirect carried no token or code' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function signOut(): Promise<void> {
  // the Groq key is a bearer token for another service — it must not survive the
  // session. It is recoverable from the profile row on next sign-in.
  await clearGroqKey()
  await supabase.auth.signOut()
}

export interface Profile {
  name: string
  avatar: string
  email: string
}

/** Display name + avatar off the Google identity, same as web. */
export async function getProfile(): Promise<Profile> {
  const { data } = await supabase.auth.getUser()
  const u = data.user
  const m = (u?.user_metadata ?? {}) as Record<string, string>
  return {
    name: (m.full_name || m.name || '').trim(),
    avatar: (m.avatar_url || m.picture || '').trim(),
    email: u?.email ?? '',
  }
}
