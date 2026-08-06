/*
 * Build one session out of several muscle groups.
 *
 * The old route was Home -> a category -> its exercises -> train, which models a session as
 * belonging to exactly one muscle group. A planned day frequently is not: chest and triceps
 * on the same day is one trip to the gym, and logging it meant finishing a chest session and
 * starting a triceps one for the second half.
 *
 * Mirrors apps/web/src/pages/NewWorkout.tsx. Keep the two in step — the picking rules and the
 * 'mixed' handling are the same product decision on both surfaces.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { C, R, alpha } from '../theme'
import { T } from '../components/ui'
import { CategoryThumb, IconClose, IconPlay, IconCheck } from '../components/Icons'
import { CATALOG } from '../data/catalog'
import { useData, useSession } from '../lib/app-context'
import { WEEKDAYS } from '../lib/util'
import { haptic } from '../lib/haptics'
import { useLayout } from '../lib/layout'
import type { ActiveSession } from '../lib/types'

/** The key a session gets when it spans more than one muscle group. */
export const MIXED_KEY = 'mixed'

export function BuildWorkout({ onClose, onStarted }: { onClose: () => void; onStarted: () => void }) {
  const L = useLayout()
  const { plan, custom } = useData()
  const { start } = useSession()

  const todayName = WEEKDAYS[(new Date().getDay() + 6) % 7]
  const planned = useMemo(
    () => plan.filter((p) => p.day === todayName).sort((a, b) => a.slot - b.slot).map((p) => p.category_key),
    [plan, todayName],
  )

  /** Planned groups first, then the rest — a session is allowed to wander off the plan. */
  const ordered = useMemo(() => {
    const inPlan = planned.map((k) => CATALOG.find((c) => c.key === k)).filter(Boolean) as typeof CATALOG
    return [...inPlan, ...CATALOG.filter((c) => !planned.includes(c.key))]
  }, [planned])

  const [open, setOpen] = useState<Set<string>>(() => new Set(planned.length ? planned : [CATALOG[0].key]))
  const [picked, setPicked] = useState<{ exercise: string; categoryKey: string }[]>([])
  const touched = useRef(false)

  /*
   * Open the planned groups once the plan arrives. The initial state above runs on the first
   * render, when `plan` is still loading, so without this a day planned as biceps and triceps
   * opens on chest with everything else collapsed — the opposite of the point.
   */
  useEffect(() => {
    if (touched.current || !planned.length) return
    setOpen(new Set(planned))
  }, [planned])

  const isPicked = (name: string) => picked.some((p) => p.exercise === name)
  const toggle = (name: string, categoryKey: string) => {
    haptic.select()
    setPicked((p) => (p.some((x) => x.exercise === name) ? p.filter((x) => x.exercise !== name) : [...p, { exercise: name, categoryKey }]))
  }
  const toggleGroup = (key: string) => {
    touched.current = true
    haptic.nav()
    setOpen((s) => {
      const n = new Set(s)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }

  const namesFor = (key: string) => {
    const cat = CATALOG.find((c) => c.key === key)
    const builtin = cat?.exercises.map((e) => e.name) ?? []
    const extra = custom.filter((c) => c.category_key === key).map((c) => c.name)
    return [...builtin, ...extra.filter((n) => !builtin.includes(n))]
  }

  const usedCategories = useMemo(() => [...new Set(picked.map((p) => p.categoryKey))], [picked])

  const begin = () => {
    if (!picked.length) return
    haptic.success()
    const single = usedCategories.length === 1 ? usedCategories[0] : null
    const title = single
      ? (CATALOG.find((c) => c.key === single)?.title ?? 'Workout')
      : usedCategories.map((k) => CATALOG.find((c) => c.key === k)?.title ?? k).join(' + ')
    const s: ActiveSession = {
      categoryKey: single ?? MIXED_KEY,
      title,
      startedAt: Date.now(),
      // each exercise carries its own category, so every set is filed under the muscle it
      // actually trained rather than under 'mixed'
      exercises: picked.map((p) => ({ exercise: p.exercise, categoryKey: p.categoryKey, sets: [{ weight: 0, reps: 0, done: false }] })),
    }
    start(s)
    onStarted()
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[s.page, { maxWidth: L.content, width: '100%', alignSelf: 'center' }]} showsVerticalScrollIndicator={false}>
        <View style={s.headRow}>
          <View style={{ flex: 1 }}>
            <T style={s.h1}>Build today's session</T>
            <T style={s.sub}>
              {planned.length
                ? `${todayName} is planned as ${planned.map((k) => CATALOG.find((c) => c.key === k)?.title ?? k).join(' + ')}. Pick what you'll actually do.`
                : 'Nothing planned today — pick anything you like.'}
            </T>
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cancel" style={s.closeBtn}>
            <IconClose size={16} color={C.muted2} />
          </Pressable>
        </View>

        {ordered.map((cat) => {
          const names = namesFor(cat.key)
          const chosen = picked.filter((p) => p.categoryKey === cat.key).length
          const isOpen = open.has(cat.key)
          return (
            <View key={cat.key} style={s.group}>
              <Pressable
                onPress={() => toggleGroup(cat.key)}
                accessibilityRole="button"
                accessibilityLabel={`${cat.title}, ${names.length} exercises${isOpen ? ', expanded' : ', collapsed'}`}
                style={({ pressed }) => [s.groupHead, pressed && { opacity: 0.75 }]}
              >
                <CategoryThumb icon={cat.key} size={32} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T style={s.groupTitle}>{cat.title}</T>
                  <T style={s.groupSub}>
                    {names.length} exercises{planned.includes(cat.key) ? '  ·  planned today' : ''}
                  </T>
                </View>
                {chosen > 0 ? <View style={s.count}><T style={s.countText}>{chosen}</T></View> : null}
                <T style={s.chev}>{isOpen ? '▴' : '▾'}</T>
              </Pressable>

              {isOpen ? (
                <View style={s.list}>
                  {names.map((name) => {
                    const on = isPicked(name)
                    return (
                      <Pressable
                        key={name}
                        onPress={() => toggle(name, cat.key)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={name}
                        style={({ pressed }) => [s.item, on && s.itemOn, pressed && { opacity: 0.8 }]}
                      >
                        <View style={[s.box, on && s.boxOn]}>{on ? <IconCheck size={11} color={C.cyanInk} /> : null}</View>
                        <T style={[s.itemText, on && s.itemTextOn]} numberOfLines={1}>{name}</T>
                      </Pressable>
                    )
                  })}
                </View>
              ) : null}
            </View>
          )
        })}
      </ScrollView>

      {/* a fixed bar: the list is eight collapsible groups deep, and a control you have to
          scroll to find is a control that gets missed */}
      <View style={s.bar}>
        <T style={s.barText} numberOfLines={1}>
          {picked.length === 0
            ? 'Choose at least one exercise'
            : `${picked.length} exercise${picked.length === 1 ? '' : 's'}${usedCategories.length > 1 ? ` across ${usedCategories.length} groups` : ''}`}
        </T>
        <Pressable
          onPress={begin}
          disabled={!picked.length}
          accessibilityRole="button"
          accessibilityLabel="Start the workout"
          style={({ pressed }) => [s.startBtn, !picked.length && s.startBtnOff, pressed && picked.length > 0 && { opacity: 0.85 }]}
        >
          <IconPlay size={14} color={picked.length ? C.cyanInk : C.muted} />
          <T style={[s.startText, !picked.length && { color: C.muted }]}>Start</T>
        </Pressable>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  page: { padding: 20, paddingBottom: 130, gap: 10 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 4 },
  h1: { fontSize: 24, fontWeight: '800' },
  sub: { marginTop: 4, fontSize: 13, lineHeight: 19, color: C.muted },
  closeBtn: { borderRadius: R.md, borderWidth: 1, borderColor: C.line2, padding: 8 },
  group: { borderRadius: R.xl, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  groupTitle: { fontSize: 15, fontWeight: '800' },
  groupSub: { marginTop: 2, fontSize: 11, color: C.muted },
  count: { borderRadius: R.pill, backgroundColor: C.cyan, paddingHorizontal: 8, paddingVertical: 2 },
  countText: { fontSize: 11, fontWeight: '800', color: C.cyanInk },
  chev: { fontSize: 14, color: C.muted },
  list: { gap: 6, borderTopWidth: 1, borderTopColor: C.line, padding: 12 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, borderRadius: R.md, borderWidth: 1, borderColor: C.line2, paddingHorizontal: 12, paddingVertical: 10 },
  itemOn: { borderColor: C.cyan, backgroundColor: alpha(C.cyan, 0.15) },
  itemText: { flex: 1, fontSize: 13, color: C.muted2 },
  itemTextOn: { color: C.cyan, fontWeight: '800' },
  box: { width: 18, height: 18, borderRadius: 5, borderWidth: 1, borderColor: C.line2, alignItems: 'center', justifyContent: 'center' },
  boxOn: { borderColor: C.cyan, backgroundColor: C.cyan },
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderTopWidth: 1, borderTopColor: C.line, backgroundColor: '#0a0a0f',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28,
  },
  barText: { flex: 1, fontSize: 12, color: C.muted },
  startBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: R.md, backgroundColor: C.cyan, paddingHorizontal: 20, paddingVertical: 12 },
  startBtnOff: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.line2 },
  startText: { fontSize: 13, fontWeight: '800', color: C.cyanInk },
})
