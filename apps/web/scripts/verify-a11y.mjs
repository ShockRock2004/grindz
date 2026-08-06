/**
 * Accessibility + responsive proof for the web build.
 *
 * Complements verify-web.mjs, which proves routes render. This proves the things a
 * screenshot of a rendered route does not: that a keyboard user can see where they are,
 * that icon-only controls have accessible names, and that nothing overflows sideways at the
 * four breakpoints in the pre-delivery checklist (375 / 768 / 1024 / 1440).
 *
 * Usage:  node scripts/verify-a11y.mjs --base=http://localhost:4174 --out=<dir>
 */
import { chromium } from 'playwright-core'
import { mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...rest] = a.replace(/^--/, '').split('=')
    return [k, rest.join('=') || true]
  }),
)
const BASE = args.base ?? 'http://localhost:4174'
const OUT = args.out ?? 'a11y-shots'

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
await mkdir(OUT, { recursive: true })
const problems = []

/* ---------------------------------------------------------------- 1. keyboard focus */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' })
  const page = await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="sidebar"]')
  await page.waitForTimeout(900)

  let ringed = 0
  const steps = 10
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press('Tab')
    await page.waitForTimeout(120)
    const info = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      const s = getComputedStyle(el)
      const w = parseFloat(s.outlineWidth) || 0
      const solid = s.outlineStyle !== 'none' && w > 0
      // a ring drawn with box-shadow counts too
      const shadow = s.boxShadow && s.boxShadow !== 'none'
      return { tag: el.tagName.toLowerCase(), visible: solid || shadow, outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}` }
    })
    if (!info) continue
    if (info.visible) ringed++
    else problems.push(`tab ${i + 1}: <${info.tag}> focused with NO visible indicator (${info.outline})`)
    if (i === 3) await page.screenshot({ path: join(OUT, 'focus-ring.png') })
  }
  console.log(`  keyboard: ${ringed}/${steps} tab stops had a visible focus indicator`)
  await ctx.close()
}

/* ------------------------------------------------- 2. accessible names on icon buttons */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
  const page = await ctx.newPage()
  for (const path of ['/', '/progress', '/history', '/session', '/planner']) {
    await page.goto(BASE + path, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid="sidebar"]')
    await page.waitForTimeout(500)
    const nameless = await page.evaluate(() => {
      const out = []
      for (const b of document.querySelectorAll('button, a[href]')) {
        const text = (b.textContent || '').trim()
        const label = b.getAttribute('aria-label') || b.getAttribute('title')
        if (!text && !label) out.push(b.className.toString().slice(0, 70) || b.tagName)
      }
      return out
    })
    for (const n of nameless) problems.push(`${path}: interactive element with no accessible name — ${n}`)
  }
  console.log(`  accessible names: checked 5 routes`)
  await ctx.close()
}

/* ------------------------------------------------------ 3. responsive, no h-scroll */
for (const w of [375, 768, 1024, 1440]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark', hasTouch: w < 768 })
  const page = await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  const over = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }))
  // 1px of rounding is not a defect; a real overflow is many px
  if (over.doc > over.win + 2) problems.push(`${over.win}px: horizontal overflow — content is ${over.doc}px wide`)
  await page.screenshot({ path: join(OUT, `w-${w}.png`) })
  console.log(`  ${String(w).padStart(4)}px: doc ${over.doc} vs viewport ${over.win}${over.doc > over.win + 2 ? '  OVERFLOW' : '  ok'}`)
  await ctx.close()
}

await browser.close()

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`)
  for (const p of [...new Set(problems)].slice(0, 25)) console.error(`  ${p}`)
  process.exit(1)
}
console.log('\nPASS — focus visible, all controls named, no horizontal overflow at 375/768/1024/1440.')
