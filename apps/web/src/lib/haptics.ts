/**
 * Haptics.
 *
 * The same semantic vocabulary the native app uses (see grindz-native/src/lib/haptics.ts),
 * so shared behaviour can call one API and each surface does the best it can.
 *
 * The web is much more limited: `navigator.vibrate` takes raw millisecond patterns with no
 * amplitude control, is unsupported on iOS Safari entirely, and cannot reach the
 * vendor-tuned effects the native build gets through `performHapticFeedback`. So the names
 * are the contract and the durations are an approximation — what matters is that the
 * *relative* weight is right: the more often an event fires, the shorter its buzz, or the
 * channel becomes noise and the user turns vibration off for good.
 */
function buzz(pattern: number | number[]): void {
  try {
    if ('vibrate' in navigator) navigator.vibrate(pattern)
  } catch {
    /* unsupported, or blocked without a user gesture */
  }
}

export const haptic = {
  /** the most frequent event in the app — steppers and the RPE scale. Near-subliminal. */
  tick: () => buzz(6),
  /** detent on a segmented control: chips, unit toggle, mode radios, dropdown options */
  select: () => buzz(10),
  /** something opened, closed or moved: a screen, sheet, tab or wizard step */
  nav: () => buzz(12),
  /** a set ticked done, an exercise included, a favourite starred */
  toggleOn: () => buzz(16),
  /** …and came back off. Deliberately a shade softer than its twin. */
  toggleOff: () => buzz(10),
  /** history paged forward or back */
  pageTurn: () => buzz(8),
  /** a planner chip picked up and now following the pointer */
  dragStart: () => buzz(18),
  /** …and landed in a day */
  drop: () => buzz([0, 14, 30, 20]),
  /** a pull-to-refresh drag crossed the threshold */
  pull: () => buzz(10),
  /** …and the refresh finished */
  settle: () => buzz(8),
  /** committed something worth confirming: workout saved, exercise added */
  success: () => buzz([0, 22, 45, 22]),
  /** destructive or rejected: a workout deleted, a week cleared, a bad key */
  warn: () => buzz([0, 40, 60, 40]),
  /** a personal record — the loudest moment the app has */
  pr: () => buzz([0, 30, 40, 30, 40, 60]),
}
