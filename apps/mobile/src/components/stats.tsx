import { View } from 'react-native'
import { C, R, alpha } from '../theme'
import { clamp } from '../lib/util'
import { T } from './ui'
import { Sparkline } from './Charts'
import { IconAlert, IconChart, IconFlame, IconScale, IconTrophy } from './Icons'
import { legendRim, legendStops, type BodyMapVariant, type IslandLayer } from '../data/bodyMapStyle'
import type { InsightIcon, InsightTone } from '../lib/insights'

/**
 * Shared visual primitives for the History and Session Detail redesign — the RN twin of
 * apps/web/src/components/stats.tsx. Same five primitives, same reason for existing: each
 * used to be a private, slightly-different copy inside two or three screen files.
 */

/* ------------------------------------------------------------------------ StatTile */

export interface TileDelta {
  n: number
  text: string
}

export function StatTile({
  icon,
  label,
  value,
  unit,
  delta,
  spark,
  sparkTone = 'cyan',
}: {
  icon?: React.ReactNode
  label: string
  value: React.ReactNode
  unit?: string
  delta?: TileDelta | null
  spark?: number[]
  sparkTone?: 'cyan' | 'good' | 'bad' | 'muted'
}) {
  const dir = delta == null ? 0 : delta.n > 0 ? 1 : delta.n < 0 ? -1 : 0
  return (
    <View style={{ flex: 1, borderRadius: R.xl, backgroundColor: C.white5, paddingHorizontal: 10, paddingVertical: 10, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {icon}
        <T style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.4, color: C.muted, textTransform: 'uppercase' }}>{label}</T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 2 }}>
        <T style={{ fontSize: 17, fontWeight: '800' }}>{value}</T>
        {unit ? <T style={{ fontSize: 10, fontWeight: '700', color: C.muted, marginLeft: 2, marginBottom: 2 }}>{unit}</T> : null}
      </View>
      {delta !== undefined &&
        (delta ? (
          <T style={{ fontSize: 10, fontWeight: '700', marginTop: 2, color: dir > 0 ? C.good : dir < 0 ? C.bad : C.muted }}>
            {dir === 0 ? '±0' : `${dir > 0 ? '↑' : '↓'}${delta.text}`}
          </T>
        ) : (
          <T style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>—</T>
        ))}
      {spark && spark.length >= 2 ? (
        <View style={{ marginTop: 4, width: '100%' }}>
          <Sparkline values={spark} height={20} tone={sparkTone} />
        </View>
      ) : null}
    </View>
  )
}

/* ------------------------------------------------------------------------ MeterBar */

export function MeterBar({
  label,
  value,
  max,
  band,
  tone = 'cyan',
  trailing,
  size = 'md',
}: {
  label: React.ReactNode
  value: number
  max: number
  band?: [number, number]
  tone?: 'cyan' | 'good' | 'warn' | 'bad'
  trailing?: React.ReactNode
  size?: 'sm' | 'md'
}) {
  const pct = clamp(max > 0 ? value / max : 0, 0, 1) * 100
  const fill = tone === 'good' ? C.good : tone === 'warn' ? C.warn : tone === 'bad' ? C.bad : C.cyan
  const h = size === 'sm' ? 6 : 8
  return (
    <View style={{ paddingVertical: size === 'sm' ? 4 : 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <T style={{ flex: 1, fontSize: 11, fontWeight: '700', color: C.ink2 }} numberOfLines={1}>{label}</T>
        {trailing ? <T style={{ fontSize: 11, color: C.muted, fontVariant: ['tabular-nums'] }}>{trailing}</T> : null}
      </View>
      <View style={{ height: h, borderRadius: 999, backgroundColor: C.white5, overflow: 'hidden' }}>
        {band ? (
          <View
            style={{
              position: 'absolute', top: 0, bottom: 0,
              left: `${clamp((band[0] / max) * 100, 0, 100)}%`,
              right: `${100 - clamp((band[1] / max) * 100, 0, 100)}%`,
              backgroundColor: C.white5,
            }}
          />
        ) : null}
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${pct}%`, borderRadius: 999, backgroundColor: fill }} />
      </View>
    </View>
  )
}

/* ------------------------------------------------------------------------ InsightCard */

const TONE_BG: Record<InsightTone, string> = { good: alpha(C.good, 0.1), warn: alpha(C.warn, 0.1), neutral: C.white5 }
const TONE_TEXT: Record<InsightTone, string> = { good: C.good, warn: C.warn, neutral: C.ink2 }
const TONE_ICON_BG: Record<InsightTone, string> = { good: alpha(C.good, 0.15), warn: alpha(C.warn, 0.15), neutral: C.white7 }
const TONE_ICON_FG: Record<InsightTone, string> = { good: C.good, warn: C.warn, neutral: C.muted }

function InsightGlyph({ icon, color }: { icon: InsightIcon; color: string }) {
  const size = 13
  switch (icon) {
    case 'trophy': return <IconTrophy size={size} color={color} />
    case 'trend': return <IconChart size={size} color={color} />
    case 'flame': return <IconFlame size={size} color={color} />
    case 'scale': return <IconScale size={size} color={color} />
    case 'alert':
    default: return <IconAlert size={size} color={color} />
  }
}

export function InsightCard({ icon, tone, text, value }: { icon: InsightIcon; tone: InsightTone; text: string; value?: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, borderRadius: R.xl, backgroundColor: TONE_BG[tone], paddingHorizontal: 14, paddingVertical: 12 }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: TONE_ICON_BG[tone] }}>
        <InsightGlyph icon={icon} color={TONE_ICON_FG[tone]} />
      </View>
      <T style={{ flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 17, color: TONE_TEXT[tone] }}>
        {text}
        {value ? <T style={{ fontWeight: '800', color: C.ink }}> {value}</T> : null}
      </T>
    </View>
  )
}

/* ------------------------------------------------------------------------ Legend */

export function Legend({ items }: { items: { swatch: React.ReactNode; label: string }[] }) {
  if (!items.length) return null
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, rowGap: 6 }}>
      {items.map((it, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {it.swatch}
          <T style={{ fontSize: 10, color: C.muted }}>{it.label}</T>
        </View>
      ))}
    </View>
  )
}

/**
 * One legend entry painted from the same source a muscle-map island reads, so the key
 * can never drift from the figure. RN twin of the web LegendSwatch — react-native-svg
 * cannot render a CSS `linear-gradient()` on a plain View, so this approximates the
 * 135° two-stop ramp with a solid mid-tone fill instead; close enough to be recognisable
 * as "the same colour family" beside the figure without pulling in another gradient SVG
 * just for an 8px swatch.
 */
export function LegendSwatch({ variant, layer, label }: { variant: BodyMapVariant; layer: IslandLayer; label: string }) {
  const rim = legendRim(variant, layer)
  const [from] = legendStops(variant, layer)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View
        style={{
          width: 10, height: 10, borderRadius: 2,
          backgroundColor: from,
          borderWidth: 1, borderColor: rim ?? 'rgba(255,255,255,0.15)',
        }}
      />
      <T style={{ fontSize: 10, color: C.muted }}>{label}</T>
    </View>
  )
}
