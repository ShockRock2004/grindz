import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/*
 * The marketing site for grindz.dev.
 *
 * Deliberately minimal next to apps/web: no service worker, no PWA manifest, no router and
 * no Supabase client. A visitor here has not signed in and may never sign in — shipping an
 * auth stack and an offline shell to them costs bandwidth and buys nothing.
 *
 * There is also a correctness reason for the missing service worker. The app registers one
 * on app.grindz.dev; a second one on the parent domain would be a separate registration with
 * its own precache, and a stale marketing shell is a page that keeps sending people to a
 * version of the app that has moved on.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    // no code-splitting worth doing on a single-page pitch; one file is one round trip
    rollupOptions: { output: { manualChunks: undefined } },
  },
})
