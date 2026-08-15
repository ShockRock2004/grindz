import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'

import { LinearGradient } from 'expo-linear-gradient'
import { C, R, alpha } from '../theme'
import { T, Button, EmptyState, Modal, Select } from '../components/ui'
import { BarChart, BodyMap, LineChart, useBodyMapVariant, type BodyMapDataset } from '../components/Charts'
import { legendRim, legendStops, type BodyMapVariant, type IslandLayer } from '../data/bodyMapStyle'
import { BODY_VIEWBOX as FEMALE_VIEWBOX, FRONT_MUSCLES as FEMALE_FRONT, BACK_MUSCLES as FEMALE_BACK } from '../data/bodyMusclesFemale'
import { CategoryThumb, IconChart, IconChevronDown, IconChevronLeft, IconChevronRight, IconPlay, IconScale, IconTrophy } from '../components/Icons'
import { CATALOG, CATALOG_BY_KEY, categoryOf, mergeCustom } from '../data/catalog'
import { musclesFromSets } from '../data/exerciseMuscles'
import { useData, usePrefs } from '../lib/app-context'
import { saveBodyweight } from '../lib/db'
import { exerciseSeries, splitByCategory, volumeByDay } from '../lib/stats'
import { clamp, dateKey, fmtWeight, fromKg, relativeDay, toKg } from '../lib/util'
import { haptic } from '../lib/haptics'
import { usePullToRefresh } from '../components/Refresh'
import { SetsPerMuscle } from '../components/SetsPerMuscle'

/** One legend entry, painted from the same source the figure reads. */
function LegendSwatch({ variant, layer, label }: { variant: BodyMapVariant; layer: IslandLayer; label: string }) {
  // the tier's own rim when it has one, else a neutral edge so a near-black resting
  // swatch is still findable on the card
  const rim = legendRim(variant, layer) ?? alpha(C.ink, 0.15)
  // {x:0,y:0}->{x:1,y:1} matches the ramp direction the islands are painted along; a flat
  // tier returns the same colour twice, so this renders as a solid chip for those
  const [from, to] = legendStops(variant, layer)
  return (
    <View style={s.row}>
      <LinearGradient
        colors={[from, to]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[s.swatch, { borderColor: rim }]}
      />
      <T style={s.legendText}>{label}</T>
    </View>
  )
}

