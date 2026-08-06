import { supabase } from './supabase'
import { clearGroqKey } from './groq'
import { DEV_BYPASS, devProfile } from './dev-auth'
import { setSignedInHint } from './domains'

/**
 * Redirect to Google, returning to `window.location.origin`.
 *
 * The origin is read at call time rather than hardcoded so that localhost and Vercel preview
 * deployments return to themselves. Every origin this can produce must be listed under
 * Supabase → Authentication → URL Configuration → Redirect URLs, or the callback is rejected.
 *
 * This only ever runs on the app host. The landing page on grindz.dev links across instead —
 * a session minted there would be stored on the wrong origin. See src/lib/domains.ts.
 */
export async function signInWithGoogle(): Promise<void> {
  if (DEV_BYPASS) return // the bypass signs you in automatically; nothing to redirect to
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      queryParams: { prompt: 'select_account' },
    },
  })
}

export async function signOut(): Promise<void> {
  // the Groq key is a bearer token for another service — it must not survive the
  // session. It is recoverable from the profile row on next sign-in.
  clearGroqKey()
  /*
   * Drop the cross-subdomain hint immediately, rather than leaving it to the
   * onAuthStateChange listener. If it survives a sign-out, grindz.dev keeps bouncing the
   * visitor to app.grindz.dev, which shows them a sign-in page — so the marketing site
   * becomes unreachable for the one person who just said they were done.
   */
  setSignedInHint(false)
  /*
   * Put the URL back to the root before the session drops.
   *
   * Signing out does not navigate: App.tsx swaps the whole <Routes> tree for <Landing /> the
   * moment `session` becomes null, so the router's location is never touched and the address
   * bar keeps whatever route you were on. Sign out from /planner and the bar reads /planner
   * while a sign-in page renders — a URL describing a page that is not on screen.
   *
   * replaceState rather than a router navigate: at this moment no route is rendering, so
   * there is nothing to navigate. And replace rather than push, so Back does not return to a
   * signed-out /planner.
   */
  try {
    if (window.location.pathname !== '/') history.replaceState(null, '', '/')
  } catch {
    /* history is unavailable in some embedded webviews; the URL is cosmetic here */
  }
  if (DEV_BYPASS) {
    // no real session to end — wipe the local mock so you get a clean slate
    try {
      localStorage.removeItem('cfit:devdb')
      localStorage.removeItem('cfit:active')
    } catch {
      /* blocked storage */
    }
    location.reload()
    return
  }
  await supabase.auth.signOut()
}

export interface Profile {
  name: string
  avatar: string
  email: string
}

/** Pull display name + avatar from the Google session (shared profiles table optional). */
export async function getProfile(): Promise<Profile> {
  if (DEV_BYPASS) return devProfile()
  const { data } = await supabase.auth.getUser()
  const u = data.user
  const m = (u?.user_metadata ?? {}) as Record<string, string>
  return {
    name: (m.full_name || m.name || '').trim(),
    avatar: (m.avatar_url || m.picture || '').trim(),
    email: u?.email ?? '',
  }
}
