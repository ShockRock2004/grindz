/**
 * Throwaway visual-iteration helper: screenshot one route at one width.
 *
 *   node scripts/shot.mjs --base=http://localhost:5199 --path=/ --out=x.png [--w=1440] [--h=900]
 *
 * Exists so layout tweaks are judged by looking at the result rather than by reasoning about
 * CSS in the abstract.
 */
import { chromium } from 'playwright-core'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

const a = Object.fromEntries(
  process.argv.slice(2).map((x) => {
    const [k, ...r] = x.replace(/^--/, '').split('=')
    return [k, r.join('=') || true]
  }),
)
const BASE = a.base ?? 'http://localhost:5199'
const W = Number(a.w ?? 1440)
const H = Number(a.h ?? 900)

async function launch() {
  const cache = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'ms-playwright') : null
  if (cache) {
    try {
      const dirs = (await readdir(cache)).filter((d) => /^chromium-\d+$/.test(d)).sort()
      const n = dirs.at(-1)
      if (n) return await chromium.launch({ executablePath: join(cache, n, 'chrome-win64', 'chrome.exe') })
    } catch {
      /* fall through */
    }
  }
  return await chromium.launch({ channel: 'chrome' })
}

const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, colorScheme: 'dark' })
const page = await ctx.newPage()
// `--early` skips the networkidle wait, which is the only way to catch the boot splash: by
// the time the network is idle the app has mounted and the splash has already faded out.
await page.goto(BASE + (a.path ?? '/'), {
  waitUntil: a.early ? 'commit' : 'networkidle',
  timeout: 45000,
})
if (a.click) {
  await page.waitForSelector(String(a.click), { timeout: 15000 })
  await page.locator(String(a.click)).first().click()
}
if (a.key) await page.keyboard.press(String(a.key))
await page.waitForTimeout(Number(a.wait ?? 1600))
await page.screenshot({ path: String(a.out ?? 'shot.png'), fullPage: a.full === 'true' })
console.log('wrote', a.out ?? 'shot.png')
await browser.close()
