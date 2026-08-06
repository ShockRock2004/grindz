import { useMemo, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { C, R, alpha } from '../theme'
import { T, Ring, CountUp } from '../components/ui'
import { CategoryThumb, IconCheck, IconClock, IconDumbbell, IconFlame, IconPlay } from '../components/Icons'
import { CATALOG, categoryOf } from '../data/catalog'
import { heroSource } from '../data/images'
import { useData, usePrefs } from '../lib/app-context'
import { currentStreak, weekSummary, weekStart, hardSetsByCategory } from '../lib/stats'
import { WEEKDAYS, dateKey, fmtCount } from '../lib/util'
import { haptic } from '../lib/haptics'
import { usePullToRefresh } from '../components/Refresh'
import { useLayout } from '../lib/layout'

const GROUPS = [
  { key: 'all', label: 'All' },
  { key: 'push', label: 'Push' },
  { key: 'pull', label: 'Pull' },
  { key: 'legs', label: 'Legs' },
  { key: 'core', label: 'Core' },
  { key: 'cardio', label: 'Cardio' },
]
const CAT_GROUP: Record<string, string> = {
  chest: 'push', shoulders: 'push', triceps: 'push',
  back: 'pull', biceps: 'pull', legs: 'legs', abs: 'core', cardio: 'cardio',
}

export function Home({ onOpenCategory, onBuildWorkout }: { onOpenCategory: (key: string) => void; onBuildWorkout: () => void }) {
  const L = useLayout()
  const refresher = usePullToRefresh()
  const { sessions, sets, custom, plan, loading } = useData()
  const { unit } = usePrefs()
  const [filter, setFilter] = useState('all')

  const week = weekSummary(sessions)
  const streak = currentStreak(sessions)

  // hard sets, not tonnage — see hardSetsByCategory for why
  const hardSets = useMemo(() => {
    const by = hardSetsByCategory(sets, (ex) => categoryOf(ex, custom)?.key)
    return Object.values(by).reduce((a, n) => a + n, 0)
  }, [sets, custom])

  /**
   * Categories already trained today. Read from the sets, not the sessions: a session that
   * spans groups is filed as 'mixed', so asking the session would mark nothing done after a
   * chest+triceps workout and invent a 'mixed' group instead.
   */
  const doneToday = useMemo(() => {
    const today = dateKey()
    const out = new Set<string>()
    for (const st of sets) if (st.category_key && dateKey(new Date(st.performed_at)) === today) out.add(st.category_key)
    return out
  }, [sets])
  const plannedDays = new Set(plan.map((p) => p.day)).size
  const goal = Math.max(plannedDays, 3)

  const todayName = WEEKDAYS[(new Date().getDay() + 6) % 7]
  const todaysPlan = plan
    .filter((p) => p.day === todayName)
    .sort((a, b) => a.slot - b.slot)
    .map((p) => CATALOG.find((c) => c.key === p.category_key))
    .filter(Boolean)

  const visible = filter === 'all' ? CATALOG : CATALOG.filter((c) => CAT_GROUP[c.key] === filter)

  const go = (key: string) => { haptic.nav(); onOpenCategory(key) }

  return (
    <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false} refreshControl={refresher}>
      {/* week hero */}
      <View style={s.card}>
        <Ring value={week.sessions / goal} size={112} stroke={11}>
          <CountUp value={week.sessions} style={s.ringNum} />
          <T style={s.ringSub}>of {goal} · week</T>
        </Ring>
        <View style={s.tiles}>
          <Tile label="Streak" unit="d" icon={<IconFlame size={13} color={C.cyan} />} value={<CountUp value={streak} style={s.tileVal} />} />
          <Tile label="Hard sets" value={<CountUp value={hardSets} style={s.tileVal} />} />
          <Tile label="Sets" value={<CountUp value={week.sets} style={s.tileVal} />} />
          <Tile label="Minutes" value={<CountUp value={week.minutes} format={fmtCount} style={s.tileVal} />} />
        </View>
      </View>

      {/* today's plan */}
      {todaysPlan.length > 0 && (
        <View>
          <T style={s.sectionLabel}>Today · {todayName}</T>
          {/*
            One entry point, not one per planned group.
            A day planned as chest and triceps used to render two "Start" rows, which
            describes the plan but misdescribes the session: those are one trip to the gym,
            and starting the first meant finishing it and starting the second to log the
            second half. The plan is shown as a list of what today covers; the button opens a
            picker across all of it.
          */}
          <View style={{ gap: 10 }}>
            <View style={s.planChips}>
              {todaysPlan.map((c, i) => {
                const done = doneToday.has(c!.key)
                return (
                  <View key={i} style={[s.planChip, done && s.planChipDone]}>
                    <CategoryThumb icon={c!.key} size={18} color={done ? C.muted2 : C.cyan} />
                    <T style={[s.planChipText, done && { color: C.muted2 }]}>{c!.title}</T>
                    {done ? <IconCheck size={11} color={C.muted2} /> : null}
                  </View>
                )
              })}
            </View>
            <Pressable
              onPress={() => { haptic.success(); onBuildWorkout() }}
              accessibilityRole="button"
              accessibilityLabel="Start today's workout — choose exercises"
              style={({ pressed }) => [s.startWorkout, pressed && { opacity: 0.85 }]}
            >
              <IconPlay size={15} color={C.cyanInk} />
              <T style={s.startWorkoutText}>Start workout</T>
            </Pressable>
          </View>
        </View>
      )}

      {/* browse */}
      <View>
        <T style={s.sectionLabel}>Workouts</T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
          {GROUPS.map((g) => {
            const on = filter === g.key
            return (
              <Pressable
                key={g.key}
                onPress={() => { haptic.select(); setFilter(g.key) }}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={[s.chip, on ? s.chipOn : s.chipOff]}
              >
                <T style={[s.chipText, on && { color: C.cyanInk }]}>{g.label}</T>
              </Pressable>
            )
          })}
        </ScrollView>

        {/* one column reads fine on a phone; on a tablet it is a stripe of whitespace */}
        <View style={[{ gap: 12 }, L.columns > 1 && { flexDirection: 'row', flexWrap: 'wrap' }]}>
          {visible.map((c) => (
            <Pressable
              key={c.key}
              onPress={() => go(c.key)}
              accessibilityRole="button"
              accessibilityLabel={`${c.title}, ${c.exercises.length} exercises`}
              style={({ pressed }) => [
                s.catCard,
                L.columns > 1 && { width: L.columns === 3 ? '32%' : '48.8%' },
                pressed && s.cardPressed,
              ]}
            >
              {/* base gradient gives the card depth instead of a flat panel */}
              <LinearGradient
                colors={[alpha(C.cyan, 0.16), 'rgba(16,16,24,0.9)', C.panel2]}
                start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              {heroSource(c.key) ? (
                <View
                  style={[s.hero, L.columns > 1 && { width: 150, height: 150, right: -8, top: -10 }]}
                  pointerEvents="none"
                >
                  <Image source={heroSource(c.key)} style={s.heroImg} contentFit="contain" cachePolicy="memory-disk" transition={150} />
                </View>
              ) : null}
              {/* left-to-right scrim so the title always clears the artwork */}
              <LinearGradient
                colors={[C.panel2, 'rgba(16,16,24,0.92)', 'rgba(16,16,24,0)']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[s.heroScrim, L.columns > 1 && { width: '78%' }]}
                pointerEvents="none"
              />
              <View style={{ flex: 1, gap: 10, zIndex: 2 }}>
                <View style={s.tag}><T style={s.tagText}>{c.subtitle.split(' / ')[0]}</T></View>
                <T style={s.catTitle}>{c.title}</T>
                <View style={{ flexDirection: 'row', gap: 14 }}>
                  <View style={s.metaRow}>
                    <IconDumbbell size={13} color={C.cyanSoft} />
                    <T style={s.meta}>{c.exercises.length} exercises</T>
                  </View>
                  <View style={s.metaRow}>
                    <IconClock size={13} color={C.cyanSoft} />
                    <T style={s.meta}>~{c.exercises.length * 8} min</T>
                  </View>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? <T style={s.syncing}>Syncing…</T> : null}
    </ScrollView>
  )
}

function Tile({ label, value, unit, icon }: { label: string; value: ReactNode; unit?: string; icon?: ReactNode }) {
  return (
    <View style={s.tile}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {icon}
        {value}
        {unit ? <T style={s.tileUnit}>{unit}</T> : null}
      </View>
      <T style={s.tileLabel}>{label}</T>
    </View>
  )
}

const s = StyleSheet.create({
  page: { padding: 20, paddingBottom: 196, gap: 22 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: 26, backgroundColor: C.glass, borderWidth: 1, borderColor: C.line, padding: 18 },
  ringNum: { fontSize: 32, fontWeight: '800' },
  ringSub: { fontSize: 10, fontWeight: '600', color: C.muted },
  tiles: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // flexBasis with grow beats a fixed 47% - two per row stay equal at any width
  tile: { flexGrow: 1, flexBasis: '44%', borderRadius: R.md, backgroundColor: C.white5, paddingHorizontal: 12, paddingVertical: 10 },
  tileVal: { fontSize: 16, fontWeight: '800' },
  // six digits in lbs used to wrap the tile; shrink instead of reflowing
  tileValWrap: { flexShrink: 1 },
  tileUnit: { fontSize: 11, fontWeight: '600', color: C.muted },
  tileLabel: { marginTop: 6, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, color: C.muted, textTransform: 'uppercase' },
  sectionLabel: { marginBottom: 12, fontSize: 12, fontWeight: '700', letterSpacing: 1.6, color: C.muted, textTransform: 'uppercase' },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: R.xl, backgroundColor: C.cyanWash2, borderWidth: 1, borderColor: alpha(C.cyan, 0.25), padding: 10 },
  planChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  planChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: R.pill, borderWidth: 1, borderColor: alpha(C.cyan, 0.25), backgroundColor: C.cyanWash2, paddingLeft: 6, paddingRight: 11, paddingVertical: 5 },
  planChipDone: { borderColor: C.line, backgroundColor: C.white5 },
  planChipText: { fontSize: 12, fontWeight: '800', color: C.cyan },
  startWorkout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: R.lg, backgroundColor: C.cyan, paddingVertical: 13 },
  startWorkoutText: { fontSize: 14, fontWeight: '800', color: C.cyanInk },
  planTitle: { fontSize: 15, fontWeight: '800' },
  planSub: { fontSize: 12, color: C.muted2 },
  startPill: { backgroundColor: C.cyan, borderRadius: R.sm, paddingHorizontal: 12, paddingVertical: 6 },
  // a finished row recedes rather than disappearing — you can still train it again
  planRowDone: { backgroundColor: C.white5, borderColor: C.line },
  donePill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: R.sm, borderWidth: 1, borderColor: alpha(C.cyan, 0.35), paddingHorizontal: 10, paddingVertical: 6 },
  donePillText: { color: C.cyan, fontSize: 12, fontWeight: '800' },
  startPillText: { color: C.cyanInk, fontSize: 12, fontWeight: '800' },
  chip: { borderRadius: R.pill, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1 },
  chipOn: { backgroundColor: C.cyan, borderColor: C.cyan },
  chipOff: { backgroundColor: 'transparent', borderColor: C.line2 },
  chipText: { fontSize: 12, fontWeight: '800', color: C.muted2 },
  catCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, overflow: 'hidden',
    borderRadius: 24, borderWidth: 1, borderColor: alpha(C.cyan, 0.18), padding: 18, minHeight: 138,
  },
  hero: { position: 'absolute', right: -14, top: -22, width: 216, height: 216 },
  heroImg: { width: '100%', height: '100%' },
  cardPressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  heroScrim: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '68%' },
  tag: { alignSelf: 'flex-start', borderRadius: R.pill, backgroundColor: alpha(C.cyan, 0.15), borderWidth: 1, borderColor: alpha(C.cyan, 0.25), paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: C.cyan, textTransform: 'uppercase' },
  catTitle: { fontSize: 26, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { fontSize: 12, color: C.muted2 },
  syncing: { textAlign: 'center', fontSize: 12, color: C.muted },
})
