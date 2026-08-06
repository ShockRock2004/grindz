/**
 * On-screen keyboard handling for the web app and any WebView embedding it.
 *
 * The bug this fixes: entering weight/reps on the last exercise of a long session was
 * impossible, because the software keyboard covered the row and nothing scrolled it back
 * into view.
 *
 * Two separate things have to be true, and only fixing one leaves the bug:
 *
 *  1. The viewport must actually react to the keyboard. That is `adjustResize` in
 *     AndroidManifest.xml — without it Android guesses per-OEM, which is why the bug
 *     reproduced on some phones and not others.
 *  2. The focused field must be scrolled INTO VIEW. Resizing alone only stops the keyboard
 *     from overlapping the page; a row 15 exercises down is still off-screen. That is this
 *     file.
 *
 * Why `visualViewport` rather than a native keyboard plugin: such a plugin's `resize`
 * option is iOS-only in every version through v8, so it would do nothing for the Android
 * build that actually has the problem. `visualViewport` is a browser API that works in the
 * WebView and in a normal browser, and it covers BOTH layout regimes with one code path —
 * whether the layout viewport shrinks (adjustResize today) or only the visual viewport does
 * (what happens once targetSdk 35 forces edge-to-edge). No plugin, no native dependency.
 */

/** Extra breathing room between the focused field and the top of the keyboard. */
const CLEARANCE_PX = 24

/** Below this the viewport change is a URL bar or a rounding artefact, not a keyboard. */
const KEYBOARD_MIN_PX = 120

function isTextEntry(el: Element | null): el is HTMLElement {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'TEXTAREA') return true
  if ((el as HTMLElement).isContentEditable) return true
  if (tag !== 'INPUT') return false
  // buttons/checkboxes never summon a keyboard, and scrolling to them would be noise
  const type = (el as HTMLInputElement).type
  return !['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image'].includes(type)
}

/**
 * Start listening. Returns a teardown function.
 *
 * Call once at app start; it is a no-op on browsers without `visualViewport`, where the
 * native `adjustResize` behaviour is the fallback.
 */
export function installKeyboardHandling(): () => void {
  const vv = window.visualViewport
  if (!vv) return () => {}

  /*
   * Publish the keyboard height as a CSS variable so layout can react (e.g. a sticky
   * footer lifting). Under adjustResize the layout viewport shrinks too and this reads ~0,
   * which is correct — the browser already made the room.
   */
  const publishInset = () => {
    const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
    document.documentElement.style.setProperty('--kb', `${Math.round(overlap)}px`)
  }

  /*
   * The sequencing that matters.
   *
   * The obvious implementation — scroll on `focusin` — does not work: the browser runs its
   * own scroll-on-focus BEFORE the keyboard has resized anything, so any measurement taken
   * then is against stale geometry. (`focus({preventScroll:true})` cannot suppress that for
   * text inputs in Chromium, so it cannot be worked around from that side either.)
   *
   * So `focusin` only records the target, and the scroll happens on the next viewport
   * resize, once the keyboard's real height is known. This also handles the keyboard
   * CHANGING height while already open — switching to the numeric or emoji pane fires
   * another resize, where a one-shot "keyboard did show" handler would not.
   */
  let pending: HTMLElement | null = null
  let raf = 0

  const onFocusIn = (e: FocusEvent) => {
    const t = e.target as Element | null
    if (isTextEntry(t)) pending = t
  }
  const onFocusOut = () => { pending = null }

  const revealPending = () => {
    const el = pending
    if (!el || !el.isConnected) return
    const rect = el.getBoundingClientRect()
    const visibleBottom = vv.height + vv.offsetTop
    // only move if the field is genuinely obscured — otherwise tabbing weight -> reps
    // inside one row would re-scroll the list on every hop
    if (rect.bottom <= visibleBottom - CLEARANCE_PX && rect.top >= vv.offsetTop) return
    /*
     * Scroll the row, not the bare input. `scrollIntoView` measures the element box and
     * ignores surrounding padding, so targeting the input alone clips the set number and
     * label sitting beside it. `data-kb-scroll` lets a row opt in as the scroll target.
     */
    const target = (el.closest('[data-kb-scroll]') as HTMLElement | null) ?? el
    target.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  const onViewportChange = () => {
    publishInset()
    const keyboardOpen = window.innerHeight - vv.height - vv.offsetTop > KEYBOARD_MIN_PX
      || vv.height < window.innerHeight - KEYBOARD_MIN_PX
    if (!keyboardOpen && !pending) return
    cancelAnimationFrame(raf)
    // one frame of settle so the rect is read after the resize has been laid out
    raf = requestAnimationFrame(revealPending)
  }

  document.addEventListener('focusin', onFocusIn)
  document.addEventListener('focusout', onFocusOut)
  vv.addEventListener('resize', onViewportChange)
  vv.addEventListener('scroll', publishInset)
  publishInset()

  return () => {
    cancelAnimationFrame(raf)
    document.removeEventListener('focusin', onFocusIn)
    document.removeEventListener('focusout', onFocusOut)
    vv.removeEventListener('resize', onViewportChange)
    vv.removeEventListener('scroll', publishInset)
  }
}
