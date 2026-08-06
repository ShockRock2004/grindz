import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Animated, Modal as RNModal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type ViewStyle, type TextStyle,
} from 'react-native'
import { Keyboard, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg'
import { C, R, alpha } from '../theme'
import { IconCheck, IconChevronDown, IconClose, IconMinus, IconPlus, IconTrophy } from './Icons'
import { haptic } from '../lib/haptics'

/* ------------------------------ text ------------------------------ */
export function T({ style, children, ...rest }: { style?: StyleProp<TextStyle>; children?: ReactNode } & Text['props']) {
  return <Text style={[{ color: C.ink }, style]} {...rest}>{children}</Text>
}

/* ----------------------------- button ----------------------------- */
export function Button({
  variant = 'cyan', onPress, disabled, style, children,
}: {
  variant?: 'cyan' | 'outline' | 'ghost' | 'danger'
  onPress?: () => void
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  children: ReactNode
}) {
  const bg = variant === 'cyan' ? C.cyan : 'transparent'
  const border =
    variant === 'outline' ? C.line2 : variant === 'danger' ? alpha(C.bad, 0.4) : 'transparent'
  const fg = variant === 'cyan' ? C.cyanInk : variant === 'danger' ? C.bad : variant === 'ghost' ? C.muted2 : C.ink
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: bg, borderColor: border, borderWidth: border === 'transparent' ? 0 : 1 },
        disabled && { opacity: 0.4 },
        pressed && !disabled && { transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      <View style={s.row}>
        {typeof children === 'string' ? <T style={[s.btnText, { color: fg }]}>{children}</T> : children}
      </View>
    </Pressable>
  )
}

/* ------------------------------ modal ----------------------------- */
export function Modal({
  open, onClose, title, children, maxHeight = '82%',
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  maxHeight?: number | `${number}%`
}) {
  const insets = useSafeAreaInsets()

  /*
   * Keyboard handling (windowSoftInputMode is
   * adjustResize + scrollable content + Keyboard.dismiss on close). An RN Modal is
   * a separate window that adjustResize does not shrink, so the height is tracked
   * here and the sheet is lifted by it — otherwise the field being typed into ends
   * up behind the keyboard.
   */
  const [kbd, setKbd] = useState(0)
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKbd(e.endCoordinates.height),
    )
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKbd(0),
    )
    return () => { show.remove(); hide.remove() }
  }, [])

  // closing without blurring leaves the keyboard up over the screen behind
  const close = () => { Keyboard.dismiss(); onClose() }

  return (
    <RNModal visible={open} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <Pressable
        style={s.backdrop}
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <View
        style={[
          s.sheet,
          // sit on top of the keyboard, and give back the safe-area padding that
          // the keyboard itself now covers
          { maxHeight, bottom: kbd, paddingBottom: (kbd > 0 ? 14 : insets.bottom + 22) },
        ]}
        accessibilityViewIsModal
      >
        {/* a bottom sheet needs a grabber to read as dismissable */}
        <View style={s.grabber} />
        <View style={s.sheetHead}>
          <T style={s.h2} numberOfLines={2}>{title}</T>
          <Pressable onPress={close} hitSlop={10} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="Close">
            <IconClose size={18} color={C.muted2} />
          </Pressable>
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 4 }}
        >
          {children}
        </ScrollView>
      </View>
    </RNModal>
  )
}

/* ------------------------------ select ---------------------------- */
export interface SelectOption { value: string; label: string; hint?: string }