export function Progress({ onOpenCategory, onStart }: { onOpenCategory: (key: string) => void; onStart: () => void }) {
  const { sessions, sets, prs, bodyweights, custom, refresh } = useData()
  const refresher = usePullToRefresh()
  const { unit, gender } = usePrefs()
  // resolved once here so the figure and its legend cannot disagree
  const bodyMapVariant = useBodyMapVariant()
  // BodyMap defaults to the male dataset internally; only pass one explicitly for female
  const bodyMapDataset: BodyMapDataset | undefined =
    gender === 'female' ? { BODY_VIEWBOX: FEMALE_VIEWBOX, FRONT_MUSCLES: FEMALE_FRONT, BACK_MUSCLES: FEMALE_BACK } : undefined

  const [muscleCat, setMuscleCat] = useState<string | null>(null)
  const weekStartMs = (() => {
    const x = new Date()
    x.setHours(0, 0, 0, 0)
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
    return x.getTime()
  })()
  // per-exercise, not per-category: a bench press should light the triceps and front
  // delts it actually works, not just the pecs
  const trainedThisWeek = useMemo(
    () => musclesFromSets(sets.filter((st) => new Date(st.performed_at).getTime() >= weekStartMs), custom),
    [sets, weekStartMs, custom],
  )
  const nothingTrainedYet = trainedThisWeek.size === 0

  const volMap = volumeByDay(sessions)
  const volBars = useMemo(() => {
    const out: { label: string; value: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      out.push({ label: dateKey(d), value: volMap[dateKey(d)] ?? 0 })
    }
    return out
  }, [volMap])

  const exercisesWithData = useMemo(
    () => Object.values(prs).sort((a, b) => (b.lastDate ?? '').localeCompare(a.lastDate ?? '')).map((p) => p.exercise),
    [prs],
  )
  const [exercise, setExercise] = useState('')
  const chosen = exercise || exercisesWithData[0] || ''
  const [metric, setMetric] = useState<'est1rm' | 'topWeight'>('est1rm')
  const series = chosen ? exerciseSeries(sets, chosen) : []

  const split = splitByCategory(sessions)
  const splitMax = Math.max(1, ...split.map((x) => x.count))

  /*
   * PR board.
   *
   * The old board was an arbitrary top-8 by estimated 1RM, which meant your best lifts
   * crowded out everything else — a chest-heavy lifter could never see a single leg PR.
   * Now it filters by muscle group and pages, so every record is reachable.
   */
  const [prCat, setPrCat] = useState<string | null>(null)
  const [prPage, setPrPage] = useState(0)
  const PR_PER_PAGE = 6

  const allPRs = useMemo(
    () => Object.values(prs).filter((p) => p.bestWeight > 0).sort((a, b) => b.best1rm - a.best1rm),
    [prs],
  )
  /** only offer filters for groups that actually have a record */
  const prCats = useMemo(() => {
    const keys = new Set<string>()
    for (const p of allPRs) {
      const c = categoryOf(p.exercise, custom)?.key
      if (c) keys.add(c)
    }
    return CATALOG.filter((c) => keys.has(c.key))
  }, [allPRs, custom])

  const prFiltered = useMemo(
    () => (prCat ? allPRs.filter((p) => categoryOf(p.exercise, custom)?.key === prCat) : allPRs),
    [allPRs, prCat, custom],
  )
  const prPages = Math.max(1, Math.ceil(prFiltered.length / PR_PER_PAGE))
  useEffect(() => { if (prPage > prPages - 1) setPrPage(prPages - 1) }, [prPage, prPages])
  const prBoard = prFiltered.slice(prPage * PR_PER_PAGE, prPage * PR_PER_PAGE + PR_PER_PAGE)

  const latestBW = bodyweights[bodyweights.length - 1]?.kg
  const bigThree = [
    { name: 'Bench Press', pr: prs['Flat Bench Press'] ?? prs['Incline Bench Press'] },
    { name: 'Squat', pr: prs['Barbell Squats'] },
    { name: 'Deadlift', pr: prs['Dumbbell Romanian Deadlift'] },
  ].filter((x) => x.pr && x.pr.best1rm > 0)

  const [bw, setBw] = useState('')
  const [bf, setBf] = useState('')
  const [bfOpen, setBfOpen] = useState(false)
  const bfSeries = bodyweights.filter((b) => b.bodyFat != null)
  const logWeight = async () => {
    const typed = Number(bw)
    if (!typed) return
    haptic.success()
    const kg = toKg(typed, unit)
    // only send body fat when one was typed — a null would wipe an earlier reading
    const bfNum = bf.trim() === '' ? undefined : Number(bf)
    await saveBodyweight(dateKey(), kg, bfNum != null && Number.isFinite(bfNum) ? bfNum : undefined)
    setBw(''); setBf('')
    await refresh()
  }

  if (sessions.length === 0 && bodyweights.length === 0) {
    return (
      // a ScrollView, not a View: an empty Progress is exactly when the data might
      // be sitting on another device, so pull-to-refresh has to reach here too
      <ScrollView
        contentContainerStyle={[s.centerPage, { flexGrow: 1 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={refresher}
      >
        <T style={s.h1}>Progress</T>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <View style={s.emptyIcon}><IconChart size={30} color={C.cyan} /></View>
          <View style={{ alignItems: 'center', gap: 8 }}>
            <T style={{ fontSize: 18, fontWeight: '800' }}>Your progress starts here</T>
            <T style={{ maxWidth: 300, textAlign: 'center', fontSize: 14, lineHeight: 20, color: C.muted2 }}>
              Log your first workout and your PRs, weekly volume, streak and charts build automatically — nothing to set up.
            </T>
          </View>
          <Button onPress={onStart}>
            <View style={s.row}><IconPlay size={18} color={C.cyanInk} /><T style={{ color: C.cyanInk, fontWeight: '800', fontSize: 15 }}>Start a workout</T></View>
          </Button>
        </View>
      </ScrollView>
    )
  }

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={s.page}
      showsVerticalScrollIndicator={false}
      refreshControl={refresher}
      keyboardShouldPersistTaps="handled"
      bottomOffset={28}
    >
      <T style={s.h1}>Progress</T>

      <View style={s.card}>
        <T style={s.cardLabel}>Muscles worked this week · tap for detail</T>
        <BodyMap trained={trainedThisWeek} onPick={setMuscleCat} variant={bodyMapVariant} dataset={bodyMapDataset} />
        {nothingTrainedYet ? (
          <T style={s.hint}>Nothing logged this week yet — muscles light up as you train them. Tap any muscle to see its progress.</T>
        ) : (
          <View style={s.legendRow}>
            {/* Every swatch is read out of the same paint the figure is drawn with, for the
                same variant the figure resolved — a legend that does not match the fill it
                labels is worse than no legend. The border is there because an honest resting
                swatch is nearly black; without an edge you could not find it on the card. */}
            <LegendSwatch variant={bodyMapVariant} layer="primary" label="Worked" />
            <LegendSwatch variant={bodyMapVariant} layer="secondary" label="Assisting" />
            <LegendSwatch variant={bodyMapVariant} layer="rest" label="Not yet" />
          </View>
        )}
      </View>

      <SetsPerMuscle sets={sets} custom={custom} />

      <View style={s.card}>
        <T style={s.cardLabel}>Volume · last 14 days</T>
        <BarChart bars={volBars} height={110} />
      </View>

      {chosen ? (
        <View style={s.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Select
              style={{ flex: 1 }}
              value={chosen}
              onChange={setExercise}
              options={exercisesWithData.map((e) => ({ value: e, label: e }))}
            />
            <View style={s.metricTgl}>
              {(['est1rm', 'topWeight'] as const).map((m) => (
                <Pressable key={m} onPress={() => setMetric(m)} style={[s.metricBtn, metric === m && { backgroundColor: C.cyan }]}>
                  <T style={[s.metricText, metric === m && { color: C.cyanInk }]}>{m === 'est1rm' ? '1RM' : 'Top'}</T>
                </Pressable>
              ))}
            </View>
          </View>
          <LineChart
            points={series.map((x) => ({ x: x.date, y: Math.round(fromKg(metric === 'est1rm' ? x.est1rm : x.topWeight, unit) * 10) / 10 }))}
            height={130}
          />
          {series.length > 0 ? (
            <T style={s.chartNote}>
              {series[0].date} → today · best {fmtWeight(Math.max(...series.map((x) => (metric === 'est1rm' ? x.est1rm : x.topWeight))), unit)} {unit}
            </T>
          ) : null}
        </View>
      ) : (
        <EmptyState title="No progression yet" sub="Complete a few workouts to see your progression here." />
      )}

      {prBoard.length > 0 ? (
        <View>
          <View style={[s.row, { marginBottom: 8, paddingHorizontal: 4 }]}>
            <IconTrophy size={16} color={C.cyan} />
            <T style={[s.sectionLabel, { flex: 1 }]}>Personal records</T>
            <T style={s.prCount}>{prFiltered.length}</T>
          </View>

          {prCats.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.prChips}>
              <Pressable
                onPress={() => { haptic.select(); setPrCat(null); setPrPage(0) }}
                accessibilityRole="tab"
                accessibilityState={{ selected: prCat === null }}
                style={[s.prChip, prCat === null && s.prChipOn]}
              >
                <T style={[s.prChipText, prCat === null && { color: C.cyanInk }]}>All</T>
              </Pressable>
              {prCats.map((c) => {
                const on = prCat === c.key
                return (
                  <Pressable
                    key={c.key}
                    onPress={() => { haptic.select(); setPrCat(on ? null : c.key); setPrPage(0) }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    style={[s.prChip, on && s.prChipOn]}
                  >
                    <T style={[s.prChipText, on && { color: C.cyanInk }]}>{c.title}</T>
                  </Pressable>
                )
              })}
            </ScrollView>
          ) : null}
          {/* column headers - three bare numeric columns are unreadable without them */}
          <View style={s.prHead}>
            <T style={[s.prHeadText, { flex: 1 }]}>EXERCISE</T>
            <T style={[s.prHeadText, s.prColBest]}>BEST</T>
            <T style={[s.prHeadText, s.prColRm]}>EST 1RM</T>
          </View>
          <View style={{ gap: 8 }}>
            {prBoard.map((p) => (
              <View key={p.exercise} style={s.prRow}>
                {/* minWidth 0 lets the name actually shrink - without it a long name
                    pushes the badge into the numeric columns and they overlap */}
                <View style={s.prNameCol}>
                  <T style={s.prName} numberOfLines={1}>{p.exercise}</T>
                  <View style={s.prMetaRow}>
                    <T style={s.prMeta}>×{p.bestReps} reps</T>
                    {p.bestDate ? <T style={s.prMeta}>· {relativeDay(p.bestDate)}</T> : null}
                    {latestBW ? (
                      <View style={s.bwTag}><T style={s.bwTagText}>{(p.best1rm / latestBW).toFixed(1)}×BW</T></View>
                    ) : null}
                  </View>
                </View>
                <View style={s.prColBest}>
                  <T style={s.prBest} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                    {fmtWeight(p.bestWeight, unit)}{unit}
                  </T>
                </View>
                <View style={s.prColRm}>
                  <T style={s.prRm} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                    {fmtWeight(p.best1rm, unit)}
                  </T>
                </View>
              </View>
            ))}
          </View>

          {prPages > 1 ? (
            <View style={s.prPager}>
              <Pressable
                onPress={() => { if (prPage > 0) { haptic.pageTurn(); setPrPage(prPage - 1) } }}
                accessibilityRole="button"
                accessibilityLabel="Newer records"
                style={[s.prPageBtn, prPage === 0 && { opacity: 0.35 }]}
              >
                <IconChevronLeft size={15} color={prPage === 0 ? C.muted : C.ink2} />
              </Pressable>
              <T style={s.prPageInfo}>Page {prPage + 1} of {prPages}</T>
              <Pressable
                onPress={() => { if (prPage < prPages - 1) { haptic.pageTurn(); setPrPage(prPage + 1) } }}
                accessibilityRole="button"
                accessibilityLabel="Older records"
                style={[s.prPageBtn, prPage >= prPages - 1 && { opacity: 0.35 }]}
              >
                <IconChevronRight size={15} color={prPage >= prPages - 1 ? C.muted : C.ink2} />
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : (
        <EmptyState title="No PRs yet" sub="Hit your first PR and it'll appear here 🏆" />
      )}

      {latestBW && bigThree.length > 0 ? (
        <View style={s.card}>
          <T style={s.cardLabel}>Strength standards</T>
          <View style={{ gap: 16 }}>
            {bigThree.map(({ name, pr }) => {
              const ratio = pr!.best1rm / latestBW
              const pct = clamp(ratio / 2, 0, 1) * 100
              return (
                <View key={name}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <T style={{ fontSize: 12, fontWeight: '700', color: C.ink2 }}>{name}</T>
                    <T style={{ fontSize: 12, fontWeight: '700', color: C.cyanSoft }}>{ratio.toFixed(2)}×BW</T>
                  </View>
                  <View style={s.track}><View style={[s.fill, { width: `${pct}%` }]} /></View>
                </View>
              )
            })}
          </View>
        </View>
      ) : null}

      {split.length > 0 ? (
        <View style={s.card}>
          <T style={s.cardLabel}>Split · last 30 days</T>
          <View style={{ gap: 10 }}>
            {split.map((x) => (
              <View key={x.key} style={s.row}>
                <CategoryThumb icon={x.key} size={28} />
                <T style={{ width: 88, fontSize: 12, color: C.muted2 }} numberOfLines={1}>{CATALOG_BY_KEY[x.key]?.title ?? x.key}</T>
                <View style={[s.track, { flex: 1 }]}><View style={[s.fill, { width: `${(x.count / splitMax) * 100}%` }]} /></View>
                <T style={{ width: 20, textAlign: 'right', fontSize: 12, fontWeight: '800' }}>{x.count}</T>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={s.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <View style={s.row}><IconScale size={15} color={C.muted} /><T style={s.cardLabel}>Bodyweight</T></View>
          {bodyweights.length > 0 ? <T style={{ fontSize: 14, fontWeight: '700', color: C.cyanSoft }}>{fmtWeight(bodyweights[bodyweights.length - 1].kg, unit)} {unit}</T> : null}
        </View>
        {bodyweights.length > 1 ? (
          <LineChart points={bodyweights.map((b) => ({ x: b.date, y: Math.round(fromKg(b.kg, unit) * 10) / 10 }))} height={110} />
        ) : (
          <T style={{ paddingVertical: 12, textAlign: 'center', fontSize: 12, color: C.muted }}>Log your weight to start the trend.</T>
        )}
        {bfSeries.length > 1 ? (
          <View style={{ marginTop: 16 }}>
            <T style={s.cardLabel}>Body fat · %</T>
            <LineChart points={bfSeries.map((b) => ({ x: b.date, y: b.bodyFat as number }))} height={90} />
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <TextInput
            value={bw} onChangeText={setBw} keyboardType="decimal-pad"
            placeholder={`Today's weight (${unit})`} placeholderTextColor={C.muted}
            style={[s.input, { flex: 1 }]}
          />
          <Button variant="outline" onPress={logWeight} disabled={!Number(bw)}>Log</Button>
        </View>
        <Pressable onPress={() => { haptic.select(); setBfOpen((v) => !v) }} style={[s.row, { marginTop: 8 }]}>
          <IconChevronDown size={14} color={C.muted} />
          <T style={{ fontSize: 12, fontWeight: '600', color: C.muted }}>Log body fat %</T>
        </Pressable>
        {bfOpen ? (
          <TextInput
            value={bf} onChangeText={setBf} keyboardType="decimal-pad"
            placeholder="Body fat % (saved with your weight)" placeholderTextColor={C.muted}
            style={[s.input, { marginTop: 8 }]}
          />
        ) : null}
      </View>

      <Modal open={!!muscleCat} onClose={() => setMuscleCat(null)} title={muscleCat ? `${CATALOG_BY_KEY[muscleCat]?.title ?? ''} · progress` : ''}>
        {muscleCat ? (() => {
          const cat = mergeCustom(custom).find((c) => c.key === muscleCat)
          const exs = cat?.exercises ?? []
          return (
            <View style={{ gap: 10 }}>
              {exs.map((e) => {
                const pr = prs[e.name]
                const sr = pr ? exerciseSeries(sets, e.name) : []
                return (
                  <View key={e.name} style={s.muscleRow}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <T style={{ flex: 1, fontSize: 14, fontWeight: '800' }} numberOfLines={1}>{e.name}</T>
                      {pr ? (
                        <T style={{ fontSize: 12, fontWeight: '700', color: C.cyanSoft }}>{fmtWeight(pr.best1rm, unit)}{unit} <T style={{ color: C.muted }}>1RM</T></T>
                      ) : <T style={{ fontSize: 11, fontWeight: '600', color: C.muted }}>Not logged yet</T>}
                    </View>
                    {pr && sr.length > 1 ? (
                      <View style={{ marginTop: 8 }}>
                        <LineChart points={sr.map((x) => ({ x: x.date, y: Math.round(fromKg(x.est1rm, unit) * 10) / 10 }))} height={64} />
                      </View>
                    ) : pr ? (
                      <T style={{ marginTop: 4, fontSize: 12, color: C.muted }}>Best {fmtWeight(pr.bestWeight, unit)}{unit} × {pr.bestReps} · one session logged</T>
                    ) : null}
                  </View>
                )
              })}
              <Button style={{ marginTop: 4 }} onPress={() => { const k = muscleCat; setMuscleCat(null); onOpenCategory(k) }}>
                <View style={s.row}><IconPlay size={17} color={C.cyanInk} /><T style={{ color: C.cyanInk, fontWeight: '800', fontSize: 15 }}>Start {cat?.title} workout</T></View>
              </Button>
            </View>
          )
        })() : null}
      </Modal>
    </KeyboardAwareScrollView>
  )
}

const s = StyleSheet.create({
  page: { padding: 20, paddingBottom: 196, gap: 20 },
  centerPage: { flex: 1, padding: 20, paddingBottom: 130 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  h1: { fontSize: 26, fontWeight: '800' },
  card: { borderRadius: 26, backgroundColor: C.glass, borderWidth: 1, borderColor: C.line, padding: 16 },
  cardLabel: { marginBottom: 10, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: C.muted, textTransform: 'uppercase' },
  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, color: C.muted, textTransform: 'uppercase' },
  hint: { marginTop: 12, textAlign: 'center', fontSize: 11, color: C.muted },
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 12 },
  legendText: { fontSize: 11, color: C.muted },
  // the border makes a near-black resting swatch findable without misstating its fill
  swatch: { width: 10, height: 10, borderRadius: 3, borderWidth: 1 },
  emptyIcon: { width: 64, height: 64, borderRadius: R.xl, backgroundColor: alpha(C.cyan, 0.1), alignItems: 'center', justifyContent: 'center' },
  metricTgl: { flexDirection: 'row', borderRadius: R.md, borderWidth: 1, borderColor: C.line2, padding: 2 },
  metricBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  metricText: { fontSize: 12, fontWeight: '800', color: C.muted },
  chartNote: { marginTop: 8, textAlign: 'center', fontSize: 12, color: C.muted },
  prRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: R.xl, backgroundColor: C.glass, borderWidth: 1, borderColor: C.line, paddingHorizontal: 16, paddingVertical: 12 },
  prCount: { fontSize: 12, fontWeight: '700', color: C.muted },
  prChips: { gap: 6, paddingBottom: 10, paddingHorizontal: 2 },
  prChip: { minHeight: 30, justifyContent: 'center', borderRadius: R.pill, borderWidth: 1, borderColor: C.line2, paddingHorizontal: 12 },
  prChipOn: { backgroundColor: C.cyan, borderColor: C.cyan },
  prChipText: { fontSize: 11, fontWeight: '800', color: C.muted2 },
  prPager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 10 },
  prPageBtn: { minHeight: 40, minWidth: 44, alignItems: 'center', justifyContent: 'center', borderRadius: R.md, borderWidth: 1, borderColor: C.line2 },
  prPageInfo: { fontSize: 11, fontWeight: '600', color: C.muted },
  prHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 6 },
  prHeadText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.7, color: C.muted, textTransform: 'uppercase', textAlign: 'right' },
  prNameCol: { flex: 1, minWidth: 0, gap: 3 },
  prName: { fontSize: 14, fontWeight: '800' },
  prMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  prMeta: { fontSize: 10, color: C.muted },
  // widened from 62 - three-digit loads plus a decimal clipped at the old width
  prColBest: { width: 76, alignItems: 'flex-end' },
  prColRm: { width: 66, alignItems: 'flex-end' },
  prBest: { fontSize: 14, fontWeight: '800', color: C.cyanSoft },
  prRm: { fontSize: 14, fontWeight: '800' },
  bwTag: { borderRadius: R.pill, backgroundColor: C.cyanWash, paddingHorizontal: 8, paddingVertical: 2 },
  bwTagText: { fontSize: 10, fontWeight: '800', color: C.cyan },
  track: { height: 10, borderRadius: 5, backgroundColor: C.white5, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5, backgroundColor: C.cyan },
  input: { borderRadius: R.md, borderWidth: 1, borderColor: C.line2, backgroundColor: C.panel2, color: C.ink, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  muscleRow: { borderRadius: R.xl, backgroundColor: C.glass, borderWidth: 1, borderColor: C.line, padding: 14 },
})
