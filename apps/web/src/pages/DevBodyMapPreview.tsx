/**
 * Scratch preview for reviewing the female body-map trace interactively — click a
 * muscle to toggle its category, hover for its name, compare against the male map
 * side by side. Not linked from any nav; reachable directly at /dev-preview/body-map,
 * outside the auth gate so it doesn't need a signed-in session.
 *
 * Delete this file (and its route in App.tsx) once the female dataset has a real home
 * in the app, e.g. behind a gender toggle.
 */
import { useState } from 'react'
import { BodyMap, useBodyMapVariant, type BodyMapDataset } from '../components/BodyMap'
import { BODY_VIEWBOX as M_VB, FRONT_MUSCLES as M_FRONT, BACK_MUSCLES as M_BACK } from '../data/bodyMuscles'
import { BODY_VIEWBOX as F_VB, FRONT_MUSCLES as F_FRONT, BACK_MUSCLES as F_BACK } from '../data/bodyMusclesFemale'
import type { BodyMapVariant } from '../data/bodyMapStyle'

const MALE: BodyMapDataset = { BODY_VIEWBOX: M_VB, FRONT_MUSCLES: M_FRONT, BACK_MUSCLES: M_BACK }
const FEMALE: BodyMapDataset = { BODY_VIEWBOX: F_VB, FRONT_MUSCLES: F_FRONT, BACK_MUSCLES: F_BACK }

const CATEGORIES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'abs']

function Panel({ title, dataset, variant }: { title: string; dataset: BodyMapDataset; variant: BodyMapVariant }) {
  const [trained, setTrained] = useState<Set<string>>(new Set())
  const toggle = (cat: string) =>
    setTrained((prev) => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
      <h2 className="text-sm font-bold uppercase tracking-wide text-white/70">{title}</h2>
      <BodyMap trained={trained} onPick={toggle} variant={variant} dataset={dataset} />
      <div className="flex flex-wrap justify-center gap-1.5 pt-2">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => toggle(c)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize transition ${
              trained.has(c) ? 'bg-cyan text-black' : 'bg-white/5 text-white/60 hover:bg-white/10'
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      <p className="max-w-xs text-center text-[11px] text-white/40">
        Click a category chip, or click directly on a muscle in the figure, to toggle its highlight. Hover a shape
        for its traced name.
      </p>
    </div>
  )
}

export function DevBodyMapPreview() {
  const resolved = useBodyMapVariant()
  const [variant, setVariant] = useState<BodyMapVariant>(resolved)
  return (
    <div className="min-h-screen bg-[#050505] p-8 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-lg font-bold">Body map preview — dev only</h1>
          <div className="flex gap-1.5">
            {(['glass', 'solid', 'flat'] as BodyMapVariant[]).map((v) => (
              <button
                key={v}
                onClick={() => setVariant(v)}
                className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                  variant === v ? 'bg-cyan text-black' : 'bg-white/5 text-white/60 hover:bg-white/10'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Panel title="Male (shipped)" dataset={MALE} variant={variant} />
          <Panel title="Female (new trace)" dataset={FEMALE} variant={variant} />
        </div>
      </div>
    </div>
  )
}
