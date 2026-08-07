/**
 * grindz.dev — the marketing site, and the whole of this deployment.
 *
 * One column, top to bottom, on a wide frame. It used to be a two pane split with a sticky
 * sign in rail, which made the page feel like an app screen and squeezed the product into a
 * narrow column with dead margins either side.
 *
 * The order encodes the pitch, so keep it:
 *
 *   1. what it is on the left, a picture of it on the right
 *   2. both ways in, centred
 *   3. the muscle map, which is the reason to choose this over any other log
 *   4. the features, each one wired to a screenshot of itself
 *   5. what Google is asked for, small, at the end
 *
 * **The h1 is the app name and must stay exactly "Grindz".** Google renders this page for
 * brand verification and compares that heading against the consent screen. It has already
 * failed once on this. See docs/OAUTH-VERIFICATION.md and scripts/check-oauth-compliance.mjs.
 *
 * **No sign in happens here.** localStorage is per origin, so a session minted on this domain
 * would be invisible to the app. The button links to app.grindz.dev carrying `?signin=1`, and
 * that origin asks Google. See ./lib/domains.
 *
 * Copy rule for this file: short sentences, no hyphens.
 */
import { useState } from 'react'
import { APP_SIGNIN_URL, APP_ORIGIN } from './lib/domains'
import { BodyMap } from './components/BodyMap'
import { IconDumbbell, IconTrophy, IconCalendar } from './components/Icons'

const REPO = 'https://github.com/ShockRock2004/grindz'
const RELEASES = `${REPO}/releases/latest`

function GoogleG({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.8 6.1C12.2 13.2 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.7 7l7.2 5.6c4.2-3.9 6.6-9.6 6.6-16.1z" />
      <path fill="#FBBC05" d="M10.3 28.5c-.5-1.4-.8-3-.8-4.5s.3-3.1.8-4.5l-7.8-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.5 10.6l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.2-5.6c-2 1.4-4.6 2.2-8 2.2-6.4 0-11.8-3.7-13.7-9.1l-7.8 6.1C6.4 42.6 14.6 48 24 48z" />
    </svg>
  )
}

/** Inline rather than a lucide re export: lucide has deprecated its brand glyphs. */
function GithubMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.73.5.99 5.24.99 11.51c0 4.86 3.15 8.98 7.52 10.44.55.1.75-.24.75-.53v-1.9c-3.06.67-3.71-1.3-3.71-1.3-.5-1.28-1.23-1.62-1.23-1.62-1-.68.08-.67.08-.67 1.1.08 1.69 1.14 1.69 1.14.99 1.69 2.59 1.2 3.22.92.1-.72.39-1.2.7-1.48-2.44-.28-5.01-1.22-5.01-5.45 0-1.2.43-2.19 1.13-2.96-.11-.28-.49-1.4.11-2.92 0 0 .93-.3 3.04 1.13a10.5 10.5 0 0 1 5.54 0c2.11-1.43 3.03-1.13 3.03-1.13.6 1.52.22 2.64.11 2.92.71.77 1.13 1.76 1.13 2.96 0 4.24-2.58 5.17-5.03 5.44.4.34.75 1.01.75 2.04v3.03c0 .29.2.64.76.53a11.02 11.02 0 0 0 7.51-10.44C23.01 5.24 18.27.5 12 .5z" />
    </svg>
  )
}

/** The Grindz mark, matching the app icon and the in app header. */
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
  { value: '42', label: 'exercises' },
  { value: 'Free', label: 'no ads, ever' },
]

/**
 * Each feature owns a screenshot of itself. Hovering the card brings that shot to the front
 * of the gallery, which is the point of pairing them: the claim and the proof are the same
 * gesture rather than two things to read separately.
 */
