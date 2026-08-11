import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useData, usePrefs, useSession } from '../lib/app-context'
import { CATALOG_BY_KEY, mergeCustom, exerciseTips, exerciseSrc } from '../data/catalog'
import { setFavorite, deleteTemplate } from '../lib/db'
import { CategoryThumb, IconStar, IconCheck, IconPlay, IconClose } from '../components/Icons'
import { Button, Modal } from '../components/ui'
import { ExerciseImage } from '../components/ExerciseImage'
import { YouTubeEmbed } from '../components/YouTubeEmbed'
import { youTubeWatch } from '../lib/youtube'
import { cx, fmtWeight } from '../lib/util'
import { haptic } from '../lib/haptics'
import type { ActiveSession, TemplateRow, Exercise } from '../lib/types'

export function Category() {
  const { key = '' } = useParams()
  const nav = useNavigate()
  const { custom, favorites, prs, templates, refresh } = useData()
  const { active, start } = useSession()
  const { unit, gender } = usePrefs()

  const category = useMemo(() => mergeCustom(custom).find((c) => c.key === key), [custom, key])
  const base = CATALOG_BY_KEY[key]
  const [selected, setSelected] = useState<Set<string>>(() => new Set(base?.exercises.map((e) => e.name)))
  const [detail, setDetail] = useState<Exercise | null>(null)

  // React Router reuses this element across /category/chest -> /category/back, so the
  // initial-state lambda never re-runs. Without this the previous category's picks stick
  // around: `selected.size` keeps the Start button lit while none of the names match the
  // exercises on screen, and starting the workout silently does nothing.
  const renderedKey = useRef(key)
  if (renderedKey.current !== key) {
    renderedKey.current = key
    setSelected(new Set(base?.exercises.map((e) => e.name)))
    setDetail(null)
  }

  if (!category) {
    return (
      <div className="pt-10 text-center text-muted">
        Unknown category.{' '}
        <button className="text-cyan" onClick={() => nav('/')}>
          Go home
        </button>
      </div>
    )
  }

  const toggle = (name: string) => {
    haptic.select()
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const fav = async (name: string) => {
    haptic.select()
    await setFavorite(name, !favorites.includes(name))
    await refresh()
  }

  const beginWorkout = () => {
    const picks = category.exercises.filter((e) => selected.has(e.name))
    if (!picks.length) return
    haptic.success()
    const s: ActiveSession = {
      categoryKey: category.key,
      title: category.title,
      startedAt: Date.now(),
      exercises: picks.map((e) => ({ exercise: e.name, sets: [{ weight: 0, reps: 0, done: false }] })),
    }
    start(s)
    nav('/session')
  }

  const template = templates.find((t) => t.category_key === key)
  const quickStart = (t: TemplateRow) => {
    haptic.success()
    const s: ActiveSession = {
      categoryKey: t.category_key,
      title: t.title,
      startedAt: Date.now(),
      exercises: t.exercises.map((e) => ({
        exercise: e.name,
        sets: Array.from({ length: Math.max(1, e.sets_count) }, () => ({ weight: e.last_weight, reps: e.last_reps, done: false })),
      })),
    }
    start(s)
    nav('/session')
  }
  const removeTemplate = async (id: string) => {
    haptic.select()
    await deleteTemplate(id)
    await refresh()
  }

  return (
    <div className="flex flex-col gap-5 pb-28">
      {/* header — category identity */}
      <div className="flex min-w-0 items-center gap-3">
        <CategoryThumb icon={category.key} size={44} />
        <div className="min-w-0">
          <h1 className="truncate font-heading text-2xl font-extrabold leading-none">{category.title}</h1>
          <p className="truncate text-xs text-muted">{category.subtitle}</p>
        </div>
      </div>

      {active && (
        <div className="rounded-2xl border border-cyan/30 bg-cyan/[0.1] px-4 py-3 text-sm">
          You have a workout in progress.{' '}
          <button className="font-bold text-cyan" onClick={() => nav('/session')}>
            Resume →
          </button>
        </div>
      )}

      <p className="-mt-1 px-0.5 text-xs text-muted">Tap a card for tips &amp; a demo. Tap the check to include or exclude it.</p>

      {template && (
        <div className="flex items-center gap-3 rounded-2xl glass bg-cyan/10 p-4">
          <div className="min-w-0 flex-1">
            <p className="font-heading text-sm font-bold text-cyan-soft">Your template</p>
            <p className="truncate text-xs text-muted2">
              {template.exercises.length} exercise{template.exercises.length === 1 ? '' : 's'} · {template.title}
            </p>
          </div>
          <Button className="!px-4 !py-2 text-sm" onClick={() => quickStart(template)}>
            <IconPlay size={16} /> Quick start
          </Button>
          <button
            onClick={() => removeTemplate(template.id)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted/70 transition hover:text-bad"
            aria-label="Delete template"
          >
            <IconClose size={16} />
          </button>
        </div>
      )}

      {/* exercises — two-up grid, large image on pure black + text */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {category.exercises.map((ex, i) => {
          const on = selected.has(ex.name)
          const pr = prs[ex.name]
          const faved = favorites.includes(ex.name)
          return (
            <article
              key={ex.name}
              onClick={() => { haptic.nav(); setDetail(ex) }}
              className={cx(
                'group animate-fadeUp cursor-pointer overflow-hidden rounded-2xl border transition active:scale-[0.99]',
                on ? 'border-cyan/50 shadow-glow-sm' : 'border-line',
              )}
              style={{ animationDelay: `${i * 45}ms` }}
            >
              {/* large image sits on pure black — transparent PNGs composite cleanly */}
              <div className="relative aspect-[4/3] w-full bg-black">
                {/*
                  Resolved through exerciseSrc rather than gated on `ex.img`: a custom exercise
                  has an empty `img` and an absolute `imageUrl`, so the old check sent every
                  user-uploaded photo down the "no image" branch. ExerciseImage handles the
                  absent case itself.
                */}
                <ExerciseImage src={exerciseSrc(category.key, ex, gender)} alt={ex.name} size={56} eager />

                {/* target tag */}
                <span className="absolute left-2 top-2 max-w-[calc(100%-1rem)] truncate rounded-full border border-cyan/40 bg-black/50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-cyan backdrop-blur">
                  {ex.target}
                </span>

                {/* selection indicator (tap to include / exclude) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    toggle(ex.name)
                  }}
                  className={cx(
                    'absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full transition active:scale-90',
                    on ? 'bg-cyan text-cyan-ink shadow-glow-sm' : 'bg-black/50 text-white/70 ring-1 ring-white/15',
                  )}
                  aria-label={on ? 'Exclude from workout' : 'Include in workout'}
                >
                  <IconCheck size={16} />
                </button>

                {/* favorite */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    fav(ex.name)
                  }}
                  className={cx(
                    'absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-full bg-black/50 backdrop-blur transition',
                    faved ? 'text-cyan' : 'text-white/60 hover:text-white',
                  )}
                  aria-label="Favorite"
                >
                  <IconStar size={17} {...(faved ? { fill: 'currentColor', stroke: 'currentColor' } : {})} />
                </button>
              </div>

              {/* text block */}
              <div className="bg-black/30 px-3 py-2.5">
                <h3 className="font-heading text-sm font-extrabold leading-tight">{ex.name}</h3>
                {pr?.lastDate ? (
                  <p className="mt-0.5 text-xs text-cyan-soft">
                    Last: {fmtWeight(pr.lastWeight, unit)}{unit} × {pr.lastReps}
                  </p>
                ) : (
                  <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted2">{ex.form}</p>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {/*
        Start CTA. On a phone it floats above the bottom nav; on desktop there is no bottom
        nav to clear and a full-bleed 1400px button looks absurd, so it docks bottom-right
        as a compact action that follows the grid instead of spanning it.
      */}
      <div
        className="fixed inset-x-0 z-30 mx-auto max-w-2xl px-4 lg:inset-x-auto lg:bottom-8 lg:right-10 lg:mx-0 lg:max-w-none lg:px-0"
        style={{ bottom: 'calc(6.6rem + env(safe-area-inset-bottom))' }}
      >
        <Button className="w-full shadow-glow lg:w-auto lg:!px-7" onClick={beginWorkout} disabled={selected.size === 0}>
          <IconPlay size={18} /> Start Workout · {selected.size}
        </Button>
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.name} maxW="max-w-lg">
        {detail && (() => {
          // a custom exercise carries its own tips/video; a built-in looks them up
          const detailTips = detail.tips?.length ? detail.tips : exerciseTips(detail.name)
          const detailVideo = detail.videoUrl ?? null
          return (
          <>
            <div className="relative mb-4 aspect-[4/3] w-full overflow-hidden rounded-2xl bg-black">
              {/*
                Resolved through exerciseSrc, not `detail.img`: a custom exercise has an empty
                `img` and an absolute `imageUrl`, so testing `detail.img` showed the "no photo"
                placeholder for exercises that definitely had one.
              */}
              <ExerciseImage
                src={exerciseSrc(category.key, detail, gender)}
                alt={detail.name}
                size={56}
                eager
                imgClassName="h-4/5 w-4/5 object-contain"
              />
              <span className="absolute left-3 top-3 rounded-full border border-cyan/40 bg-black/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-cyan backdrop-blur">
                {detail.target}
              </span>
            </div>

            <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Form cue</p>
            <p className="mt-1 text-sm leading-snug text-ink2">{detail.form}</p>

            {detailTips.length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Tips to improve</p>
                <ul className="mt-1.5 space-y-2">
                  {detailTips.map((t, i) => (
                    <li key={i} className="flex gap-2 text-sm leading-snug text-ink2">
                      <IconCheck size={15} className="mt-0.5 shrink-0 text-cyan" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/*
              Only offered when a demo actually exists. This used to link to
              `exerciseVideo(name)`, which falls back to youtube.com — so every built-in
              exercise had a "Watch demo" button that dropped you on YouTube's homepage.
            */}
            {detailVideo && (
              <div className="mt-4 flex flex-col gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Demo</p>
                <YouTubeEmbed url={detailVideo} title={detail.name} />
                <a
                  href={youTubeWatch(detailVideo) ?? detailVideo}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => haptic.select()}
                  className="text-center text-[11px] font-semibold text-muted transition hover:text-cyan"
                >
                  Open on YouTube
                </a>
              </div>
            )}

            <div className="mt-5 flex flex-col gap-2">
              <Button variant={selected.has(detail.name) ? 'outline' : 'cyan'} onClick={() => toggle(detail.name)}>
                {selected.has(detail.name) ? 'Remove from workout' : 'Add to workout'}
              </Button>
            </div>
          </>
          )
        })()}
      </Modal>
    </div>
  )
}

