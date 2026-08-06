/**
 * The app side of the two-origin split.
 *
 *   grindz.dev       apps/landing — the marketing site, a separate Vercel project
 *   app.grindz.dev   this app
 *
 * Two deployments, two origins, and that is deliberate rather than incidental: `localStorage`
 * is per-origin, so the session this app stores is invisible to `grindz.dev` and vice versa.
 * The landing page therefore never runs OAuth — it links here, and this origin asks Google.
 *
 * ## Why this file still exists after the split
 *
 * One thing has to cross the boundary: whether the visitor is signed in. A returning user who
 * types `grindz.dev` should land in the app rather than on a pitch for something they already
 * use, and the marketing page cannot read a session it has no access to.
 *
 * So this app leaves a note on the shared parent domain, and the landing page reads it. The
 * note is a **boolean and nothing else** — no token, no user id, no email:
 *
 *   gz_hint=1; domain=.grindz.dev; path=/; secure; samesite=lax
 *
 * Worst case it is stale or forged, and someone is sent to a sign-in screen they would have
 * reached by clicking the button anyway. It grants nothing and proves nothing.
 */

/** The registrable domain both origins share. Override with `VITE_SITE_HOST`. */
export const SITE_HOST = (import.meta.env.VITE_SITE_HOST as string | undefined) || 'grindz.dev'

/** Where the landing page lives. Override with `VITE_SITE_ORIGIN`. */
export const SITE_ORIGIN =
  (import.meta.env.VITE_SITE_ORIGIN as string | undefined) || `https://${SITE_HOST}`

const HINT = 'gz_hint'

/**
 * A cookie scoped to `.grindz.dev` cannot be set from `localhost` or `*.vercel.app` — the
 * browser silently drops a `Domain` the page does not own. Rather than write something that
 * can never be read, skip it off-domain entirely. Nothing depends on it there: in development
 * the two apps are separate dev servers reached by typing their ports.
 */
function onSiteDomain(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname.toLowerCase()
  return h === SITE_HOST || h.endsWith(`.${SITE_HOST}`)
}

/**
 * Mirror auth state onto the parent domain. Called on every auth transition.
 *
 * Driven from `onAuthStateChange` rather than from `signInWithGoogle`, because OAuth returns
 * via a full page load — the sign-in call never reaches its own success path. The listener
 * fires on every route in, including a session restored from storage and a token refresh.
 *
 * `signOut()` clears it eagerly. If it survived a sign-out, `grindz.dev` would keep bouncing
 * that person into a sign-in screen, making the marketing site unreachable for the one person
 * who just said they were done.
 */
export function setSignedInHint(signedIn: boolean): void {
  if (!onSiteDomain()) return
  try {
    document.cookie = signedIn
      ? `${HINT}=1; domain=.${SITE_HOST}; path=/; secure; samesite=lax; max-age=${60 * 60 * 24 * 365}`
      : // expire in the past to delete; attributes must match the ones it was set with
        `${HINT}=; domain=.${SITE_HOST}; path=/; secure; samesite=lax; max-age=0`
  } catch {
    /* cookies blocked — the redirect simply never fires, which is a fine failure mode */
  }
}