const FEATURES = [
  {
    Icon: IconDumbbell,
    title: 'Log as you lift',
    body: 'Weight and reps, one set at a time. The rest timer starts itself.',
    shot: '/showcase/phone-session.png',
    alt: 'Logging a chest session in Grindz, set by set',
  },
  {
    Icon: IconTrophy,
    title: 'Progression in view',
    body: 'Last time and your best, where you type the next number.',
    shot: '/showcase/phone-history.png',
    alt: 'Grindz history, showing a 16 week training heatmap',
  },
  {
    Icon: IconCalendar,
    title: 'Plan the week',
    body: 'Drag a split onto any day, up to three blocks.',
    shot: '/showcase/phone-planner.png',
    alt: 'The Grindz weekly planner with a split dropped onto it',
  },
]

/*
 * A representative week for the muscle map. Static sample data on purpose: nobody is signed in
 * yet, so there is nothing real to draw, and an empty figure would sell the feature short.
 * A Map rather than a Set because the map expresses intensity, not just presence.
 */
const HERO_TRAINED = new Map<string, 'primary' | 'secondary'>([
  ['chest', 'primary'],
  ['shoulders', 'primary'],
  ['triceps', 'secondary'],
  ['back', 'secondary'],
  ['biceps', 'secondary'],
])

/*
 * Two sizes on purpose. The hero card is where the decision is made, so it gets the full
 * target; the footer repeats the same three for anyone who read to the end, and a second set
 * of full size buttons down there competed with the first rather than backing it up.
 */
const BTN = 'flex items-center justify-center gap-3 rounded-2xl font-heading font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan active:scale-[0.985]'
const GOOGLE_SKIN = 'bg-white text-[#111] hover:bg-white/90'
const APK_SKIN = 'bg-cyan text-white shadow-card hover:brightness-110'
const SIZE_LG = 'px-6 py-3.5 text-[14.5px]'
const SIZE_SM = 'px-5 py-3 text-[13.5px]'
const GHOST =
  'flex items-center gap-3 rounded-2xl border border-line text-muted2 transition hover:border-line2 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan'

