import { useEffect, useMemo, useState } from 'react'
import { Modal, Button } from './ui'
import { CategoryThumb, IconCheck, IconChevronLeft, IconClose, IconTrophy, IconPlus } from './Icons'
import { CATALOG } from '../data/catalog'
import { addCustom } from '../lib/db'
import { getGroqKey, setGroqKey } from '../lib/groq'
import { validateExercise, testGroqKey, type Verdict } from '../lib/exercise-ai'
import { uploadExerciseImage, validateImage } from '../lib/storage'
import { youTubeId, youTubeWatch, youTubeThumb } from '../lib/youtube'
import { cx } from '../lib/util'
import { haptic } from '../lib/haptics'

const EQUIPMENT = ['Barbell', 'Dumbbell', 'Machine', 'Cable', 'Bodyweight', 'Kettlebell', 'Band', 'Other']

const SECONDARY = [
  'Chest', 'Upper Back', 'Lats', 'Traps', 'Front Delts', 'Side Delts', 'Rear Delts',
  'Biceps', 'Triceps', 'Forearms', 'Core', 'Obliques', 'Glutes', 'Quads', 'Hamstrings', 'Calves',
]

/*
 * Which secondary muscles a primary group already covers.
 *
 * "Also works" means *in addition to* the primary group, so offering Chest as a secondary on a
 * Chest exercise is meaningless — and worse, it doubles the muscle in the heat map. A literal
 * name match is not enough: picking Back has to remove Lats and Upper Back too, and Legs has to
 * remove all four leg muscles, because those are the same tissue under a different label.
 */
