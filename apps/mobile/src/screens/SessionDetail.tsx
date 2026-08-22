import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { C, R, alpha } from '../theme'
import { T, Button, Modal, EmptyState } from '../components/ui'
import { LineChart, ColumnChart, BodyMap, useBodyMapVariant, type BodyMapDataset } from '../components/Charts'
import { StatTile, MeterBar, InsightCard, LegendSwatch } from '../components/stats'
import { SetLadder } from '../components/SetLadder'
import { CategoryThumb, IconArrowLeft, IconChart, IconClock, IconGrid, IconScale, IconTrash, IconTrophy } from '../components/Icons'
import { CATALOG_BY_KEY } from '../data/catalog'
import { useData, usePrefs } from '../lib/app-context'
import { getSessionSets, deleteSession } from '../lib/db'
import { exerciseSeries, previousSameCategory, volumeByExercise, sessionEffort, categorySessionVolumes } from '../lib/stats'
import { sessionInsights } from '../lib/insights'
import { fmtDuration, fmtWeight, fromKg, type WeightUnit } from '../lib/util'
import { haptic } from '../lib/haptics'
import { useLayout } from '../lib/layout'
import { BODY_VIEWBOX as FEMALE_VIEWBOX, FRONT_MUSCLES as FEMALE_FRONT, BACK_MUSCLES as FEMALE_BACK } from '../data/bodyMusclesFemale'
import { musclesFromSets } from '../data/exerciseMuscles'
import type { SetRow, SessionRow } from '../lib/types'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function fullDate(iso: string): string {
  const d = new Date(iso)
  return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`
}

function howLongAgo(iso: string): string {
  const then = new Date(iso)
  const a = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime()
  const n = new Date()
  const b = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()
  const days = Math.round((b - a) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) { const w = Math.round(days / 7); return `${w} week${w === 1 ? '' : 's'} ago` }
  const m = Math.round(days / 30)
  return m < 12 ? `${m} month${m === 1 ? '' : 's'} ago` : `${Math.round(days / 365)}y ago`
}

/** "Mon 11" — short label for the comparison column chart. */
function shortDay(iso: string): string {
  const d = new Date(iso)
  return `${DOW[d.getDay()]} ${d.getDate()}`
}

export function SessionDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { sessions, sets: allSets, custom, prs, loading, refresh } = useData()
  const { unit, gender } = usePrefs()
  const L = useLayout()
  const [rows, setRows] = useState<SetRow[] | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [chartFor, setChartFor] = useState<string | null>(null)

  const session = sessions.find((x) => x.id === id)

  useEffect(() => {
    let live = true
    // instant first paint from what's already in memory, then the fetch overwrites it —
    // never trust the in-memory filter alone, since `sets` is a client cache
    setRows(allSets.filter((x) => x.session_id === id).sort((a, b) => a.set_index - b.set_index))
    getSessionSets(id).then((r) => { if (live) setRows(r) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const grouped = useMemo(() => {
    const map: Record<string, SetRow[]> = {}
    for (const r of rows ?? []) (map[r.exercise] ??= []).push(r)
    const byExVolume = new Map(volumeByExercise(rows ?? []).map((v) => [v.exercise, v]))
    return Object.entries(map).map(([exercise, list]) => {
      const ordered = list.slice().sort((a, b) => a.set_index - b.set_index)
      const agg = byExVolume.get(exercise)
      return { exercise, rows: ordered, volume: agg?.volume ?? 0, top: agg?.topWeight ?? 0, best1rm: agg?.best1rm ?? 0 }
    })
  }, [rows])

  const previous: SessionRow | undefined = useMemo(() => (session ? previousSameCategory(sessions, session) : undefined), [sessions, session])
  const cat = session ? CATALOG_BY_KEY[session.category_key] : undefined

  const bodyMapVariant = useBodyMapVariant()
  const bodyMapDataset: BodyMapDataset | undefined =
    gender === 'female' ? { BODY_VIEWBOX: FEMALE_VIEWBOX, FRONT_MUSCLES: FEMALE_FRONT, BACK_MUSCLES: FEMALE_BACK } : undefined
  const trainedMuscles = useMemo(() => musclesFromSets(rows ?? [], custom), [rows, custom])

  const volumeSpark = useMemo(() => {
    if (!session) return undefined
    const points = categorySessionVolumes(sessions, session.category_key, session.started_at, 5)
    return points.length >= 2 ? points.map((p) => p.volume) : undefined
  }, [sessions, session])

  const comparisonBars = useMemo(() => {
    if (!session) return { bars: [] as { label: string; value: number }[], highlightIndex: undefined as number | undefined }
    const points = categorySessionVolumes(sessions, session.category_key, session.started_at, 5)
    return {
      bars: points.map((p) => ({ label: shortDay(p.date), value: Math.round(fromKg(p.volume, unit)) })),
      highlightIndex: points.length ? points.length - 1 : undefined,
    }
  }, [sessions, session, unit])

  const insights = useMemo(() => {
    if (!session || rows == null) return []
    return sessionInsights({ session, rows, allSets, prs, previous, fmt: (kg) => `${fmtWeight(kg, unit)}${unit}` })
  }, [session, rows, allSets, prs, previous, unit])

  const byExercise = useMemo(() => (rows ? volumeByExercise(rows) : []), [rows])
  const totalExVolume = byExercise.reduce((a, e) => a + e.volume, 0)
  const effort = useMemo(() => (rows ? sessionEffort(rows) : null), [rows])

  if (!session && !loading) {
    return (
      <ScrollView contentContainerStyle={s.page}>
        <Pressable onPress={onBack} style={s.iconBtn}><IconArrowLeft size={18} color={C.muted2} /></Pressable>
        <EmptyState title="Workout not found" sub="It may have been deleted, or the link is out of date." />
        <Button variant="outline" onPress={onBack}>Back to history</Button>
      </ScrollView>
    )
  }

  const dVolume = previous ? (session?.total_volume_kg ?? 0) - (previous.total_volume_kg ?? 0) : null
  const dSets = previous ? (session?.total_sets ?? 0) - (previous.total_sets ?? 0) : null
  const dTime = previous ? (session?.duration_s ?? 0) - (previous.duration_s ?? 0) : null

  const hasRpe = (rows ?? []).some((r) => r.rpe != null)
  const hasWarmup = (rows ?? []).some((r) => r.is_warmup)
  const nothingTrained = trainedMuscles.size === 0

  const overview = (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {cat ? <CategoryThumb icon={session!.category_key} size={48} /> : <View style={s.blankThumb} />}
        <View style={{ flex: 1 }}>
          <T style={s.h1} numberOfLines={1}>{session?.title || cat?.title || 'Workout'}</T>
          {session ? (
            <T style={s.dateLine}>
              {fullDate(session.started_at)} <T style={{ color: alpha('#8b8b94', 0.6) }}>·</T>{' '}
              <T style={{ color: alpha(C.cyanSoft, 0.85) }}>{howLongAgo(session.started_at)}</T>
            </T>
          ) : null}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <StatTile icon={<IconClock size={11} color={alpha(C.cyan, 0.7)} />} label="Time" value={fmtDuration(session?.duration_s ?? 0)} delta={dTime == null ? null : { n: dTime, text: fmtDuration(Math.abs(dTime)) }} />
        <StatTile icon={<IconGrid size={11} color={alpha(C.cyan, 0.7)} />} label="Sets" value={String(session?.total_sets ?? 0)} delta={dSets == null ? null : { n: dSets, text: String(Math.abs(dSets)) }} />
        <StatTile icon={<IconScale size={11} color={alpha(C.cyan, 0.7)} />} label="Volume" value={fmtWeight(session?.total_volume_kg ?? 0, unit)} unit={unit} delta={dVolume == null ? null : { n: dVolume, text: fmtWeight(Math.abs(dVolume), unit) }} spark={volumeSpark} />
      </View>
      {previous ? (
        <T style={s.cmpNote}>Compared with your previous {cat?.title ?? 'workout'} session, {howLongAgo(previous.started_at)}.</T>
      ) : null}

      {rows !== null && rows.length > 0 ? (
        <View style={s.card}>
          <T style={s.cardLabel}>Muscles worked</T>
          <BodyMap trained={trainedMuscles} onPick={() => {}} variant={bodyMapVariant} dataset={bodyMapDataset} />
          {!nothingTrained ? (
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 10 }}>
              <LegendSwatch variant={bodyMapVariant} layer="primary" label="Worked" />
              <LegendSwatch variant={bodyMapVariant} layer="secondary" label="Assisting" />
            </View>
          ) : null}
        </View>
      ) : null}

      {comparisonBars.bars.length >= 2 ? (
        <View style={s.card}>
          <T style={s.cardLabel}>vs your last {comparisonBars.bars.length - 1} {cat?.title ?? 'workout'} sessions</T>
          <ColumnChart bars={comparisonBars.bars} height={100} highlightIndex={comparisonBars.highlightIndex} />
        </View>
      ) : null}
    </View>
  )

  const body = (
    <View style={{ gap: 16 }}>
      {rows === null ? (
        <View style={{ gap: 10 }}>
          {[0, 1, 2].map((i) => <View key={i} style={s.skeleton} />)}
        </View>
      ) : grouped.length === 0 ? (
        <EmptyState title="No sets recorded" sub="This session was saved without any completed sets." />
      ) : (
        <View style={{ gap: 16 }}>
          {insights.length > 0 ? (
            <View style={{ gap: 8 }}>
              {insights.map((ins) => (
                <InsightCard key={ins.id} icon={ins.icon} tone={ins.tone} text={ins.text} value={ins.value} />
              ))}
            </View>
          ) : null}

          {byExercise.length > 1 ? (
            <View style={s.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <T style={[s.cardLabel, { marginBottom: 0 }]}>Volume by exercise</T>
                {effort?.avgRpe != null ? <T style={{ fontSize: 11, color: C.muted }}>avg effort @{effort.avgRpe}</T> : null}
              </View>
              {byExercise.map((e) => (
                <MeterBar
                  key={e.exercise}
                  label={e.exercise}
                  value={e.volume}
                  max={Math.max(1, byExercise[0].volume)}
                  trailing={`${fmtWeight(e.volume, unit)}${unit} · ${totalExVolume > 0 ? Math.round((e.volume / totalExVolume) * 100) : 0}%`}
                />
              ))}
            </View>
          ) : null}

          <View style={{ gap: 10 }}>
            {grouped.map((g) => {
              const pr = prs[g.exercise]
              const isPrSet = (r: SetRow) => !r.is_warmup && r.weight_kg > 0 && pr != null && r.weight_kg >= pr.bestWeight - 0.001
              const cardIsPr = g.rows.some(isPrSet)
              return (
                <View key={g.exercise} style={[s.exCard, cardIsPr && { borderColor: alpha(C.cyan, 0.3) }]}>
                  <Pressable onPress={() => { haptic.nav(); setChartFor(g.exercise) }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <T style={s.exName} numberOfLines={1}>{g.exercise}</T>
                          {cardIsPr ? (
                            <View style={s.prTag}><IconTrophy size={9} color={C.cyan} /><T style={s.prTagText}>PR</T></View>
                          ) : null}
                        </View>
                        <T style={s.exSummary}>
                          {g.rows.length} set{g.rows.length === 1 ? '' : 's'}
                          {g.top > 0 ? ` · top ${fmtWeight(g.top, unit)}${unit}` : ''}
                          {g.best1rm > 0 ? ` · e1RM ${fmtWeight(g.best1rm, unit)}${unit}` : ''}
                        </T>
                      </View>
                    </View>
                  </Pressable>
                  <View style={{ marginTop: 10 }}>
                    <SetLadder rows={g.rows} unit={unit} isPrSet={isPrSet} />
                  </View>
                </View>
              )
            })}

            {(hasRpe || hasWarmup) ? (
              <View style={s.legend}>
                {hasWarmup ? (
                  <View style={s.row}><View style={s.legendW}><T style={{ color: C.warn, fontSize: 10, fontWeight: '800' }}>W</T></View><T style={s.legendText}>warm-up set</T></View>
                ) : null}
                {hasRpe ? (
                  <View style={s.row}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.good }} />
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.cyan }} />
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.warn }} />
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.bad }} />
                    <T style={s.legendText}>near failure — effort (RPE)</T>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      )}
    </View>
  )

  return (
    <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
      <View style={s.topRow}>
        <Pressable
          onPress={onBack}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back to history"
          style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.6 }]}
        >
          <IconArrowLeft size={18} color={C.muted2} />
        </Pressable>
        {session ? (
          <Pressable
            onPress={() => setConfirmDel(true)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Delete this workout"
            style={({ pressed }) => [s.delBtn, pressed && { opacity: 0.6 }]}
          >
            <IconTrash size={18} color={C.muted} />
          </Pressable>
        ) : null}
      </View>

      {L.columns > 1 ? (
        <View style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>
          <View style={{ width: 320 }}>{overview}</View>
          <View style={{ flex: 1, minWidth: 0 }}>{body}</View>
        </View>
      ) : (
        <View style={{ gap: 16 }}>
          {overview}
          {body}
        </View>
      )}

      <Modal open={confirmDel} onClose={() => setConfirmDel(false)} title="Delete this workout?">
        <T style={{ color: C.muted2, fontSize: 14, lineHeight: 20 }}>
          {session?.title || cat?.title || 'This workout'} from {session ? fullDate(session.started_at) : ''} will be permanently removed,
          along with its {session?.total_sets ?? 0} logged set{(session?.total_sets ?? 0) === 1 ? '' : 's'}. This can't be undone.
        </T>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
          <Button variant="ghost" style={{ flex: 1 }} onPress={() => setConfirmDel(false)} disabled={deleting}>Keep it</Button>
          <Button variant="danger" style={{ flex: 1 }} disabled={deleting} onPress={async () => {
            setDeleting(true); haptic.warn()
            await deleteSession(id); await refresh(); onBack()
          }}>{deleting ? 'Deleting…' : 'Delete'}</Button>
        </View>
      </Modal>

      <Modal open={!!chartFor} onClose={() => setChartFor(null)} title={chartFor ?? ''}>
        {chartFor ? <Progression exercise={chartFor} allSets={allSets} unit={unit} /> : null}
      </Modal>
    </ScrollView>
  )
}

function Progression({ exercise, allSets, unit }: { exercise: string; allSets: SetRow[]; unit: WeightUnit }) {
  const series = useMemo(() => exerciseSeries(allSets, exercise), [allSets, exercise])
  if (series.length < 2) {
    return <EmptyState title="Not enough history yet" sub={`Log ${exercise} once more and the progression chart appears here.`} />
  }
  const best = series.reduce((m, x) => Math.max(m, x.est1rm), 0)
  const first = series[0]
  const last = series[series.length - 1]
  const change = first.est1rm > 0 ? ((last.est1rm - first.est1rm) / first.est1rm) * 100 : 0
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 }}>
        <View>
          <T style={s.miniLabel}>Estimated 1RM</T>
          <T style={{ fontSize: 24, fontWeight: '800', color: C.cyanSoft }}>{fmtWeight(best, unit)}<T style={{ fontSize: 14, color: C.muted }}> {unit}</T></T>
        </View>
        <T style={{ fontSize: 14, fontWeight: '800', color: change > 0 ? C.good : change < 0 ? C.bad : C.muted }}>
          {change === 0 ? '±0%' : `${change > 0 ? '↑' : '↓'}${Math.abs(change).toFixed(1)}%`}
          <T style={{ fontSize: 10, color: C.muted }}> all time</T>
        </T>
      </View>
      <LineChart points={series.map((x) => ({ x: x.date, y: Math.round(fromKg(x.est1rm, unit) * 10) / 10 }))} height={130} />
      <T style={{ marginTop: 8, textAlign: 'center', fontSize: 11, color: C.muted }}>
        {series.length} sessions · {series[0].date} → {series[series.length - 1].date}
      </T>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14 }}>
        <IconChart size={16} color={C.muted2} />
        <T style={{ color: C.muted2, fontSize: 13 }}>Full progress lives on the Progress tab</T>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  page: { padding: 20, paddingBottom: 196, gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.glass },
  delBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  blankThumb: { width: 48, height: 48, borderRadius: R.md, backgroundColor: C.panel2 },
  h1: { fontSize: 21, fontWeight: '800' },
  dateLine: { marginTop: 5, fontSize: 12, color: C.muted },
  cmpNote: { marginTop: -8, fontSize: 11, lineHeight: 16, color: C.muted, paddingHorizontal: 4 },
  card: { borderRadius: 22, backgroundColor: C.glass, borderWidth: 1, borderColor: C.line, padding: 14 },
  cardLabel: { marginBottom: 10, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: C.muted, textTransform: 'uppercase' },
  skeleton: { height: 92, borderRadius: R.xl, backgroundColor: C.glass, borderWidth: 1, borderColor: C.line },
  exCard: { borderRadius: R.xl, backgroundColor: C.glass, borderWidth: 1, borderColor: C.line, padding: 14 },
  exName: { flex: 1, fontSize: 15, fontWeight: '800' },
  prTag: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: R.pill, backgroundColor: alpha(C.cyan, 0.15), paddingHorizontal: 6, paddingVertical: 2 },
  prTagText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4, color: C.cyan },
  exSummary: { marginTop: 2, fontSize: 11, color: C.muted },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, paddingHorizontal: 4, paddingTop: 4 },
  legendW: { borderRadius: 4, backgroundColor: alpha(C.warn, 0.15), paddingHorizontal: 4, paddingVertical: 1 },
  legendText: { fontSize: 10, color: C.muted },
  miniLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: C.muted, textTransform: 'uppercase' },
})
