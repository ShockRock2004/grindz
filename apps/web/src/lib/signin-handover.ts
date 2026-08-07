/**
 * The receiving half of the grindz.dev handover.
 *
 * `localStorage` is per-origin, so the marketing site cannot run OAuth — a session minted
 * there would be invisible here. Its "Continue with Google" links to this origin carrying
 * `?signin=1`, and this file is what acts on it.
 *
 * ## Why this runs before React
 *
 * It used to live in a `useEffect` on the landing page, which meant sign-in could not start
 * until the bundle had parsed, the session had been fetched over the network, and the landing
 * page had rendered. The visible result was about two seconds of *this app's* front door —
 * the page the person had just said they did not want — before the tab left for Google.
 *
 * Starting here removes both waits. Nothing is rendered, nothing is fetched: the flag is read
 * synchronously at module scope and the redirect begins immediately.
 *
 * ## Why the splash stays up
 *
 * `main.tsx` skips `app-ready` while a handover is in flight, so the boot splash that is
 * already on screen simply stays there until the tab leaves. There is no second spinner and
 * no flash of the landing page — the person sees one continuous branded screen from the click
 * on grindz.dev to Google's consent page.
 *
 * If sign-in fails, `reveal()` lifts the splash so they land on the sign-in page with an error
 * rather than staring at a splash forever.
 */
import { signInWithGoogle } from './auth'

/**
 * Is a session already in storage?
 *
 * Deliberately synchronous. `supabase.auth.getSession()` is the correct API but it is async
 * and can go to the network to refresh — waiting on it is exactly the delay being removed
 * here. Supabase persists under `sb-<project-ref>-auth-token`, so presence of that key is
 * enough to answer "should we ask Google again?".
 *
 * Being wrong is cheap and self-correcting in both directions: a stale key means we boot the
 * app, find no session and show the sign-in page; a missing key means one extra trip to
 * Google, which returns immediately for anyone with a live Google session.
 */
function hasStoredSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && /^sb-.+-auth-token$/.test(k) && localStorage.getItem(k)) return true
    }
  } catch {
    /* storage blocked — treat as signed out and let Google decide */
  }
  return false
}

/**
 * Consume `?signin=1` and start sign-in.
 *
 * Returns true when a redirect is under way, which tells `main.tsx` to leave the splash up.
 *
 * The flag is stripped **before** sign-in starts, and that ordering carries the whole safety
 * argument:
 *
 *   - returning from an abandoned consent screen restores this page from bfcache with a clean
 *     URL, so it does not fire again and trap the person in a loop
 *   - a reload, a bookmark or a shared link cannot re-trigger it
 *   - React StrictMode's double mount cannot double-fire it
 *
 * `replaceState` rather than `pushState`, so Back leaves the app instead of stepping through a
 * URL that has already been consumed. `redirectTo` is `window.location.origin`, which carries
 * no query, so the return trip is unaffected.
 */
export function startSignInHandover(reveal: () => void): boolean {
  if (typeof window === 'undefined') return false

  const url = new URL(window.location.href)
  if (url.searchParams.get('signin') !== '1') return false

  url.searchParams.delete('signin')
  window.history.replaceState({}, '', url.pathname + url.search + url.hash)

  // Already signed in: booting normally lands them in the app, which is what they wanted.
  if (hasStoredSession()) return false

  signInWithGoogle().catch(reveal)
  return true
}
