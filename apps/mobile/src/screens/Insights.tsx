import { useEffect, useState } from 'react'
import { ActivityIndicator, Linking, ScrollView, StyleSheet, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { C, R, alpha } from '../theme'
import { T, Button, EmptyState } from '../components/ui'
import { useData, usePrefs } from '../lib/app-context'
import { getGeminiKey, maskKey, onGeminiKeyChange } from '../lib/gemini'
import { buildInsightsPayload, generateInsights, NO_KEY, type AIInsightsResult, type AIInsight } from '../lib/ai-insights'
import { IconAlert, IconChart, IconFlame, IconScale, IconSparkles, IconTrophy } from '../components/Icons'
import { haptic } from '../lib/haptics'

const CACHE_KEY = 'grindz:ai_insights_cache'

async function loadCache(): Promise<{ result: AIInsightsResult; generatedAt: string } | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

async function saveCache(result: AIInsightsResult) {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ result, generatedAt: new Date().toISOString() }))
  } catch {
    /* ignore */
  }
}

function InsightGlyph({ icon, color }: { icon: AIInsight['icon']; color: string }) {
  const size = 15
  switch (icon) {
    case 'trophy': return <IconTrophy size={size} color={color} />
    case 'trend': return <IconChart size={size} color={color} />
    case 'flame': return <IconFlame size={size} color={color} />
    case 'scale': return <IconScale size={size} color={color} />
    case 'alert':
    default: return <IconAlert size={size} color={color} />
  }
}

const TONE_BG: Record<AIInsight['tone'], string> = { good: alpha(C.good, 0.08), warn: alpha(C.warn, 0.08), neutral: C.white5 }
const TONE_BORDER: Record<AIInsight['tone'], string> = { good: alpha(C.good, 0.25), warn: alpha(C.warn, 0.25), neutral: C.line }
const TONE_ICON_BG: Record<AIInsight['tone'], string> = { good: alpha(C.good, 0.15), warn: alpha(C.warn, 0.15), neutral: C.white7 }
const TONE_ICON_FG: Record<AIInsight['tone'], string> = { good: C.good, warn: C.warn, neutral: C.muted }