const COVERED_BY: Record<string, string[]> = {
  chest: ['Chest'],
  back: ['Upper Back', 'Lats', 'Traps'],
  shoulders: ['Front Delts', 'Side Delts', 'Rear Delts'],
  biceps: ['Biceps'],
  triceps: ['Triceps'],
  legs: ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
  abs: ['Core', 'Obliques'],
  cardio: [],
}

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
  onSaved: () => void | Promise<void>
  defaultCategory?: string
}) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [equipment, setEquipment] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState('')
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

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // reset on every open, so a previous draft never leaks in
  useEffect(() => {
    if (!open) return
    setStep(0); setName(''); setNameTouched(false); setEquipment('')
    setImageFile(null); setImagePreview(null); setImageError(null); setVideoUrl('')
    setCategoryKey(defaultCategory ?? CATALOG[0].key)
    setSecondary([]); setMode('reps')
    setVerdict(null); setAiError(null); setKeyDraft(''); setKeyError(null)
    setSaving(false); setSaved(false)
    setHasKey(!!getGroqKey())
  }, [open, defaultCategory])

  const trimmed = name.trim()
  const nameError = trimmed.length === 0 ? 'Give the exercise a name.' : trimmed.length < 3 ? 'A bit longer, please.' : null
  const canAdvance = step === 0 ? !nameError : true

  /* Secondary options minus whatever the primary group already covers. */
  const availableSecondary = useMemo(
    () => SECONDARY.filter((m) => !(COVERED_BY[categoryKey] ?? []).includes(m)),
    [categoryKey],
  )

  /*
   * Changing the primary group can strand an already-picked secondary — pick Lats, then switch
   * the primary to Back, and Lats is both primary and secondary while its chip is no longer on
   * screen to unpick. Drop those silently when the primary changes.
   */
  useEffect(() => {
    setSecondary((prev) => {
      const covered = COVERED_BY[categoryKey] ?? []
      const next = prev.filter((m) => !covered.includes(m))
      return next.length === prev.length ? prev : next
    })
  }, [categoryKey])

  const toggleSecondary = (m: string) => {
    haptic.select()
    setSecondary((p) => (p.includes(m) ? p.filter((x) => x !== m) : p.length >= 3 ? p : [...p, m]))
  }

  const runCheck = async () => {
    setChecking(true); setAiError(null); setVerdict(null)
    try {
      setVerdict(await validateExercise({ name: trimmed, categoryKey, equipment, secondary, mode }))
      haptic.success()
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Check failed.')
    } finally {
      setChecking(false)
    }
  }

  // the review step checks by itself — making the user press a button to find out
  // whether their entry is valid is a step with no decision in it
  useEffect(() => {
    if (step === 3 && hasKey && !verdict && !checking && !aiError) void runCheck()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, hasKey])

  const saveKey = async () => {
    const k = keyDraft.trim()
    if (!k) return
    setSavingKey(true); setKeyError(null)
    if (!(await testGroqKey(k))) {
      setKeyError("That key didn't work. Check it and try again.")
      setSavingKey(false)
      return
    }
    await setGroqKey(k)
    setSavingKey(false); setHasKey(true); setKeyDraft('')
    void runCheck()
  }

  const finalName = verdict?.canonicalName || trimmed
  const finalCategory = verdict?.categoryKey || categoryKey
  const finalSecondary = verdict?.secondary.length ? verdict.secondary : secondary
  const finalCue = verdict?.formCue || ''
  const finalTips = verdict?.tips ?? []
  const videoId = youTubeId(videoUrl)
  const videoInvalid = videoUrl.trim().length > 0 && !videoId
  const cat = CATALOG.find((c) => c.key === finalCategory)

  const save = async () => {
    setSaving(true)

    /*
     * Upload first, then insert. If the upload fails the exercise is still saved without a
     * photo — losing a picture is a far smaller failure than losing the whole entry, and the
     * reason is surfaced rather than swallowed.
     */
    let imageUrl: string | null = null
    if (imageFile) {
      const up = await uploadExerciseImage(imageFile, finalName)
      imageUrl = up.url
      if (up.error) setImageError(up.error)
    }

    // `target` is the tag the exercise card shows; it stays populated for databases that do
    // not yet have the dedicated equipment / secondary columns
    const target = [equipment, ...finalSecondary].filter(Boolean).join(' · ') || 'Custom'
    const row = await addCustom({
      categoryKey: finalCategory,
      name: finalName,
      target,
      form: finalCue,
      equipment,
      secondary: finalSecondary,
      tips: finalTips,
      imageUrl,
      videoUrl: youTubeWatch(videoUrl) ?? null,
      mode,
    })
    setSaving(false)
    if (!row) {
      setAiError("Couldn't save that. Check your connection and try again.")
      return
    }
    haptic.success()
    setSaved(true)
    await onSaved()
    setTimeout(onClose, 900)
  }

  const chip = (on: boolean) =>
    cx(
      'min-h-[36px] rounded-full border px-3.5 text-xs font-bold transition',
      on ? 'border-cyan bg-cyan text-cyan-ink' : 'border-line2 text-muted2 hover:text-ink',
    )

  return (
    // opened from inside Settings, so it must sit above that dialog with a solid scrim —
    // two translucent glass panels stacked on each other read as a rendering glitch
    <Modal open={open} onClose={onClose} title={saved ? 'Exercise added' : 'Add exercise'} layer="over" maxW="max-w-lg">
      {saved ? (
        <div className="flex flex-col items-center gap-2 py-7 text-center">
          <div className="mb-1 grid h-16 w-16 place-items-center rounded-full bg-cyan/[0.12]">
            <IconCheck size={30} className="text-cyan" />
          </div>
          <p className="text-lg font-bold">{finalName}</p>
          <p className="text-sm text-muted">Added to {cat?.title ?? 'your exercises'}.</p>
        </div>
      ) : (
        <>
          {/* progress — a multi-step form has to say where you are */}
          <div className="mb-5 flex gap-1.5" aria-label={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}>
            {STEPS.map((label, i) => (
              <div key={label} className="flex-1">
                <div className={cx('h-[3px] rounded-sm transition-colors', i <= step ? 'bg-cyan' : 'bg-line2')} />
                <p className={cx('mt-1.5 text-[9px] font-bold uppercase tracking-wide', i === step ? 'text-cyan' : 'text-muted')}>
                  {label}
                </p>
              </div>
            ))}
          </div>

          {step === 0 && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label htmlFor="ex-name" className="text-[13px] font-bold">Exercise name</label>
                <input
                  id="ex-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setNameTouched(true)}
                  placeholder="e.g. Incline Dumbbell Press"
                  autoFocus
                  className={cx(
                    'min-h-[48px] rounded-xl border bg-panel px-3.5 text-[15px] outline-none focus:ring-2 focus:ring-cyan/50',
                    nameTouched && nameError ? 'border-bad' : 'border-line2',
                  )}
                />
                {nameTouched && nameError ? (
                  <p role="alert" className="text-xs font-semibold text-bad">{nameError}</p>
                ) : (
                  <p className="text-xs leading-snug text-muted">Type it however you like — we'll tidy the name up at the end.</p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-[13px] font-bold">Equipment <span className="text-[11px] font-semibold text-muted">· optional</span></p>
                <div className="flex flex-wrap gap-1.5">
                  {EQUIPMENT.map((e) => (
                    <button
                      key={e}
                      role="radio"
                      aria-checked={equipment === e}
                      onClick={() => { haptic.select(); setEquipment(equipment === e ? '' : e) }}
                      className={chip(equipment === e)}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              {/* ------------------------------------------------ photo + demo video */}
              <div className="flex flex-col gap-2">
                <p className="text-[13px] font-bold">
                  Photo <span className="text-[11px] font-semibold text-muted">· optional</span>
                </p>
                <div className="flex items-start gap-3">
                  <label
                    className={cx(
                      'grid h-24 w-24 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-2xl border border-dashed transition',
                      imagePreview ? 'border-cyan/40' : 'border-line2 hover:border-cyan/50',
                    )}
                  >
                    {/*
                      Preview uses object-contain, not object-cover. Nothing crops this photo —
                      the web picker has no crop step, and every surface that later draws it uses
                      object-contain. A `cover` preview therefore hid the edges of a non-square
                      upload and showed the user something narrower than they would actually get.
                    */}
                    {imagePreview ? (
                      <img src={imagePreview} alt="" className="h-24 w-24 object-contain" />
                    ) : (
                      <span className="flex flex-col items-center gap-1 text-muted">
                        <IconPlus size={18} />
                        <span className="text-[10px] font-bold">Add</span>
                      </span>
                    )}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        e.target.value = '' // let the same file be re-picked after a rejection
                        if (!f) return
                        const bad = validateImage(f)
                        if (bad) {
                          setImageError(bad)
                          return
                        }
                        setImageError(null)
                        setImageFile(f)
                        // revoke the previous preview or every re-pick leaks a blob
                        setImagePreview((old) => {
                          if (old) URL.revokeObjectURL(old)
                          return URL.createObjectURL(f)
                        })
                      }}
                    />
                  </label>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-snug text-muted">
                      {/*
                        Square is not arbitrary: 29 of the 34 built-in photos are 1512x1512, and the
                        cards render with object-contain. A square therefore fills the frame, while a
                        tall phone photo letterboxes and reads as smaller than everything around it.
                      */}
                      Best as a <strong className="font-semibold text-ink2">square (1:1)</strong> image,
                      around 1600&times;1600 — that is how the built-in photos are shaped, so it fills the
                      card instead of letterboxing. A plain or transparent background works best.
                    </p>
                    <p className="mt-1.5 text-[11px] leading-snug text-muted">
                      JPEG, PNG or WebP, up to 5&nbsp;MB. Anything larger is resized before upload.
                    </p>
                    {imageFile && (
                      <button
                        onClick={() => {
                          setImageFile(null)
                          setImagePreview((old) => {
                            if (old) URL.revokeObjectURL(old)
                            return null
                          })
                        }}
                        className="mt-2 text-[11px] font-bold text-muted transition hover:text-bad"
                      >
                        Remove photo
                      </button>
                    )}
                    {imageError && (
                      <p role="alert" className="mt-2 text-[11px] font-semibold text-bad">{imageError}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-[13px] font-bold">
                  Demo video <span className="text-[11px] font-semibold text-muted">· optional</span>
                </p>
                <input
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="Paste a YouTube link"
                  inputMode="url"
                  aria-label="YouTube demo link"
                  aria-invalid={videoInvalid}
                  className={cx(
                    'min-h-[46px] w-full rounded-xl border bg-panel2 px-3.5 text-sm outline-none transition focus:ring-2 focus:ring-cyan/50 placeholder:text-muted',
                    videoInvalid ? 'border-bad' : 'border-line2',
                  )}
                />
                {videoInvalid ? (
                  <p role="alert" className="text-xs font-semibold text-bad">
                    That doesn't look like a YouTube link.
                  </p>
                ) : videoId ? (
                  <div className="flex items-center gap-2.5 rounded-xl border border-cyan/25 bg-cyan/[0.07] p-2">
                    <img src={youTubeThumb(videoUrl) ?? ''} alt="" className="h-10 w-[68px] shrink-0 rounded-md object-cover" />
                    <p className="text-[11px] font-semibold text-cyan-soft">Demo attached</p>
                  </div>
                ) : (
                  <p className="text-xs leading-snug text-muted">
                    Anyone opening this exercise gets a “View demo” button.
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <p className="text-[13px] font-bold">Primary muscle group</p>
                <p className="text-xs text-muted">This decides which workout the exercise shows up in.</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {CATALOG.map((c) => {
                    const on = categoryKey === c.key
                    return (
                      <button
                        key={c.key}
                        role="radio"
                        aria-checked={on}
                        onClick={() => { haptic.select(); setCategoryKey(c.key) }}
                        className={cx(
                          'flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-[9px] font-bold transition',
                          on ? 'border-cyan bg-cyan/15 text-cyan' : 'border-line2 bg-white/5 text-muted2 hover:text-ink',
                        )}
                      >
                        <CategoryThumb icon={c.key} size={18} className={on ? 'text-cyan' : 'text-muted2'} />
                        <span className="truncate">{c.title}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-[13px] font-bold">
                  Also works <span className="text-[11px] font-semibold text-muted">· optional, up to 3</span>
                </p>
                <p className="text-xs text-muted">
                  {CATALOG.find((c) => c.key === categoryKey)?.title} is already the primary group, so its
                  muscles aren't listed here.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {availableSecondary.map((m) => {
                    const on = secondary.includes(m)
                    const full = !on && secondary.length >= 3
                    return (
                      <button
                        key={m}
                        role="checkbox"
                        aria-checked={on}
                        disabled={full}
                        onClick={() => toggleSecondary(m)}
                        className={cx(chip(on), full && 'opacity-35')}
                      >
                        {m}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-2.5">
              <p className="text-[13px] font-bold">How will you log it?</p>
              {MODES.map((m) => {
                const on = mode === m.key
                return (
                  <button
                    key={m.key}
                    role="radio"
                    aria-checked={on}
                    onClick={() => { haptic.select(); setMode(m.key) }}
                    className={cx(
                      'flex min-h-[60px] items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition',
                      on ? 'border-cyan bg-cyan/[0.08]' : 'border-line2 hover:border-line',
                    )}
                  >
                    <span className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-full border-2', on ? 'border-cyan' : 'border-line2')}>
                      {on && <span className="h-2.5 w-2.5 rounded-full bg-cyan" />}
                    </span>
                    <span className="min-w-0">
                      <span className={cx('block text-sm font-bold', on && 'text-cyan')}>{m.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-tight text-muted">{m.hint}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-3.5">
              {!hasKey ? (
                <div className="rounded-2xl border border-cyan/25 bg-cyan/[0.06] p-3.5">
                  <p className="mb-1 text-sm font-bold">Check this with AI</p>
                  <p className="text-xs leading-snug text-muted">
                    Paste your Groq API key to have the exercise checked and a form cue written for you.
                    Optional — you can skip this and fill the details in yourself.
                  </p>
                  <input
                    type="password"
                    value={keyDraft}
                    onChange={(e) => setKeyDraft(e.target.value)}
                    placeholder="gsk_…"
                    autoComplete="off"
                    className={cx(
                      'mt-2.5 w-full min-h-[48px] rounded-xl border bg-panel px-3.5 text-[15px] outline-none focus:ring-2 focus:ring-cyan/50',
                      keyError ? 'border-bad' : 'border-line2',
                    )}
                  />
                  {keyError && <p role="alert" className="mt-1.5 text-xs font-semibold text-bad">{keyError}</p>}
                  <div className="mt-3 flex gap-2">
                    <Button variant="ghost" className="flex-1" onClick={() => setHasKey(true)}>Skip check</Button>
                    <Button className="flex-1" disabled={!keyDraft.trim() || savingKey} onClick={saveKey}>
                      {savingKey ? 'Checking…' : 'Save key'}
                    </Button>
                  </div>
                </div>
              ) : checking ? (
                <div className="flex flex-col items-center gap-2.5 py-6">
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-cyan border-t-transparent" />
                  <p className="text-xs text-muted">Checking “{trimmed}”…</p>
                </div>
              ) : aiError ? (
                <div role="alert" className="rounded-2xl border border-warn/35 bg-warn/[0.08] p-3.5">
                  <p className="text-xs leading-snug text-ink2">{aiError}</p>
                  <button onClick={runCheck} className="mt-2 text-[13px] font-bold text-cyan">Try again</button>
                </div>
              ) : verdict && !verdict.recognised ? (
                <div role="alert" className="rounded-2xl border border-warn/35 bg-warn/[0.08] p-3.5">
                  <p className="mb-1 text-[13px] font-bold text-warn">That doesn't look like an exercise</p>
                  <p className="text-xs leading-snug text-ink2">
                    We couldn't match “{trimmed}” to a known movement. You can go back and rename it, or save it anyway.
                  </p>
                </div>
              ) : null}

              {/* always shown, so saving without a check still has a summary */}
              <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white/[0.045] p-3.5">
                <div className="flex items-center gap-3">
                  {cat && <CategoryThumb icon={cat.key} size={34} className="shrink-0 text-cyan" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-bold">{finalName || 'Unnamed exercise'}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted">
                      {cat?.title}{equipment ? ` · ${equipment}` : ''} · {MODES.find((m) => m.key === mode)?.label}
                    </p>
                  </div>
                  {verdict?.recognised && (
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cyan/[0.12]">
                      <IconCheck size={13} className="text-cyan" />
                    </span>
                  )}
                </div>

                {finalSecondary.length > 0 && (
                  <div className="border-t border-line pt-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-muted">Also works</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {finalSecondary.map((m) => (
                        <span key={m} className="rounded-full bg-cyan/[0.12] px-2 py-0.5 text-[10px] font-bold text-cyan">{m}</span>
                      ))}
                    </div>
                  </div>
                )}

                {finalCue && (
                  <div className="border-t border-line pt-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-muted">Form cue</p>
                    <p className="mt-1 text-[13px] leading-snug text-ink2">{finalCue}</p>
                  </div>
                )}

                {/*
                  Three coaching pointers, which is what lets a typed-in exercise sit next to a
                  built-in one without looking bare — every catalogue entry carries this depth.
                */}
                {finalTips.length > 0 && (
                  <div className="border-t border-line pt-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-muted">Tips to improve</p>
                    <ol className="mt-1.5 flex flex-col gap-1.5">
                      {finalTips.map((t, i) => (
                        <li key={i} className="flex items-start gap-2 text-[13px] leading-snug text-ink2">
                          <span className="mt-[1px] grid h-4 w-4 shrink-0 place-items-center rounded-full bg-cyan/[0.14] text-[9px] font-bold text-cyan">
                            {i + 1}
                          </span>
                          {t}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {!!verdict?.notes.length && (
                  <div className="border-t border-line pt-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-muted">We changed</p>
                    {verdict.notes.map((n, i) => (
                      <p key={i} className="mt-1.5 flex items-start gap-2 text-xs leading-snug text-ink2">
                        <IconTrophy size={12} className="mt-0.5 shrink-0 text-warn" />
                        {n}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mt-5 flex items-center gap-2.5">
            {step > 0 ? (
              <button onClick={() => { haptic.nav(); setStep((x) => x - 1) }} className="flex min-h-[48px] items-center gap-1.5 px-3 text-[13px] font-bold text-ink2">
                <IconChevronLeft size={16} /> Back
              </button>
            ) : (
              <button onClick={onClose} className="flex min-h-[48px] items-center gap-1.5 px-3 text-[13px] font-bold text-muted2">
                <IconClose size={15} /> Cancel
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <Button
                className="flex-1"
                disabled={!canAdvance}
                onClick={() => { if (!canAdvance) { setNameTouched(true); return } haptic.nav(); setStep((x) => x + 1) }}
              >
                Next
              </Button>
            ) : (
              <Button className="flex-1" disabled={saving} onClick={save}>
                {saving ? 'Saving…' : 'Save exercise'}
              </Button>
            )}
          </div>
        </>
      )}
    </Modal>
  )
}
