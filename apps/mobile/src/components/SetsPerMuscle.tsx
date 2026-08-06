import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { C, R, alpha } from '../theme'
import { T } from './ui'
import { CategoryThumb } from './Icons'
import { CATALOG } from '../data/catalog'
import { categoryOf } from '../data/catalog'
import { muscleLoad, SETS_TARGET_MIN, SETS_TARGET_MAX, type MuscleLoad } from '../lib/stats'
import { haptic } from '../lib/haptics'
import type { CustomExerciseRow, SetRow } from '../lib/types'

const WINDOWS: { weeks: number; label: string; caption: string }[] = [
  { weeks: 1, label: 'Week', caption: 'so far this week' },
  { weeks: 4, label: '4wk', caption: 'average over the last 4 complete weeks' },
  { weeks: 12, label: '12wk', caption: 'average over the last 12 complete weeks' },
]

/** cardio has no muscle group of its own, so it has no set target */
const TRACKED = CATALOG.filter((c) => c.key !== 'cardio')

/**
 * Hard sets per muscle group per week, against the 10–20 band.
 *
 * This is the number that actually tracks hypertrophy — total tonnage does not — and it
 * is the one thing the app can tell you that a paper logbook cannot. Hevy shows the same
 * metric but no target range, so the band is the part worth having.
 */
export function SetsPerMuscle({ sets, custom }: { sets: SetRow[]; custom: CustomExerciseRow[] }) {
  const [weeks, setWeeks] = useState(1)
  const win = WINDOWS.find((w) => w.weeks === weeks)!

  const rows = useMemo(
    () => muscleLoad(sets, (ex) => categoryOf(ex, custom)?.key, TRACKED.map((c) => c.key), weeks),
    [sets, custom, weeks],
  )

  // scale always shows the whole target band, even when nothing reaches it
  const max = Math.max(SETS_TARGET_MAX + 4, ...rows.map((r) => r.perWeek))
  // RN wants a `${number}%` literal, not a plain string, for width/left
  const pct = (n: number): `${number}%` => `${Math.min(100, (n / max) * 100)}%`

  const under = rows.filter((r) => r.status === 'under').length
  const onTarget = rows.filter((r) => r.status === 'onTarget').length

  return (
    <View style={s.card}>
      <View style={s.head}>
        <T style={s.cardLabel} numberOfLines={1}>Hard sets per muscle</T>
        <View style={s.seg}>
          {WINDOWS.map((w) => {
            const on = w.weeks === weeks
            return (
              <Pressable
                key={w.weeks}
                onPress={() => { haptic.select(); setWeeks(w.weeks) }}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={[s.segBtn, on && { backgroundColor: C.cyan }]}
              >
                <T style={[s.segText, on && { color: C.cyanInk }]}>{w.label}</T>
              </Pressable>
            )
          })}
        </View>
      </View>

      <T style={s.caption}>
        {win.caption} · target {SETS_TARGET_MIN}–{SETS_TARGET_MAX} per week
      </T>

      <View style={{ gap: 9, marginTop: 14 }}>
        {rows.map((r) => (
          <Row key={r.category} row={r} pct={pct} max={max} />
        ))}
      </View>

      {/* a chart nobody can read still has to say what it means */}
      <T style={s.summary}>
        {onTarget} of {rows.length} muscle groups in range
        {under > 0 ? `, ${under} under ${SETS_TARGET_MIN} sets` : ''}.
      </T>
    </View>
  )
}

function Row({ row, pct, max }: { row: MuscleLoad; pct: (n: number) => `${number}%`; max: number }) {
  const cat = CATALOG.find((c) => c.key === row.category)
  const colour =
    row.status === 'onTarget' ? C.cyan : row.status === 'over' ? C.warn : alpha(C.cyan, 0.45)
  const word = row.status === 'onTarget' ? 'in range' : row.status === 'over' ? 'above range' : 'below range'

  return (
    <View
      style={s.row}
      accessible
      accessibilityLabel={`${cat?.title ?? row.category}: ${row.perWeek} hard sets per week, ${word}. Target ${SETS_TARGET_MIN} to ${SETS_TARGET_MAX}.`}
    >
      <CategoryThumb icon={row.category} size={16} color={C.muted2} />
      <T style={s.name} numberOfLines={1}>{cat?.title ?? row.category}</T>

      <View style={s.track}>
        {/* the target band sits behind the bar, so "enough" is a place on the axis
            rather than a number you have to remember */}
        <View
          style={[
            s.band,
            {
              left: pct(SETS_TARGET_MIN),
              width: `${((SETS_TARGET_MAX - SETS_TARGET_MIN) / max) * 100}%` as `${number}%`,
            },
          ]}
        />
        <View style={[s.bar, { width: pct(row.perWeek), backgroundColor: colour }]} />
      </View>

      <T style={[s.val, row.status === 'under' && { color: C.muted }]}>{row.perWeek}</T>
    </View>
  )
}

const s = StyleSheet.create({
  card: { borderRadius: 26, backgroundColor: C.glass, borderWidth: 1, borderColor: C.line, padding: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardLabel: { flex: 1, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: C.muted, textTransform: 'uppercase' },
  seg: { flexDirection: 'row', borderRadius: R.md, borderWidth: 1, borderColor: C.line2, padding: 2 },
  segBtn: { minHeight: 28, justifyContent: 'center', borderRadius: R.sm, paddingHorizontal: 9 },
  segText: { fontSize: 10, fontWeight: '800', color: C.muted2 },
  caption: { marginTop: 8, fontSize: 11, color: C.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 26 },
  name: { width: 70, fontSize: 11, fontWeight: '700', color: C.ink2 },
  track: { flex: 1, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.05)', overflow: 'hidden', justifyContent: 'center' },
  band: { position: 'absolute', top: 0, bottom: 0, backgroundColor: alpha(C.cyan, 0.12), borderLeftWidth: 1, borderRightWidth: 1, borderColor: alpha(C.cyan, 0.28) },
  bar: { height: 10, borderRadius: 5 },
  val: { width: 30, textAlign: 'right', fontSize: 12, fontWeight: '800' },
  summary: { marginTop: 12, fontSize: 11, lineHeight: 16, color: C.muted },
})