export function Insights() {
  const { sessions, sets, prs, bodyweights, loading } = useData()
  const { unit } = usePrefs()

  // Key management lives entirely in Settings now — this screen only reads it. Settings is an
  // overlay Modal, not a screen swap, so this tab stays mounted underneath while it's open —
  // a mount-time-only read would miss a key saved there. onGeminiKeyChange keeps this in sync
  // for the lifetime of this instance, not just its first render.
  const [key, setKeyState] = useState('')

  const [result, setResult] = useState<AIInsightsResult | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    void getGeminiKey().then(setKeyState)
    void loadCache().then((c) => {
      if (c) {
        setResult(c.result)
        setGeneratedAt(c.generatedAt)
      }
    })
    return onGeminiKeyChange(setKeyState)
  }, [])

  const hasEnoughData = sessions.length >= 3

  const run = async () => {
    setBusy(true)
    setErr(null)
    try {
      const payload = buildInsightsPayload({ sessions, sets, prs, bodyweights, unit })
      const r = await generateInsights(payload)
      setResult(r)
      const now = new Date().toISOString()
      setGeneratedAt(now)
      await saveCache(r)
      haptic.success()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.')
      haptic.warn()
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
      <View style={s.headRow}>
        <IconSparkles size={22} color={C.cyan} />
        <T style={s.h1}>AI Insights</T>
      </View>
      <T style={s.sub}>Gemini reads your training data and tells you what it means.</T>

      {loading ? null : !hasEnoughData ? (
        <EmptyState title="Not enough history yet" sub="Log a few more sessions and Gemini will have something real to say about them." />
      ) : !key ? (
        <View style={s.keyCard}>
          <T style={s.keyTitle}>Bring your own Gemini key</T>
          <T style={s.keyBody}>
            Grindz never runs its own AI backend for this — your Gemini API key talks directly to Google from your device, and only ever
            sees the numbers already on this screen (weekly totals, PRs, muscle-group balance), never your raw workout log. Get a free key at{' '}
            <T style={{ color: C.cyanSoft }} onPress={() => Linking.openURL('https://aistudio.google.com')}>aistudio.google.com</T>,
            then add it in Settings — tap your profile in the header.
          </T>
        </View>
      ) : (
        <View style={{ gap: 16 }}>
          <View style={s.statusRow}>
            <T style={s.statusText} numberOfLines={1}>
              Using key {maskKey(key)}{generatedAt ? ` · ${new Date(generatedAt).toLocaleString()}` : ''}
            </T>
            <Button onPress={run} disabled={busy}>{busy ? 'Thinking…' : result ? 'Regenerate' : 'Generate'}</Button>
          </View>

          {err ? (
            <View style={s.errBox}>
              <T style={{ color: C.warn, fontSize: 13, fontWeight: '600' }} accessibilityRole="alert">{err}</T>
              {err !== NO_KEY ? (
                <T style={{ color: C.warn, fontSize: 12, marginTop: 4, textDecorationLine: 'underline' }} onPress={run}>Try again</T>
              ) : null}
            </View>
          ) : null}

          {busy && !result ? (
            <View style={{ alignItems: 'center', gap: 10, paddingVertical: 40 }}>
              <ActivityIndicator color={C.cyan} />
              <T style={{ color: C.muted, fontSize: 13 }}>Reading your training data…</T>
            </View>
          ) : null}

          {result ? (
            <View style={{ gap: 14 }}>
              <View style={s.headlineCard}>
                <T style={s.headlineLabel}>Headline</T>
                <T style={s.headlineText}>{result.headline}</T>
              </View>

              <View style={{ gap: 10 }}>
                {result.insights.map((ins, i) => (
                  <View key={i} style={[s.insightCard, { backgroundColor: TONE_BG[ins.tone], borderColor: TONE_BORDER[ins.tone] }]}>
                    <View style={[s.insightIcon, { backgroundColor: TONE_ICON_BG[ins.tone] }]}>
                      <InsightGlyph icon={ins.icon} color={TONE_ICON_FG[ins.tone]} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <T style={s.insightTitle}>{ins.title}</T>
                      <T style={s.insightBody}>{ins.body}</T>
                    </View>
                  </View>
                ))}
              </View>

              <View style={s.focusCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <IconTrophy size={12} color={C.cyan} />
                  <T style={s.focusLabel}>Suggested focus</T>
                </View>
                <T style={s.focusText}>{result.focus}</T>
              </View>

              <T style={s.disclaimer}>Generated by Gemini from your own logged data. Not medical or nutrition advice.</T>
            </View>
          ) : null}
        </View>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  page: { padding: 20, paddingBottom: 196, gap: 4 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  h1: { fontSize: 24, fontWeight: '800' },
  sub: { fontSize: 13, color: C.muted, marginTop: 2, marginBottom: 16 },
  keyCard: { borderRadius: R.xxl, backgroundColor: alpha(C.cyan, 0.06), borderWidth: 1, borderColor: alpha(C.cyan, 0.25), padding: 18, gap: 10 },
  keyTitle: { fontSize: 16, fontWeight: '800' },
  keyBody: { fontSize: 13, lineHeight: 19, color: C.muted2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderRadius: R.xl, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, paddingVertical: 10 },
  statusText: { flex: 1, fontSize: 11, color: C.muted },
  errBox: { borderRadius: R.xl, borderWidth: 1, borderColor: alpha(C.warn, 0.35), backgroundColor: alpha(C.warn, 0.08), paddingHorizontal: 14, paddingVertical: 12 },
  headlineCard: { borderRadius: R.xl, backgroundColor: alpha(C.cyan, 0.06), borderWidth: 1, borderColor: alpha(C.cyan, 0.25), padding: 14 },
  headlineLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, color: C.cyan, textTransform: 'uppercase' },
  headlineText: { fontSize: 16, fontWeight: '700', marginTop: 4, lineHeight: 22 },
  insightCard: { flexDirection: 'row', gap: 10, borderRadius: R.xl, borderWidth: 1, padding: 14 },
  insightIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  insightTitle: { fontSize: 13, fontWeight: '800' },
  insightBody: { fontSize: 12, lineHeight: 17, color: C.muted2, marginTop: 2 },
  focusCard: { borderRadius: R.xl, backgroundColor: C.white5, borderWidth: 1, borderColor: C.line, padding: 14 },
  focusLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, color: C.muted, textTransform: 'uppercase' },
  focusText: { fontSize: 13, lineHeight: 19, color: C.ink2 },
  disclaimer: { fontSize: 10, color: C.muted, textAlign: 'center', paddingHorizontal: 8 },
})