export function Landing() {
  /** Which feature is being pointed at. Defaults to the first, so the gallery is never limp. */
  const [hovered, setHovered] = useState<number | null>(null)
  const active = hovered ?? 0

  return (
    <div data-testid="landing" className="min-h-full">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(1300px 760px at 12% -12%, rgba(0,114,255,0.22) 0%, transparent 62%), radial-gradient(900px 600px at 90% 2%, rgba(0,198,255,0.10) 0%, transparent 58%)',
        }}
      />

      <main className="mx-auto w-full max-w-[1560px] px-6 pb-20 pt-12 sm:px-10 lg:pt-16">
        {/* ══════════════════ 1 · THE PRODUCT, BESIDE A PICTURE OF IT ══════════════════ */}
        <section className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:gap-16">
          <div>
            <Mark size={44} />

            <h1 className="mt-6 font-heading text-[clamp(3rem,6vw,5rem)] font-extrabold leading-[1] tracking-tight">
              Grindz
            </h1>

            <h2 className="mt-4 max-w-[16ch] font-heading text-[clamp(1.6rem,3vw,2.6rem)] font-extrabold leading-[1.12] tracking-tight">
              Log every set.{' '}
              <span className="bg-cyan bg-clip-text text-transparent">See every muscle.</span>
            </h2>

            <p className="mt-5 max-w-[42ch] text-[16.5px] leading-relaxed text-muted2">
              A training log with a muscle map that shows exactly what you worked this week.
              Free, with no ads.
            </p>

            <dl className="mt-8 flex flex-wrap gap-x-9 gap-y-4">
              {STATS.map((s) => (
                <div key={s.label}>
                  <dt className="sr-only">{s.label}</dt>
                  <dd>
                    <div className="tnum font-heading text-2xl font-extrabold">{s.value}</div>
                    <div className="mt-0.5 text-[12.5px] text-muted">{s.label}</div>
                  </dd>
                </div>
              ))}
            </dl>

            {/*
              Both ways in, stacked directly under the pitch rather than centred beneath the
              whole fold. The decision is made while the copy is still in view, and the eye
              does not have to travel back across the page to act on it.

              The Google button is a link, not a button: this origin cannot sign anyone in, so
              it hands the person and their intent to the app. See ./lib/domains.
            */}
            <div className="mt-8 max-w-[348px] rounded-3xl border border-line bg-white/[0.02] p-4">
              <div className="flex flex-col gap-2.5">
                <a href={APP_SIGNIN_URL} className={`${BTN} ${GOOGLE_SKIN} ${SIZE_LG}`}>
                  <GoogleG size={18} />
                  Continue with Google
                </a>
                <a
                  href={RELEASES}
                  target="_blank"
                  rel="noreferrer"
                  className={`${BTN} ${APK_SKIN} ${SIZE_LG}`}
                >
                  Get the APK
                </a>
                <a href={REPO} target="_blank" rel="noreferrer" className={`${GHOST} px-4 py-2.5 text-[12.5px]`}>
                  <GithubMark size={15} />
                  <span>
                    Open source. <span className="text-cyan">Star it on GitHub</span>
                  </span>
                </a>
              </div>
            </div>
          </div>

          {/*
            The devices. Tablet behind, phone in front on the right, so the pair reads as one
            object. Both are real captures of the shipped app.

            The tablet shows the home screen rather than the muscle map, deliberately: the map
            is the reason to choose this app and it gets its own section below. Showing it here
            too spent the idea twice and made that section read as a repeat.
          */}
          <div className="relative">
            {/*
              The tablet is held to 85% of its column so the pair does not dominate the fold,
              and the phone hangs off the right edge rather than sitting on top of it. Most of
              the phone now lands in the space the tablet gave up, so it reads as two devices
              rather than one covering the other.
            */}
            <div className="relative mx-auto w-full sm:w-[85%]">
              <img
                src="/showcase/tablet-home.png"
                alt="Grindz on a tablet, showing the week's numbers and the muscle groups to train"
                className="w-full rounded-2xl border border-line2 shadow-raise"
                width={2304}
                height={1440}
              />
              {/*
                Sits inside the frame on a phone, where a negative offset clips against the
                viewport edge. It only breaks out of the tablet once there is room for it.
              */}
              <img
                src="/showcase/phone-session.png"
                alt="Logging a workout in Grindz on a phone"
                className="absolute -bottom-6 right-0 w-[26%] rounded-[1.1rem] border border-line2 shadow-raise sm:-bottom-10 sm:-right-[13%] sm:w-[26%]"
                loading="lazy"
              />
            </div>
          </div>
        </section>

        {/* ══════════════════ 2 · THE MUSCLE MAP ══════════════════════════════════════ */}
        <section className="mt-20 sm:mt-24">
          <div className="grid items-center gap-10 rounded-3xl border border-line bg-white/[0.02] p-7 sm:p-10 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <p className="font-heading text-[11px] font-bold uppercase tracking-[0.16em] text-cyan">
                Why Grindz
              </p>
              <h2 className="mt-3 font-heading text-[clamp(1.5rem,2.4vw,2rem)] font-extrabold leading-tight tracking-tight">
                A muscle map that means something
              </h2>
              <p className="mt-4 max-w-[44ch] text-[15.5px] leading-relaxed text-muted2">
                Every muscle is drawn separately and shaded by what you actually trained. Bright
                for worked, faint for assisting, flat for untouched. A group you keep skipping is
                impossible to miss.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-5 text-[12.5px] text-muted">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm bg-cyan" /> Worked
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm bg-cyan/25" /> Assisting
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm bg-white/10" /> Not yet
                </span>
              </div>
            </div>
            <div className="mx-auto w-full max-w-[460px]">
              <BodyMap trained={HERO_TRAINED} onPick={() => {}} />
            </div>
          </div>
        </section>

        {/* ══════════════════ 4 · FEATURES, EACH WIRED TO ITS OWN SCREENSHOT ══════════ */}
        <section className="mt-24 sm:mt-28">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start lg:gap-14">
            {/* ── the claims, stacked ── */}
            <div className="flex flex-col gap-3">
              {FEATURES.map(({ Icon, title, body }, i) => (
                <button
                  key={title}
                  type="button"
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(i)}
                  onBlur={() => setHovered(null)}
                  aria-pressed={active === i}
                  className={`rounded-2xl border p-5 text-left transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan ${
                    active === i
                      ? 'border-cyan/40 bg-cyan/[0.06]'
                      : 'border-line bg-white/[0.02] hover:border-line2'
                  }`}
                >
                  <span
                    className={`grid h-10 w-10 place-items-center rounded-xl transition ${
                      active === i ? 'bg-cyan/20 text-cyan' : 'bg-cyan/10 text-cyan'
                    }`}
                  >
                    <Icon size={19} />
                  </span>
                  <h3 className="mt-3 font-heading text-[16px] font-extrabold tracking-tight">{title}</h3>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted2">{body}</p>
                </button>
              ))}
            </div>

            {/* ── the proof: the same three, as screens ── */}
            <div className="flex items-end justify-center gap-3 sm:gap-5 lg:justify-start">
              {FEATURES.map(({ shot, alt }, i) => (
                <img
                  key={shot}
                  src={shot}
                  alt={alt}
                  loading="lazy"
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  className={`w-1/3 rounded-[1.2rem] border transition duration-300 ${
                    active === i
                      ? 'z-10 -translate-y-2 scale-[1.06] border-cyan/40 opacity-100 shadow-raise'
                      : 'border-line2 opacity-45 grayscale-[35%]'
                  }`}
                />
              ))}
            </div>
          </div>

        </section>

        {/* ══════════════════ 5 · FOOTER — THE SMALL PRINT, AND THE LAST WAY IN ═══════ */}
        {/*
          The disclosure sits here rather than mid page because it is reference, not pitch.
          It cannot be removed or paraphrased away: Google's brand verification requires the
          homepage to say which data the app requests and why, and check-oauth-compliance.mjs
          asserts these exact subjects appear in both this file and index.html. Keep them in
          step.

          The call to action sits beside it so the page ends on a way in rather than on legal
          text, and so a reader who scrolled the whole thing does not have to scroll back up.
        */}
        <footer className="mt-20 border-t border-line pt-10 sm:mt-24">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)] lg:gap-16">
            <div>
              <h2 className="font-heading text-[13px] font-bold uppercase tracking-[0.14em] text-muted">
                Data and privacy
              </h2>
              <p className="mt-3 max-w-[62ch] text-[12.5px] leading-relaxed text-muted">
                Signing in shares your email address, name and profile picture, so your training
                follows you between devices. Grindz cannot read your Gmail, Drive, Contacts or
                Calendar. Nothing is sold or shared.
              </p>
              <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
                <a
                  href="/privacy/"
                  className="text-cyan underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
                >
                  Privacy policy
                </a>
                <a
                  href={APP_ORIGIN}
                  className="hover:text-muted2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
                >
                  Open the app
                </a>
                <a
                  href={REPO}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-muted2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
                >
                  GitHub
                </a>
                <span className="text-line2">© {new Date().getFullYear()} Grindz</span>
              </p>
            </div>

            <div className="rounded-3xl border border-line bg-white/[0.02] p-5">
              <h2 className="font-heading text-[17px] font-extrabold tracking-tight">Start your log</h2>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted2">
                Free, and free of ads. Your sets on every device.
              </p>

              <div className="mt-4 flex flex-col gap-2.5">
                <a href={APP_SIGNIN_URL} className={`${BTN} ${GOOGLE_SKIN} ${SIZE_SM}`}>
                  <GoogleG size={16} />
                  Continue with Google
                </a>
                <a
                  href={RELEASES}
                  target="_blank"
                  rel="noreferrer"
                  className={`${BTN} ${APK_SKIN} ${SIZE_SM}`}
                >
                  Get the APK
                </a>
                <a href={REPO} target="_blank" rel="noreferrer" className={`${GHOST} px-4 py-2.5 text-[12.5px]`}>
                  <GithubMark size={15} />
                  <span>
                    Open source. <span className="text-cyan">Star it on GitHub</span>
                  </span>
                </a>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  )
}