/** Themed dropdown — a sheet of options, so it can't look like an OS picker. */
export function Select({
  value, options, onChange, placeholder = 'Select…', style,
}: {
  value: string
  options: SelectOption[]
  onChange: (v: string) => void
  placeholder?: string
  style?: StyleProp<ViewStyle>
}) {
  const [open, setOpen] = useState(false)
  const sel = options.find((o) => o.value === value)
  return (
    <>
      <Pressable
        onPress={() => { if (options.length) { haptic.nav(); setOpen(true) } }}
        style={[s.selectTrigger, open && { borderColor: alpha(C.cyan, 0.6) }, style]}
      >
        <T style={[s.selectText, !sel && { color: C.muted, fontWeight: '400' }]} numberOfLines={1}>
          {sel?.label ?? placeholder}
        </T>
        <IconChevronDown size={16} color={C.muted} />
      </Pressable>
      <Modal open={open} onClose={() => setOpen(false)} title="Choose" maxHeight="70%">
        {options.map((o) => {
          const on = o.value === value
          return (
            <Pressable
              key={o.value}
              onPress={() => { haptic.select(); onChange(o.value); setOpen(false) }}
              style={({ pressed }) => [s.optRow, (on || pressed) && { backgroundColor: alpha(C.cyan, 0.15) }]}
            >
              <T style={[s.optText, on && { fontWeight: '800' }]} numberOfLines={1}>{o.label}</T>
              {o.hint ? <T style={s.optHint}>{o.hint}</T> : null}
              {on ? <IconCheck size={15} color={C.cyan} /> : null}
            </Pressable>
          )
        })}
      </Modal>
    </>
  )
}

/* ----------------------------- stepper ---------------------------- */
export function Stepper({ value, onChange, step = 1, min = 0, suffix }: { value: number; onChange: (v: number) => void; step?: number; min?: number; suffix?: string }) {
  const set = (v: number) => { haptic.tick(); onChange(Math.max(min, Math.round(v * 100) / 100)) }
  return (
    <View style={s.row}>
      <Pressable onPress={() => set(value - step)} style={s.stepBtn}><IconMinus size={16} color={C.muted2} /></Pressable>
      <View style={{ minWidth: 54, flexDirection: 'row', justifyContent: 'center', alignItems: 'baseline' }}>
        <T style={s.stepVal}>{value}</T>
        {suffix ? <T style={s.stepSuffix}>{suffix}</T> : null}
      </View>
      <Pressable onPress={() => set(value + step)} style={s.stepBtn}><IconPlus size={16} color={C.muted2} /></Pressable>
    </View>
  )
}

/* ---------------------------- empty state -------------------------- */
export function EmptyState({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={s.empty}>
      <T style={s.emptyTitle}>{title}</T>
      {sub ? <T style={s.emptySub}>{sub}</T> : null}
    </View>
  )
}

/* ------------------------------ ring ------------------------------- */
export function Ring({ value, size = 118, stroke = 11, children }: { value: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="ringg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={C.cyan} />
            <Stop offset="1" stopColor={C.cyanDeep} />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke="url(#ringg)" strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={{ alignItems: 'center' }}>{children}</View>
    </View>
  )
}

/* ----------------------------- count up ---------------------------- */
export function CountUp({ value, format, style }: { value: number; format?: (n: number) => string; style?: StyleProp<TextStyle> }) {
  const [shown, setShown] = useState(value)
  const from = useRef(0)
  useEffect(() => {
    const start = Date.now()
    const startVal = from.current
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / 750)
      const eased = 1 - Math.pow(1 - t, 3)
      setShown(startVal + (value - startVal) * eased)
      if (t >= 1) { from.current = value; clearInterval(id) }
    }, 16)
    return () => { from.current = value; clearInterval(id) }
  }, [value])
  return <T style={style}>{format ? format(shown) : String(Math.round(shown))}</T>
}

/* --------------------------- celebration --------------------------- */
export function Celebration({ prs, onDone }: { prs: { exercise: string; text: string }[] | null; onDone: () => void }) {
  const fade = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!prs?.length) return
    haptic.pr()
    Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start()
    const t = setTimeout(onDone, 2600 + prs.length * 400)
    return () => clearTimeout(t)
  }, [prs, onDone, fade])
  if (!prs?.length) return null
  const multi = prs.length > 1
  return (
    <Pressable onPress={onDone} style={s.celebWrap}>
      <Animated.View style={[s.celebCard, { opacity: fade }]}>
        <View style={s.celebIcon}><IconTrophy size={30} color={C.cyanInk} /></View>
        <T style={s.celebTitle}>{multi ? 'New PRs!' : 'New PR!'}</T>
        {multi ? (
          <View style={{ marginTop: 12, gap: 6, width: '100%' }}>
            {prs.map((p, i) => (
              <View key={i} style={s.celebRow}>
                <T style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>{p.exercise}</T>
                <T style={{ color: C.muted2, fontSize: 12 }}>{p.text}</T>
              </View>
            ))}
          </View>
        ) : (
          <>
            <T style={{ color: C.cyanSoft, marginTop: 4 }}>{prs[0].exercise}</T>
            <T style={{ color: C.muted2, marginTop: 2, fontSize: 13 }}>{prs[0].text}</T>
          </>
        )}
      </Animated.View>
    </Pressable>
  )
}

