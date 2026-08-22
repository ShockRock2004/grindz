import { View } from 'react-native'
import { C, alpha } from '../theme'
import { T } from './ui'
import { fmtWeight, rpeColor, type WeightUnit } from '../lib/util'
import { IconTrophy } from './Icons'
import type { SetRow } from '../lib/types'

/**
 * RN twin of apps/web/src/components/SetLadder.tsx — replaces the small text chips
 * ("1: 32×15 @8") with a bar per set, sized by weight relative to the exercise's heaviest
 * working set, so fatigue across a set reads as a shape. RPE stays a small dot rather than
 * its own bar — a state, not a magnitude.
 */

/** Same mode-aware label the chips used ("400m · 2.5min", "45s · 20kg", "32×15"). */
function setLabel(r: SetRow, unit: WeightUnit): string {
  if ((r.distance_m ?? 0) > 0) {
    const mins = (r.duration_s ?? 0) > 0 ? ` · ${Math.round(((r.duration_s ?? 0) / 60) * 10) / 10}min` : ''
    return `${r.distance_m}m${mins}`
  }
  if ((r.duration_s ?? 0) > 0) {
    const load = r.weight_kg > 0 ? ` · ${fmtWeight(r.weight_kg, unit)}${unit}` : ''
    return `${r.duration_s}s${load}`
  }
  return `${fmtWeight(r.weight_kg, unit)}${unit} × ${r.reps}`
}

export function SetLadder({ rows, unit, isPrSet }: { rows: SetRow[]; unit: WeightUnit; isPrSet: (r: SetRow) => boolean }) {
  if (!rows.length) return null
  const maxWeight = Math.max(1, ...rows.map((r) => r.weight_kg || 0))
  const isTimedOrDistance = rows.some((r) => (r.duration_s ?? 0) > 0 || (r.distance_m ?? 0) > 0)

  return (
    <View style={{ gap: 4 }}>
      {rows.map((r, i) => {
        const pr = isPrSet(r)
        const pct = isTimedOrDistance || r.weight_kg <= 0 ? 100 : Math.max(8, (r.weight_kg / maxWeight) * 100)
        return (
          <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={{
                width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                backgroundColor: r.is_warmup ? alpha(C.warn, 0.15) : C.white7,
              }}
            >
              <T style={{ fontSize: 10, fontWeight: '800', color: r.is_warmup ? C.warn : C.muted }}>{r.is_warmup ? 'W' : i + 1}</T>
            </View>
            <View style={{ flex: 1, height: 24, borderRadius: 12, backgroundColor: C.white5, overflow: 'hidden', justifyContent: 'center' }}>
              <View
                style={{
                  position: 'absolute', top: 0, bottom: 0, left: 0, width: `${pct}%`, borderRadius: 12,
                  backgroundColor: r.is_warmup ? 'transparent' : pr ? C.cyan : C.white7,
                  borderWidth: r.is_warmup ? 1 : 0, borderColor: alpha(C.warn, 0.4), borderStyle: r.is_warmup ? 'dashed' : 'solid',
                }}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10 }}>
                {pr ? <IconTrophy size={10} color={C.cyanInk} /> : null}
                <T style={{ fontSize: 11, fontWeight: '700', color: pr ? C.cyanInk : C.ink2 }}>{setLabel(r, unit)}</T>
              </View>
            </View>
            {r.rpe != null ? (
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: rpeColor(r.rpe) }} />
            ) : (
              <View style={{ width: 10 }} />
            )}
          </View>
        )
      })}
    </View>
  )
}
