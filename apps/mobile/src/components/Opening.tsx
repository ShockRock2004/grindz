import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native'
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg'
import { C } from '../theme'
import { T } from './ui'

const AnimatedPath = Animated.createAnimatedComponent(Path)

/**
 * lucide `dumbbell`, verbatim — the same geometry as the launcher icon and the web mark.
 *
 * Each entry carries its own approximate path length. SVG's `pathLength` attribute would
 * normalise these to 1 and let a single driver cover them all, but react-native-svg does not
 * expose it, so the lengths are measured per sub-path instead. Animating each offset from its
 * own length to zero on the shared driver means every stroke still completes together rather
 * than the short ticks snapping in instantly.
 */
const MARK_PATHS: [d: string, len: number][] = [
  ['M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z', 42],
  ['m2.5 21.5 1.4-1.4', 2],
  ['m20.1 3.9 1.4-1.4', 2],
  ['M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z', 42],
  ['m9.6 14.4 4.8-4.8', 7],
]

const R = 34
const CIRC = 2 * Math.PI * R
/** the brand mark's resting gap — the ring stops here, it is not a full circle */
const GAP = 0.22

/**
 * Opening animation.
 *
 * The launcher icon is a cyan ring with a gap; this draws that same ring, so the app
 * appears to finish drawing the icon the user just tapped rather than cutting to an
 * unrelated screen. Background is the native splash colour (#050505), which makes the
 * handoff from the system splash invisible.
 *
 * Deliberately short. An opening animation is a cost paid on every cold start, so it
 * earns roughly a second and no more, and it is skipped entirely for anyone who has
 * asked for reduced motion.
 */
export function Opening({ onDone }: { onDone: () => void }) {
  const draw = useRef(new Animated.Value(0)).current   // JS driver: SVG props
  const rise = useRef(new Animated.Value(0)).current   // native driver: opacity/transform
  const exit = useRef(new Animated.Value(1)).current
  const [gone, setGone] = useState(false)

  useEffect(() => {
    let cancelled = false

    const finish = () => {
      if (cancelled) return
      setGone(true)
      onDone()
    }

    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return
      if (reduced) { finish(); return }

      Animated.sequence([
        Animated.parallel([
          // the ring sweeps round to its resting gap
          Animated.timing(draw, {
            toValue: 1,
            duration: 620,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }),
          Animated.timing(rise, {
            toValue: 1,
            duration: 520,
            delay: 200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(180),
        Animated.timing(exit, {
          toValue: 0,
          duration: 260,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => { if (finished) finish() })
    })

    return () => { cancelled = true }
  }, [draw, rise, exit, onDone])

  if (gone) return null

  return (
    <Animated.View
      style={[s.wrap, { opacity: exit }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/*
        The mark draws itself: lucide's dumbbell outline, dashed to its own length with the
        offset animating to zero. pathLength={1} normalises every sub-path so one driver covers
        them all regardless of their real lengths.
      */}
      <Svg width={104} height={104} viewBox="0 0 24 24">
        <Defs>
          <LinearGradient id="openMark" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#00c6ff" />
            <Stop offset="1" stopColor="#0072ff" />
          </LinearGradient>
        </Defs>
        <G fill="none" stroke="url(#openMark)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          {MARK_PATHS.map(([d, len], i) => (
            <AnimatedPath
              key={i}
              d={d}
              strokeDasharray={len}
              strokeDashoffset={draw.interpolate({ inputRange: [0, 1], outputRange: [len, 0] })}
            />
          ))}
        </G>
      </Svg>

      <Animated.View
        style={{
          opacity: rise,
          transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
        }}
      >
        <T style={s.word}>Grindz</T>
      </Animated.View>
    </Animated.View>
  )
}

const s = StyleSheet.create({
  wrap: {
    // absoluteFillObject does not exist in RN 0.86, and absoluteFill is a registered
    // style id rather than an object, so it cannot be spread
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    backgroundColor: C.bg,
  },
  word: { fontSize: 30, fontWeight: '800', letterSpacing: -0.4 },
})
