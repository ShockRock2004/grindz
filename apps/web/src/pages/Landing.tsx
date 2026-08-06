/**
 * Public landing page — the only thing a signed-out visitor sees.
 *
 * Structured as three acts down a scrolling left column, with the door held open on the right:
 *
 *   ACT 1  the hook   — what this is in one line, plus the muscle map as the hero visual
 *   ACT 2  the proof  — screenshots and the three features that actually carry the product
 *   ACT 3  the close  — one account across devices, and what happens to your data
 *
 * The right pane is `position: sticky`, which is the point of the split: the left side can be
 * as long as it needs to be to earn the click, and the click is never more than a glance away.
 * Below `lg` the panes stack with sign-in FIRST, so a phone visitor lands on the button instead
 * of scrolling to find it.
 */
import { useState } from 'react'
import { signInWithGoogle } from '../lib/auth'
import { APP_ORIGIN } from '../lib/domains'
import { BodyMap } from '../components/BodyMap'
import {
  IconDumbbell,
  IconCalendar,
  IconChart,
  IconClock,
  IconTrophy,
  IconHistory,
  IconScale,
} from '../components/Icons'

function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.8 6.1C12.2 13.2 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.7 7l7.2 5.6c4.2-3.9 6.6-9.6 6.6-16.1z" />
      <path fill="#FBBC05" d="M10.3 28.5c-.5-1.4-.8-3-.8-4.5s.3-3.1.8-4.5l-7.8-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.5 10.6l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.2-5.6c-2 1.4-4.6 2.2-8 2.2-6.4 0-11.8-3.7-13.7-9.1l-7.8 6.1C6.4 42.6 14.6 48 24 48z" />
    </svg>
  )
}

/** The Grindz mark, matching the app icon and the in-app header. */
function Mark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id="landingMark" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00c6ff" />
          <stop offset="100%" stopColor="#0072ff" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#landingMark)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z" />
        <path d="m2.5 21.5 1.4-1.4" />
        <path d="m20.1 3.9 1.4-1.4" />
        <path d="M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z" />
        <path d="m9.6 14.4 4.8-4.8" />
      </g>
    </svg>
  )
}

const STATS = [
  { value: '8', label: 'muscle groups' },
  { value: '42', label: 'exercises, illustrated' },
  { value: '∞', label: 'custom lifts' },
]

/** Act 2 — the three that actually carry the product. */
const FEATURES = [
  {
    Icon: IconDumbbell,
    title: 'Log as you lift',
    body: 'Weight × reps, ticked off one set at a time, with RPE captured on the set you just finished — while it is still honest. The rest timer starts itself and the screen stays awake.',
  },
  {
    Icon: IconTrophy,
    title: 'Progression where you need it',
    body: 'Every exercise shows what you did last time and your best, right where you are about to type the next number. PRs — top set and estimated 1RM — are caught as they happen.',
  },
  {
    Icon: IconChart,
    title: 'A muscle map that means something',
    body: 'Not decoration: traced anatomy where every muscle is individually shaded by what you actually trained this week, so a neglected group is impossible to miss.',
  },
]

const ALSO = [
  { Icon: IconCalendar, t: 'Weekly planner with splits' },
  { Icon: IconHistory, t: '16-week training heatmap' },
  { Icon: IconClock, t: 'Automatic rest timer' },
  { Icon: IconScale, t: 'Bodyweight tracking' },
]

const PROMISES = ['Your sets, plan and PRs on every device', 'Works offline once loaded', 'Free, and free of ads']

/*
 * A representative week for the hero body map. Static sample data on purpose: nobody is signed
 * in yet, so there is nothing real to draw, and an empty figure would sell the feature short.
 * A Map rather than a Set because TrainedInput uses the map form to express intensity — chest
 * and shoulders worked, the muscles that assist those shaded lighter.
 */
const HERO_TRAINED = new Map<string, 'primary' | 'secondary'>([
  ['chest', 'primary'],
  ['shoulders', 'primary'],
  ['triceps', 'secondary'],
  ['back', 'secondary'],
  ['biceps', 'secondary'],
])

/**
 * `marketing` — served from grindz.dev, where the call to action is a link to the app.
 * `signin`    — served from app.grindz.dev to a signed-out visitor; the button signs in.
 *
 * Same page either way. Only the door at the end of it differs; see src/lib/domains.ts.
 */
