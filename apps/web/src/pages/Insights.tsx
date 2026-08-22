import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData, usePrefs } from '../lib/app-context'
import { getGeminiKey, maskKey, onGeminiKeyChange } from '../lib/gemini'
import { buildInsightsPayload, generateInsights, NO_KEY, type AIInsightsResult, type AIInsight } from '../lib/ai-insights'
import { Button, EmptyState } from '../components/ui'
import { IconAlert, IconChart, IconFlame, IconScale, IconTrophy, IconSparkles } from '../components/Icons'
import { cx } from '../lib/util'
import { haptic } from '../lib/haptics'

const CACHE_KEY = 'grindz:ai_insights_cache'

function loadCache(): { result: AIInsightsResult; generatedAt: string } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveCache(result: AIInsightsResult) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ result, generatedAt: new Date().toISOString() }))
  } catch {
    /* private mode */
  }
}

function InsightGlyph({ icon }: { icon: AIInsight['icon'] }) {
  const size = 15
  switch (icon) {
    case 'trophy': return <IconTrophy size={size} />
    case 'trend': return <IconChart size={size} />
    case 'flame': return <IconFlame size={size} />
    case 'scale': return <IconScale size={size} />
    case 'alert':
    default: return <IconAlert size={size} />
  }
}

const TONE_CARD: Record<AIInsight['tone'], string> = {
  good: 'border-good/25 bg-good/[0.06]',
  warn: 'border-warn/25 bg-warn/[0.06]',
  neutral: 'border-line bg-white/[0.03]',
}
const TONE_ICON: Record<AIInsight['tone'], string> = {
  good: 'bg-good/15 text-good',
  warn: 'bg-warn/15 text-warn',
  neutral: 'bg-white/10 text-muted',
}

export function Insights() {
  const nav = useNavigate()
  const { sessions, sets, prs, bodyweights, loading } = useData()
  const { unit } = usePrefs()

  // Key management lives entirely in Settings now — this screen only reads it. Settings is an
  // overlay drawer, not a route change, so this page stays mounted underneath while it's open —
  // a one-shot read at mount would miss a key saved there. onGeminiKeyChange keeps this in sync
  // for the lifetime of this instance, not just its first render.
  const [key, setKey] = useState(() => getGeminiKey())
  useEffect(() => onGeminiKeyChange(setKey), [])

  const cached = useMemo(loadCache, [])
  const [result, setResult] = useState<AIInsightsResult | null>(cached?.result ?? null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(cached?.generatedAt ?? null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

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
      saveCache(r)
      haptic.success()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.')
      haptic.warn()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-3xl font-extrabold tracking-tight">
            <IconSparkles size={26} className="text-cyan" /> AI Insights
          </h1>
          <p className="mt-1 text-sm text-muted">Gemini reads your training data and tells you what it means.</p>
        </div>
      </div>

      {loading ? null : !hasEnoughData ? (
        <EmptyState title="Not enough history yet" sub="Log a few more sessions and Gemini will have something real to say about them." />
      ) : !key ? (
        <div className="rounded-2xl border border-cyan/25 bg-cyan/[0.06] p-5">
          <p className="font-heading text-base font-extrabold">Bring your own Gemini key</p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted2">
            Grindz never runs its own AI backend for this — your Gemini API key talks directly to Google from your device, and only ever
            sees the numbers already on this page (weekly totals, PRs, muscle-group balance), never your raw workout log. Get a free key
            at <span className="text-cyan-soft">aistudio.google.com</span>, then add it in <span className="text-cyan-soft">Settings</span> —
            click your profile at the bottom of the sidebar.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
            <p className="text-xs text-muted">
              Using key <span className="tnum text-ink2">{maskKey(key)}</span>
              {generatedAt && <> · last generated {new Date(generatedAt).toLocaleString()}</>}
            </p>
            <Button onClick={run} disabled={busy}>
              {busy ? 'Thinking…' : result ? 'Regenerate' : 'Generate insights'}
            </Button>
          </div>

          {err && (
            <div role="alert" className="rounded-2xl border border-warn/35 bg-warn/[0.08] px-4 py-3 text-sm font-medium text-warn">
              {err}
              {err === NO_KEY ? null : (
                <button onClick={run} className="ml-2 underline underline-offset-2">
                  Try again
                </button>
              )}
            </div>
          )}

          {busy && !result && (
            <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-line2 py-16 text-center">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-cyan border-t-transparent" />
              <p className="text-sm text-muted">Reading your training data…</p>
            </div>
          )}

          {result && (
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl border border-cyan/25 bg-cyan/[0.06] p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-cyan">Headline</p>
                <p className="mt-1 font-heading text-lg font-bold leading-snug">{result.headline}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {result.insights.map((ins, i) => (
                  <div key={i} className={cx('flex items-start gap-3 rounded-2xl border p-4', TONE_CARD[ins.tone])}>
                    <span className={cx('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', TONE_ICON[ins.tone])}>
                      <InsightGlyph icon={ins.icon} />
                    </span>
                    <div className="min-w-0">
                      <p className="font-heading text-sm font-bold">{ins.title}</p>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-muted2">{ins.body}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-line bg-white/[0.03] p-4">
                <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
                  <IconTrophy size={12} className="text-cyan" /> Suggested focus
                </p>
                <p className="text-sm leading-relaxed text-ink2">{result.focus}</p>
              </div>

              <p className="px-1 text-center text-[11px] text-muted">
                Generated by Gemini from your own logged data. Not medical or nutrition advice.{' '}
                <button onClick={() => nav('/history')} className="underline underline-offset-2">
                  Back to History
                </button>
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
