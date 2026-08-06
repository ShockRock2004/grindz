/**
 * Keyboard-shortcut chips.
 *
 * Two things this exists to get right.
 *
 * **The right modifier.** Hard-coding ⌘ ships the wrong glyph to every Windows and Linux
 * user, and hard-coding Ctrl ships the wrong one to every Mac user. `Mod` resolves at
 * runtime. On Windows/Linux it renders the *word* "Ctrl" rather than ⌃ (U+2303), because
 * the caret is a Mac convention that Windows users do not read as anything.
 *
 * **No hydration flash.** Platform detection cannot run on a server, so the first paint
 * would otherwise show one modifier and swap to the other. The chip reserves its box and
 * stays invisible for a frame instead of flickering.
 *
 * Each key gets its own chip: screen readers should not hear "command-K" as one token, and
 * `aria-keyshortcuts` on the *control* is what actually conveys the binding — the chips are
 * decoration and are hidden from the accessibility tree.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { cx } from '../lib/util'

/**
 * True on Apple platforms. `navigator.userAgentData` is Chromium-only — Safari and Firefox
 * declined it — so the `platform` fallback is load-bearing rather than vestigial.
 * iPadOS reports "MacIntel", which is the answer we want: an iPad with a keyboard uses ⌘.
 */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
  if (uaData?.platform) return uaData.platform === 'macOS'
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)
}

/** The ARIA name for the primary modifier — never the glyph. */
export function modKeyName(): 'Meta' | 'Control' {
  return isApplePlatform() ? 'Meta' : 'Control'
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd aria-hidden className={cx('kbd', className)}>
      {children}
    </kbd>
  )
}

/** The platform's primary modifier: ⌘ on Apple, the word Ctrl everywhere else. */
export function Mod({ className }: { className?: string }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const apple = mounted && isApplePlatform()
  return (
    <kbd
      aria-hidden
      className={cx('kbd', className)}
      // hold the box before we know the platform, so nothing reflows or flickers
      style={{ visibility: mounted ? 'visible' : 'hidden' }}
    >
      {apple ? <span className="kbd-glyph">⌘</span> : 'Ctrl'}
    </kbd>
  )
}

/** ⌘ K / Ctrl K as a pair of chips. */
export function ModK({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1', className)}>
      <Mod />
      <Kbd>K</Kbd>
    </span>
  )
}
