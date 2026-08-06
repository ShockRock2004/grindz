import type { ImageSourcePropType } from 'react-native'
import { cdnExercise, cdnHero } from './assetCdn'
import { CATALOG } from './catalog'

/*
 * Exercise and hero imagery, resolved to CDN URLs rather than bundled assets.
 *
 * This file used to be a generated table of ~42 literal `require()` calls, because Metro
 * cannot resolve a dynamic image path — which meant every photo was linked into the APK.
 * At ~33 MB that was roughly a third of the download, paid on install and again on every
 * update, whether or not the user ever opened the exercise.
 *
 * Returning `{ uri }` keeps the call sites identical: `{ uri: string }` is an
 * ImageSourcePropType exactly like a `require()` handle, so nothing downstream changed
 * shape. What DID have to change is the renderer — these must be drawn with expo-image, not
 * the React Native `Image`, because expo-image's `memory-disk` cache policy is what keeps a
 * downloaded photo on disk across app restarts and app updates. Plain RN `Image` on Android
 * leans on Fresco's cache, which is not a durable store.
 *
 * The known trade: an image that has never been viewed on this device needs the network the
 * first time. Every call site already handled `undefined` for custom lifts, so a missing photo
 * degrades to the same empty state rather than breaking layout.
 */

/** Only these have a photo; anything else (custom lifts) renders without one. */
const KNOWN_EXERCISE_IMAGES: ReadonlySet<string> = new Set(
  CATALOG.flatMap((c) => c.exercises.filter((e) => e.img).map((e) => `${c.key}/${e.img}`)),
)

const HERO_CATEGORIES: ReadonlySet<string> = new Set(CATALOG.map((c) => c.key))

/** Exercise photo for a category + filename, or undefined when absent (custom lifts). */
export function exerciseImageSource(categoryKey: string, img?: string | null): ImageSourcePropType | undefined {
  if (!img) return undefined
  // guard on the catalog rather than pointing the loader at a URL that will 404 — a custom
  // lift carrying a stale filename should render as "no photo", not as a broken fetch
  if (!KNOWN_EXERCISE_IMAGES.has(`${categoryKey}/${img}`)) return undefined
  return { uri: cdnExercise(categoryKey, img) }
}

/** Full-bleed hero render used on the Home category cards. */
export function heroSource(categoryKey: string): ImageSourcePropType | undefined {
  if (!HERO_CATEGORIES.has(categoryKey)) return undefined
  return { uri: cdnHero(categoryKey) }
}

/**
 * Photo for an exercise by display name — what the live Session screen has to hand.
 *
 * This replaces a round-trip through `exerciseImage()`, which returned a `/assets/images/...`
 * string that the caller then string-surgeried back apart. That prefix stopped being a real
 * location when the photos moved to the CDN, so the surgery was operating on a path that no
 * longer pointed anywhere; resolving from the catalog directly removes the coupling.
 */
export function exerciseImageSourceByName(name: string): ImageSourcePropType | undefined {
  for (const c of CATALOG) {
    const e = c.exercises.find((x) => x.name === name)
    if (e?.img) return exerciseImageSource(c.key, e.img)
  }
  return undefined
}
