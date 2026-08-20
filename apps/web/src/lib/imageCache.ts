import { cdnHero, type Gender } from '../data/assetCdn'
import { CATALOG } from '../data/catalog'

const CATEGORY_KEYS = CATALOG.map((c) => c.key)

/**
 * Purges the CDN image cache (see vite.config.ts's `exercise-images` CacheFirst rule and
 * cdn/README.md) so a gender switch re-downloads fresh instead of continuing to serve
 * whichever gender happened to be cached first.
 *
 * The rule matches by origin, not by path, so male and female photos share ONE Cache
 * Storage bucket — there is no per-gender key to selectively evict. Deleting the whole
 * bucket is not a workaround for that, it is the correct scope: after a switch every
 * photo the user goes on to view should come from the network once and be re-cached
 * under the new gender's URL, and the CDN's `immutable` header makes that refetch cheap
 * per photo (~30MB total, once, not per view).
 *
 * Never throws: Cache Storage does not exist in every context (Safari private mode,
 * very old browsers), and a failed purge should not block the preference itself from
 * saving. Worst case a stale image shows until it is naturally evicted or the cache is
 * cleared some other way — not a broken app.
 */
export async function purgeExerciseImageCache(): Promise<void> {
  try {
    if (typeof caches === 'undefined') return
    await caches.delete('exercise-images')
  } catch {
    /* Cache Storage unavailable or blocked — nothing to do */
  }
}

/**
 * Warm the cache for the gender just switched to, starting with what the person is
 * about to see rather than the whole library: the 8 category heroes are what Home
 * renders immediately, before anything else has had a chance to load lazily. This
 * runs after `purgeExerciseImageCache`, so it is genuinely a fresh fetch under the
 * new gender's URL, not a cache hit left over from before the switch.
 *
 * Deliberately NOT prefetching all ~37 exercise photos here — the app's own tradeoff
 * (see cdn/README.md) is that a photo downloads on first view, not on every app open;
 * eagerly pulling the whole library on a switch would undo that on a metered
 * connection for exercises that may never be opened this session.
 */
export async function prefetchGenderHeroes(gender: Gender): Promise<void> {
  try {
    await Promise.all(CATEGORY_KEYS.map((key) => fetch(cdnHero(key, gender)).catch(() => {})))
  } catch {
    /* best-effort warm-up only — a failed prefetch just means the first view fetches it */
  }
}
