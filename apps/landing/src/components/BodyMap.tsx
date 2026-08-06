import { useEffect, useId, useState } from 'react'
import {
  BODY_VIEWBOX,
  FRONT_MUSCLES,
  BACK_MUSCLES,
  intensityOf,
  type BodyMuscle,
  type TrainedInput,
} from '../data/bodyMuscles'
import { BODY_MAP_PAINT, ISLAND_LAYERS, isGradient, type BodyMapVariant, type IslandLayer } from '../data/bodyMapStyle'

/** True when the OS asks for reduced transparency; glass falls back to solid. */
function useReducedTransparency() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-transparency: reduce)')
    const on = () => setReduced(mq.matches)
    on()
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return reduced
}

/**
 * Which palette the map will paint with right now.
 *
 * Exported because the legend has to name the same colours the figure uses. When this
 * resolution lived privately inside BodyMap, a viewer with reduced transparency got an
 * opaque figure next to a legend still showing the translucent glass tiers — a key that
 * matched nothing on screen, for exactly the people least able to tolerate that. Callers
 * that render a legend should call this once and pass the result into BodyMap.
 */
export function useBodyMapVariant(): BodyMapVariant {
  return useReducedTransparency() ? 'solid' : 'glass'
}

/**
 * Front + back anatomy map. Pass `trained` as a Set of category keys to light every
 * muscle in those categories, or as a Map for two-tier highlighting — see
 * `intensityOf` in ../data/bodyMuscles.
 *
 * `variant` defaults to whatever `useBodyMapVariant` resolves; pass 'flat' to render the
 * reference artwork's own palette (used by the parity test).
 */
export function BodyMap({ trained, onPick, variant }: { trained: TrainedInput; onPick: (category: string) => void; variant?: BodyMapVariant }) {
  const resolved = useBodyMapVariant()
  const v: BodyMapVariant = variant ?? resolved
  return (
    <div className="flex items-start justify-center gap-2">
      <BodyView label="Front" muscles={FRONT_MUSCLES} trained={trained} onPick={onPick} variant={v} />
      <BodyView label="Back" muscles={BACK_MUSCLES} trained={trained} onPick={onPick} variant={v} />
    </div>
  )
}

function BodyView({ label, muscles, trained, onPick, variant }: { label: string; muscles: BodyMuscle[]; trained: TrainedInput; onPick: (c: string) => void; variant: BodyMapVariant }) {
  const paint = BODY_MAP_PAINT[variant]
  // ids must be unique per figure, or the Front map's gradients would also paint the Back one
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '')
  const gid = (k: string) => `bm${raw}${variant}${k}`
  // only the tiers that actually carry a ramp get a def
  const gradientLayers = ISLAND_LAYERS.filter((k) => isGradient(paint[k].fill))

  const silhouettes = muscles.filter((m) => m.kind === 'silhouette')
  const body = muscles.find((m) => m.id === 'body')
  const islands = muscles.filter((m) => m.kind !== 'silhouette')
  const layerOf = (m: BodyMuscle): IslandLayer => intensityOf(m, trained) ?? 'rest'
  const fillOf = (k: IslandLayer) => (isGradient(paint[k].fill) ? `url(#${gid(k)})` : (paint[k].fill as string))

  return (
    <div className="flex flex-1 flex-col items-center gap-2">
      <svg viewBox={BODY_VIEWBOX} className="h-auto w-full" role="img" aria-label={`${label} muscle map`}>
        {gradientLayers.length > 0 && (
          <defs>
            {gradientLayers.map((k) => {
              const [from, to] = paint[k].fill as readonly [string, string]
              // 0,0 -> 1,1 in objectBoundingBox units is CSS `135deg`, per island
              return (
                <linearGradient key={k} id={gid(k)} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor={from} />
                  <stop offset="1" stopColor={to} />
                </linearGradient>
              )
            })}
          </defs>
        )}

        {/* layer 2 — dark glass: the body, and what shows through every gap.
            Composited as one group so the translucent fill does not double up
            where head/hands/feet overlap the body. */}
        <g fill={paint.body.color} fillRule="evenodd" opacity={paint.body.opacity}>
          {silhouettes.map((m) => (
            <path key={`base-${m.id}`} d={m.path} />
          ))}
        </g>
        {/* rim light on the outer edge only, outside the group so the group's
            opacity does not dim it */}
        {body && paint.body.rim && (
          <path d={body.path} fill="none" stroke={paint.body.rim} strokeWidth={paint.body.rimWidth} />
        )}

        {/* layers 3/4 — the trained islands */}
        {islands.map((m) => {
          const k = layerOf(m)
          const p = paint[k]
          const clickable = !!m.category
          return (
            <path
              key={m.id}
              d={m.path}
              className={clickable ? 'bm-clickable' : undefined}
              role={clickable ? 'button' : undefined}
              aria-label={clickable ? m.name : undefined}
              onClick={clickable ? () => onPick(m.category as string) : undefined}
              fill={fillOf(k)}
              fillRule="evenodd"
              stroke={p.rim ?? 'none'}
              strokeWidth={p.rimWidth}
              style={{ cursor: clickable ? 'pointer' : 'default', transition: 'fill 0.25s' }}
            >
              <title>{m.name}</title>
            </path>
          )
        })}
      </svg>
      <span className="text-[10px] font-bold uppercase tracking-wide text-muted">{label}</span>
    </div>
  )
}
