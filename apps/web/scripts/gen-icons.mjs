/**
 * Rasterises the Grindz mark into every icon size the web app and the Android app need.
 *
 * There is no ImageMagick / sharp in this project, but Chromium is already here for the
 * verification scripts and renders SVG exactly as the browser will — so it is both the most
 * available rasteriser and the most faithful one.
 *
 *   node scripts/gen-icons.mjs
 *
 * Two shapes are produced:
 *   - transparent  : favicons and the Android adaptive-icon foreground, which are composited
 *                    onto a background by the OS or the browser tab.
 *   - on-canvas    : maskable / apple-touch / store icons, which must supply their own
 *                    background or render on whatever the platform picks (often white).
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { chromium } from 'playwright-core'

const WEB = join(process.cwd(), 'public')
const MOBILE = join(process.cwd(), '..', 'mobile', 'assets')
const BG = '#050505'

/** size, output path, whether to paint the dark canvas, and mark inset as a % of the tile */
const TARGETS = [
  { size: 16, out: join(WEB, 'icons', 'favicon-16x16.png'), canvas: false, pad: 2 },
  { size: 32, out: join(WEB, 'icons', 'favicon-32x32.png'), canvas: false, pad: 2 },
  { size: 180, out: join(WEB, 'icons', 'apple-touch-icon.png'), canvas: true, pad: 16 },
  { size: 192, out: join(WEB, 'icons', 'android-chrome-192x192.png'), canvas: true, pad: 16 },
  { size: 512, out: join(WEB, 'icons', 'android-chrome-512x512.png'), canvas: true, pad: 16 },
  // Expo: square store icon, adaptive-icon foreground (safe zone = 33% padding), splash, web favicon
  { size: 1024, out: join(MOBILE, 'icon.png'), canvas: true, pad: 16 },
  { size: 1024, out: join(MOBILE, 'android-icon-foreground.png'), canvas: false, pad: 30 },
  { size: 1024, out: join(MOBILE, 'android-icon-monochrome.png'), canvas: false, pad: 30, mono: true },
  { size: 1024, out: join(MOBILE, 'splash-icon.png'), canvas: false, pad: 26 },
  { size: 48, out: join(MOBILE, 'favicon.png'), canvas: false, pad: 4 },
]

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

const svg = await readFile(join(WEB, 'grindz-mark.svg'), 'utf8')
const browser = await launch()

for (const t of TARGETS) {
  const ctx = await browser.newContext({
    viewport: { width: t.size, height: t.size },
    deviceScaleFactor: 1,
  })
  const page = await ctx.newPage()
  // monochrome themed icons must be a single flat colour; Android tints them itself
  const mark = t.mono ? svg.replace(/url\(#gz\)/g, '#ffffff') : svg
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>
       html,body{margin:0;height:100%;}
       body{display:grid;place-items:center;background:${t.canvas ? BG : 'transparent'};}
       .m{width:${100 - t.pad * 2}%;height:${100 - t.pad * 2}%;}
     </style><div class="m">${mark}</div>`,
    { waitUntil: 'load' },
  )
  await page.waitForTimeout(120)
  await mkdir(dirname(t.out), { recursive: true })
  await page.screenshot({ path: t.out, omitBackground: !t.canvas })
  console.log(`  ${String(t.size).padStart(4)}px  ${t.canvas ? 'canvas' : 'alpha '}  ${t.out}`)
  await ctx.close()
}

/*
 * favicon.ico — a single 32×32 PNG wrapped in an ICO container. Every browser released in
 * the last decade reads PNG-in-ICO; hand-writing the 22-byte header avoids pulling in an
 * image library for one file.
 */
const png32 = await readFile(join(WEB, 'icons', 'favicon-32x32.png'))
const header = Buffer.alloc(22)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // type: icon
header.writeUInt16LE(1, 4) // image count
header.writeUInt8(32, 6) // width
header.writeUInt8(32, 7) // height
header.writeUInt8(0, 8) // palette size (0 = truecolour)
header.writeUInt8(0, 9) // reserved
header.writeUInt16LE(1, 10) // colour planes
header.writeUInt16LE(32, 12) // bits per pixel
header.writeUInt32LE(png32.length, 14) // payload size
header.writeUInt32LE(22, 18) // payload offset
await writeFile(join(WEB, 'icons', 'favicon.ico'), Buffer.concat([header, png32]))
console.log(`    ico  32px    ${join(WEB, 'icons', 'favicon.ico')}`)

await browser.close()
console.log('\nicons written')
