import { useEffect, useMemo, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { C, R, alpha } from '../theme'
import { T, Modal, Button } from '../components/ui'
import { CategoryThumb, IconClose, IconPlay } from '../components/Icons'
import { CATALOG } from '../data/catalog'
import { useData } from '../lib/app-context'
import { setPlanSlot, clearPlanSlot, replacePlan } from '../lib/db'
import { WEEKDAYS } from '../lib/util'
import { haptic } from '../lib/haptics'
import { useLayout } from '../lib/layout'
import { usePullToRefresh } from '../components/Refresh'

type Grid = Record<string, Record<number, string>>
type Rect = { x: number; y: number; w: number; h: number }
const SLOTS = [1, 2]

const TEMPLATES: { name: string; plan: Record<string, string[]> }[] = [
  { name: 'Push / Pull / Legs', plan: { Monday: ['chest', 'triceps'], Tuesday: ['back', 'biceps'], Wednesday: ['legs'], Thursday: ['shoulders'], Friday: ['abs', 'cardio'] } },
  { name: 'Bro Split', plan: { Monday: ['chest'], Tuesday: ['back'], Wednesday: ['shoulders'], Thursday: ['legs'], Friday: ['biceps', 'triceps'] } },
  { name: 'Upper / Lower', plan: { Monday: ['chest', 'back'], Tuesday: ['legs'], Thursday: ['shoulders', 'biceps'], Friday: ['legs', 'triceps'] } },
  { name: 'Full Body', plan: { Monday: ['chest', 'legs'], Wednesday: ['back', 'shoulders'], Friday: ['legs', 'abs'] } },
  { name: 'PPL ×2', plan: { Monday: ['chest', 'triceps'], Tuesday: ['back', 'biceps'], Wednesday: ['legs', 'abs'], Thursday: ['shoulders', 'triceps'], Friday: ['back', 'biceps'], Saturday: ['legs', 'cardio'] } },
  { name: 'Arnold Split', plan: { Monday: ['chest', 'back'], Tuesday: ['shoulders', 'triceps'], Wednesday: ['legs', 'abs'], Thursday: ['chest', 'back'], Friday: ['shoulders', 'biceps'], Saturday: ['legs', 'cardio'] } },
  { name: 'Push / Pull', plan: { Monday: ['chest', 'triceps'], Tuesday: ['back', 'biceps'], Wednesday: ['shoulders', 'legs'], Thursday: ['chest', 'triceps'], Friday: ['back', 'biceps'] } },
  { name: '4-Day Split', plan: { Monday: ['chest', 'triceps'], Tuesday: ['back', 'biceps'], Thursday: ['shoulders', 'abs'], Friday: ['legs', 'cardio'] } },
  { name: 'Chest & Arms', plan: { Monday: ['chest', 'triceps'], Tuesday: ['back', 'biceps'], Wednesday: ['legs'], Thursday: ['shoulders', 'abs'], Friday: ['biceps', 'triceps'] } },
]

const slotKey = (day: string, slot: number) => `${day}:${slot}`
/** finger travel that cancels the pending long-press and lets the list scroll */
const DRAG_SLOP = 8
/** hold this long on a chip to pick it up; a quicker swipe scrolls the page instead */
const LONG_PRESS_MS = 220
/** how close to the edge of the list the finger must get to auto-scroll mid-drag */
const EDGE_BOTTOM = 190
const EDGE_TOP = 40
/** pixels per tick while auto-scrolling */
const EDGE_STEP = 24
/*
 * The ghost is what the user aims with, so the drop is tested at the ghost's centre
 * rather than at the finger. Testing the finger made a block land only when the chip
 * was held over the slot's outline — the chip sat a whole chip-height away from the
 * point actually being tested.
 */
const GHOST_W = 150
const GHOST_H = 44
/** how far above the finger the chip floats, so a thumb never covers it */
const GHOST_LIFT = 64
/** slop around a slot, so a drop that looks on-target is on-target */
const DROP_PAD = 10

export function Planner({ onOpenCategory }: { onOpenCategory: (key: string) => void }) {
  const L = useLayout()
  const refresher = usePullToRefresh()
  const { plan, refresh } = useData()
  const [grid, setGrid] = useState<Grid>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  // applying a template wipes every existing slot, so it is confirmed like "Clear all"
  const [pendingTpl, setPendingTpl] = useState<(typeof TEMPLATES)[number] | null>(null)

  // --- drag and drop ---------------------------------------------------------
  // Slot positions are measured at drag start rather than at layout: the day list
  // scrolls under a pinned palette, so anything measured earlier is already stale.
  const slotRefs = useRef<Record<string, View | null>>({})
  const slotRects = useRef<Record<string, Rect>>({})
  // the pinned palette covers day cards scrolled underneath it; its rect is
  // measured alongside the slots so hitTest can reject drops it would occlude
  const paletteRef = useRef<View | null>(null)
  const paletteRect = useRef<Rect | null>(null)
  // the ghost is absolutely positioned inside this screen's root, which sits below
  // the app header - finger coords are in window space, so the root's own offset
  // has to come off or the chip floats a header's height below the finger
  const rootRef = useRef<View | null>(null)
  const rootRect = useRef<Rect>({ x: 0, y: 0, w: 0, h: 0 })
  // auto-scroll plumbing so days below the fold stay reachable mid-drag
  const scrollRef = useRef<ScrollView | null>(null)
  const scrollY = useRef(0)
  const contentH = useRef(0)
  const fingerY = useRef(0)
  const autoScroll = useRef<ReturnType<typeof setInterval> | null>(null)
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const hoverRef = useRef<string | null>(null)
  const draggingRef = useRef(false)
  const ghost = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current

  // landing animation: the block settles with a spring and a cyan bloom that fades
  const pop = useRef(new Animated.Value(1)).current
  const [popKey, setPopKey] = useState<string | null>(null)
  const reduceMotion = useRef(false)
  const popRef = useRef<(k: string) => void>(() => {})

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((on) => { reduceMotion.current = on })
  }, [])

  const playPop = (k: string) => {
    if (reduceMotion.current) return
    setPopKey(k)
    pop.setValue(0)
    Animated.timing(pop, {
      toValue: 1,
      duration: 420,
      // ease-out: quick to arrive, unhurried to settle
      easing: Easing.out(Easing.back(2.2)),
      useNativeDriver: true,
    }).start(() => setPopKey(null))
  }
  popRef.current = playPop

  // assign() is called from a PanResponder created once on mount, so the handler
  // reads it through a ref instead of closing over a stale first-render copy
  const assignRef = useRef<(day: string, slot: number, key: string) => void>(() => {})

  useEffect(() => {
    const g: Grid = {}
    for (const p of plan) (g[p.day] ??= {})[p.slot] = p.category_key
    setGrid(g)
  }, [plan])

  const todayName = WEEKDAYS[(new Date().getDay() + 6) % 7]

  const assign = async (day: string, slot: number, key: string) => {
    haptic.drop()
    setGrid((g) => ({ ...g, [day]: { ...g[day], [slot]: key } }))
    setSelected(null)
    await setPlanSlot(day, slot, key)
    refresh()
  }
  assignRef.current = assign

  const clear = async (day: string, slot: number) => {
    haptic.toggleOff()
    setGrid((g) => { const d = { ...g[day] }; delete d[slot]; return { ...g, [day]: d } })
    await clearPlanSlot(day, slot)
    refresh()
  }
  const applyTemplate = async (tpl: (typeof TEMPLATES)[number]) => {
    haptic.success()
    setPendingTpl(null)
    const entries: { day: string; slot: number; category_key: string }[] = []
    for (const [day, keys] of Object.entries(tpl.plan)) keys.slice(0, 2).forEach((key, i) => entries.push({ day, slot: i + 1, category_key: key }))
    const g: Grid = {}
    entries.forEach((e) => ((g[e.day] ??= {})[e.slot] = e.category_key))
    setGrid(g)
    await replacePlan(entries)
    refresh()
  }

  const measureSlots = () => {
    const out: Record<string, Rect> = {}
    for (const [k, ref] of Object.entries(slotRefs.current)) {
      ref?.measureInWindow((x, y, w, h) => { out[k] = { x, y, w, h } })
    }
    slotRects.current = out
    paletteRect.current = null
    paletteRef.current?.measureInWindow((x, y, w, h) => { paletteRect.current = { x, y, w, h } })
    rootRef.current?.measureInWindow((x, y, w, h) => { rootRect.current = { x, y, w, h } })
  }

  const stopAutoScroll = () => {
    if (autoScroll.current) { clearInterval(autoScroll.current); autoScroll.current = null }
  }

  /** While dragging near the top or bottom edge, creep the list and re-measure. */
  const startAutoScroll = () => {
    stopAutoScroll()
    autoScroll.current = setInterval(() => {
      const root = rootRect.current
      if (!root.h) return
      const pal = paletteRect.current
      const topEdge = (pal ? pal.y + pal.h : root.y) + EDGE_TOP
      const bottomEdge = root.y + root.h - EDGE_BOTTOM
      let delta = 0
      if (fingerY.current > bottomEdge) delta = EDGE_STEP
      else if (fingerY.current < topEdge) delta = -EDGE_STEP
      if (!delta) return
      const max = Math.max(0, contentH.current - root.h)
      const next = Math.max(0, Math.min(scrollY.current + delta, max))
      if (next === scrollY.current) return
      scrollY.current = next
      scrollRef.current?.scrollTo({ y: next, animated: false })
      // positions shifted under the finger, so the drop targets must be re-read
      measureSlots()
    }, 16)
  }

  const endDrag = () => {
    if (longPress.current) { clearTimeout(longPress.current); longPress.current = null }
    stopAutoScroll()
    draggingRef.current = false
    setDragKey(null)
    setHover(null)
    hoverRef.current = null
  }

  useEffect(() => () => { stopAutoScroll(); if (longPress.current) clearTimeout(longPress.current) }, [])

  const hitTest = (px: number, py: number): string | null => {
    // anything at or above the pinned palette's bottom edge is hidden behind it
    // (or behind the header) - a slot there is not something the user can see,
    // so releasing over it must cancel rather than silently overwrite a day
    const pal = paletteRect.current
    if (pal && py <= pal.y + pal.h) return null
    for (const [k, r] of Object.entries(slotRects.current)) {
      if (
        px >= r.x - DROP_PAD && px <= r.x + r.w + DROP_PAD &&
        py >= r.y - DROP_PAD && py <= r.y + r.h + DROP_PAD
      ) return k
    }
    return null
  }

  /** Where the ghost's centre is, given the finger. This is what gets dropped. */
  const aim = (pageX: number, pageY: number) => ({ x: pageX, y: pageY - GHOST_LIFT })

  /**
   * One PanResponder per palette chip, handling BOTH tap and drag.
   *
   * Android's ScrollView intercepts touches natively and JS capture handlers cannot
   * preempt it, so the responder has to be claimed on touch-down to get a drag at all.
   * That would otherwise make the pinned palette a dead zone for scrolling, so the
   * drag only arms after a short hold: move before then and the claim is released
   * (onPanResponderTerminationRequest) and the list scrolls as usual. A release with
   * no hold and no travel is a tap.
   */
  const makeResponder = (key: string) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      // until the drag is armed, let the ScrollView take the gesture when it asks
      onPanResponderTerminationRequest: () => !draggingRef.current,
      onPanResponderGrant: (e) => {
        draggingRef.current = false
        fingerY.current = e.nativeEvent.pageY
        if (longPress.current) clearTimeout(longPress.current)
        longPress.current = setTimeout(() => {
          draggingRef.current = true
          haptic.dragStart()
          measureSlots()
          setDragKey(key)
          startAutoScroll()
        }, LONG_PRESS_MS)
      },
      onPanResponderMove: (e, g) => {
        const { pageX, pageY } = e.nativeEvent
        fingerY.current = pageY
        if (!draggingRef.current) {
          // travelled before the hold completed - this is a scroll, not a drag
          if ((Math.abs(g.dx) > DRAG_SLOP || Math.abs(g.dy) > DRAG_SLOP) && longPress.current) {
            clearTimeout(longPress.current)
            longPress.current = null
          }
          return
        }
        ghost.setValue({ x: pageX - rootRect.current.x, y: pageY - rootRect.current.y })
        const a = aim(pageX, pageY)
        const k = hitTest(a.x, a.y)
        if (k !== hoverRef.current) {
          hoverRef.current = k
          setHover(k)
          if (k) haptic.tick()
        }
      },
      onPanResponderRelease: (e) => {
        if (longPress.current) { clearTimeout(longPress.current); longPress.current = null }
        if (!draggingRef.current) {
          // released before the hold armed a drag - treat as a tap on the chip
          haptic.select()
          setSelected((x) => (x === key ? null : key))
        } else {
          const a = aim(e.nativeEvent.pageX, e.nativeEvent.pageY)
          const k = hitTest(a.x, a.y)
          if (k) {
            const [day, slot] = k.split(':')
            assignRef.current(day, Number(slot), key)
            popRef.current(k)
          }
        }
        endDrag()
      },
      onPanResponderTerminate: () => endDrag(),
    })

  // one responder per category, created once
  const responders = useMemo(
    () => Object.fromEntries(CATALOG.map((c) => [c.key, makeResponder(c.key)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const filled = useMemo(() => Object.values(grid).reduce((a, d) => a + Object.keys(d).length, 0), [grid])
  const dragCat = dragKey ? CATALOG.find((c) => c.key === dragKey) : undefined

  return (
    <View style={{ flex: 1 }} ref={rootRef} collapsable={false}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={s.page}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[2]}
        scrollEnabled={!dragKey}
        refreshControl={refresher}
        scrollEventThrottle={16}
        onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y }}
        onContentSizeChange={(_w, h) => { contentH.current = h }}
      >
        <View style={s.headRow}>
          <T style={s.h1}>Weekly Plan</T>
          {filled > 0 ? (
            <Pressable
              onPress={() => setConfirmClear(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear the whole week"
              style={({ pressed }) => [s.clearBtn, pressed && { opacity: 0.7 }]}
            >
              <T style={s.clearAll}>Clear all</T>
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
          {TEMPLATES.map((t) => (
            <Pressable
              key={t.name}
              onPress={() => { if (filled > 0) { haptic.nav(); setPendingTpl(t) } else applyTemplate(t) }}
              accessibilityRole="button"
              accessibilityLabel={`Apply the ${t.name} template`}
              style={({ pressed }) => [s.tplChip, pressed && { opacity: 0.7 }]}
            >
              <T style={s.tplChipText}>{t.name}</T>
            </Pressable>
          ))}
        </ScrollView>

        <View style={s.paletteStick}>
          <View style={s.palette} ref={paletteRef} collapsable={false}>
            <T style={s.paletteLabel}>
              {dragKey ? 'Drop on a day' : selected ? 'Tap a day to assign' : 'Hold to drag onto a day — or tap, then tap a day'}
            </T>
            <View style={s.paletteGrid}>
              {CATALOG.map((c) => {
                const on = selected === c.key
                const lifted = dragKey === c.key
                return (
                  <View
                    key={c.key}
                    style={s.palCell}
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={`${c.title} — hold to drag onto a day, or tap to select`}
                    // a View driven only by PanResponder never sees an accessibility
                    // activation, so TalkBack's double-tap needs its own handler
                    onAccessibilityTap={() => { haptic.select(); setSelected((x) => (x === c.key ? null : c.key)) }}
                    {...responders[c.key].panHandlers}
                  >
                    <View style={[s.palBtn, on ? s.palBtnOn : s.palBtnOff, lifted && { opacity: 0.35 }]}>
                      <CategoryThumb icon={c.key} size={16} color={C.cyan} />
                      <T
                        style={[s.palText, on && { color: C.cyan }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        {c.title}
                      </T>
                    </View>
                  </View>
                )
              })}
            </View>
          </View>
        </View>

        <View style={[{ gap: 8 }, L.columns > 1 && { flexDirection: 'row', flexWrap: 'wrap' }]}>
          {WEEKDAYS.map((day) => (
            <View
              key={day}
              style={[s.dayCard, L.columns > 1 && { width: '49%' }, day === todayName && s.dayCardToday]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <T style={s.dayName}>{day}</T>
                {day === todayName ? <View style={s.todayTag}><T style={s.todayTagText}>TODAY</T></View> : null}
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {SLOTS.map((slot) => {
                  const key = grid[day]?.[slot]
                  const cat = key ? CATALOG.find((c) => c.key === key) : undefined
                  const k = slotKey(day, slot)
                  const isHover = hover === k
                  return (
                    <View
                      key={slot}
                      ref={(r) => { slotRefs.current[k] = r }}
                      collapsable={false}
                      style={{ flex: 1 }}
                    >
                      <Animated.View
                        style={popKey === k ? {
                          transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) }],
                        } : undefined}
                      >
                      {popKey === k ? (
                        <Animated.View
                          pointerEvents="none"
                          style={[
                            s.bloom,
                            { opacity: pop.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.85, 0.5, 0] }) },
                          ]}
                        />
                      ) : null}
                      <Pressable
                        onPress={() => { if (selected) assign(day, slot, selected) }}
                        accessibilityRole="button"
                        accessibilityLabel={cat ? `${day} slot ${slot}: ${cat.title}` : `${day} slot ${slot}: empty`}
                        style={[
                          s.slot,
                          cat ? s.slotFilled : selected || dragKey ? s.slotArmed : s.slotEmpty,
                          isHover && s.slotHover,
                        ]}
                      >
                        {cat ? (
                          <>
                            <CategoryThumb icon={cat.key} size={22} />
                            <T style={s.slotText} numberOfLines={1}>{cat.title}</T>
                            <Pressable onPress={() => clear(day, slot)} hitSlop={10} accessibilityLabel={`Clear ${day} slot ${slot}`}>
                              <IconClose size={14} color={C.muted2} />
                            </Pressable>
                          </>
                        ) : (
                          <T style={s.slotEmptyText}>{dragKey ? 'Drop here' : selected ? 'Tap to add' : 'Empty'}</T>
                        )}
                      </Pressable>
                      </Animated.View>
                    </View>
                  )
                })}
              </View>
              {grid[day]?.[1] ? (
                <Pressable onPress={() => onOpenCategory(grid[day][1])} style={s.startRow}>
                  <IconPlay size={13} color={C.cyanSoft} />
                  <T style={s.startText}>Start {CATALOG.find((c) => c.key === grid[day][1])?.title}</T>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>

        <Modal open={!!pendingTpl} onClose={() => setPendingTpl(null)} title={pendingTpl?.name ?? ''}>
          {pendingTpl ? (
            <View style={{ gap: 14 }}>
              {/* show what you're getting — a blind swap is not a decision */}
              <View>
                <T style={s.mLabel}>THE NEW WEEK</T>
                <View style={{ gap: 6, marginTop: 8 }}>
                  {WEEKDAYS.map((day) => {
                    const keys = (pendingTpl.plan[day] ?? []).slice(0, 2)
                    return (
                      <View key={day} style={s.mDayRow}>
                        <T style={s.mDayName}>{day.slice(0, 3)}</T>
                        {keys.length ? (
                          <View style={s.mDayChips}>
                            {keys.map((k) => {
                              const c = CATALOG.find((x) => x.key === k)
                              return (
                                <View key={k} style={s.mChip}>
                                  <CategoryThumb icon={k} size={13} color={C.cyan} />
                                  <T style={s.mChipText} numberOfLines={1}>{c?.title ?? k}</T>
                                </View>
                              )
                            })}
                          </View>
                        ) : (
                          <T style={s.mRest}>Rest</T>
                        )}
                      </View>
                    )
                  })}
                </View>
              </View>

              <View style={s.mWarn} accessibilityRole="alert" accessibilityLiveRegion="polite">
                <IconClose size={14} color={C.warn} />
                <T style={s.mWarnText}>
                  Replaces your current week — {filled} planned session{filled === 1 ? '' : 's'} removed,
                  including days this template leaves as rest. Can't be undone.
                </T>
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <Button variant="ghost" style={{ flex: 1 }} onPress={() => setPendingTpl(null)}>Keep my week</Button>
                <Button style={{ flex: 1 }} onPress={() => applyTemplate(pendingTpl)}>Apply</Button>
              </View>
            </View>
          ) : null}
        </Modal>

        <Modal open={confirmClear} onClose={() => setConfirmClear(false)} title="Clear the whole week?">
          <T style={{ color: C.muted2, fontSize: 14, lineHeight: 20 }}>Every planned session will be removed. You can rebuild it from a template.</T>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
            <Button variant="ghost" style={{ flex: 1 }} onPress={() => setConfirmClear(false)}>Keep it</Button>
            <Button variant="danger" style={{ flex: 1 }} onPress={async () => { setConfirmClear(false); setGrid({}); await replacePlan([]); refresh() }}>Clear all</Button>
          </View>
        </Modal>
      </ScrollView>

      {/* the dragged chip follows the finger above everything else */}
      {dragCat ? (
        <Animated.View
          pointerEvents="none"
          style={[
            s.ghost,
            {
              width: GHOST_W,
              transform: [
                { translateX: Animated.subtract(ghost.x, GHOST_W / 2) },
                { translateY: Animated.subtract(ghost.y, GHOST_LIFT + GHOST_H / 2) },
              ],
            },
          ]}
        >
          <CategoryThumb icon={dragCat.key} size={20} color={C.cyan} />
          <T style={s.ghostText} numberOfLines={1}>{dragCat.title}</T>
        </Animated.View>
      ) : null}
    </View>
  )
}

const s = StyleSheet.create({
  page: { padding: 20, paddingBottom: 196, gap: 18 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { fontSize: 26, fontWeight: '800' },
  clearBtn: { borderRadius: R.pill, borderWidth: 1, borderColor: C.line2, paddingHorizontal: 12, paddingVertical: 6 },
  clearAll: { fontSize: 12, fontWeight: '700', color: C.muted2 },
  tplChip: { borderRadius: R.pill, borderWidth: 1, borderColor: C.line2, paddingHorizontal: 14, paddingVertical: 8 },
  tplChipText: { fontSize: 12, fontWeight: '800', color: C.muted2 },
  paletteStick: { backgroundColor: C.bg, paddingBottom: 10 },
  palette: {
    borderRadius: R.xl, borderWidth: 1, borderColor: alpha(C.cyan, 0.18),
    // a raised surface, not the same panel tone as the cards sliding beneath it
    backgroundColor: '#14141f',
    paddingHorizontal: 10, paddingVertical: 9,
    shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 10,
  },
  paletteLabel: { marginBottom: 7, paddingHorizontal: 4, fontSize: 10, fontWeight: '700', letterSpacing: 0.6, color: C.muted, textTransform: 'uppercase' },
  paletteGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  // compact chips - the palette is a pinned tool strip, not a content grid
  // 4 x 24% + three 5dp gaps overflows the palette's inner width at ~393dp and
  // wraps to three — leave the gaps room rather than claiming the full 96%
  palCell: { width: '23.5%' },
  palBtn: { alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: R.md, borderWidth: 1, paddingHorizontal: 2, paddingVertical: 6, minHeight: 44 },
  palBtnOn: { borderColor: C.cyan, backgroundColor: alpha(C.cyan, 0.15) },
  palBtnOff: { borderColor: C.line2, backgroundColor: C.white5 },
  palText: { fontSize: 9, fontWeight: '800', letterSpacing: -0.1, color: C.muted2, textAlign: 'center' },
  dayCard: { borderRadius: R.xl, borderWidth: 1, borderColor: C.line, padding: 12 },
  dayCardToday: { borderColor: alpha(C.cyan, 0.3), backgroundColor: alpha(C.cyan, 0.04) },
  dayName: { fontSize: 14, fontWeight: '800' },
  todayTag: { borderRadius: 4, backgroundColor: alpha(C.cyan, 0.15), paddingHorizontal: 6, paddingVertical: 2 },
  todayTagText: { fontSize: 10, fontWeight: '800', color: C.cyan },
  slot: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 8 },
  slotFilled: { backgroundColor: C.cyanWash2, borderWidth: 1, borderColor: alpha(C.cyan, 0.25) },
  slotArmed: { borderWidth: 1, borderStyle: 'dashed', borderColor: alpha(C.cyan, 0.4) },
  slotEmpty: { borderWidth: 1, borderStyle: 'dashed', borderColor: C.line2 },
  slotHover: { borderStyle: 'solid', borderColor: C.cyan, backgroundColor: alpha(C.cyan, 0.18) },
  slotText: { flex: 1, fontSize: 13, fontWeight: '800' },
  slotEmptyText: { flex: 1, textAlign: 'center', fontSize: 12, color: C.muted },
  startRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, borderRadius: R.md, backgroundColor: C.white5, paddingVertical: 8 },
  startText: { fontSize: 12, fontWeight: '800', color: C.cyanSoft },
  bloom: {
    position: 'absolute', left: -6, right: -6, top: -6, bottom: -6,
    borderRadius: R.lg, backgroundColor: C.cyan,
  },
  ghost: {
    position: 'absolute', left: 0, top: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: R.md, borderWidth: 1, borderColor: C.cyan, backgroundColor: '#14141f',
    paddingHorizontal: 12, paddingVertical: 10,
    shadowColor: C.cyan, shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 16,
  },
  ghostText: { fontSize: 12, fontWeight: '800', color: C.ink },
  mLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.7, color: C.muted, textTransform: 'uppercase' },
  mDayRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 30 },
  mDayName: { width: 34, fontSize: 12, fontWeight: '800', color: C.muted2 },
  mDayChips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  mChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: R.pill, backgroundColor: C.cyanWash, paddingHorizontal: 9, paddingVertical: 4 },
  mChipText: { fontSize: 11, fontWeight: '800', color: C.cyan },
  mRest: { flex: 1, fontSize: 11, color: alpha('#8b8b94', 0.7) },
  mWarn: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: R.md, borderWidth: 1, borderColor: alpha(C.warn, 0.3), backgroundColor: alpha(C.warn, 0.07), paddingHorizontal: 12, paddingVertical: 11 },
  mWarnText: { flex: 1, fontSize: 12, lineHeight: 17, color: C.ink2 },
})
