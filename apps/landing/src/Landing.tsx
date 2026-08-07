/**
 * grindz.dev — the marketing site, and the whole of this deployment.
 *
 * Structured as three acts down a scrolling left column, with the door held open on the right:
 *
 *   ACT 1  the hook   — the name, what this is in one line, and the numbers
 *   ACT 2  the proof  — screenshots, the muscle map, and the three features that carry it
 *   ACT 3  the close  — one account across devices, and what happens to your data
 *
 * The screenshots come before the muscle map: they show the product, and the map is a detail
 * of it. The h1 is the app name — see the note above it before changing that.
 *
 * The right pane is `position: sticky`, which is the point of the split: the left side can be
 * as long as it needs to be to earn the click, and the click is never more than a glance away.
 * Below `lg` the panes stack with the call to action FIRST, so a phone visitor lands on it
 * instead of scrolling to find it.
 *
 * **No sign-in happens here.** This origin has no Supabase client and no session — the CTA is
 * a link to app.grindz.dev, which is the origin whose localStorage will hold the session. See
 * src/lib/domains.ts for why that split is not optional.
 */
import { APP_SIGNIN_URL } from './lib/domains'
import { BodyMap } from './components/BodyMap'
import {
  IconDumbbell,
  IconCalendar,
  IconChart,
  IconClock,
  IconTrophy,
  IconHistory,
  IconScale,
} from './components/Icons'

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

export function Landing() {
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
          {/*
            The app name is the h1, and it is the largest thing on the page.

            This is not a design preference. Google renders this page before checking it —
            createRoot() has replaced the static shell in index.html by then, so the shell's
            heading is not what gets read; this component is. When the tagline held the
            h1, brand verification rejected the app with "the app name 'Grindz' configured for
            your OAuth consent screen does not match the app name on your homepage", because
            the only heading on the rendered page was "Train on purpose. Know what you trained."

            The tagline is an h2 directly under it and keeps its display size, so the pitch
            still leads visually — but the document now says, in its own structure, that this
            page is Grindz. Do not demote this back to a <span>.
          */}
          <div className="flex items-center gap-3">
            <Mark size={44} />
          </div>

          <h1 className="mt-6 font-heading text-[clamp(2.75rem,5.4vw,4.25rem)] font-extrabold leading-[1.02] tracking-tight">
            Grindz
          </h1>

          <h2 className="mt-4 font-heading text-[clamp(1.5rem,2.9vw,2.25rem)] font-extrabold leading-[1.1] tracking-tight text-muted2">
            Train on purpose.{' '}
            <span className="bg-cyan bg-clip-text text-transparent">Know what you trained.</span>
          </h2>

          <p className="mt-6 max-w-[54ch] text-[17px] leading-relaxed text-muted2">
            Grindz is a training log. Record each set as you lift it, see which muscles you have
            worked this week, and check what you lifted last time before you load the bar.
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

          {/* ───────────────────────────── ACT 2 — THE PROOF ─────────────────────────── */}
          <h2 className="mt-14 font-heading text-sm font-bold uppercase tracking-[0.14em] text-muted">
            What it looks like
          </h2>

          <div className="relative mt-6 flex items-end gap-4 sm:gap-6">
            <img
              src="/showcase/phone-progress.png"
              alt="The Grindz muscle heat map, showing which muscles were trained this week"
              className="w-[30%] max-w-[220px] rounded-[1.6rem] border border-line2 shadow-card"
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
            />
          </div>

          {/* the real component, not a screenshot of it */}
          <div className="mt-16 rounded-3xl border border-line bg-white/[0.02] p-6">
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

          {/*
            What Google asks for, and why.

            This is a verification requirement, not decoration: the homepage must "explain with
            transparency the purpose for which your app requests user data" and describe how the
            app uses it. Saying "sign in with Google" is not that — it names the mechanism and
            leaves the reason unstated.

            It lives at the end of the pitch on purpose. It was briefly moved up under the hook
            on the theory that the verifier wanted it above the fold, but that was a guess and it
            put a block of consent-screen prose in front of the product. The evidence does not
            support the guess: this copy was already present in Google's rendered capture of the
            page while it sat down here. What was actually missing was the app name in the h1.

            Keep this in step with the same section in index.html and with docs at /privacy/.
          */}
          <div className="mt-8 rounded-3xl border border-line bg-white/[0.02] p-7">
            <h2 className="font-heading text-xl font-extrabold tracking-tight">
              What Grindz asks Google for
            </h2>
            <p className="mt-3 max-w-[62ch] text-[14.5px] leading-relaxed text-muted2">
              Signing in with Google gives Grindz three things: your <strong>email address</strong>,
              your <strong>name</strong> and your <strong>profile picture</strong>. The email
              identifies your account so your training history follows you between the browser and
              the phone. The name and picture are only shown back to you, so you can see which
              account you are signed in as.
            </p>
            <p className="mt-3 max-w-[62ch] text-[14.5px] leading-relaxed text-muted2">
              That is the whole list. Grindz cannot read your Gmail, your Drive, your Contacts or
              your Calendar — it never asks for them, and no permission it holds would allow it.
              Nothing from your Google account is sold, shared or used for advertising.
            </p>
            <p className="mt-3 max-w-[62ch] text-[14.5px] leading-relaxed text-muted">
              Full detail in the{' '}
              <a
                href="/privacy/"
                className="text-cyan underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
              >
                privacy policy
              </a>
              .
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
            A link, not a button — this origin cannot sign anyone in.

            Sign-in has to happen on app.grindz.dev, because that is the origin whose
            localStorage will hold the session. Running the OAuth round-trip here would
            deposit it on grindz.dev, where the app cannot read it: the user would return
            "signed in" to a page with no app on it, then be asked to sign in again the
            moment they clicked through. So this deployment's job is to hand them over.

            It hands over the intent as well as the person. Linking to the bare origin landed
            them on the app's own signed-out front door, where they had to press a second
            Google button to get what this one promised — so the link carries `?signin=1` and
            the app goes straight to Google. See APP_SIGNIN_URL in ./lib/domains.
          */}
          <a
            href={APP_SIGNIN_URL}
            className="mt-7 flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-6 py-4 font-heading text-[15px] font-bold text-[#111] transition hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan active:scale-[0.985]"
          >
            <GoogleG />
            Continue with Google
          </a>

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
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan px-4 py-3 font-heading text-[13.5px] font-bold text-white shadow-card transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
            >
              Get the APK
            </a>
          </div>

          {/*
            The privacy link sits with the consent sentence rather than in a page footer, because
            this is the moment it is relevant — and because Google's OAuth brand verification
            wants a reachable policy URL discoverable from the page carrying the sign-in.

            /privacy/ is a static file in public/, not a route: this deployment ships no router.
          */}
          <p className="mt-6 text-xs leading-relaxed text-muted">
            By continuing you agree that Grindz may store the training data you enter, so it can be
            shown back to you across your devices. See the{' '}
            <a
              href="/privacy/"
              className="text-muted2 underline underline-offset-2 transition hover:text-cyan focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
            >
              privacy policy
            </a>
            .
          </p>
        </div>
      </aside>
    </div>
  )
}
