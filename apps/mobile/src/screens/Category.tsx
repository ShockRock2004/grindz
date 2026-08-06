import { useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions, Linking } from 'react-native'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { C, R, alpha } from '../theme'
import { T, Button, Modal } from '../components/ui'
import { CategoryThumb, IconCheck, IconClose, IconDumbbell, IconPlay, IconStar } from '../components/Icons'
import { CATALOG_BY_KEY, mergeCustom, exerciseTips } from '../data/catalog'
import { youTubeWatch } from '../lib/youtube'
import { exerciseImageSource } from '../data/images'
import { useData, usePrefs, useSession } from '../lib/app-context'
import { setFavorite, deleteTemplate } from '../lib/db'
import { fmtWeight } from '../lib/util'
import { haptic } from '../lib/haptics'
import { useLayout } from '../lib/layout'
import type { ActiveSession, Exercise, TemplateRow } from '../lib/types'

export function Category({ categoryKey, onBack, onStarted }: { categoryKey: string; onBack: () => void; onStarted: () => void }) {
  const { custom, favorites, prs, templates, refresh } = useData()
  const { active, start } = useSession()
  const { unit } = usePrefs()
  const { width } = useWindowDimensions()
  const L = useLayout()
  const insets = useSafeAreaInsets()
  // tab pill (~74) + safe area + breathing room, so neither CTA nor list sits under it
  const ctaBottom = insets.bottom + 86
  const listPad = ctaBottom + 78

  const category = useMemo(() => mergeCustom(custom).find((c) => c.key === categoryKey), [custom, categoryKey])
  const base = CATALOG_BY_KEY[categoryKey]
  const [selected, setSelected] = useState<Set<string>>(() => new Set(base?.exercises.map((e) => e.name)))
  const [detail, setDetail] = useState<Exercise | null>(null)

  // reset picks when the category changes (the screen instance is reused)
  const renderedKey = useRef(categoryKey)
  if (renderedKey.current !== categoryKey) {
    renderedKey.current = categoryKey
    setSelected(new Set(base?.exercises.map((e) => e.name)))
    setDetail(null)
  }

  if (!category) {
    return (
      <View style={s.center}>
        <T style={{ color: C.muted }}>Unknown category.</T>
        <Button variant="outline" style={{ marginTop: 12 }} onPress={onBack}>Go back</Button>
      </View>
    )
  }

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      // direction matters: including and excluding should not feel identical
      if (next.has(name)) { next.delete(name); haptic.toggleOff() }
      else { next.add(name); haptic.toggleOn() }
      return next
    })
  }

  const fav = async (name: string) => {
    const on = !favorites.includes(name)
    if (on) haptic.toggleOn()
    else haptic.toggleOff()
    await setFavorite(name, on)
    await refresh()
  }

  const beginWorkout = () => {
    const picks = category.exercises.filter((e) => selected.has(e.name))
    if (!picks.length) return
    haptic.success()
    const sess: ActiveSession = {
      categoryKey: category.key,
      title: category.title,
      startedAt: Date.now(),
      exercises: picks.map((e) => ({ exercise: e.name, sets: [{ weight: 0, reps: 0, done: false }] })),
    }
    start(sess)
    onStarted()
  }

  const template = templates.find((t) => t.category_key === categoryKey)
  const quickStart = (t: TemplateRow) => {
    haptic.success()
    start({
      categoryKey: t.category_key,
      title: t.title,
      startedAt: Date.now(),
      exercises: t.exercises.map((e) => ({
        exercise: e.name,
        sets: Array.from({ length: Math.max(1, e.sets_count) }, () => ({ weight: e.last_weight, reps: e.last_reps, done: false })),
      })),
    })
    onStarted()
  }

  // derive from the stage, not the window — on a tablet the rail and the content
  // cap mean the window is far wider than the space this grid actually has
  const cols = L.size === 'expanded' ? 4 : L.size === 'medium' ? 3 : 2
  // floor, don't divide exactly: n cards plus their gaps come to precisely the
  // available width, so a fractional pixel pushes the last one onto its own row
  const cardW = Math.floor((L.stage - 40 - 12 * (cols - 1)) / cols)

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[s.page, { paddingBottom: listPad }]} showsVerticalScrollIndicator={false}>
        <View style={s.head}>
          <CategoryThumb icon={category.key} size={44} />
          <View style={{ flex: 1 }}>
            <T style={s.h1} numberOfLines={1}>{category.title}</T>
            <T style={s.sub} numberOfLines={1}>{category.subtitle}</T>
          </View>
        </View>

        {active ? (
          <Pressable onPress={onStarted} style={s.resume}>
            <T style={{ fontSize: 14 }}>You have a workout in progress. <T style={{ color: C.cyan, fontWeight: '800' }}>Resume →</T></T>
          </Pressable>
        ) : null}

        <T style={s.hint}>Tap a card for tips. Tap the check to include or exclude it.</T>

        {template ? (
          <View style={s.tplRow}>
            <View style={{ flex: 1 }}>
              <T style={s.tplTitle}>Your template</T>
              <T style={s.tplSub} numberOfLines={1}>
                {template.exercises.length} exercise{template.exercises.length === 1 ? '' : 's'} · {template.title}
              </T>
            </View>
            <Button style={{ paddingHorizontal: 14, paddingVertical: 8 }} onPress={() => quickStart(template)}>
              <View style={s.row}><IconPlay size={15} color={C.cyanInk} /><T style={s.tplBtn}>Quick start</T></View>
            </Button>
            <Pressable onPress={async () => { haptic.warn(); await deleteTemplate(template.id); await refresh() }} hitSlop={8}>
              <IconClose size={16} color={C.muted} />
            </Pressable>
          </View>
        ) : null}

        <View style={s.grid}>
          {category.exercises.map((ex) => {
            const on = selected.has(ex.name)
            const pr = prs[ex.name]
            const faved = favorites.includes(ex.name)
            // a custom exercise has no bundled illustration, but may have the
            // user's own photo — either way the card looks the same
            const src = ex.imageUri ? { uri: ex.imageUri } : exerciseImageSource(category.key, ex.img)
            return (
              <Pressable
                key={ex.name}
                onPress={() => { haptic.nav(); setDetail(ex) }}
                accessibilityRole="button"
                accessibilityLabel={`${ex.name}, tap for tips`}
                style={({ pressed }) => [s.exCard, { width: cardW }, on && s.exCardOn, pressed && { opacity: 0.85 }]}
              >
                <View style={[s.exImgWrap, { height: cardW * 0.78 }]}>
                  {src ? <Image source={src} style={s.exImg} contentFit="contain" cachePolicy="memory-disk" transition={150} /> : (
                    <IconDumbbell size={52} color={alpha(C.cyan, 0.4)} />
                  )}
                  <View style={s.exTag}><T style={s.exTagText} numberOfLines={1}>{ex.target}</T></View>
                  <Pressable
                    onPress={() => toggle(ex.name)}
                    hitSlop={10}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`Include ${ex.name}`}
                    style={[s.exCheck, on ? s.exCheckOn : s.exCheckOff]}
                  >
                    <IconCheck size={16} color={on ? C.cyanInk : 'rgba(255,255,255,0.7)'} />
                  </Pressable>
                  <Pressable
                    onPress={() => fav(ex.name)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={faved ? `Unfavourite ${ex.name}` : `Favourite ${ex.name}`}
                    style={s.exFav}
                  >
                    <IconStar size={17} color={faved ? C.cyan : 'rgba(255,255,255,0.6)'} fill={faved ? C.cyan : 'none'} />
                  </Pressable>
                </View>
                <View style={s.exBody}>
                  <T style={s.exName} numberOfLines={2}>{ex.name}</T>
                  {pr?.lastDate ? (
                    <T style={s.exLast}>Last: {fmtWeight(pr.lastWeight, unit)}{unit} × {pr.lastReps}</T>
                  ) : (
                    <T style={s.exForm} numberOfLines={2}>{ex.form}</T>
                  )}
                </View>
              </Pressable>
            )
          })}
        </View>
      </ScrollView>

      <View style={[s.cta, { bottom: ctaBottom }]}>
        <Button onPress={beginWorkout} disabled={selected.size === 0}>
          <View style={s.row}><IconPlay size={18} color={C.cyanInk} /><T style={s.ctaText}>Start Workout · {selected.size}</T></View>
        </Button>
      </View>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.name}>
        {detail ? (() => {
          const detailImage = detail.imageUri
            ? { uri: detail.imageUri }
            : exerciseImageSource(category.key, detail.img)
          const detailTips = detail.tips?.length ? detail.tips : exerciseTips(detail.name)
          const detailVideo = detail.videoUrl ? youTubeWatch(detail.videoUrl) : null
          return (
          <View>
            <View style={s.detailImgWrap}>
              {/*
                imageUri first: a custom exercise has an EMPTY `img` and an absolute Supabase
                Storage URL, so resolving only through exerciseImageSource(img) routed every
                user-uploaded photo down the "no photo" branch.
              */}
              {detailImage ? (
                <Image source={detailImage} style={s.detailImg} contentFit="contain" cachePolicy="memory-disk" transition={150} />
              ) : <IconDumbbell size={56} color={alpha(C.cyan, 0.4)} />}
            </View>
            <T style={s.detailLabel}>Form cue</T>
            <T style={s.detailText}>{detail.form}</T>
            {detailTips.length > 0 ? (
              <>
                <T style={[s.detailLabel, { marginTop: 16 }]}>Tips to improve</T>
                <View style={{ gap: 8, marginTop: 6 }}>
                  {detailTips.map((tip, i) => (
                    <View key={i} style={s.tipRow}>
                      <IconCheck size={15} color={C.cyan} />
                      <T style={s.tipText}>{tip}</T>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
            {/*
              Hands the canonical watch URL to the OS, which opens the YouTube app when it is
              installed and the browser otherwise. Rendered only when a demo actually exists —
              the catalogue helper falls back to youtube.com's homepage, which is a dead end.
            */}
            {detailVideo ? (
              <Button
                variant="outline"
                style={{ marginTop: 16 }}
                onPress={() => {
                  haptic.select()
                  void Linking.openURL(detailVideo)
                }}
              >
                View demo
              </Button>
            ) : null}
            <Button
              variant={selected.has(detail.name) ? 'outline' : 'cyan'}
              style={{ marginTop: 20 }}
              onPress={() => toggle(detail.name)}
            >
              {selected.has(detail.name) ? 'Remove from workout' : 'Add to workout'}
            </Button>
          </View>
          )
        })() : null}
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  page: { padding: 20, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  h1: { fontSize: 24, fontWeight: '800' },
  sub: { fontSize: 12, color: C.muted, marginTop: 2 },
  resume: { borderRadius: R.xl, borderWidth: 1, borderColor: alpha(C.cyan, 0.3), backgroundColor: C.cyanWash2, paddingHorizontal: 16, paddingVertical: 12 },
  hint: { fontSize: 12, color: C.muted },
  tplRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: R.xl, backgroundColor: alpha(C.cyan, 0.1), borderWidth: 1, borderColor: C.line, padding: 14 },
  tplTitle: { fontSize: 13, fontWeight: '800', color: C.cyanSoft },
  tplSub: { fontSize: 12, color: C.muted2 },
  tplBtn: { color: C.cyanInk, fontWeight: '800', fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  exCard: { borderRadius: R.xl, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  exCardOn: { borderColor: alpha(C.cyan, 0.5) },
  exImgWrap: { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  exImg: { width: '100%', height: '100%' },
  exTag: { position: 'absolute', left: 8, top: 8, maxWidth: '66%', borderRadius: R.pill, borderWidth: 1, borderColor: alpha(C.cyan, 0.4), backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 8, paddingVertical: 2 },
  exTagText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.4, color: C.cyan, textTransform: 'uppercase' },
  exCheck: { position: 'absolute', right: 8, top: 8, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  exCheckOn: { backgroundColor: C.cyan },
  exCheckOff: { backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  exFav: { position: 'absolute', right: 8, bottom: 8, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  // fixed body height keeps the two grid columns aligned whether a card shows a
  // "Last:" line or a two-line form cue
  exBody: { backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 10, paddingVertical: 9, minHeight: 74 },
  exName: { fontSize: 13, fontWeight: '800', lineHeight: 17 },
  exLast: { marginTop: 2, fontSize: 11, color: C.cyanSoft },
  exForm: { marginTop: 2, fontSize: 11, lineHeight: 15, color: C.muted2 },
  cta: { position: 'absolute', left: 16, right: 16 },
  ctaText: { color: C.cyanInk, fontSize: 15, fontWeight: '800' },
  detailImgWrap: { aspectRatio: 4 / 3, borderRadius: R.xl, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', marginBottom: 16, overflow: 'hidden' },
  detailImg: { width: '82%', height: '82%' },
  detailLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: C.muted, textTransform: 'uppercase' },
  detailText: { marginTop: 4, fontSize: 14, lineHeight: 19, color: C.ink2 },
  tipRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  tipText: { flex: 1, fontSize: 14, lineHeight: 19, color: C.ink2 },
})
