import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon.ico', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Grindz — Train',
        short_name: 'Grindz',
        description: 'Log lifts, track progression, plan your week.',
        theme_color: '#00c6ff',
        background_color: '#050505',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'grindz-logo.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: 'icons/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/android-chrome-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Shell only. The ~33 MB photo library no longer lives in /public at all — it is
        // served from the CDN and cached on demand by the CacheFirst rule below, which is
        // what keeps the install (and every update) small.
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2}'],
        globIgnores: ['assets/images/**', 'assets/hero/**'],
        /*
         * Exercise + hero images now come from the Cloudflare CDN rather than /public, so the
         * rule matches by ORIGIN, not by pathname — a same-origin /assets/ path no longer exists.
         *
         * CacheFirst is what makes the move worthwhile: Cache Storage is keyed by URL and lives
         * in origin storage, so a photo fetched once survives app restarts AND app updates. The
         * CDN's immutable header alone would not guarantee that. `maxEntries` is comfortably
         * above the 37 real images so nothing is evicted in normal use.
         */
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://cdn.grindz.dev',
            handler: 'CacheFirst',
            options: { cacheName: 'exercise-images', expiration: { maxEntries: 120 } },
          },
          /*
           * User-uploaded exercise photos, which live in Supabase Storage rather than on the
           * CDN (the image Worker is a static git-built deploy with no upload endpoint).
           *
           * This rule is what makes that affordable on a free plan. Supabase counts every byte
           * served against a monthly egress allowance, and without a CacheFirst entry the same
           * photo is re-fetched on every single page view. With it, a device downloads a given
           * image once and then reads it out of Cache Storage — which survives restarts and app
           * updates — so ongoing egress for images is effectively zero.
           *
           * Matched on the storage path, not just the host, so ordinary API and auth calls to
           * the same Supabase origin are never cached.
           */
          {
            urlPattern: ({ url }) =>
              /\.supabase\.co$/.test(url.hostname) && url.pathname.includes('/storage/v1/object/public/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'user-exercise-images',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.origin.includes('fonts.g'),
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 20 } },
          },
        ],
      },
    }),
  ],
  /*
   * `allowedHosts` is Vite's DNS-rebinding guard: it rejects any request whose Host header it
   * does not recognise, which is what blocks a tunnel with
   * "This host is not allowed. To allow this host, add it to server.allowedHosts".
   *
   * A leading dot matches the domain and all its subdomains, so this covers every ephemeral
   * tunnel hostname without editing this file each time one is issued. Scoped to the tunnel
   * providers rather than set to `true` — `true` disables the check for ALL hosts, which is
   * the protection itself, and a dev server on a laptop is worth keeping guarded.
   *
   * `preview` gets the same list so a built bundle can be shared over a tunnel too.
   */
  server: {
    port: 5173,
    allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app', '.ngrok.io', '.ngrok.app', '.trycloudflare.com', '.loca.lt'],
  },
  preview: {
    allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app', '.ngrok.io', '.ngrok.app', '.trycloudflare.com', '.loca.lt'],
  },
})