/* ------------------------- numeric text input ---------------------- */
/**
 * Keeps raw keystrokes in a draft while focused. A controlled numeric field that
 * coerces on every keypress makes decimals impossible ("2." -> 2), which is why
 * half-plate loads couldn't be typed on web. Parse on change, but never rewrite
 * what the user is mid-way through typing.
 */
export function NumInput({
  value, onChange, placeholder, integer, suffix, style,
}: {
  value: number
  onChange: (v: number) => void
  placeholder?: string | number
  integer?: boolean
  suffix?: string
  style?: StyleProp<ViewStyle>
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const display = (n: number) => (!n ? '' : String(integer ? Math.round(n) : Math.round(n * 100) / 100))
  const sanitize = (raw: string) => {
    let t = raw.replace(integer ? /[^0-9]/g : /[^0-9.]/g, '')
    const dot = t.indexOf('.')
    if (dot >= 0) t = t.slice(0, dot + 1) + t.slice(dot + 1).replace(/\./g, '')
    return t
  }
  return (
    <View style={[s.numWrap, style]}>
      <TextInput
        value={draft ?? display(value)}
        onChangeText={(raw) => {
          const t = sanitize(raw)
          setDraft(t)
          const n = Number(t)
          onChange(t === '' || t === '.' || !Number.isFinite(n) ? 0 : integer ? Math.round(n) : n)
        }}
        onBlur={() => setDraft(null)}
        placeholder={placeholder != null ? String(placeholder) : '0'}
        placeholderTextColor={alpha('#8b8b94', 0.5)}
        keyboardType={integer ? 'number-pad' : 'decimal-pad'}
        style={s.numInput}
      />
      {suffix ? <T style={s.numSuffix}>{suffix}</T> : null}
    </View>
  )
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: { borderRadius: R.xl, paddingHorizontal: 20, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 15, fontWeight: '800' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: C.panel2, borderTopLeftRadius: 26, borderTopRightRadius: 26,
    borderWidth: 1, borderColor: C.line2, padding: 18, paddingTop: 10,
  },
  grabber: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: C.line2, marginBottom: 12 },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  h2: { fontSize: 18, fontWeight: '800', flex: 1 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.white5 },
  selectTrigger: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: R.md, borderWidth: 1, borderColor: C.line2, backgroundColor: C.panel2,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  selectText: { flex: 1, fontSize: 14, fontWeight: '700' },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: R.sm, paddingHorizontal: 10, paddingVertical: 11 },
  optText: { flex: 1, fontSize: 14, color: C.ink2 },
  optHint: { fontSize: 11, color: C.muted },
  stepBtn: { width: 36, height: 36, borderRadius: R.md, borderWidth: 1, borderColor: C.line2, alignItems: 'center', justifyContent: 'center' },
  stepVal: { fontSize: 20, fontWeight: '800' },
  stepSuffix: { fontSize: 12, color: C.muted, marginLeft: 2 },
  empty: {
    alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 26, borderWidth: 1, borderStyle: 'dashed', borderColor: C.line2,
    paddingHorizontal: 24, paddingVertical: 44,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.ink2 },
  emptySub: { fontSize: 13, color: C.muted, textAlign: 'center', maxWidth: 280 },
  celebWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 60 },
  celebCard: {
    width: '86%', maxWidth: 360, borderRadius: 26, padding: 26, alignItems: 'center',
    backgroundColor: C.glassStrong, borderWidth: 1, borderColor: C.line2,
  },
  celebIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: C.cyan, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  celebTitle: { fontSize: 20, fontWeight: '800' },
  celebRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.white5, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 8 },
  numWrap: { position: 'relative', justifyContent: 'center' },
  numInput: {
    borderRadius: R.md, borderWidth: 1, borderColor: C.line2, backgroundColor: C.panel2,
    color: C.ink, textAlign: 'center', fontSize: 16, fontWeight: '800', paddingVertical: 8, paddingHorizontal: 6,
  },
  numSuffix: { position: 'absolute', right: 8, fontSize: 11, color: C.muted },
})
