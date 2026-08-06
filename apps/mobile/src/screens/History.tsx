import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { C, R, alpha } from '../theme'
import { T, Button, EmptyState } from '../components/ui'
import { Heatmap } from '../components/Charts'
import { CategoryThumb, IconChevronLeft, IconChevronRight, IconClose, IconFlame, IconHistory, IconPlay, IconSearch } from '../components/Icons'
import { CATALOG, CATALOG_BY_KEY } from '../data/catalog'
import { useData, usePrefs } from '../lib/app-context'
import { currentStreak, volumeByDay } from '../lib/stats'
import { dateKey, fmtDuration, fmtWeight, relativeDay } from '../lib/util'
import { haptic } from '../lib/haptics'
import { usePullToRefresh } from '../components/Refresh'
import { useLayout } from '../lib/layout'
import type { SessionRow } from '../lib/types'

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKS_PER_PAGE = 4

/** Monday (local) of the week containing the given date. */
function mondayOf(iso: string | Date): Date {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

function ordinal(n: number): string {
  const suffix = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0]}`
}

/** "This week" / "Last week" / "2nd week of July 2026" */
function weekLabel(monday: Date, thisKey: string, lastKey: string): string {
  const key = dateKey(monday)
  if (key === thisKey) return 'This week'
  if (key === lastKey) return 'Last week'
  return `${ordinal(Math.ceil(monday.getDate() / 7))} week of ${MONTHS_LONG[monday.getMonth()]} ${monday.getFullYear()}`
}

interface WeekGroup { key: string; label: string; sessions: SessionRow[]; volume: number }

function groupByWeek(sessions: SessionRow[]): WeekGroup[] {
  const thisKey = dateKey(mondayOf(new Date()))
  const lastMon = mondayOf(new Date())
  lastMon.setDate(lastMon.getDate() - 7)
  const lastKey = dateKey(lastMon)

  const map = new Map<string, SessionRow[]>()
  for (const s of sessions) {
    const k = dateKey(mondayOf(s.started_at))
    const list = map.get(k)
    if (list) list.push(s)
    else map.set(k, [s])
  }
  const groups: WeekGroup[] = []
  for (const [k, list] of map) {
    const [y, m, dd] = k.split('-').map(Number)
    groups.push({
      key: k,
      label: weekLabel(new Date(y, m - 1, dd), thisKey, lastKey),
      sessions: list.slice().sort((a, b) => b.started_at.localeCompare(a.started_at)),
      volume: list.reduce((a, x) => a + (x.total_volume_kg ?? 0), 0),
    })
  }
  return groups.sort((a, b) => b.key.localeCompare(a.key))
}

export function History({ onOpenSession, onStart }: { onOpenSession: (id: string) => void; onStart: () => void }) {
  const L = useLayout()
  const refresher = usePullToRefresh()
  const { sessions, loading } = useData()
  const { unit } = usePrefs()
  const streak = currentStreak(sessions)
  const heat = volumeByDay(sessions)
  /*
   * Filter + search.
   *
   * History was a flat reverse-chronological list with a pager. Finding "that leg day
   * where I hit 105" meant paging through every week. Filtering by muscle group and
   * searching by title narrows first, then the weeks regroup around what is left.
   */
  const [cat, setCat] = useState<string | null>(null)
  const [q, setQ] = useState('')

  /** only offer groups the user has actually trained */
  const cats = useMemo(() => {
    const keys = new Set(sessions.map((x) => x.category_key))
    return CATALOG.filter((c) => keys.has(c.key))
  }, [sessions])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return sessions.filter((x) => {
      if (cat && x.category_key !== cat) return false
      if (!needle) return true
      const title = (x.title || CATALOG_BY_KEY[x.category_key]?.title || '').toLowerCase()
      return title.includes(needle)
    })
  }, [sessions, cat, q])

  const groups = useMemo(() => groupByWeek(filtered), [filtered])
  const filtering = !!cat || q.trim().length > 0

  const [page, setPage] = useState(0)
  useEffect(() => { setPage(0) }, [cat, q])
  const pageCount = Math.max(1, Math.ceil(groups.length / WEEKS_PER_PAGE))
  // deleting the last session on a page can shrink the list out from under us
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1)
  }, [page, pageCount])

  const visible = groups.slice(page * WEEKS_PER_PAGE, page * WEEKS_PER_PAGE + WEEKS_PER_PAGE)

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={s.page}
      showsVerticalScrollIndicator={false}
      refreshControl={refresher}
      keyboardShouldPersistTaps="handled"
      bottomOffset={28}
    >
      <View style={s.headRow}>
        <T style={s.h1}>History</T>
        <View style={s.streak} accessibilityLabel={`Current streak: ${streak} days`}>
          <IconFlame size={16} color={C.cyan} />
          <T style={s.streakText}>{streak}</T>
          <T style={s.streakUnit}>day{streak === 1 ? '' : 's'}</T>
        </View>
      </View>

      <View style={s.card}>
        <T style={s.cardLabel}>Last 16 weeks</T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Heatmap dayVolumes={heat} unit={unit} />
        </ScrollView>
      </View>

      {sessions.length > 0 ? (
        <View style={{ gap: 10 }}>
          <View style={s.searchWrap}>
            <IconSearch size={15} color={C.muted} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search workouts"
              placeholderTextColor={C.muted}
              style={s.search}
              accessibilityLabel="Search workouts by name"
              returnKeyType="search"
            />
            {q.length > 0 ? (
              <Pressable onPress={() => { haptic.toggleOff(); setQ('') }} hitSlop={10} accessibilityLabel="Clear search">
                <IconClose size={15} color={C.muted2} />
              </Pressable>
            ) : null}
          </View>

          {cats.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
              <Pressable
                onPress={() => { haptic.select(); setCat(null) }}
                accessibilityRole="tab"
                accessibilityState={{ selected: cat === null }}
                style={[s.chip, cat === null && s.chipOn]}
              >
                <T style={[s.chipText, cat === null && { color: C.cyanInk }]}>All</T>
              </Pressable>
              {cats.map((c) => {
                const on = cat === c.key
                return (
                  <Pressable
                    key={c.key}
                    onPress={() => { haptic.select(); setCat(on ? null : c.key) }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    style={[s.chip, on && s.chipOn]}
                  >
                    <T style={[s.chipText, on && { color: C.cyanInk }]}>{c.title}</T>
                  </Pressable>
                )
              })}
            </ScrollView>
          ) : null}

          {filtering ? (
            <T style={s.filterNote} accessibilityLiveRegion="polite">
              {filtered.length} of {sessions.length} workouts
              {cat ? ` · ${CATALOG_BY_KEY[cat]?.title}` : ''}
            </T>
          ) : null}
        </View>
      ) : null}

      {sessions.length === 0 ? (
        !loading && (
          <View style={{ gap: 16, alignItems: 'center' }}>
            <EmptyState title="No workouts logged yet" sub="Finish your first session and it'll appear here, building your streak and heatmap." />
            <Button onPress={onStart}><View style={s.btnRow}><IconPlay size={18} color={C.cyanInk} /><T style={s.btnLabel}>Start a workout</T></View></Button>
          </View>
        )
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No workouts match"
          sub="Try a different muscle group, or clear the search."
        />
      ) : (
        <View style={{ gap: 20 }}>
          {visible.map((g) => (
            <View key={g.key} style={[{ gap: 8 }, L.columns > 1 && { flexDirection: 'row', flexWrap: 'wrap' }]}>
              <View style={s.groupHead}>
                <T style={s.groupTitle} numberOfLines={1}>{g.label}</T>
                <T style={s.groupMeta}>
                  {g.sessions.length} session{g.sessions.length === 1 ? '' : 's'} · {fmtWeight(g.volume, unit)}{unit}
                </T>
              </View>
              {g.sessions.map((row) => {
                const cat = CATALOG_BY_KEY[row.category_key]
                return (
                  <Pressable
                    key={row.id}
                    onPress={() => { haptic.nav(); onOpenSession(row.id) }}
                    style={[s.sessionRow, L.columns > 1 && { width: '49%' }]}
                  >
                    {cat ? <CategoryThumb icon={row.category_key} size={44} /> : (
                      <View style={s.fallbackThumb}><IconHistory size={20} color={C.cyan} /></View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <T style={s.sessionTitle} numberOfLines={1}>{row.title || cat?.title || 'Workout'}</T>
                      <T style={s.sessionMeta}>
                        {relativeDay(row.started_at)} · {fmtDuration(row.duration_s ?? 0)} · {row.total_sets ?? 0} sets
                      </T>
                    </View>
                    <View style={s.volCol}>
                      <T style={s.vol} numberOfLines={1}>{fmtWeight(row.total_volume_kg ?? 0, unit)}</T>
                      <T style={s.volUnit}>{unit} vol</T>
                    </View>
                    <IconChevronRight size={16} color={C.muted} />
                  </Pressable>
                )
              })}
            </View>
          ))}

          {pageCount > 1 && (
            <View style={s.pager}>
              <Pressable
                onPress={() => { if (page > 0) { haptic.pageTurn(); setPage(page - 1) } }}
                style={[s.pageBtn, page === 0 && { opacity: 0.35 }]}
              >
                <IconChevronLeft size={15} color={page === 0 ? C.muted : C.ink2} />
                <T style={[s.pageBtnText, page === 0 && { color: C.muted }]}>Newer</T>
              </Pressable>
              <T style={s.pageInfo}>Page {page + 1} of {pageCount}</T>
              <Pressable
                onPress={() => { if (page < pageCount - 1) { haptic.pageTurn(); setPage(page + 1) } }}
                style={[s.pageBtn, page >= pageCount - 1 && { opacity: 0.35 }]}
              >
                <T style={[s.pageBtnText, page >= pageCount - 1 && { color: C.muted }]}>Older</T>
                <IconChevronRight size={15} color={page >= pageCount - 1 ? C.muted : C.ink2} />
              </Pressable>
            </View>
          )}
        </View>
      )}
    </KeyboardAwareScrollView>
  )
}

const s = StyleSheet.create({
  page: { padding: 20, paddingBottom: 196, gap: 20 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { fontSize: 26, fontWeight: '800' },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: R.pill, backgroundColor: C.cyanWash, paddingHorizontal: 12, paddingVertical: 6 },
  streakText: { color: C.cyan, fontWeight: '800' },
  streakUnit: { color: C.cyanSoft, fontSize: 11, fontWeight: '700' },
  volCol: { alignItems: 'flex-end', width: 78 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderRadius: R.md, borderWidth: 1, borderColor: C.line2, backgroundColor: C.panel, paddingHorizontal: 12 },
  search: { flex: 1, color: C.ink, fontSize: 14 },
  chips: { gap: 6, paddingHorizontal: 2 },
  chip: { minHeight: 32, justifyContent: 'center', borderRadius: R.pill, borderWidth: 1, borderColor: C.line2, paddingHorizontal: 13 },
  chipOn: { backgroundColor: C.cyan, borderColor: C.cyan },
  chipText: { fontSize: 11, fontWeight: '800', color: C.muted2 },
  filterNote: { paddingHorizontal: 4, fontSize: 11, fontWeight: '600', color: C.muted },
  card: { borderRadius: 26, backgroundColor: C.glass, borderWidth: 1, borderColor: C.line, padding: 16 },
  cardLabel: { marginBottom: 12, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: C.muted, textTransform: 'uppercase' },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnLabel: { color: C.cyanInk, fontSize: 15, fontWeight: '800' },
  groupHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, paddingHorizontal: 2 },
  groupTitle: { flex: 1, fontSize: 14, fontWeight: '800' },
  groupMeta: { fontSize: 12, color: C.muted },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: R.xl, backgroundColor: C.glass, borderWidth: 1, borderColor: C.line, padding: 14 },
  fallbackThumb: { width: 44, height: 44, borderRadius: R.md, backgroundColor: C.cyanWash, alignItems: 'center', justifyContent: 'center' },
  sessionTitle: { fontSize: 15, fontWeight: '800' },
  sessionMeta: { fontSize: 12, color: C.muted, marginTop: 2 },
  vol: { fontSize: 14, fontWeight: '800', color: C.cyanSoft },
  volUnit: { fontSize: 10, color: C.muted },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
  // 44dp minimum touch target - the pager was 32dp tall
  pageBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, minWidth: 92, borderRadius: R.md, borderWidth: 1, borderColor: C.line2, paddingHorizontal: 14, paddingVertical: 8 },
  pageBtnText: { fontSize: 12, fontWeight: '800', color: C.ink2 },
  pageInfo: { fontSize: 12, fontWeight: '600', color: C.muted },
})
