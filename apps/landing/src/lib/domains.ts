/**
 * The marketing side of the two-origin split.
 *
 *   grindz.dev       this app — the pitch, and nothing else
 *   app.grindz.dev   apps/web — the actual product
 *
 * Two separate Vercel projects. This one never imports `@supabase/supabase-js`, has no
 * session, and cannot sign anybody in — `localStorage` is per-origin, so a session minted
 * here would be invisible to the app and the user would arrive signed out anyway. The call
 * to action is therefore a link, and the app asks Google.
 *
 * ## The hint cookie
 *
 * A returning user typing `grindz.dev` should land in the app, not on a pitch for something
 * they already use. This page cannot read their session for the reason above, so the app
 * leaves a note on the shared parent domain instead:
 *
 *   gz_hint=1; domain=.grindz.dev; path=/; secure; samesite=lax
 *
 * It is a **boolean and nothing else** — no token, no user id, no email. Worst case it is
 * stale or forged and the visitor is sent to the app, which shows them a sign-in screen:
 * exactly what clicking the button would have done. It grants nothing.
 *
 * The app writes it on every auth transition and clears it on sign-out. If it were left
 * behind after signing out, this page would bounce that person straight back into a sign-in
 * screen — making the marketing site unreachable for the one person who just left.
 */

/** Where the app lives. Override with `VITE_APP_ORIGIN` for previews or a renamed domain. */
export const APP_ORIGIN =
  (import.meta.env.VITE_APP_ORIGIN as string | undefined) || 'https://app.grindz.dev'

/**
 * The handover: "this person came here to sign in".
 *
 * This page cannot run OAuth itself — `localStorage` is per-origin, so a session minted on
 * `grindz.dev` would be invisible to the app that needs it. So the button links across, and
 * the app asks Google.
 *
 * Linking to the bare origin handed over the *person* but not the *intent*: they pressed
 * "Continue with Google", arrived at the app's own signed-out front door, and had to press a
 * second Google button to get what the first one promised. This flag is what closes that gap.
 * `apps/web/src/pages/Landing.tsx` reads it, strips it, and goes straight to Google.
 *
 * Both sides must agree on the spelling, so it is a constant on each — grep `signin=1`.
 */
export const APP_SIGNIN_URL = `${APP_ORIGIN}/?signin=1`

const HINT = 'gz_hint'

export function hasSignedInHint(): boolean {
  if (typeof document === 'undefined') return false
  try {
    return new RegExp(`(?:^|;\\s*)${HINT}=1(?:;|$)`).test(document.cookie)
  } catch {
    return false
  }
}

/**
 * Send a previously-signed-in visitor straight to the app.
 *
 * `replace` rather than `assign`, so Back returns them to wherever they came from instead of
 * to a page that will immediately redirect them again.
 *
 * Returns true when a navigation has been committed, so the caller can skip mounting a tree
 * it is about to leave.
 */
export function redirectToAppIfSignedIn(): boolean {
  if (typeof window === 'undefined' || !hasSignedInHint()) return false
  window.location.replace(APP_ORIGIN)
  return true
}
