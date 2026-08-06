import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { C, R, alpha } from '../theme'
import { T, Button, Modal, EmptyState } from '../components/ui'
import { LineChart } from '../components/Charts'
import { CategoryThumb, IconArrowLeft, IconChart, IconChevronRight, IconClock, IconGrid, IconScale, IconTrash, IconTrophy } from '../components/Icons'
import { CATALOG_BY_KEY } from '../data/catalog'
import { useData, usePrefs } from '../lib/app-context'
import { getSessionSets, deleteSession } from '../lib/db'
import { exerciseSeries } from '../lib/stats'
import { epley1rm, fmtDuration, fmtWeight, fromKg, rpeColor, type WeightUnit } from '../lib/util'
import { haptic } from '../lib/haptics'
import type { SetRow, SessionRow } from '../lib/types'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Tue 16 Jun 2026" — the year matters once history goes back far enough. */
function fullDate(iso: string): string {
  const d = new Date(iso)
  return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`
}

/** "3 weeks ago" — in a history view, how long ago is the first thing you want. */
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

function setLabel(r: SetRow, unit: WeightUnit): string {
  if ((r.distance_m ?? 0) > 0) {
    const mins = (r.duration_s ?? 0) > 0 ? ` · ${Math.round(((r.duration_s ?? 0) / 60) * 10) / 10}min` : ''
    return `${r.distance_m}m${mins}`
  }
  if ((r.duration_s ?? 0) > 0) {
    const load = r.weight_kg > 0 ? ` · ${fmtWeight(r.weight_kg, unit)}${unit}` : ''
    return `${r.duration_s}s${load}`
  }
  return `${fmtWeight(r.weight_kg, unit)}×${r.reps}`
}

export function SessionDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { sessions, sets: allSets, prs, loading, refresh } = useData()
  const { unit } = usePrefs()
  const [rows, setRows] = useState<SetRow[] | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [chartFor, setChartFor] = useState<string | null>(null)

  const session = sessions.find((x) => x.id === id)

  useEffect(() => {
    let live = true
    setRows(null)
    getSessionSets(id).then((r) => { if (live) setRows(r) })
    return () => { live = false }
  }, [id])

  const grouped = useMemo(() => {
    const map: Record<string, SetRow[]> = {}
    for (const r of rows ?? []) (map[r.exercise] ??= []).push(r)
    return Object.entries(map).map(([exercise, list]) => {
      const ordered = list.slice().sort((a, b) => a.set_index - b.set_index)
      const working = ordered.filter((r) => !r.is_warmup)
      return {
        exercise, rows: ordered,
        volume: working.reduce((a, r) => a + r.weight_kg * r.reps, 0),
        top: working.reduce((b, r) => (r.weight_kg > b ? r.weight_kg : b), 0),
        best1rm: working.reduce((b, r) => Math.max(b, epley1rm(r.weight_kg, r.reps)), 0),
      }
    })
  }, [rows])

  /** the previous time this same workout was trained, for deltas */
  const previous: SessionRow | undefined = useMemo(() => {
    if (!session) return undefined
    return sessions
      .filter((x) => x.category_key === session.category_key && x.started_at < session.started_at)
      .sort((a, b) => b.started_at.localeCompare(a.started_at))[0]
  }, [sessions, session])

  const cat = session ? CATALOG_BY_KEY[session.category_key] : undefined

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
        <Tile icon={<IconClock size={12} color={alpha(C.cyan, 0.7)} />} label="Time" value={fmtDuration(session?.duration_s ?? 0)} delta={dTime == null ? null : { n: dTime, text: fmtDuration(Math.abs(dTime)) }} />
        <Tile icon={<IconGrid size={12} color={alpha(C.cyan, 0.7)} />} label="Sets" value={String(session?.total_sets ?? 0)} delta={dSets == null ? null : { n: dSets, text: String(Math.abs(dSets)) }} />
        <Tile icon={<IconScale size={12} color={alpha(C.cyan, 0.7)} />} label="Volume" value={fmtWeight(session?.total_volume_kg ?? 0, unit)} sub={unit} delta={dVolume == null ? null : { n: dVolume, text: fmtWeight(Math.abs(dVolume), unit) }} />
      </View>
      {previous ? (
        <T style={s.cmpNote}>Compared with your previous {cat?.title ?? 'workout'} session, {howLongAgo(previous.started_at)}.</T>
      ) : null}

      {rows === null ? (
        <View style={{ gap: 10 }}>
          {[0, 1, 2].map((i) => <View key={i} style={s.skeleton} />)}
        </View>
      ) : grouped.length === 0 ? (
        <EmptyState title="No sets recorded" sub="This session was saved without any completed sets." />
      ) : (
        <View style={{ gap: 10 }}>
          {grouped.map((g) => {
            const pr = prs[g.exercise]
            const isPrSet = (r: SetRow) => !r.is_warmup && r.weight_kg > 0 && pr != null && r.weight_kg >= pr.bestWeight - 0.001
            const cardIsPr = g.rows.some(isPrSet)
            return (
              <Pressable key={g.exercise} onPress={() => { haptic.nav(); setChartFor(g.exercise) }} style={[s.exCard, cardIsPr && { borderColor: alpha(C.cyan, 0.3) }]}>
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
                      {g.volume > 0 ? ` · ${fmtWeight(g.volume, unit)}${unit} vol` : ''}
                      {g.best1rm > 0 ? ` · e1RM ${fmtWeight(g.best1rm, unit)}${unit}` : ''}
                    </T>
                  </View>
                  <IconChevronRight size={15} color={alpha('#8b8b94', 0.6)} />
                </View>
                <View style={s.chipWrap}>
                  {g.rows.map((r, i) => (
                    <View key={r.id} style={[s.chip, r.is_warmup ? s.chipWarm : isPrSet(r) ? s.chipPr : s.chipPlain]}>
                      {isPrSet(r) ? <IconTrophy size={10} color={C.cyanSoft} /> : null}
                      <T style={[s.chipText, r.is_warmup && { color: C.warn }, isPrSet(r) && { color: C.cyanSoft }]}>
                        {r.is_warmup ? 'W' : i + 1}: {setLabel(r, unit)}
                      </T>
                      {r.rpe != null ? <T style={[s.chipText, { color: rpeColor(r.rpe) }]}>@{r.rpe}</T> : null}
                    </View>
                  ))}
                </View>
              </Pressable>
            )
          })}

          {(hasRpe || hasWarmup) ? (
            <View style={s.legend}>
              {hasWarmup ? (
                <View style={s.row}><View style={s.legendW}><T style={{ color: C.warn, fontSize: 10, fontWeight: '800' }}>W</T></View><T style={s.legendText}>warm-up set</T></View>
              ) : null}
              {hasRpe ? (
                <View style={s.row}>
                  <T style={{ color: C.good, fontSize: 10, fontWeight: '800' }}>@6</T>
                  <T style={s.legendText}>–</T>
                  <T style={{ color: C.bad, fontSize: 10, fontWeight: '800' }}>@10</T>
                  <T style={s.legendText}>effort (RPE), higher = harder</T>
                </View>
              ) : null}
            </View>
          ) : null}
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

function Tile({ icon, label, value, sub, delta }: { icon: ReactNode; label: string; value: string; sub?: string; delta?: { n: number; text: string } | null }) {
  const dir = delta == null ? 0 : delta.n > 0 ? 1 : delta.n < 0 ? -1 : 0
  return (
    <View style={s.tile}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' }}>
        <T style={{ fontSize: 17, fontWeight: '800' }}>{value}</T>
        {sub ? <T style={{ fontSize: 12, color: C.muted, marginLeft: 2 }}>{sub}</T> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 4 }}>
        {icon}
        <T style={s.tileLabel}>{label}</T>
      </View>
      {delta != null ? (
        <T style={[s.tileDelta, { color: dir > 0 ? C.good : dir < 0 ? C.bad : C.muted }]}>
          {dir === 0 ? '±0' : `${dir > 0 ? '↑' : '↓'}${delta.text}`}
        </T>
      ) : null}
    </View>
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
  tile: { flex: 1, borderRadius: R.xl, backgroundColor: C.white5, paddingVertical: 12, alignItems: 'center' },
  tileLabel: { fontSize: 10, letterSpacing: 0.5, color: C.muted, textTransform: 'uppercase' },
  tileDelta: { marginTop: 4, fontSize: 10, fontWeight: '800' },
  skeleton: { height: 92, borderRadius: R.xl, backgroundColor: C.glass, borderWidth: 1, borderColor: C.line },
  exCard: { borderRadius: R.xl, backgroundColor: C.glass, borderWidth: 1, borderColor: C.line, padding: 14 },
  exName: { flex: 1, fontSize: 15, fontWeight: '800' },
  prTag: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: R.pill, backgroundColor: alpha(C.cyan, 0.15), paddingHorizontal: 6, paddingVertical: 2 },
  prTagText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4, color: C.cyan },
  exSummary: { marginTop: 2, fontSize: 11, color: C.muted },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: R.sm, paddingHorizontal: 10, paddingVertical: 4 },
  chipPlain: { backgroundColor: C.white5 },
  chipWarm: { backgroundColor: alpha(C.warn, 0.15) },
  chipPr: { backgroundColor: alpha(C.cyan, 0.15), borderWidth: 1, borderColor: alpha(C.cyan, 0.25) },
  chipText: { fontSize: 12, fontWeight: '600' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, paddingHorizontal: 4, paddingTop: 4 },
  legendW: { borderRadius: 4, backgroundColor: alpha(C.warn, 0.15), paddingHorizontal: 4, paddingVertical: 1 },
  legendText: { fontSize: 10, color: C.muted },
  miniLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: C.muted, textTransform: 'uppercase' },
})
