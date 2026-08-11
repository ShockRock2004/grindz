/**
 * An exercise photo that always shows *something*, without ever delaying the photo.
 *
 * Two mistakes are deliberately avoided here, both of which this component has had:
 *
 * 1. **Never gate the image.** An earlier version held it at `opacity: 0` until `onLoad`
 *    fired and then faded it in over 300ms — the browser already had the pixels and the UI
 *    was sitting on them. The `<img>` now renders at full opacity from the start; nothing in
 *    JavaScript stands between the download finishing and the pixels being painted.
 *
 * 2. **Do remove the placeholder once loaded.** The exercise photos are transparent PNGs, so
 *    a placeholder left underneath shows *through* the figure and the mark appears stamped
 *    across the image. `onLoad` therefore still exists — but its only job is to drop the
 *    placeholder, never to reveal the image.
 *
 * Three non-image states, all showing the brand mark rather than a void:
 *   - no src            a custom exercise saved without a photo
 *   - request failed    dead URL, offline, blocked
 *   - still downloading the common case on a slow connection
 *
 * Shared by the category grid, the exercise detail sheet and the live-session card so the
 * three cannot drift — they previously each did their own thing, and two rendered nothing at
 * all while an image was in flight.
 */
import { useEffect, useState } from 'react'
import { cx } from '../lib/util'
import { IconDumbbell } from './Icons'

export function ExerciseImage({
  src,
  alt,
  size = 30,
  className,
  imgClassName,
  eager = false,
}: {
  src: string | null | undefined
  alt: string
  /** placeholder glyph size — match it to the box, not to the image */
  size?: number
  className?: string
  imgClassName?: string
  /**
   * Skip lazy-loading. Set for grids visible on arrival: `loading="lazy"` makes the browser
   * wait until an image nears the viewport, which on a short list of a dozen photos costs a
   * visible delay and saves nothing.
   */
  eager?: boolean
}) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  // A `src` change (e.g. switching Body type in Settings, see gender.ts) re-renders this
  // same component instance with a new URL rather than mounting a fresh one — React has no
  // reason to reset `loaded`, so without this the OLD bitmap keeps showing (a `<img>` holds
  // its last frame across a `src` swap) until the new photo happens to finish, then jumps
  // straight to it with no visible transition. That reads as "nothing happened" right when
  // the point is to show the switch took effect. Resetting on every `src` change brings back
  // the loading placeholder immediately, so the old photo visibly clears before the new one
  // downloads, matching every other src change (a genuinely different exercise) too.
  useEffect(() => {
    setLoaded(false)
    setFailed(false)
  }, [src])
  const usable = !!src && !failed

  return (
    <>
      {/* sits behind the image, and is removed the moment there is an image to see */}
      {!(usable && loaded) && (
        <span
          aria-hidden
          className={cx(
            'absolute inset-0 grid place-items-center bg-white/[0.04] text-cyan/25',
            // pulse only while something is genuinely in flight; a permanent absence is static
            usable ? 'animate-pulse' : '',
            className,
          )}
        >
          <IconDumbbell size={size} />
        </span>
      )}
      {usable && (
        <img
          // Keyed on src, not left to the default "same position in the tree" identity:
          // a same-element src swap can keep painting the OLD bitmap's pixels for a beat
          // after the attribute changes (confirmed by watching naturalWidth stay at the
          // previous image's size immediately after a switch) — browsers don't guarantee
          // the frame clears just because the source did. The key forces React to tear
          // down that DOM node and mount a genuinely new one, which has never painted
          // anything, so there is no stale frame left to show.
          key={src}
          src={src as string}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cx('absolute inset-0 m-auto', imgClassName ?? 'h-full w-full object-contain')}
        />
      )}
    </>
  )
}
