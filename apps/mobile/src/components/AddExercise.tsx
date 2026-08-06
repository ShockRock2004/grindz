import { useEffect, useState } from 'react'
import { ActivityIndicator, Image, Pressable, StyleSheet, TextInput, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { uploadExerciseImage, MAX_BYTES } from '../lib/storage'
import { youTubeId, youTubeWatch } from '../lib/youtube'
import { C, R, alpha } from '../theme'
import { T, Button, Modal } from './ui'
import { CategoryThumb, IconCheck, IconChevronLeft, IconClose, IconPlus, IconTrophy } from './Icons'
import { CATALOG } from '../data/catalog'
import { addCustom } from '../lib/db'
import { getGroqKey, setGroqKey } from '../lib/groq'
import { validateExercise, testGroqKey, type Verdict } from '../lib/exercise-ai'
import { haptic } from '../lib/haptics'

const EQUIPMENT = ['Barbell', 'Dumbbell', 'Machine', 'Cable', 'Bodyweight', 'Kettlebell', 'Band', 'Other']

const SECONDARY = [
  'Chest', 'Upper Back', 'Lats', 'Traps', 'Front Delts', 'Side Delts', 'Rear Delts',
  'Biceps', 'Triceps', 'Forearms', 'Core', 'Obliques', 'Glutes', 'Quads', 'Hamstrings', 'Calves',
]

const MODES: { key: 'reps' | 'timed' | 'distance'; label: string; hint: string }[] = [
  { key: 'reps', label: 'Weight & reps', hint: 'Most lifts — log a load and a rep count' },
  { key: 'timed', label: 'Time', hint: 'Planks, holds, stretches — log seconds' },
  { key: 'distance', label: 'Distance', hint: 'Cardio — log metres, optionally with time' },
]

const STEPS = ['Exercise', 'Muscles', 'Logging', 'Review']

export function AddExercise({
  open, onClose, onSaved, defaultCategory,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  defaultCategory?: string
}) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [equipment, setEquipment] = useState('')
  const [categoryKey, setCategoryKey] = useState(defaultCategory ?? CATALOG[0].key)
  const [secondary, setSecondary] = useState<string[]>([])
  const [mode, setMode] = useState<'reps' | 'timed' | 'distance'>('reps')

  const [checking, setChecking] = useState(false)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [hasKey, setHasKey] = useState(true)
  const [keyDraft, setKeyDraft] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [keyError, setKeyError] = useState<string | null>(null)

  const [image, setImage] = useState<string | null>(null)
  const [imageB64, setImageB64] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [imgErr, setImgErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [degraded, setDegraded] = useState(false)

  // reset every time the sheet is reopened, so a previous draft never leaks in
  useEffect(() => {
    if (!open) return
    setStep(0); setName(''); setNameTouched(false); setEquipment('')
    setCategoryKey(defaultCategory ?? CATALOG[0].key)
    setSecondary([]); setMode('reps')
    setVerdict(null); setAiError(null); setKeyDraft(''); setKeyError(null)
    setImage(null); setImgErr(null); setDegraded(false)
    setSaving(false); setSaved(false)
    getGroqKey().then((k) => setHasKey(!!k))
  }, [open, defaultCategory])

  const trimmed = name.trim()
  const nameError = trimmed.length === 0 ? 'Give the exercise a name.' : trimmed.length < 3 ? 'A bit longer, please.' : null
  const canAdvance = step === 0 ? !nameError : true

  const toggleSecondary = (m: string) => {
    haptic.select()
    setSecondary((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : prev.length >= 3 ? prev : [...prev, m]))
  }

  const pickImage = async () => {
    setImgErr(null)
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      setImgErr('Photo access is off. Enable it in system settings to add a picture.')
      return
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      /*
       * Square, to match the catalogue: 29 of the 34 built-in photos are 1512x1512, and every
       * container renders with contain-fit. Cropping to 4:3 — which this used to do — produced
       * a photo that letterboxed in its own card and sat visibly smaller than the built-in
       * beside it.
       */
      aspect: [1, 1],
      /*
       * Raised from 0.5, then from 0.8, and matched to the web path's WebP quality. 0.5 was
       * chosen when the image was stored inline on the database row as a base64 string, where
       * every byte was paid on every read. It goes to object storage now, so the old reason is
       * gone and anything below ~0.9 is throwing away detail for a saving that does not matter.
       */
      quality: 0.92,
      base64: true,
    })
    if (res.canceled) return
    const b64 = res.assets?.[0]?.base64
    if (!b64) {
      setImgErr("Couldn't read that image. Try another one.")
      return
    }
    /*
     * Was `b64.length > 900_000` — base64 is 4 chars per 3 bytes, so that rejected anything
     * over ~659 KB while the bucket and MAX_BYTES both allow 5 MB. Another leftover from the
     * base64-in-the-database era, and a bad one: a square crop of a modern phone photo clears
     * 659 KB easily, and the message told the user to "crop it tighter" when cropping does not
     * reduce resolution. There was no action that would make it succeed.
     *
     * Compare decoded bytes against the same MAX_BYTES the uploader enforces, so there is one
     * limit rather than two that disagree.
     */
    const bytes = Math.ceil((b64.length * 3) / 4)
    if (bytes > MAX_BYTES) {
      setImgErr(`That image is ${(bytes / 1048576).toFixed(1)} MB — the limit is 5 MB.`)
      return
    }
    haptic.success()
    // the data URI is for the on-screen preview only. It must NOT reach the database — a
    // 1-2 MB string in a text column bloats every read of that row and is re-sent in full to
    // everyone the exercise is shared with. `imageB64` is what gets uploaded to storage.
    setImage(`data:image/jpeg;base64,${b64}`)
    setImageB64(b64)
  }

  const runCheck = async () => {
    setChecking(true)
    setAiError(null)
    setVerdict(null)
    try {
      const v = await validateExercise({ name: trimmed, categoryKey, equipment, secondary, mode })
      setVerdict(v)
      haptic.success()
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Check failed.')
      haptic.warn()
    } finally {
      setChecking(false)
    }
  }

  // step 4 kicks the check off by itself — making the user press a button to
  // find out whether their entry is valid is a step with no decision in it
  useEffect(() => {
    if (step === 3 && hasKey && !verdict && !checking && !aiError) void runCheck()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, hasKey])

  const saveKey = async () => {
    const k = keyDraft.trim()
    if (!k) return
    setSavingKey(true)
    setKeyError(null)
    const works = await testGroqKey(k)
    if (!works) {
      setKeyError("That key didn't work. Check it and try again.")
      setSavingKey(false)
      return
    }
    await setGroqKey(k)
    setSavingKey(false)
    setHasKey(true)
    setKeyDraft('')
    void runCheck()
  }

  /** What actually gets stored — the verdict's corrections win if the user kept them. */
  const finalName = verdict?.canonicalName || trimmed
  const finalCategory = verdict?.categoryKey || categoryKey
  const finalSecondary = verdict?.secondary.length ? verdict.secondary : secondary
  const finalCue = verdict?.formCue || ''

  const save = async () => {
    setSaving(true)
    // no dedicated columns for equipment / secondary muscles yet, so they ride
    // along in `target`, which is what the exercise card shows as its tag
    const target = [equipment, ...finalSecondary].filter(Boolean).join(' · ') || 'Custom'

    // Upload first, then insert. A failed upload still saves the exercise without a photo —
    // losing a picture is a far smaller failure than losing the whole entry.
    let uploadedUrl: string | null = null
    if (imageB64) {
      const up = await uploadExerciseImage(imageB64, finalName)
      uploadedUrl = up.url
      if (up.error) setImgErr(up.error)
    }

    const { row, degraded: lost } = await addCustom(finalCategory, finalName, target, finalCue, {
      mode,
      imageUrl: uploadedUrl ?? undefined,
      videoUrl: youTubeWatch(videoUrl) ?? undefined,
      secondary: finalSecondary,
      tips: verdict?.tips ?? [],
      equipment,
    })
    setSaving(false)
    if (!row) {
      setAiError("Couldn't save that. Check your connection and try again.")
      return
    }
    haptic.success()
    setDegraded(lost)
    setSaved(true)
    onSaved()
    // a dropped photo is worth reading before the sheet closes itself
    setTimeout(onClose, lost ? 2600 : 900)
  }

  const cat = CATALOG.find((c) => c.key === finalCategory)

  return (
    <Modal open={open} onClose={onClose} title={saved ? 'Exercise added' : 'Add exercise'} maxHeight="88%">
      {saved ? (
        <View style={s.doneWrap}>
          <View style={s.doneIcon}><IconCheck size={30} color={C.cyan} /></View>
          <T style={s.doneTitle}>{finalName}</T>
          <T style={s.doneSub}>Added to {cat?.title ?? 'your exercises'}.</T>
          {degraded ? (
            <T style={s.doneWarn} accessibilityRole="alert">
              Saved, but your photo and logging type couldn't be stored — this project is missing the
              `mode` and `image_url` columns on workout_custom_exercises.
            </T>
          ) : null}
        </View>
      ) : (
        <>
          {/* progress — a multi-step form has to say where you are */}
          <View style={s.steps} accessibilityLabel={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}>
            {STEPS.map((label, i) => (
              <View key={label} style={{ flex: 1, gap: 5 }}>
                <View style={[s.stepBar, i <= step && { backgroundColor: C.cyan }]} />
                <T style={[s.stepLabel, i === step && { color: C.cyan }]} numberOfLines={1}>{label}</T>
              </View>
            ))}
          </View>

          {step === 0 && (
            <View style={{ gap: 18 }}>
              <View style={{ gap: 7 }}>
                <T style={s.label}>Exercise name</T>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  onBlur={() => setNameTouched(true)}
                  placeholder="e.g. Incline Dumbbell Press"
                  placeholderTextColor={C.muted}
                  style={[s.input, nameTouched && nameError ? s.inputBad : null]}
                  autoFocus
                  returnKeyType="next"
                  accessibilityLabel="Exercise name"
                />
                {nameTouched && nameError ? (
                  <T style={s.err} accessibilityRole="alert" accessibilityLiveRegion="polite">{nameError}</T>
                ) : (
                  <T style={s.hint}>Type it however you like — we'll tidy the name up at the end.</T>
                )}
              </View>

              <View style={{ gap: 8 }}>
                <T style={s.label}>Photo <T style={s.optional}>· optional</T></T>
                <T style={s.hint}>
                  Crop to a square — that is how the built-in photos are shaped, so it fills the card
                  instead of letterboxing.
                </T>
                {image ? (
                  <View style={s.photoWrap}>
                    {/*
                      `contain`, not `cover`. The picker crops to a square, and every surface
                      that later draws this photo uses contentFit="contain" — so a `cover`
                      preview in a 4:3 box sliced the top and bottom off a square the user had
                      just framed, showing them less than they were actually going to get.
                    */}
                    <Image source={{ uri: image }} style={s.photo} resizeMode="contain" />
                    <Pressable
                      onPress={() => { haptic.toggleOff(); setImage(null) }}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel="Remove photo"
                      style={s.photoX}
                    >
                      <IconClose size={15} color={C.ink} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={pickImage}
                    accessibilityRole="button"
                    accessibilityLabel="Add a photo"
                    style={({ pressed }) => [s.photoAdd, pressed && { opacity: 0.7 }]}
                  >
                    <IconPlus size={18} color={C.cyan} />
                    <T style={s.photoAddText}>Add a photo</T>
                  </Pressable>
                )}
                {imgErr ? (
                  <T style={s.err} accessibilityRole="alert" accessibilityLiveRegion="polite">{imgErr}</T>
                ) : (
                  <T style={s.hint}>Shown on the exercise card, like the built-in illustrations.</T>
                )}
              </View>

              <View style={{ gap: 8 }}>
                <T style={s.label}>Equipment <T style={s.optional}>· optional</T></T>
                <View style={s.chips}>
                  {EQUIPMENT.map((e) => {
                    const on = equipment === e
                    return (
                      <Pressable
                        key={e}
                        onPress={() => { haptic.select(); setEquipment(on ? '' : e) }}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        style={[s.chip, on ? s.chipOn : s.chipOff]}
                      >
                        <T style={[s.chipText, on && { color: C.cyanInk }]}>{e}</T>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            </View>
          )}

          {step === 1 && (
            <View style={{ gap: 18 }}>
              <View style={{ gap: 8 }}>
                <T style={s.label}>Primary muscle group</T>
                <T style={s.hint}>This decides which workout the exercise shows up in.</T>
                <View style={s.grid}>
                  {CATALOG.map((c) => {
                    const on = categoryKey === c.key
                    return (
                      <Pressable
                        key={c.key}
                        onPress={() => { haptic.select(); setCategoryKey(c.key) }}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        style={[s.groupBtn, on ? s.groupOn : s.groupOff]}
                      >
                        <CategoryThumb icon={c.key} size={18} color={on ? C.cyan : C.muted2} />
                        <T style={[s.groupText, on && { color: C.cyan }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                          {c.title}
                        </T>
                      </Pressable>
                    )
                  })}
                </View>
              </View>

              <View style={{ gap: 8 }}>
                <T style={s.label}>
                  Also works <T style={s.optional}>· optional, up to 3</T>
                </T>
                <View style={s.chips}>
                  {SECONDARY.map((m) => {
                    const on = secondary.includes(m)
                    const full = !on && secondary.length >= 3
                    return (
                      <Pressable
                        key={m}
                        onPress={() => toggleSecondary(m)}
                        disabled={full}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on, disabled: full }}
                        style={[s.chip, on ? s.chipOn : s.chipOff, full && { opacity: 0.35 }]}
                      >
                        <T style={[s.chipText, on && { color: C.cyanInk }]}>{m}</T>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            </View>
          )}

          {step === 2 && (
            <View style={{ gap: 10 }}>
              <T style={s.label}>How will you log it?</T>
              {MODES.map((m) => {
                const on = mode === m.key
                return (
                  <Pressable
                    key={m.key}
                    onPress={() => { haptic.select(); setMode(m.key) }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={[s.modeRow, on && s.modeOn]}
                  >
                    <View style={[s.radio, on && { borderColor: C.cyan }]}>
                      {on ? <View style={s.radioDot} /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <T style={[s.modeTitle, on && { color: C.cyan }]}>{m.label}</T>
                      <T style={s.modeHint}>{m.hint}</T>
                    </View>
                  </Pressable>
                )
              })}
            </View>
          )}

          {step === 3 && (
            <View style={{ gap: 14 }}>
              {!hasKey ? (
                <View style={s.keyCard}>
                  <T style={s.keyTitle}>Check this with AI</T>
                  <T style={s.hint}>
                    Paste your Groq API key to have the exercise checked and a form cue written for you.
                    Optional — you can skip this and fill the details in yourself.
                  </T>
                  <TextInput
                    value={keyDraft}
                    onChangeText={setKeyDraft}
                    placeholder="gsk_…"
                    placeholderTextColor={C.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                    style={[s.input, { marginTop: 10 }, keyError ? s.inputBad : null]}
                    accessibilityLabel="Groq API key"
                  />
                  {keyError ? (
                    <T style={s.err} accessibilityRole="alert" accessibilityLiveRegion="polite">{keyError}</T>
                  ) : null}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                    <Button variant="ghost" style={{ flex: 1 }} onPress={() => setHasKey(true)}>Skip check</Button>
                    <Button style={{ flex: 1 }} onPress={saveKey} disabled={!keyDraft.trim() || savingKey}>
                      {savingKey ? 'Checking…' : 'Save key'}
                    </Button>
                  </View>
                </View>
              ) : checking ? (
                <View style={s.busy}>
                  <ActivityIndicator color={C.cyan} />
                  <T style={s.hint}>Checking “{trimmed}”…</T>
                </View>
              ) : aiError ? (
                <View style={s.warnCard} accessibilityRole="alert" accessibilityLiveRegion="polite">
                  <T style={s.warnText}>{aiError}</T>
                  <Pressable onPress={runCheck} hitSlop={8} style={{ marginTop: 8 }}>
                    <T style={s.link}>Try again</T>
                  </Pressable>
                </View>
              ) : verdict && !verdict.recognised ? (
                <View style={s.warnCard} accessibilityRole="alert" accessibilityLiveRegion="polite">
                  <T style={s.warnTitle}>That doesn't look like an exercise</T>
                  <T style={s.warnText}>
                    We couldn't match “{trimmed}” to a known movement. You can go back and rename it, or save it anyway.
                  </T>
                </View>
              ) : null}

              {/* the review card — always shown, so saving without a check still has a summary */}
              <View style={s.review}>
                <View style={s.reviewHead}>
                  {image ? (
                    <Image source={{ uri: image }} style={s.reviewPhoto} resizeMode="contain" />
                  ) : cat ? <CategoryThumb icon={cat.key} size={34} /> : null}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T style={s.reviewName} numberOfLines={2}>{finalName || 'Unnamed exercise'}</T>
                    <T style={s.reviewMeta} numberOfLines={1}>
                      {cat?.title}{equipment ? ` · ${equipment}` : ''} · {MODES.find((m) => m.key === mode)?.label}
                    </T>
                  </View>
                  {verdict?.recognised ? (
                    <View style={s.okBadge}><IconCheck size={13} color={C.cyan} /></View>
                  ) : null}
                </View>

                {finalSecondary.length > 0 && (
                  <View style={s.reviewRow}>
                    <T style={s.reviewLabel}>ALSO WORKS</T>
                    <View style={s.chipsTight}>
                      {finalSecondary.map((m) => (
                        <View key={m} style={s.tag}><T style={s.tagText}>{m}</T></View>
                      ))}
                    </View>
                  </View>
                )}

                {finalCue ? (
                  <View style={s.reviewRow}>
                    <T style={s.reviewLabel}>FORM CUE</T>
                    <T style={s.cue}>{finalCue}</T>
                  </View>
                ) : null}

                {verdict?.notes.length ? (
                  <View style={s.reviewRow}>
                    <T style={s.reviewLabel}>WE CHANGED</T>
                    {verdict.notes.map((n, i) => (
                      <View key={i} style={s.noteRow}>
                        <IconTrophy size={12} color={C.warn} />
                        <T style={s.noteText}>{n}</T>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            </View>
          )}

          {/* footer */}
          <View style={s.footer}>
            {step > 0 ? (
              <Pressable
                onPress={() => { haptic.nav(); setStep((x) => x - 1) }}
                accessibilityRole="button"
                accessibilityLabel="Back a step"
                style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.6 }]}
              >
                <IconChevronLeft size={16} color={C.ink2} />
                <T style={s.backText}>Back</T>
              </Pressable>
            ) : (
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.6 }]}
              >
                <IconClose size={15} color={C.muted2} />
                <T style={s.backText}>Cancel</T>
              </Pressable>
            )}
            {step < STEPS.length - 1 ? (
              <Button
                style={{ flex: 1 }}
                disabled={!canAdvance}
                onPress={() => {
                  if (!canAdvance) { setNameTouched(true); return }
                  haptic.nav()
                  setStep((x) => x + 1)
                }}
              >
                Next
              </Button>
            ) : (
              <Button style={{ flex: 1 }} onPress={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save exercise'}
              </Button>
            )}
          </View>
        </>
      )}
    </Modal>
  )
}

const s = StyleSheet.create({
  steps: { flexDirection: 'row', gap: 6, marginBottom: 20 },
  stepBar: { height: 3, borderRadius: 2, backgroundColor: C.line2 },
  stepLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4, color: C.muted, textTransform: 'uppercase' },

  label: { fontSize: 13, fontWeight: '800' },
  optional: { fontSize: 11, fontWeight: '600', color: C.muted },
  hint: { fontSize: 12, lineHeight: 17, color: C.muted },
  err: { fontSize: 12, fontWeight: '600', color: C.bad },
  link: { fontSize: 13, fontWeight: '800', color: C.cyan },

  input: {
    borderRadius: R.md, borderWidth: 1, borderColor: C.line2, backgroundColor: C.panel,
    paddingHorizontal: 14, minHeight: 48, color: C.ink, fontSize: 15,
  },
  inputBad: { borderColor: C.bad },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chipsTight: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 5 },
  // 36dp tall with 8dp gaps — comfortably tappable without a 44dp chip wall
  chip: { minHeight: 36, justifyContent: 'center', borderRadius: R.pill, borderWidth: 1, paddingHorizontal: 13 },
  chipOn: { backgroundColor: C.cyan, borderColor: C.cyan },
  chipOff: { backgroundColor: 'transparent', borderColor: C.line2 },
  chipText: { fontSize: 12, fontWeight: '800', color: C.muted2 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  groupBtn: { width: '23.5%', minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: R.md, borderWidth: 1, paddingHorizontal: 3, paddingVertical: 8 },
  groupOn: { borderColor: C.cyan, backgroundColor: alpha(C.cyan, 0.14) },
  groupOff: { borderColor: C.line2, backgroundColor: C.white5 },
  groupText: { fontSize: 9, fontWeight: '800', color: C.muted2, textAlign: 'center' },

  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, borderRadius: R.xl, borderWidth: 1, borderColor: C.line2, paddingHorizontal: 14, paddingVertical: 12 },
  modeOn: { borderColor: C.cyan, backgroundColor: alpha(C.cyan, 0.08) },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.line2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.cyan },
  modeTitle: { fontSize: 14, fontWeight: '800' },
  modeHint: { marginTop: 2, fontSize: 11, lineHeight: 15, color: C.muted },

  busy: { alignItems: 'center', gap: 10, paddingVertical: 22 },
  keyCard: { borderRadius: R.xl, borderWidth: 1, borderColor: alpha(C.cyan, 0.25), backgroundColor: alpha(C.cyan, 0.06), padding: 14 },
  keyTitle: { fontSize: 14, fontWeight: '800', marginBottom: 4 },

  warnCard: { borderRadius: R.xl, borderWidth: 1, borderColor: alpha(C.warn, 0.35), backgroundColor: alpha(C.warn, 0.08), padding: 14 },
  warnTitle: { fontSize: 13, fontWeight: '800', color: C.warn, marginBottom: 4 },
  warnText: { fontSize: 12, lineHeight: 17, color: C.ink2 },

  review: { borderRadius: R.xl, borderWidth: 1, borderColor: C.line, backgroundColor: C.glass, padding: 14, gap: 12 },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  reviewName: { fontSize: 16, fontWeight: '800' },
  reviewMeta: { marginTop: 2, fontSize: 11, color: C.muted },
  okBadge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: C.cyanWash },
  reviewRow: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 },
  reviewLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.7, color: C.muted, textTransform: 'uppercase' },
  cue: { marginTop: 5, fontSize: 13, lineHeight: 18, color: C.ink2 },
  tag: { borderRadius: R.pill, backgroundColor: C.cyanWash, paddingHorizontal: 9, paddingVertical: 3 },
  tagText: { fontSize: 10, fontWeight: '800', color: C.cyan },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 6 },
  noteText: { flex: 1, fontSize: 12, lineHeight: 16, color: C.ink2 },

  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 48, paddingHorizontal: 12 },
  backText: { fontSize: 13, fontWeight: '800', color: C.ink2 },

  photoAdd: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 84, borderRadius: R.xl, borderWidth: 1, borderStyle: 'dashed', borderColor: alpha(C.cyan, 0.4), backgroundColor: alpha(C.cyan, 0.05) },
  photoAddText: { fontSize: 13, fontWeight: '800', color: C.cyan },
  photoWrap: { borderRadius: R.xl, overflow: 'hidden', borderWidth: 1, borderColor: C.line2 },
  photo: { width: '100%', aspectRatio: 4 / 3, backgroundColor: '#000' },
  photoX: { position: 'absolute', right: 8, top: 8, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  reviewPhoto: { width: 46, height: 46, borderRadius: R.md, backgroundColor: '#000' },
  doneWarn: { marginTop: 10, fontSize: 11, lineHeight: 16, color: C.warn, textAlign: 'center' },
  doneWrap: { alignItems: 'center', gap: 8, paddingVertical: 26 },
  doneIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: C.cyanWash, marginBottom: 6 },
  doneTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  doneSub: { fontSize: 13, color: C.muted, textAlign: 'center' },
})
