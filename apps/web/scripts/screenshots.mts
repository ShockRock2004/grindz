/**
 * Generates the README screenshots at the exact viewports of the two AVDs used for
 * manual testing, so the images in the docs match what the hardware actually renders:
 *
 *   pixel_7             1080 x 2400 @ 420dpi  ->  412 x 915 CSS px, DPR 2.625
 *   galaxy_tab_s9fe_plus 2304 x 1440 @ 240dpi -> 1536 x 960 CSS px, DPR 1.5
 *
 * CSS px = physical px / (dpi / 160). Passing the real DPR rather than a round number
 * matters: the body map is an SVG and the rings are stroked at sub-pixel widths, so a
 * wrong DPR produces hairlines that no real device shows.
 *
 * Shoots the WEB build, not the native app, and does so on purpose. The native app talks
 * to Supabase directly with no local mock, so screenshotting it means signing in as a real
 * user and publishing that user's actual training history. The web build has a dev bypass
 * with generated sample data (see db-seed.ts) covering the same components — BodyMap,
 * Charts, SetsPerMuscle and the theme are shared source — so the images are representative
 * without putting anyone's data in a public README.
 *
 * Usage (server must already be running with the bypass on):
 *   VITE_DEV_BYPASS_AUTH=1 VITE_DEV_SEED=1 npx vite --port 5199 --strictPort
 *   npx tsx scripts/screenshots.mts
 */
import { chromium, type Browser } from 'playwright-core'
import { mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const BASE = process.env.SHOT_BASE ?? 'http://localhost:5199'
const OUT = process.env.SHOT_OUT ?? 'docs/screenshots'

interface Device {
  dir: string
  width: number
  height: number
  dpr: number
  landscape: boolean
}

const DEVICES: Device[] = [
  { dir: 'phone', width: 412, height: 915, dpr: 2.625, landscape: false },
  { dir: 'tablet', width: 1536, height: 960, dpr: 1.5, landscape: true },
]

interface Shot {
  name: string
  path: string
  /** skip on devices whose dir is listed */
  skip?: string[]
}

const SHOTS: Shot[] = [
  { name: 'home', path: '/' },
  { name: 'progress', path: '/progress' },
  { name: 'history', path: '/history' },
  { name: 'category', path: '/category/chest' },
  { name: 'planner', path: '/planner' },
  { name: 'session', path: '/session' },
]

/**
 * An in-progress chest session, written before any app script runs so /session has
 * something to render. Weights match the seeded 6-week block so the "last time" hints
 * line up instead of showing a first-ever-workout empty state.
 */
const ACTIVE = {
  categoryKey: 'chest',
  title: 'Chest',
  startedAt: 0, // stamped at runtime
  exercises: [
    {
      exercise: 'Flat Bench Press',
      sets: [
        { weight: 72.5, reps: 8, done: true },
        { weight: 72.5, reps: 8, done: true },
        { weight: 75, reps: 6, done: false },
      ],
    },
    {
      exercise: 'Incline Bench Press',
      sets: [
        { weight: 57.5, reps: 10, done: false },
        { weight: 57.5, reps: 9, done: false },
      ],
    },
    { exercise: 'Pec Fly', sets: [{ weight: 30, reps: 12, done: false }] },
  ],
}

/**
 * playwright-core ships no browser of its own. Prefer the cached Playwright build (it is
 * the version this package was tested against); fall back to whatever Chrome is installed.
 */
async function launch(): Promise<Browser> {
  const cache = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'ms-playwright') : null
  if (cache) {
    try {
      const dirs = (await readdir(cache)).filter((d) => /^chromium-\d+$/.test(d)).sort()
      const newest = dirs.at(-1)
      if (newest) {
        return await chromium.launch({
          executablePath: join(cache, newest, 'chrome-win64', 'chrome.exe'),
        })
      }
    } catch {
      /* fall through to the installed Chrome */
    }
  }
  return await chromium.launch({ channel: 'chrome' })
}

const browser = await launch()
let failures = 0

for (const dev of DEVICES) {
  const dir = join(OUT, dev.dir)
  await mkdir(dir, { recursive: true })

  const ctx = await browser.newContext({
    viewport: { width: dev.width, height: dev.height },
    deviceScaleFactor: dev.dpr,
    isMobile: !dev.landscape,
    hasTouch: true,
    colorScheme: 'dark',
    // The app stores kilograms and formats by locale; pin both so the numbers in the
    // screenshots are stable between runs on differently-configured machines.
    locale: 'en-GB',
    timezoneId: 'Asia/Kolkata',
  })

  // Seed the live session before any bundle executes.
  await ctx.addInitScript(
    ([key, session]) => {
      const s = JSON.parse(session as string)
      s.startedAt = Date.now() - 41 * 60 * 1000
      localStorage.setItem(key as string, JSON.stringify(s))
    },
    ['cfit:active', JSON.stringify(ACTIVE)] as const,
  )

  const page = await ctx.newPage()

  // Track anything the CDN refuses to serve — a broken exercise photo is easy to miss by
  // eye in a dark screenshot but obvious in the response log.
  const broken: string[] = []
  page.on('response', (r) => {
    if (r.status() >= 400) broken.push(`${r.status()} ${r.url()}`)
  })

  // First load performs the seed write; reload so every page renders against a warm store.
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.reload({ waitUntil: 'networkidle' })

  for (const shot of SHOTS) {
    if (shot.skip?.includes(dev.dir)) continue
    await page.goto(BASE + shot.path, { waitUntil: 'networkidle' })
    // Rings, CountUp and the body map all animate in; let them land.
    await page.waitForTimeout(1400)
    await page.evaluate(() => document.fonts.ready)
    const file = join(dir, `${shot.name}.png`)
    await page.screenshot({ path: file })
    console.log(`  ${dev.dir}/${shot.name}.png`)
  }

  if (broken.length) {
    failures += broken.length
    console.error(`\n  ${dev.dir}: ${broken.length} failed request(s):`)
    for (const b of [...new Set(broken)]) console.error(`    ${b}`)
  }

  await ctx.close()
}

await browser.close()

if (failures) {
  console.error(`\nFinished with ${failures} failed request(s) — check the CDN before publishing.`)
  process.exit(1)
}
console.log('\nAll screenshots written, no failed requests.')
