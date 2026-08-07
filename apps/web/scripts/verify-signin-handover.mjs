/**
 * The grindz.dev -> app.grindz.dev sign-in handover.
 *
 * `localStorage` is per-origin, so the marketing site cannot run OAuth — a session minted
 * there would be invisible to this app. Its "Continue with Google" is therefore a link, and
 * it carries `?signin=1` to say what the person actually came to do. This app reads that,
 * strips it, and goes straight to Google.
 *
 * It regressed once by being incomplete rather than wrong: the link pointed at the bare
 * origin, so the click handed over the person but not the intent. You arrived at this app's
 * own signed-out front door and had to press a second Google button to get what the first one
 * promised. Nothing errored, so only a behavioural check catches it.
 *
 * Both directions are asserted, and the second matters most: it is what stops the fix turning
 * every ordinary visit into a forced consent screen.
 *
 *   /?signin=1   navigates to Supabase's /auth/v1/authorize, and the flag is gone from the URL
 *   /            navigates nowhere, and the landing page renders
 *
 * Usage — against a local preview of `dist`, or anything else:
 *
 *   npm run build && npx vite preview --port 4321 --strictPort &
 *   node scripts/verify-signin-handover.mjs
 *   BASE=https://app.grindz.dev node scripts/verify-signin-handover.mjs
 *
 * The OAuth hop is aborted at the network layer, so this never depends on Google answering,
 * never needs credentials, and never signs anybody in.
 */
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const BASE = process.env.BASE || 'http://localhost:4321'
const AUTHORIZE = /\/auth\/v1\/authorize/

let failed = 0
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'ok     ' : 'FAILED '} ${name}`)
  if (!ok) {
    if (detail) console.log(`           ${detail}`)
    failed++
  }
}

async function launch() {
  const cache = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'ms-playwright') : null
  if (cache) {
    try {
      const dirs = (await readdir(cache)).filter((d) => /^chromium-\d+$/.test(d)).sort()
      const newest = dirs.at(-1)
      if (newest) return await chromium.launch({ executablePath: join(cache, newest, 'chrome-win64', 'chrome.exe') })
    } catch {
      /* fall through */
    }
  }
  return await chromium.launch({ channel: 'chrome' })
}

const browser = await launch()

async function visit(path, { expectSignIn }) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  const hops = []

  // Catch the OAuth navigation before it leaves the machine.
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (AUTHORIZE.test(url)) {
      hops.push(url)
      return route.abort()
    }
    return route.continue()
  })

  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)

  const url = page.url()
  console.log(`\n${path}`)

  if (expectSignIn) {
    check('goes straight to Google', hops.length > 0, `no authorize hop; still sitting on ${url}`)
    check('strips the flag from the URL', !url.includes('signin='), `url is still ${url}`)
  } else {
    check('does not start sign-in', hops.length === 0, `unexpected authorize hop: ${hops[0]}`)
    check(
      'renders the landing page',
      (await page.locator('[data-testid="landing"]').count()) > 0,
      'no [data-testid="landing"] in the DOM',
    )
  }

  await ctx.close()
}

console.log(`Checking the sign-in handover against ${BASE}`)
await visit('/?signin=1', { expectSignIn: true })
await visit('/', { expectSignIn: false })
await browser.close()

console.log()
if (failed) {
  console.error(`FAILED — ${failed} assertion(s). The landing page's Google button is broken.`)
  process.exit(1)
}
console.log('OK — the handover works, and an ordinary visit is left alone.')
