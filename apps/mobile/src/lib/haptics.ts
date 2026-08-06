import { Platform } from 'react-native'
import * as Haptics from 'expo-haptics'

/**
 * Haptics.
 *
 * Rebuilt on the platform haptics API, because the
 * old implementation had exactly the problem that file documents:
 *
 * `impactAsync` / `notificationAsync` / `selectionAsync` are, on Android, raw
 * `Vibrator.vibrate(VibrationEffect.createWaveform)` calls at a peak amplitude of
 * 70/255 held for 43–60ms. Google's own guidance calls that shape "buzzy" and says
 * that given the choice between buzzy haptics and none, choose none. It also drives
 * the motor directly rather than asking the view for feedback, so it **bypasses the
 * user's touch-feedback setting** — turning haptics off in system settings did not
 * silence this app.
 *
 * And the styles collapse: Light and Soft are byte-identical waveforms, as are Medium
 * and Rigid, and `selectionAsync` is another copy of Light. The old five-name API
 * (`tap` `select` `medium` `success` `pr`) therefore produced about **two** distinct
 * sensations — and `success` and `pr` were literally the same call, so hitting a
 * personal record felt exactly like saving a set.
 *
 * Everything now goes through `performAndroidHapticsAsync`, i.e.
 * `View.performHapticFeedback(HapticFeedbackConstants.X)`. That path is tuned per
 * device by the vendor and obeys the system haptic settings, so a user who turns
 * touch feedback off actually gets silence.
 *
 * Names are semantic rather than intensity levels, because the right strength depends
 * on how often the event fires: the more frequent, the softer it has to be, or the
 * channel becomes noise and the user switches haptics off for good.
 */

const A = Haptics.AndroidHaptics
const isAndroid = Platform.OS === 'android'
const api = isAndroid && typeof Platform.Version === 'number' ? Platform.Version : 0

/**
 * The good constants are recent: Confirm/Reject and the gesture pair arrived in API 30,
 * the toggle and segment families in API 34. Below each line the whole vocabulary steps
 * down together, rather than leaving some interactions rich and others silent.
 */
const RICH = api >= 34
const MODERN = api >= 30

function fire(type: Haptics.AndroidHaptics) {
  // rejects where the framework lacks the constant, and no-ops with no foreground
  // view. Neither is worth surfacing to the user.
  Haptics.performAndroidHapticsAsync(type).catch(() => {})
}

/** iOS and web. Grindz ships Android today, but this stays honest. */
function fallback(style: Haptics.ImpactFeedbackStyle) {
  Haptics.impactAsync(style).catch(() => {})
}

export const haptic = {
  /**
   * The most frequent event in the app — holding a weight/rep stepper or moving
   * across the RPE scale fires this many times a second, so it must be near-subliminal.
   */
  tick() {
    if (!isAndroid) return fallback(Haptics.ImpactFeedbackStyle.Light)
    fire(RICH ? A.Segment_Frequent_Tick : A.Clock_Tick)
  },

  /** Detent on a segmented control: filter chips, unit toggle, mode radios, dropdown options. */
  select() {
    if (!isAndroid) return fallback(Haptics.ImpactFeedbackStyle.Light)
    fire(RICH ? A.Segment_Tick : A.Clock_Tick)
  },

  /** Something opened, closed or moved: a screen, a sheet, a tab, a wizard step. */
  nav() {
    if (!isAndroid) return fallback(Haptics.ImpactFeedbackStyle.Light)
    fire(A.Context_Click)
  },

  /** A set was ticked done, an exercise included, a favourite starred. */
  toggleOn() {
    if (!isAndroid) return fallback(Haptics.ImpactFeedbackStyle.Medium)
    fire(RICH ? A.Toggle_On : A.Virtual_Key)
  },

  /** …and came back off. Deliberately a shade softer than its twin. */
  toggleOff() {
    if (!isAndroid) return fallback(Haptics.ImpactFeedbackStyle.Light)
    fire(RICH ? A.Toggle_Off : A.Clock_Tick)
  },

  /** History paged forward or back. Frequent while browsing, so kept light. */
  pageTurn() {
    if (!isAndroid) return fallback(Haptics.ImpactFeedbackStyle.Light)
    fire(A.Clock_Tick)
  },

  /** A planner chip was picked up and is now following the finger. */
  dragStart() {
    if (!isAndroid) return fallback(Haptics.ImpactFeedbackStyle.Medium)
    fire(MODERN ? A.Drag_Start : A.Long_Press)
  },

  /** …and landed in a day. Closes the drag so the gesture feels bounded. */
  drop() {
    if (!isAndroid) return fallback(Haptics.ImpactFeedbackStyle.Medium)
    fire(MODERN ? A.Gesture_End : A.Virtual_Key)
  },

  /** A pull-to-refresh drag crossed the threshold and will fire on release. */
  pull() {
    if (!isAndroid) return fallback(Haptics.ImpactFeedbackStyle.Light)
    fire(MODERN ? A.Gesture_Start : A.Context_Click)
  },

  /** …and the refresh finished. */
  settle() {
    if (!isAndroid) return fallback(Haptics.ImpactFeedbackStyle.Light)
    fire(MODERN ? A.Gesture_End : A.Clock_Tick)
  },

  /** Committed something worth confirming: workout saved, exercise added, key stored. */
  success() {
    if (!isAndroid) return fallback(Haptics.ImpactFeedbackStyle.Medium)
    fire(MODERN ? A.Confirm : A.Virtual_Key)
  },

  /** Destructive or rejected: a workout deleted, a week cleared, a bad API key. */
  warn() {
    if (!isAndroid) return fallback(Haptics.ImpactFeedbackStyle.Heavy)
    fire(MODERN ? A.Reject : A.Long_Press)
  },

  /**
   * A personal record — the loudest moment the app has, and the one place a composed
   * pattern is justified. Two confirms a beat apart read as celebration rather than as
   * an ordinary save. Previously this was byte-identical to `success`, so the app's
   * best moment felt like its most routine one.
   */
  pr() {
    if (!isAndroid) {
      fallback(Haptics.ImpactFeedbackStyle.Heavy)
      setTimeout(() => fallback(Haptics.ImpactFeedbackStyle.Medium), 110)
      return
    }
    fire(MODERN ? A.Confirm : A.Virtual_Key)
    setTimeout(() => fire(MODERN ? A.Confirm : A.Virtual_Key), 110)
  },
}
