/**
 * Regenerates the Android launcher icons from the Grindz mark.
 *
 * **Why this exists.** `assembleRelease` does not run `expo prebuild`, so the icons under
 * `android/app/src/main/res/mipmap-*` are whatever prebuild produced the last time it ran —
 * changing `assets/icon.png` and rebuilding ships an APK with the OLD launcher icon and no
 * warning. This is the same trap as the version literals in build.gradle (see docs/BUILD.md):
 * anything prebuild generates has to be regenerated deliberately.
 *
 *   node scripts/gen-android-icons.mjs
 *
 * Writes PNGs and removes the stale WebPs of the same name — Android resolves a drawable by
 * resource NAME, so the extension is free to change.
 *
 * Adaptive icons are 108dp square with only the central 72dp guaranteed visible (the launcher
 * masks and parallaxes the rest), so the mark is inset to ~66% of the canvas. The legacy
 * ic_launcher / ic_launcher_round are flat 48dp icons for pre-Oreo launchers and get the mark
 * on the brand background.
 */
import { readFile, writeFile, unlink, readdir, access } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const RES = join(process.cwd(), '..', 'mobile', 'android', 'app', 'src', 'main', 'res')
const BG = '#050505'

/** density -> [adaptive foreground px (108dp), legacy icon px (48dp)] */
const DENSITIES = {
  'mipmap-mdpi': [108, 48],
  'mipmap-hdpi': [162, 72],
  'mipmap-xhdpi': [216, 96],
  'mipmap-xxhdpi': [324, 144],
  'mipmap-xxxhdpi': [432, 192],
}

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

const svg = await readFile(join(process.cwd(), 'public', 'grindz-mark.svg'), 'utf8')
const browser = await launch()

async function render(px, { canvas, pad, round = false }) {
  const ctx = await browser.newContext({ viewport: { width: px, height: px }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>
       html,body{margin:0;height:100%}
       body{display:grid;place-items:center;background:${canvas ? BG : 'transparent'};
            ${round ? 'border-radius:50%;overflow:hidden;' : ''}}
       .m{width:${100 - pad * 2}%;height:${100 - pad * 2}%}
     </style><div class="m">${svg}</div>`,
    { waitUntil: 'load' },
  )
  await page.waitForTimeout(80)
  const buf = await page.screenshot({ omitBackground: !canvas })
  await ctx.close()
  return buf
}

/** Replace a resource, dropping any stale file of the same name with a different extension. */
async function put(dir, name, buf) {
  await writeFile(join(RES, dir, `${name}.png`), buf)
  for (const ext of ['webp', 'jpg']) {
    const stale = join(RES, dir, `${name}.${ext}`)
    try {
      await access(stale)
      await unlink(stale)
    } catch {
      /* nothing to remove */
    }
  }
}

for (const [dir, [fg, legacy]] of Object.entries(DENSITIES)) {
  // adaptive foreground: transparent, inset into the 72dp safe zone
  await put(dir, 'ic_launcher_foreground', await render(fg, { canvas: false, pad: 17 }))
  // legacy icons: opaque, on the brand background
  await put(dir, 'ic_launcher', await render(legacy, { canvas: true, pad: 16 }))
  await put(dir, 'ic_launcher_round', await render(legacy, { canvas: true, pad: 16, round: true }))
  console.log(`  ${dir.padEnd(18)} foreground ${fg}px, legacy ${legacy}px`)
}

/*
 * Splash logo.
 *
 * Also a prebuild artifact, and it had gone stale in a way that was actually visible: the
 * shipped drawable-xxxhdpi/splashscreen_logo.png was a 66 KB grey grid-and-circles placeholder,
 * so the Android launch screen showed that instead of the mark. Transparent, because the
 * splash screen paints its own background colour behind it.
 */
const SPLASH = {
  'drawable-mdpi': 200,
  'drawable-hdpi': 300,
  'drawable-xhdpi': 400,
  'drawable-xxhdpi': 600,
  'drawable-xxxhdpi': 800,
}
for (const [dir, px] of Object.entries(SPLASH)) {
  await put(dir, 'splashscreen_logo', await render(px, { canvas: false, pad: 6 }))
  console.log(`  ${dir.padEnd(18)} splash ${px}px`)
}

await browser.close()
console.log('\nlauncher + splash icons regenerated — assembleRelease does not do this for you')
