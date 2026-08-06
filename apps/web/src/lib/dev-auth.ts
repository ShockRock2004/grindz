import type { Session } from '@supabase/supabase-js'
import type { Profile } from './auth'

/**
 * Dev-only auth bypass — skips Google OAuth so the app can be driven in an
 * emulator / on a device without a Google account or a whitelisted redirect URL.
 *
 * Double-gated on purpose:
 *   1. `import.meta.env.DEV` is compiled to `false` by `vite build`, so the whole
 *      branch is dead code and gets tree-shaken out of any production bundle.
 *   2. `VITE_DEV_BYPASS_AUTH` must be explicitly set, so a normal `npm run dev`
 *      against the real Supabase project is unaffected unless you opt in.
 *
 * When on, the Supabase data layer is swapped for a localStorage-backed mock
 * (see `db-local.ts`) so History, PRs, streaks and charts all work on fake data.
 */
export const DEV_BYPASS: boolean =
  import.meta.env.DEV && String(import.meta.env.VITE_DEV_BYPASS_AUTH ?? '') === '1'

export const DEV_USER_ID = '00000000-0000-4000-8000-00000000dev1'

/*
 * These are functions, not top-level consts, on purpose: a const object literal
 * stays referenced by the (dead) `if (DEV_BYPASS)` branches and Rollup keeps its
 * strings in the production bundle. As functions the call sites vanish with the
 * branch, the declarations become unreachable, and the whole thing is dropped —
 * verified by grepping dist/ for these literals after `vite build`.
 */
export function devProfile(): Profile {
  return { name: 'Dev Tester', avatar: '', email: 'dev@localhost' }
}

/**
 * Minimal stand-in for a Supabase session. The app only ever checks this for
 * undefined (loading) / null (signed out) / truthy (signed in), so a shallow
 * object is enough — cast rather than fabricating every JWT field.
 */
export function devSession(): Session {
  const p = devProfile()
  return {
    access_token: 'dev-bypass',
    refresh_token: 'dev-bypass',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 4102444800,
    user: {
      id: DEV_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: p.email,
      app_metadata: {},
      user_metadata: { full_name: p.name, avatar_url: p.avatar },
      created_at: new Date(0).toISOString(),
    },
  } as unknown as Session
}

if (DEV_BYPASS) {
  console.warn('[cfit] DEV AUTH BYPASS ACTIVE — using local mock data, nothing syncs to Supabase.')
}
