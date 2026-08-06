/**
 * Two hostnames, one deployment.
 *
 *   grindz.dev       → the marketing landing page, always, signed in or not
 *   app.grindz.dev   → the app; signed out, Landing renders as the sign-in page
 *
 * Both are domains on the *same* Vercel project serving the *same* bundle. The only thing
 * that differs at runtime is `window.location.hostname`, which is what this module reads.
 *
 * ## Why the test is "is this the marketing host" and not "is this the app host"
 *
 * The obvious version — `hostname.startsWith('app.')` — is wrong, and wrong in a way that
 * only shows up outside production. `localhost:5173`, `127.0.0.1` and every Vercel preview
 * URL (`grindz-<hash>-<scope>.vercel.app`) would all fail that test, so development and
 * every PR preview would be permanently stuck on the landing page with no way into the app.
 *
 * So the marketing host is an explicit allow-list of one, and **everything else is the app**.
 * A new preview domain, a custom staging URL or a colleague's tunnel all behave like the app
 * without anyone having to remember to add them.
 */

/** The bare marketing host. Override per-environment with `VITE_SITE_HOST`. */
export const SITE_HOST = (import.meta.env.VITE_SITE_HOST as string | undefined) || 'grindz.dev'

/** Where the app lives. Override with `VITE_APP_ORIGIN`. */
export const APP_ORIGIN =
  (import.meta.env.VITE_APP_ORIGIN as string | undefined) || 'https://app.grindz.dev'

/** Where the landing page lives. Override with `VITE_SITE_ORIGIN`. */
export const SITE_ORIGIN =
  (import.meta.env.VITE_SITE_ORIGIN as string | undefined) || `https://${SITE_HOST}`

/**
 * True only on the marketing host. `www.` counts — people type it, and a registrar-level
 * redirect is not guaranteed to exist.
 */
export function isMarketingHost(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname.toLowerCase()
  return h === SITE_HOST || h === `www.${SITE_HOST}`
}

/* --------------------------- the sign-in hint ---------------------------- */

/**
 * A signed-in visitor who types `grindz.dev` should land in the app, not on a pitch for a
 * product they already use. The landing page cannot ask Supabase whether they are signed in:
 * the session lives in `localStorage` on `app.grindz.dev`, and localStorage is per-origin.
 *
 * So the app leaves a note on the shared parent domain. `gz_hint=1` is a **boolean and
 * nothing else** — no token, no user id, no email. Worst case it is stale or forged, and the
 * visitor is sent to the app and shown a sign-in screen. That is the same thing that would
 * have happened if they had clicked the button.
 *
 * `SameSite=Lax` because the redirect is a top-level navigation; `Secure` because it is only
 * ever set over HTTPS in production. Deliberately **not** `HttpOnly` — client JS on the
 * landing page is the only thing that ever reads it.
 */
const HINT = 'gz_hint'

/**
 * Cookies scoped to `.grindz.dev` cannot be set from `localhost` or `*.vercel.app` — the
 * browser silently drops a `Domain` it does not own. Rather than write a cookie that will
 * never be read, skip it entirely off-domain. Nothing depends on it there: the landing page
 * on localhost is reached by editing the URL, not by a redirect.
 */
function onSiteDomain(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname.toLowerCase()
  return h === SITE_HOST || h.endsWith(`.${SITE_HOST}`)
}

/** Mirror auth state onto the parent domain. Call on every auth transition. */
export function setSignedInHint(signedIn: boolean): void {
  if (!onSiteDomain()) return
  try {
    const base = `${HINT}=1; domain=.${SITE_HOST}; path=/; secure; samesite=lax`
    document.cookie = signedIn
      ? `${base}; max-age=${60 * 60 * 24 * 365}`
      : // expire in the past to delete; the attributes must match the ones it was set with
        `${HINT}=; domain=.${SITE_HOST}; path=/; secure; samesite=lax; max-age=0`
  } catch {
    /* cookies blocked — the redirect just never fires, which is a fine failure mode */
  }
}

export function hasSignedInHint(): boolean {
  if (typeof document === 'undefined') return false
  try {
    return new RegExp(`(?:^|;\\s*)${HINT}=1(?:;|$)`).test(document.cookie)
  } catch {
    return false
  }
}

/**
 * On the marketing host, bounce a previously-signed-in visitor straight into the app.
 *
 * `replace` rather than `assign` so the back button returns them to wherever they came from
 * instead of to a page that will immediately redirect them again.
 */
export function redirectToAppIfSignedIn(): boolean {
  if (!isMarketingHost() || !hasSignedInHint()) return false
  window.location.replace(APP_ORIGIN)
  return true
}
