#!/usr/bin/env node
/**
 * Where is the grindz.dev setup actually up to?
 *
 * The five steps in docs/DOMAINS.md each depend on the one before, and each fails in a way
 * that is easy to misread from a browser — a parking wildcard answers for every subdomain, a
 * proxied Vercel record returns a redirect loop rather than an error, and `.dev` being
 * HSTS-preloaded means a certificate problem looks like a dead site. This checks the chain
 * from DNS upward and says which step you are on.
 *
 *   node scripts/check-domains.mjs
 *   node scripts/check-domains.mjs mydomain.dev
 *
 * Queries a public resolver directly rather than the OS one, so a stale local cache cannot
 * report success that nobody else can see.
 */
import { Resolver } from 'node:dns/promises'

const SITE = (process.argv[2] || 'grindz.dev').replace(/^https?:\/\//, '').replace(/\/$/, '')
const APP = `app.${SITE}`
const CDN = `cdn.${SITE}`

const resolver = new Resolver({ timeout: 5000, tries: 2 })
resolver.setServers(['8.8.8.8', '1.1.1.1'])

const PARKING = /^(91\.195\.240\.|199\.59\.24[0-3]\.)/ // Sedo / Name.com parking ranges

const PASS = '  ✔'
const FAIL = '  ✘'
const WARN = '  !'
const SKIP = '  ·'

const ok = (m) => console.log(`${PASS} ${m}`)
const no = (m) => console.log(`${FAIL} ${m}`)
const warn = (m) => console.log(`${WARN} ${m}`)
const skip = (m) => console.log(`${SKIP} ${m}`)

async function q(fn, name) {
  try {
    return await fn(name)
  } catch {
    return null
  }
}

/** HEAD, falling back to GET — some edges reject HEAD on the apex. */
async function head(url) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, { method, redirect: 'manual' })
      return res
    } catch (e) {
      if (method === 'GET') return { error: e.cause?.code || e.message }
    }
  }
}

console.log(`\n  grindz domain check — ${SITE}\n`)

/* ── Step 1 — delegation ─────────────────────────────────────────────── */
console.log('  Step 1  Zone delegated to Cloudflare')

const ns = (await q((n) => resolver.resolveNs(n), SITE)) || []
let onCloudflare = false

if (!ns.length) {
  no(`no NS records — ${SITE} is not registered, or not yet propagating`)
} else {
  onCloudflare = ns.every((h) => /\bns\.cloudflare\.com$/i.test(h))
  const list = ns.sort().join(', ')
  if (onCloudflare) ok(`nameservers are Cloudflare's — ${list}`)
  else no(`nameservers are NOT Cloudflare's — ${list}`)
}

// a parking wildcard shadows everything below it, so call it out explicitly
const apexA = (await q((n) => resolver.resolve4(n), SITE)) || []
const parked = apexA.filter((ip) => PARKING.test(ip))
if (parked.length && onCloudflare) {
  // the zone moved but the imported records came with it — this is the trap
  warn(`${SITE} still points at a parking IP (${parked.join(', ')})`)
  warn("  delete the A / wildcard records Cloudflare imported — they shadow your CNAMEs")
} else if (parked.length) {
  skip(`${SITE} is on the registrar's parking page (${parked.join(', ')}) — expected until Step 1`)
}

/* ── Step 2 — the CDN Worker ─────────────────────────────────────────── */
console.log('\n  Step 2  cdn Worker + Custom Domain')

const cdnA = (await q((n) => resolver.resolve4(n), CDN)) || []
if (!cdnA.length) {
  no(`${CDN} does not resolve — Custom Domain not added yet`)
} else if (cdnA.some((ip) => PARKING.test(ip))) {
  no(`${CDN} resolves to the parking IP, not Cloudflare (${cdnA.join(', ')})`)
} else {
  ok(`${CDN} resolves (${cdnA.slice(0, 2).join(', ')})`)
  const res = await head(`https://${CDN}/hero/abs.png`)
  if (res?.error) {
    no(`https://${CDN}/hero/abs.png — ${res.error}`)
  } else if (res.status === 200) {
    const cc = res.headers.get('cache-control') || ''
    if (/immutable/.test(cc)) ok(`images served, cached immutably`)
    else warn(`images served but cache-control="${cc}" — check cdn/public/_headers`)
    console.log(`${SKIP} run \`node scripts/check-cdn.mjs\` to verify all 42`)
  } else {
    no(`https://${CDN}/hero/abs.png returned ${res.status}`)
  }
}

/* ── Step 3 — Vercel ─────────────────────────────────────────────────── */
console.log('\n  Step 3  Vercel serving both hosts')

for (const host of [SITE, APP]) {
  const cname = await q((n) => resolver.resolveCname(n), host)
  const a = (await q((n) => resolver.resolve4(n), host)) || []

  if (!cname && !a.length) {
    no(`${host} does not resolve`)
    continue
  }
  if (a.some((ip) => PARKING.test(ip))) {
    no(`${host} → parking IP; the record has not been replaced`)
    continue
  }

  const res = await head(`https://${host}/`)
  if (res?.error) {
    no(`https://${host}/ — ${res.error}`)
    continue
  }
  const server = (res.headers.get('server') || '').toLowerCase()
  const loc = res.headers.get('location')

  if (res.status >= 300 && res.status < 400) {
    // the failure mode grey-clouding prevents
    no(`https://${host}/ → ${res.status} redirect to ${loc}`)
    if (/cloudflare/.test(server)) {
      warn('  served by Cloudflare, not Vercel — the record is orange-clouded (proxied).')
      warn('  Set it to DNS only, or switch SSL/TLS to Full (strict).')
    }
  } else if (res.status === 200) {
    if (/vercel/.test(server)) ok(`https://${host}/ → 200, served by Vercel`)
    else if (/cloudflare/.test(server)) {
      warn(`https://${host}/ → 200 but server="${server}" — proxied through Cloudflare.`)
      warn('  Works, but grey-cloud it unless you set SSL/TLS to Full (strict).')
    } else ok(`https://${host}/ → 200 (server: ${server || 'unset'})`)
  } else {
    no(`https://${host}/ → ${res.status}`)
  }
}

/* ── what's left ─────────────────────────────────────────────────────── */
console.log('\n  Steps 4–5  Supabase + Google — dashboard only, not checkable from here')
skip('Supabase → Auth → URL Configuration: Site URL = https://' + APP)
skip('Google Console → Authorized JavaScript origins: both hosts')
console.log()

if (!onCloudflare) {
  console.log('  → Next: move the nameservers to Cloudflare (docs/DOMAINS.md, Step 1).\n')
} else if (parked.length) {
  console.log('  → Next: delete the imported parking / wildcard records in Cloudflare DNS.\n')
} else if (!cdnA.length) {
  console.log('  → Next: create the grindz-cdn Worker and add the Custom Domain (Step 2).\n')
} else {
  console.log('  → DNS layer looks right. Remaining work is Vercel/Supabase/Google config.\n')
}
