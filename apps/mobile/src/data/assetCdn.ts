/**
 * Where the exercise and hero imagery lives.
 *
 * Kept byte-identical between apps/web and apps/mobile — enforced by
 * scripts/check-parity.mjs — so both surfaces resolve the same URL for the same image,
 * and a device that has already downloaded a photo in one never downloads it again in
 * the other.
 *
 * These 42 PNGs are ~32 MB. They used to be bundled into the app builds, so every user
 * paid the full 32 MB on first install AND on every update, forever, whether or not they
 * ever opened the exercise. Serving them from a Cloudflare static-assets Worker means a
 * device downloads an image at most once in its lifetime:
 *
 *   - the CDN marks them `immutable` for a year (see cdn/public/_headers)
 *   - the web build keeps them in Cache Storage via a CacheFirst service worker rule
 *   - React Native keeps them on disk via expo-image's `memory-disk` cache policy
 *
 * The last two matter more than the HTTP header: Cache Storage and the expo-image disk cache
 * are keyed by URL and live in app storage, so they survive an app update. An HTTP cache alone
 * would not reliably do that.
 *
 * The filenames are effectively content-addressed — a photo keeps its name for life, and a
 * changed photo ships under a NEW name. Never overwrite one in place: devices holding the old
 * copy would keep serving it for a year.
 *
 * Changing ASSET_CDN is a breaking change for every device already in the field — they
 * re-download the whole library once. It must be changed together with the `urlPattern`
 * origin check in apps/web/vite.config.ts, or images still load but the service worker
 * silently stops caching them.
 */
export const ASSET_CDN = 'https://cdn.grindz.dev'

/** Public URL for an exercise photo, e.g. ('shoulders', 'shrugs.png'). */
export function cdnExercise(categoryKey: string, img: string): string {
  return `${ASSET_CDN}/images/${categoryKey}/${img}`
}

/** Public URL for a category hero image. */
export function cdnHero(categoryKey: string): string {
  return `${ASSET_CDN}/hero/${categoryKey}.png`
}
