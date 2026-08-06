import { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'

import { Image } from 'expo-image'
import { useKeepAwake } from 'expo-keep-awake'
import { C, R, alpha } from '../theme'
import { T, Button, Modal, NumInput, EmptyState, Celebration } from '../components/ui'
import { IconArrowLeft, IconCheck, IconClose, IconDumbbell, IconLink, IconPlus, IconStar, IconTrophy } from '../components/Icons'
import { mergeCustom, exerciseMode, categoryOf, CATALOG_BY_KEY } from '../data/catalog'
import { exerciseImageSourceByName } from '../data/images'
import { useData, usePrefs, useSession } from '../lib/app-context'
import { lastPerformance } from '../lib/stats'
import { saveTemplate } from '../lib/db'
import { epley1rm, fmtDuration, fmtWeight, fromKg, toKg, rpeColor, type WeightUnit } from '../lib/util'
import { haptic } from '../lib/haptics'
import type { ActiveSession, SetEntry, SetRow, CustomExerciseRow, TemplateExercise } from '../lib/types'

export function Session({ onExit, onSaved }: { onExit: () => void; onSaved: () => void }) {
  const { active, update, finish, discard } = useSession()
  const { sets, prs, custom, favorites } = useData()
  const { unit } = usePrefs()
  useKeepAwake()

  const [now, setNow] = useState(Date.now())
  const [picker, setPicker] = useState(false)
  const [summary, setSummary] = useState(false)
  const [celebrate, setCelebrate] = useState<{ exercise: string; text: string }[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState(false)
  const [asTemplate, setAsTemplate] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const earnedPRs = useMemo(() => {
    const out: { exercise: string; text: string }[] = []
    if (!active) return out
    active.exercises.forEach((e) => {
      const logged = e.sets.filter((x) => x.reps > 0 && !x.warmup)
      if (!logged.length) return
      const maxW = Math.max(...logged.map((x) => x.weight))
      const max1 = Math.max(...logged.map((x) => epley1rm(x.weight, x.reps)))
      const prev = prs[e.exercise]
      if (maxW > 0 && (!prev || maxW > prev.bestWeight + 0.001)) out.push({ exercise: e.exercise, text: `${fmtWeight(maxW, unit)} ${unit} top set` })
      else if (prev && max1 > prev.best1rm + 0.5) out.push({ exercise: e.exercise, text: `Est. 1RM ${fmtWeight(max1, unit)} ${unit}` })
    })
    return out
  }, [active, prs, unit])

  if (!active) {
    return celebrate ? (
      <Celebration prs={celebrate} onDone={() => { setCelebrate(null); onSaved() }} />
    ) : (
      <View style={s.center}><EmptyState title="No active workout" sub="Pick a muscle group and hit Start Workout." /></View>
    )
  }

  const elapsed = Math.floor((now - active.startedAt) / 1000)

  const mutEx = (i: number, fn: (e: ActiveSession['exercises'][number]) => ActiveSession['exercises'][number]) =>
    update((sn) => ({ ...sn, exercises: sn.exercises.map((e, k) => (k === i ? fn(e) : e)) }))

  const setSetField = (ei: number, si: number, patch: Partial<SetEntry>) =>
    mutEx(ei, (e) => ({ ...e, sets: e.sets.map((st, k) => (k === si ? { ...st, ...patch } : st)) }))

  const toggleDone = (ei: number, si: number) => {
    const st = active.exercises[ei].sets[si]
    if (st.done) haptic.toggleOff()
    else haptic.toggleOn()
    setSetField(ei, si, !st.done ? { done: true } : { done: false, rpe: undefined })
  }

  /** Abs work can be logged either way, so those cards expose a reps/time toggle. */
  const setMode = (ei: number, mode: 'reps' | 'timed') => { haptic.select(); mutEx(ei, (e) => ({ ...e, mode })) }

  const addSet = (ei: number) => {
    haptic.select()
    mutEx(ei, (e) => {
      const last = e.sets[e.sets.length - 1]
      return { ...e, sets: [...e.sets, { weight: last?.weight ?? 0, reps: last?.reps ?? 0, done: false, duration_s: last?.duration_s, distance_m: last?.distance_m }] }
    })
  }
  const removeSet = (ei: number, si: number) => mutEx(ei, (e) => ({ ...e, sets: e.sets.filter((_, k) => k !== si) }))
  const removeExercise = (ei: number) => update((sn) => ({ ...sn, exercises: sn.exercises.filter((_, k) => k !== ei) }))
  const setNote = (ei: number, note: string) => mutEx(ei, (e) => ({ ...e, note }))

  /** Pair with the exercise above. Group ids are shared and checked with !== undefined. */
  const toggleSuperset = (ei: number) => {
    if (ei === 0) return
    haptic.select()
    update((sn) => {
      const exs = sn.exercises
      const cur = exs[ei]
      if (cur.ss !== undefined) {
        const gid = cur.ss
        const others = exs.filter((e, k) => k !== ei && e.ss === gid)
        const dissolve = others.length <= 1
        return { ...sn, exercises: exs.map((e, k) => (k === ei || (dissolve && e.ss === gid) ? { ...e, ss: undefined } : e)) }
      }
      const prev = exs[ei - 1]
      const gid = prev.ss ?? Math.max(-1, ...exs.map((e) => e.ss ?? -1)) + 1
      return { ...sn, exercises: exs.map((e, k) => (k === ei || k === ei - 1 ? { ...e, ss: gid } : e)) }
    })
  }

  const addExercise = (name: string) => {
    haptic.success()
    update((sn) => ({ ...sn, exercises: [...sn.exercises, { exercise: name, sets: [{ weight: 0, reps: 0, done: false }] }] }))
    setPicker(false)
  }

  const setHasWork = (x: SetEntry) => x.reps > 0 || (x.duration_s ?? 0) > 0 || (x.distance_m ?? 0) > 0
  const doneSets = active.exercises.reduce((a, e) => a + e.sets.filter(setHasWork).length, 0)
  const volume = active.exercises.reduce((a, e) => a + e.sets.reduce((b, x) => b + (x.reps > 0 ? x.weight * x.reps : 0), 0), 0)

  const save = async () => {
    setSaving(true)
    setSaveErr(false)
    if (asTemplate) {
      const tmpl: TemplateExercise[] = active.exercises.map((e) => {
        const working = e.sets.filter((x) => !x.warmup)
        const last = working[working.length - 1] ?? e.sets[e.sets.length - 1]
        return { name: e.exercise, sets_count: e.sets.length, last_weight: last?.weight ?? 0, last_reps: last?.reps ?? 0 }
      })
      await saveTemplate(active.categoryKey, active.title, tmpl)
    }
    const saved = await finish()
    setSaving(false)
    if (!saved) { setSaveErr(true); return }
    setSummary(false)
    if (earnedPRs.length) setCelebrate(earnedPRs)
    else onSaved()
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.header}>
        <Pressable onPress={onExit} style={s.iconBtn} accessibilityLabel="Minimize"><IconArrowLeft size={18} color={C.muted2} /></Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <T style={s.hTitle} numberOfLines={1}>{active.title}</T>
          <T style={s.hMeta}>
            {fmtDuration(elapsed)} · {doneSets} sets{volume > 0 ? ` · ${fmtWeight(volume, unit)}${unit}` : ''}
          </T>
        </View>
        <Button style={{ paddingHorizontal: 16, paddingVertical: 8 }} onPress={() => setSummary(true)}>
          <T style={{ color: C.cyanInk, fontWeight: '800', fontSize: 14 }}>Finish</T>
        </Button>
      </View>

      {/*
        * KeyboardAwareScrollView, not ScrollView: it tracks the focused TextInput and scrolls
        * it above the keyboard. A plain ScrollView (or KeyboardAvoidingView) only ever pads or
        * shrinks the container — under Android edge-to-edge it does not even get that, which
        * is why the weight/reps fields on the last exercise of a long session were unreachable.
        * bottomOffset keeps the caret clear of the keyboard rather than flush against it.
        */}
      <KeyboardAwareScrollView
        contentContainerStyle={s.page}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bottomOffset={28}
      >
        {active.exercises.map((e, ei) => (
          <ExerciseCard
            key={`${e.exercise}-${ei}`}
            name={e.exercise}
            sets={e.sets}
            note={e.note ?? ''}
            superset={e.ss !== undefined}
            canSuperset={ei > 0}
            mode={e.mode ?? exerciseMode(e.exercise, custom)}
            canChooseMode={categoryOf(e.exercise, custom)?.key === 'abs'}
            lastPerf={lastPerformance(sets, e.exercise)}
            best={prs[e.exercise]?.bestWeight ?? 0}
            unit={unit}
            onMode={(m) => setMode(ei, m)}
            onToggleDone={(si) => toggleDone(ei, si)}
            onField={(si, patch) => setSetField(ei, si, patch)}
            onAddSet={() => addSet(ei)}
            onRemoveSet={(si) => removeSet(ei, si)}
            onWarmup={(si, w) => setSetField(ei, si, { warmup: w })}
            onNote={(n) => setNote(ei, n)}
            onSuperset={() => toggleSuperset(ei)}
            onRemove={() => removeExercise(ei)}
            onRpe={(si, rpe) => { haptic.tick(); setSetField(ei, si, { rpe }) }}
          />
        ))}

        <Pressable onPress={() => setPicker(true)} style={s.addEx}>
          <IconPlus size={18} color={C.muted2} />
          <T style={{ color: C.muted2, fontWeight: '800', fontSize: 14 }}>Add exercise</T>
        </Pressable>

        <Pressable onPress={() => { discard(); onExit() }} style={{ paddingVertical: 10 }}>
          <T style={{ textAlign: 'center', fontSize: 14, color: C.muted }}>Discard workout</T>
        </Pressable>
      </KeyboardAwareScrollView>

      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={addExercise} custom={custom} sets={sets} favorites={favorites} categoryKey={active.categoryKey} />

      <Modal open={summary} onClose={() => setSummary(false)} title="Finish workout?">
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Tile label="Time" value={fmtDuration(elapsed)} />
          <Tile label="Sets" value={String(doneSets)} />
          <Tile label="Volume" value={fmtWeight(volume, unit)} sub={unit} />
        </View>
        {earnedPRs.length > 0 ? (
          <View style={s.prBox}>
            <View style={s.row}><IconTrophy size={16} color={C.cyanSoft} /><T style={{ color: C.cyanSoft, fontWeight: '800' }}>{earnedPRs.length} new PR{earnedPRs.length > 1 ? 's' : ''}</T></View>
            {earnedPRs.map((p, i) => <T key={i} style={{ color: C.ink2, fontSize: 13, marginTop: 4 }}><T style={{ fontWeight: '700' }}>{p.exercise}</T> — {p.text}</T>)}
          </View>
        ) : null}
        {doneSets === 0 ? <T style={s.warn}>Log at least one set to save.</T> : null}
        {saveErr ? <T style={s.saveErr}>Couldn't sync right now — your workout is safe on this device. Check your connection and tap Save again.</T> : null}

        <Pressable onPress={() => { haptic.select(); setAsTemplate((v) => !v) }} style={s.tglRow}>
          <View style={{ flex: 1 }}>
            <T style={{ fontWeight: '800', fontSize: 14 }}>Save as template</T>
            <T style={{ color: C.muted, fontSize: 12 }}>Quick-start this workout next time</T>
          </View>
          <View style={[s.tgl, asTemplate && { backgroundColor: C.cyan }]}>
            <View style={[s.tglDot, asTemplate && { left: 22 }]} />
          </View>
        </Pressable>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
          <Button variant="ghost" style={{ flex: 1 }} onPress={() => setSummary(false)} disabled={saving}>Keep going</Button>
          <Button style={{ flex: 1 }} onPress={save} disabled={doneSets === 0 || saving}>
            {saving ? 'Saving…' : saveErr ? 'Try again' : 'Save workout'}
          </Button>
        </View>
      </Modal>

      {celebrate ? <Celebration prs={celebrate} onDone={() => { setCelebrate(null); onSaved() }} /> : null}
    </View>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={s.tile}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' }}>
        <T style={{ fontSize: 19, fontWeight: '800' }}>{value}</T>
        {sub ? <T style={{ fontSize: 12, color: C.muted, marginLeft: 2 }}>{sub}</T> : null}
      </View>
      <T style={s.tileLabel}>{label}</T>
    </View>
  )
}

function ExerciseCard(p: {
  name: string; sets: SetEntry[]; note: string; superset: boolean; canSuperset: boolean
  mode: 'reps' | 'timed' | 'distance'; canChooseMode: boolean; unit: WeightUnit
  lastPerf: { date: string; sets: { weight: number; reps: number }[] } | null; best: number
  onMode: (m: 'reps' | 'timed') => void
  onToggleDone: (si: number) => void; onField: (si: number, patch: Partial<SetEntry>) => void
  onAddSet: () => void; onRemoveSet: (si: number) => void; onWarmup: (si: number, w: boolean) => void
  onNote: (n: string) => void; onSuperset: () => void; onRemove: () => void; onRpe: (si: number, rpe: number) => void
}) {
  const [showNote, setShowNote] = useState(!!p.note)
  const unitLabel = p.unit === 'lbs' ? 'Lbs' : 'Kg'
  const headers = p.mode === 'timed' ? ['Sec', unitLabel] : p.mode === 'distance' ? ['Dist (m)', 'Min'] : [unitLabel, 'Reps']
  const lp = p.lastPerf
  const lastText = p.mode === 'reps' && lp ? lp.sets.map((x) => `${fmtWeight(x.weight, p.unit)}×${x.reps}`).join('  ') : null
  const lastWeightIn = (si: number) => {
    const w = lp?.sets[si]?.weight
    return w == null ? undefined : Math.round(fromKg(w, p.unit) * 10) / 10
  }
  const src = exerciseImageSourceByName(p.name)
  const doneCount = p.sets.filter((x) => x.done).length

  return (
    <View style={[s.exCard, p.superset && { borderColor: alpha(C.cyan, 0.3) }]}>
      <View style={[s.progressBar, { width: `${(doneCount / Math.max(1, p.sets.length)) * 100}%` }]} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {src ? <Image source={src} style={s.exThumb} contentFit="contain" cachePolicy="memory-disk" transition={150} /> : null}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <T style={s.exTitle}>{p.name}</T>
                {p.superset ? <View style={s.ssTag}><T style={s.ssTagText}>Superset</T></View> : null}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 5 }}>
                {p.mode === 'reps'
                  ? lastText
                    ? <T style={{ fontSize: 11, color: C.cyanSoft }}>Last: {lastText}</T>
                    : <T style={{ fontSize: 11, color: C.muted }}>First time — set the bar</T>
                  : <T style={{ fontSize: 11, color: C.muted }}>{p.mode === 'timed' ? 'Hold for time' : 'Distance & time'}</T>}
                {p.best > 0 && p.mode === 'reps' ? <T style={{ fontSize: 11, color: C.muted }}>PR {fmtWeight(p.best, p.unit)}{p.unit}</T> : null}
              </View>
              {p.canChooseMode ? (
                <View style={s.modeTgl}>
                  {(['reps', 'timed'] as const).map((m) => (
                    <Pressable key={m} onPress={() => p.onMode(m)} style={[s.modeBtn, p.mode === m && { backgroundColor: C.cyan }]}>
                      <T style={[s.modeText, p.mode === m && { color: C.cyanInk }]}>{m === 'reps' ? 'Reps' : 'Time'}</T>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
            <Pressable
              onPress={p.canSuperset ? p.onSuperset : undefined}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={p.superset ? 'Remove from superset' : 'Superset with the next exercise'}
              style={[s.miniBtn, !p.canSuperset && { opacity: 0.3 }]}
            >
              <IconLink size={16} color={p.superset ? C.cyan : C.muted} />
            </Pressable>
            <Pressable
              onPress={p.onRemove}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${p.name} from this workout`}
              style={s.miniBtn}
            >
              <IconClose size={16} color={C.muted} />
            </Pressable>
          </View>

          <View style={{ marginTop: 12, gap: 6 }}>
            <View style={s.setHead}>
              <T style={[s.colSet, s.headText]}>Set</T>
              <T style={[s.colField, s.headText]}>{headers[0]}</T>
              <T style={[s.colField, s.headText]}>{headers[1]}</T>
              <T style={[s.colDone, s.headText]}>Done</T>
            </View>
            {p.sets.map((st, si) => (
              // the row and its RPE strip are one block when done, so a finished set
              // reads as a single soft card rather than two mismatched rectangles
              <View key={si} style={[s.setBlock, st.done && s.setBlockDone]}>
                <View style={s.setRow}>
                  <Pressable onPress={() => p.onWarmup(si, !st.warmup)} style={[s.warmBtn, st.warmup && { backgroundColor: alpha(C.warn, 0.2) }]}>
                    <T style={[s.warmText, st.warmup && { color: C.warn }]}>{st.warmup ? 'W' : si + 1}</T>
                  </Pressable>
                  {p.mode === 'timed' ? (
                    <>
                      <NumInput style={s.colField} value={st.duration_s ?? 0} onChange={(v) => p.onField(si, { duration_s: v })} placeholder="sec" suffix="s" integer />
                      <NumInput style={s.colField} value={fromKg(st.weight, p.unit)} onChange={(v) => p.onField(si, { weight: toKg(v, p.unit) })} placeholder={lastWeightIn(si)} />
                    </>
                  ) : p.mode === 'distance' ? (
                    <>
                      <NumInput style={s.colField} value={st.distance_m ?? 0} onChange={(v) => p.onField(si, { distance_m: v })} placeholder="m" suffix="m" integer />
                      <NumInput style={s.colField} value={st.duration_s ? Math.round((st.duration_s / 60) * 10) / 10 : 0} onChange={(v) => p.onField(si, { duration_s: Math.round(v * 60) })} placeholder="min" />
                    </>
                  ) : (
                    <>
                      <NumInput style={s.colField} value={fromKg(st.weight, p.unit)} onChange={(v) => p.onField(si, { weight: toKg(v, p.unit) })} placeholder={lastWeightIn(si)} />
                      <NumInput style={s.colField} value={st.reps} onChange={(v) => p.onField(si, { reps: v })} placeholder={lp?.sets[si]?.reps} integer />
                    </>
                  )}
                  <View style={[s.colDone, { flexDirection: 'row', gap: 4, justifyContent: 'center' }]}>
                    <Pressable
                      onPress={() => p.onToggleDone(si)}
                      hitSlop={8}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: st.done }}
                      accessibilityLabel={`Set ${si + 1} done`}
                      style={[s.doneBtn, st.done && { backgroundColor: C.cyan, borderColor: C.cyan }]}
                    >
                      <IconCheck size={16} color={st.done ? C.cyanInk : alpha('#8b8b94', 0.5)} />
                    </Pressable>
                    {p.sets.length > 1 ? (
                      <Pressable
                        onPress={() => p.onRemoveSet(si)}
                        hitSlop={14}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete set ${si + 1}`}
                      >
                        <IconClose size={14} color={C.muted} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
                {st.done ? (
                  <View style={s.rpeRow}>
                    <T style={s.rpeLabel}>RPE</T>
                    {[6, 7, 8, 9, 10].map((n) => (
                      <Pressable key={n} onPress={() => p.onRpe(si, n)} style={[s.rpeBtn, st.rpe === n && { backgroundColor: alpha(rpeColor(n), 0.2) }]}>
                        <T style={[s.rpeText, st.rpe === n && { color: rpeColor(n) }]}>{n}</T>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 14, marginTop: 10, alignItems: 'center' }}>
            <Pressable onPress={p.onAddSet} style={s.row}><IconPlus size={14} color={C.cyanSoft} /><T style={{ color: C.cyanSoft, fontSize: 12, fontWeight: '800' }}>Add set</T></Pressable>
            <Pressable onPress={() => setShowNote((v) => !v)}><T style={{ color: C.muted, fontSize: 12, fontWeight: '600' }}>{showNote ? 'Hide note' : 'Note'}</T></Pressable>
          </View>
          {showNote ? (
            <TextInput
              value={p.note}
              onChangeText={p.onNote}
              placeholder="Note (e.g. felt heavy, drop set…)"
              placeholderTextColor={C.muted}
              style={s.noteInput}
            />
          ) : null}
        </View>
      </View>
    </View>
  )
}

function ExercisePicker({ open, onClose, onPick, custom, sets, favorites, categoryKey }: {
  open: boolean; onClose: () => void; onPick: (name: string) => void
  custom: CustomExerciseRow[]; sets: SetRow[]; favorites: string[]; categoryKey: string
}) {
  const [q, setQ] = useState('')
  const cats = mergeCustom(custom)
  const query = q.trim().toLowerCase()

  const recent = (() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const st of sets) {
      if (st.category_key !== categoryKey || seen.has(st.exercise)) continue
      seen.add(st.exercise); out.push(st.exercise)
      if (out.length >= 5) break
    }
    return out
  })()
  const favInCat = (() => {
    const cat = CATALOG_BY_KEY[categoryKey]
    const names = new Set<string>([
      ...(cat?.exercises.map((e) => e.name) ?? []),
      ...custom.filter((c) => c.category_key === categoryKey).map((c) => c.name),
    ])
    return favorites.filter((f) => names.has(f))
  })()

  return (
    <Modal open={open} onClose={onClose} title="Add exercise">
      <TextInput value={q} onChangeText={setQ} placeholder="Search exercises…" placeholderTextColor={C.muted} style={s.search} />
      {!query && (recent.length > 0 || favInCat.length > 0) ? (
        <View style={{ gap: 12, marginBottom: 12 }}>
          {recent.length > 0 ? (
            <View>
              <T style={s.pickLabel}>Recently used</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {recent.map((n) => <Pressable key={n} onPress={() => onPick(n)} style={s.pill}><T style={s.pillText}>{n}</T></Pressable>)}
              </View>
            </View>
          ) : null}
          {favInCat.length > 0 ? (
            <View>
              <T style={s.pickLabel}>Favorites</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {favInCat.map((n) => (
                  <Pressable key={n} onPress={() => onPick(n)} style={s.pill}>
                    <IconStar size={12} color={C.cyan} /><T style={s.pillText}>{n}</T>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
      {cats.map((c) => {
        const list = c.exercises.filter((e) => !query || e.name.toLowerCase().includes(query))
        if (!list.length) return null
        return (
          <View key={c.key} style={{ marginBottom: 14 }}>
            <T style={s.pickLabel}>{c.title}</T>
            <View style={{ gap: 4 }}>
              {list.map((e) => (
                <Pressable key={e.name} onPress={() => onPick(e.name)} style={s.pickRow}>
                  <IconDumbbell size={15} color={alpha(C.cyan, 0.7)} />
                  <T style={{ flex: 1, fontSize: 14 }} numberOfLines={1}>{e.name}</T>
                  <IconPlus size={15} color={C.muted} />
                </Pressable>
              ))}
            </View>
          </View>
        )
      })}
    </Modal>
  )
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: C.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(7,7,11,0.95)',
  },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.glass },
  hTitle: { fontSize: 14, fontWeight: '800' },
  hMeta: { fontSize: 12, color: C.cyanSoft, marginTop: 2 },
  page: { padding: 18, paddingBottom: 60, gap: 12 },
  exCard: { borderRadius: 22, backgroundColor: C.glass, borderWidth: 1, borderColor: C.line, padding: 14, overflow: 'hidden' },
  progressBar: { position: 'absolute', left: 0, top: 0, height: 2, backgroundColor: C.cyan },
  exThumb: { width: 84, height: 84, borderRadius: 16, backgroundColor: '#000' },
  exTitle: { fontSize: 15, fontWeight: '800', lineHeight: 20 },
  ssTag: { borderRadius: 4, backgroundColor: alpha(C.cyan, 0.15), paddingHorizontal: 6, paddingVertical: 2 },
  ssTagText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4, color: C.cyan, textTransform: 'uppercase' },
  modeTgl: { flexDirection: 'row', alignSelf: 'flex-start', marginTop: 8, borderRadius: R.sm, borderWidth: 1, borderColor: C.line2, padding: 2 },
  modeBtn: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  modeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, color: C.muted, textTransform: 'uppercase' },
  miniBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  setHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6, marginBottom: 2 },
  headText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: C.muted, textTransform: 'uppercase' },
  colSet: { width: 28 },
  colField: { flex: 1, textAlign: 'center' },
  colDone: { width: 52, textAlign: 'center' },
  setBlock: { borderRadius: 16, borderWidth: 1, borderColor: 'transparent' },
  // a soft tint with a hairline edge, not a hard filled box
  setBlockDone: { backgroundColor: alpha(C.cyan, 0.055), borderColor: alpha(C.cyan, 0.16) },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 6, paddingVertical: 7 },
  warmBtn: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: C.white5 },
  warmText: { fontSize: 12, fontWeight: '800', color: C.muted2 },
  doneBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: C.line2, alignItems: 'center', justifyContent: 'center' },
  // sits inside the done block now, so it needs a divider rather than its own fill
  rpeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginHorizontal: 8, marginBottom: 6, paddingHorizontal: 4, paddingTop: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: alpha(C.cyan, 0.18) },
  rpeLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6, color: C.muted, textTransform: 'uppercase', marginRight: 2 },
  rpeBtn: { flex: 1, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  rpeText: { fontSize: 12, fontWeight: '800', color: C.muted },
  noteInput: { marginTop: 8, borderRadius: R.md, borderWidth: 1, borderColor: C.line2, backgroundColor: C.panel2, color: C.ink, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 },
  addEx: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: R.xl, borderWidth: 1, borderStyle: 'dashed', borderColor: C.line2, paddingVertical: 16 },
  tile: { flex: 1, borderRadius: R.xl, backgroundColor: C.white5, paddingVertical: 12, alignItems: 'center' },
  tileLabel: { marginTop: 4, fontSize: 10, letterSpacing: 0.5, color: C.muted, textTransform: 'uppercase' },
  prBox: { marginTop: 16, borderRadius: R.xl, borderWidth: 1, borderColor: alpha(C.cyan, 0.3), backgroundColor: C.cyanWash2, padding: 12 },
  warn: { marginTop: 16, textAlign: 'center', fontSize: 14, color: C.muted },
  saveErr: { marginTop: 16, borderRadius: R.md, borderWidth: 1, borderColor: alpha(C.warn, 0.3), backgroundColor: alpha(C.warn, 0.1), color: C.warn, padding: 10, textAlign: 'center', fontSize: 13 },
  tglRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, borderRadius: R.xl, borderWidth: 1, borderColor: C.line, paddingHorizontal: 16, paddingVertical: 12 },
  tgl: { width: 44, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center' },
  tglDot: { position: 'absolute', left: 2, width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  search: { marginBottom: 12, borderRadius: R.md, borderWidth: 1, borderColor: C.line2, backgroundColor: C.panel2, color: C.ink, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  pickLabel: { marginBottom: 6, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: C.muted, textTransform: 'uppercase' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: R.pill, backgroundColor: C.white5, paddingHorizontal: 12, paddingVertical: 7 },
  pillText: { fontSize: 12, fontWeight: '600', color: C.ink2 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: R.md, backgroundColor: 'rgba(255,255,255,0.03)', paddingHorizontal: 12, paddingVertical: 10 },
})
