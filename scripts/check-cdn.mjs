#!/usr/bin/env node
/**
 * Verify every image the CDN is supposed to publish.
 *
 * `cdn/public/` is the source of truth: whatever is in there is what the Worker serves, at
 * the same path. So walking the directory and HEADing each corresponding URL checks the
 * deployment end to end — a missing file, a wrong path prefix, a Worker built from the wrong
 * root directory, and a lost cache header all surface as failures.
 *
 *   node scripts/check-cdn.mjs
 *   node scripts/check-cdn.mjs https://<old-worker>.workers.dev
 *
 * Exits non-zero if anything is not a 200, so it can gate a deploy.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = join(ROOT, 'cdn', 'public')

/** Read the origin out of assetCdn.ts rather than hardcoding it, so the two cannot drift. */
async function defaultOrigin() {
  const src = await readFile(join(ROOT, 'apps', 'web', 'src', 'data', 'assetCdn.ts'), 'utf8')
  const m = src.match(/ASSET_CDN\s*=\s*'([^']+)'/)
  if (!m) throw new Error('could not find ASSET_CDN in apps/web/src/data/assetCdn.ts')
  return m[1]
}

async function walk(dir) {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(p)))
    // _headers is configuration, not an asset — it is consumed by Cloudflare, not served
    else if (e.name !== '_headers') out.push(p)
  }
  return out
}

const origin = (process.argv[2] || (await defaultOrigin())).replace(/\/$/, '')
const files = await walk(PUBLIC)

if (files.length === 0) {
  console.error(`No files under ${PUBLIC} — nothing to check.`)
  process.exit(1)
}

console.log(`Checking ${files.length} assets against ${origin}\n`)

let failed = 0
let noCache = 0

// modest concurrency: enough to be quick, not enough to look like an attack
const QUEUE = [...files]
async function worker() {
  while (QUEUE.length) {
    const file = QUEUE.pop()
    const path = '/' + relative(PUBLIC, file).split(/[\\/]/).join('/')
    const url = origin + path
    try {
      const res = await fetch(url, { method: 'HEAD', redirect: 'follow' })
      const cc = res.headers.get('cache-control') || ''
      if (!res.ok) {
        failed++
        console.error(`  ✗ ${res.status}  ${path}`)
      } else if (path === '/catalog.json') {
        // the one deliberately mutable file — see cdn/public/_headers. Immutable here would
        // mean a new exercise never reaches a device that already cached the old copy.
        if (/immutable/.test(cc)) {
          failed++
          console.error(`  ✗ ${path} is cached immutable — it should re-check every few minutes`)
        }
      } else if (!/immutable/.test(cc)) {
        // serving but not cached immutably: images work, and every device re-downloads
        noCache++
        console.warn(`  ! 200 but cache-control="${cc}"  ${path}`)
      }
    } catch (err) {
      failed++
      console.error(`  ✗ ERR  ${path} — ${err.message}`)
    }
  }
}
await Promise.all(Array.from({ length: 8 }, worker))

console.log()
if (failed) {
  console.error(`FAILED — ${failed} of ${files.length} did not return 200.`)
  process.exit(1)
}
if (noCache) {
  console.error(`FAILED — all ${files.length} served, but ${noCache} lack \`immutable\`.`)
  console.error('Check cdn/public/_headers reached the deployment.')
  process.exit(1)
}
console.log(`OK — all ${files.length} assets return 200 and are cached immutably.`)