export function Landing({ variant = 'signin' }: { variant?: 'marketing' | 'signin' }) {
  const marketing = variant === 'marketing'
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const go = () => {
    setBusy(true)
    setErr(null)
    // a successful call navigates away, so reaching here means it failed
    signInWithGoogle().catch(() => {
      setBusy(false)
      setErr('Could not reach Google just now. Try again.')
    })
  }

  return (
    <div data-testid="landing" className="min-h-full lg:grid lg:h-full lg:grid-cols-[1.25fr_minmax(400px,0.75fr)]">
      {/* ═════════════════════════════ LEFT — the pitch, in three acts ═════════════════ */}
      <section className="relative order-2 overflow-hidden px-6 py-14 lg:order-1 lg:h-full lg:overflow-y-auto lg:px-14 lg:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(1100px 620px at 12% -10%, rgba(0,114,255,0.20) 0%, transparent 62%), radial-gradient(760px 520px at 88% 6%, rgba(0,198,255,0.09) 0%, transparent 58%)',
          }}
        />

        <div className="mx-auto max-w-3xl">
          {/* ───────────────────────────── ACT 1 — THE HOOK ──────────────────────────── */}
          <div className="flex items-center gap-3">
            <Mark size={44} />
            <span className="font-heading text-2xl font-extrabold tracking-tight">Grindz</span>
          </div>

          <h1 className="mt-10 font-heading text-[clamp(2.25rem,4.6vw,3.75rem)] font-extrabold leading-[1.04] tracking-tight">
            Train on purpose.
            <br />
            <span className="bg-cyan bg-clip-text text-transparent">Know what you trained.</span>
          </h1>

          <p className="mt-6 max-w-[54ch] text-[17px] leading-relaxed text-muted2">
            A training log that is honest about your week. Log every set as you lift, watch the
            muscle map fill in, and see progression where you actually need it — on the bar you are
            about to load.
          </p>

          <dl className="mt-9 flex flex-wrap gap-x-10 gap-y-4">
            {STATS.map((s) => (
              <div key={s.label}>
                <dt className="sr-only">{s.label}</dt>
                <dd>
                  <div className="tnum font-heading text-3xl font-extrabold">{s.value}</div>
                  <div className="mt-0.5 text-[13px] text-muted">{s.label}</div>
                </dd>
              </div>
            ))}
          </dl>

          {/* hero visual — the real component, not a screenshot of it */}
          <div className="mt-12 rounded-3xl border border-line bg-white/[0.02] p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
              A week of training, mapped
            </p>
            <div className="mx-auto mt-4 max-w-[430px]">
              <BodyMap trained={HERO_TRAINED} onPick={() => {}} />
            </div>
            <div className="mt-4 flex items-center justify-center gap-5 text-[11px] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-cyan" /> Worked
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-cyan/25" /> Assisting
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-white/10" /> Not yet
              </span>
            </div>
          </div>

          {/* ───────────────────────────── ACT 2 — THE PROOF ─────────────────────────── */}
          <h2 className="mt-20 font-heading text-sm font-bold uppercase tracking-[0.14em] text-muted">
            What it looks like
          </h2>

          <div className="relative mt-6 flex items-end gap-4 sm:gap-6">
            <img
              src="/showcase/phone-progress.png"
              alt="The Grindz muscle heat map, showing which muscles were trained this week"
              className="w-[30%] max-w-[220px] rounded-[1.6rem] border border-line2 shadow-card"
              loading="lazy"
            />
            <img
              src="/showcase/phone-home.png"
              alt="The Grindz home screen, showing the week ring, streak and workout categories"
              className="-mb-6 w-[34%] max-w-[250px] rounded-[1.8rem] border border-line2 shadow-card"
            />
            <img
              src="/showcase/phone-session.png"
              alt="Logging a live workout in Grindz, with sets, RPE and a rest timer"
              className="w-[30%] max-w-[220px] rounded-[1.6rem] border border-line2 shadow-card"
              loading="lazy"
            />
          </div>

          <ul className="mt-14 flex flex-col gap-4">
            {FEATURES.map(({ Icon, title, body }) => (
              <li key={title} className="flex gap-4 rounded-2xl border border-line bg-white/[0.02] p-5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cyan/10 text-cyan">
                  <Icon size={21} />
                </span>
                <div>
                  <h3 className="font-heading text-[15px] font-bold">{title}</h3>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{body}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-[13px] text-muted">
            {ALSO.map(({ Icon, t }) => (
              <span key={t} className="flex items-center gap-2">
                <Icon size={15} className="text-cyan-soft" />
                {t}
              </span>
            ))}
          </div>

          {/* ───────────────────────────── ACT 3 — THE CLOSE ─────────────────────────── */}
          <div className="mt-20 rounded-3xl border border-cyan/20 bg-cyan/[0.04] p-7">
            <h2 className="font-heading text-xl font-extrabold tracking-tight">One account, every screen</h2>
            <p className="mt-3 max-w-[62ch] text-[14.5px] leading-relaxed text-muted2">
              Everything syncs to your Google account, so a session logged in the browser is on your
              phone before you have racked the bar. The web app needs nothing installed — open it and
              add it to your home screen. The Android app is a free download.
            </p>
          </div>

          <p className="mt-8 pb-4 text-xs leading-relaxed text-muted">
            Your training data is private to your account and is never shared with other users. No
            ads, no trackers, nothing sold on.
          </p>
        </div>
      </section>

      {/* ═════════════════════════════ RIGHT — the door, held open ═════════════════════ */}
      <aside className="relative order-1 border-line px-6 py-14 lg:order-2 lg:h-full lg:overflow-y-auto lg:border-l lg:py-0">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 hidden lg:block"
          style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 42%)' }}
        />
        <div className="mx-auto flex w-full max-w-sm animate-fadeUp flex-col justify-center lg:min-h-screen lg:py-14">
          <div className="mb-7 hidden lg:block">
            <Mark size={36} />
          </div>

          <h2 className="font-heading text-[28px] font-extrabold leading-tight tracking-tight">Start your log</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Sign in with Google. No password to invent, no account to confirm — your history is
            waiting on the other side.
          </p>

          {/*
            On grindz.dev this is a link, not a button.

            Sign-in has to happen on app.grindz.dev, because that is the origin whose
            localStorage will hold the session — running the OAuth round-trip here would
            deposit it on the marketing origin, where the app cannot read it. So the
            marketing host's job is to hand the visitor over, and the app asks for Google.
          */}
          {marketing ? (
            <a
              href={APP_ORIGIN}
              className="mt-7 flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-6 py-4 font-heading text-[15px] font-bold text-[#111] transition hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan active:scale-[0.985]"
            >
              <GoogleG />
              Continue with Google
            </a>
          ) : (
            <button
              onClick={go}
              disabled={busy}
              className="mt-7 flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-6 py-4 font-heading text-[15px] font-bold text-[#111] transition hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan active:scale-[0.985] disabled:opacity-60"
            >
              <GoogleG />
              {busy ? 'Redirecting to Google…' : 'Continue with Google'}
            </button>
          )}

          {err && (
            <p role="alert" className="mt-3 text-[13px] text-bad">
              {err}
            </p>
          )}

          <div className="mt-7 space-y-3 border-t border-line pt-7">
            {PROMISES.map((t) => (
              <div key={t} className="flex items-start gap-3 text-[13.5px] text-muted2">
                <span className="mt-[3px] grid h-4 w-4 shrink-0 place-items-center rounded-full bg-cyan/15 text-cyan">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                {t}
              </div>
            ))}
          </div>

          {/* the second door, for people who would rather have the app */}
          <div className="mt-7 rounded-2xl border border-line bg-white/[0.02] p-4">
            <p className="font-heading text-[13px] font-bold">Also on Android</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
              Sideload the APK — same account, same data.
            </p>
            <a
              href="https://github.com/ShockRock2004/grindz/releases/latest"
              target="_blank"
              rel="noreferrer"
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-line2 px-4 py-2.5 font-heading text-[13px] font-bold text-cyan transition hover:border-cyan/50 hover:bg-cyan/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
            >
              Get the APK
            </a>
          </div>

          <p className="mt-6 text-xs leading-relaxed text-muted">
            By continuing you agree that Grindz may store the training data you enter, so it can be
            shown back to you across your devices.
          </p>
        </div>
      </aside>
    </div>
  )
}
