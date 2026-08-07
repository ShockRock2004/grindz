#!/usr/bin/env node
/**
 * Verify the landing site still meets Google's OAuth brand-verification requirements.
 *
 * Brand verification is what makes the Google consent screen say "Grindz" with the logo
 * instead of the raw Supabase project hostname. It is **not** a permanent pass: Google
 * re-checks, and a homepage that stops complying loses the branding again — silently, and
 * months after whoever broke it has forgotten touching the page.
 *
 * The failure mode this exists for is specific. The disclosure copy lives in TWO files:
 *
 *   apps/landing/index.html      the static shell, which is what a crawler that does not
 *                                execute JavaScript reads
 *   apps/landing/src/Landing.tsx the React page, which is what a person reads
 *
 * Rewrite the React page, forget the shell, and the site looks perfect in a browser while
 * the crawler-visible copy quietly falls out of compliance. That is not hypothetical: the
 * shell was empty once, and Google rejected the app twice for "your homepage does not
 * explain the purpose of your app" while the page plainly did.
 *
 * Requirements checked, from
 *   https://support.google.com/cloud/answer/13807376  (verification requirements)
 *   https://support.google.com/cloud/answer/13804963  (app identity and branding)
 *
 *   1  homepage returns 200 without signing in, and does not redirect off the domain
 *   2  the app name on the homepage matches the consent screen exactly
 *   3  it describes what the app does
 *   4  it states which Google user data is requested, and why
 *   5  it states what the app cannot reach
 *   6  it links to the privacy policy, which is itself reachable
 *
 * Checks 2-5 run against the HTML as served, with no JavaScript executed — deliberately.
 * That is what the verifier sees, and it is the half that breaks without anyone noticing.
 *
 *   node scripts/check-oauth-compliance.mjs
 *   node scripts/check-oauth-compliance.mjs https://grindz-landing.vercel.app
 *
 * Exits non-zero on any failure, so it can gate a deploy.
 */
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** The name configured on the OAuth consent screen. Changing it requires re-verification. */
const APP_NAME = 'Grindz'

const origin = (process.argv[2] || 'https://grindz.dev').replace(/\/$/, '')

/** Strip tags and script bodies: what is left is what a crawler reads as text. */
function visibleText(html) {
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

let failed = 0
let checked = 0

function check(label, ok, detail) {
  checked++
  if (ok) {
    console.log(`  ok       ${label}`)
  } else {
    failed++
    console.error(`  FAILED   ${label}`)
    if (detail) console.error(`           ${detail}`)
  }
}

console.log(`Checking OAuth brand-verification requirements against ${origin}\n`)

// ── 1. the homepage itself ────────────────────────────────────────────────────────────
let res
try {
  res = await fetch(origin + '/', { redirect: 'manual' })
} catch (err) {
  console.error(`Could not reach ${origin}/ — ${err.message}`)
  process.exit(1)
}

if (res.status >= 300 && res.status < 400) {
  const to = res.headers.get('location') || '(no Location header)'
  console.error(`FAILED — the homepage redirects to ${to}.`)
  console.error('Google requires a static homepage URL that does not redirect to another domain.')
  process.exit(1)
}

check('homepage returns 200', res.status === 200, `got ${res.status}`)
if (res.status !== 200) process.exit(1)

const html = await res.text()
const text = visibleText(html)

// ── 2. the app name, exactly ──────────────────────────────────────────────────────────
//
// Google matches the consent screen's app name against the name on the homepage. A tagline
// containing the word is not the same as a heading that IS the word.
const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '').replace(/<[^>]+>/g, '').trim()
check(
  `<h1> is exactly "${APP_NAME}"`,
  h1 === APP_NAME,
  h1 ? `<h1> reads ${JSON.stringify(h1)} — the consent screen says ${JSON.stringify(APP_NAME)}` : 'no <h1> in the served HTML',
)

// ── 3. there is copy at all, and it describes the product ─────────────────────────────
//
// The shell was once empty: 2.6 KB of tags, zero characters of text. A browser showed a
// full page; the verifier saw nothing. 400 is comfortably above "a heading and a link" and
// comfortably below anything the real copy would fall to.
check(`homepage serves readable text without JavaScript`, text.length >= 400, `only ${text.length} characters — is #root empty again?`)
check('describes what the app does', /training log|log (every )?set|workout/i.test(text))

// ── 4-5. the data request: what, why, and what is out of reach ────────────────────────
//
// This is the requirement the rejection wording hides. "Explain with transparency the
// purpose for which your app requests user data" is not "describe your app" — an app can
// describe itself perfectly and still never say why it wants your email.
const scopes = [
  ['requested data: email address', /email address/i],
  ['requested data: name', /\byour name\b/i],
  ['requested data: profile picture', /profile picture/i],
]
for (const [label, re] of scopes) check(label, re.test(text))

check(
  'states why that data is requested',
  /identif\w+ your account|so (your|you)|only shown back to you/i.test(text),
  'the scopes are listed but no purpose is given for them',
)

// Naming what it cannot touch is what makes the disclosure credible rather than a list.
const exclusions = ['Gmail', 'Drive', 'Contacts', 'Calendar']
const missing = exclusions.filter((s) => !new RegExp(s, 'i').test(text))
check('states what it cannot access (Gmail, Drive, Contacts, Calendar)', missing.length === 0, `not mentioned: ${missing.join(', ')}`)

// ── 6. the privacy policy ─────────────────────────────────────────────────────────────
const linksPolicy = /href\s*=\s*["']\/privacy\/?["']/i.test(html)
check('homepage links to /privacy/', linksPolicy)

try {
  const p = await fetch(origin + '/privacy/', { redirect: 'follow' })
  check('/privacy/ returns 200', p.status === 200, `got ${p.status}`)
  const ptext = visibleText(await p.text())
  check('/privacy/ has content', ptext.length >= 500, `only ${ptext.length} characters`)
} catch (err) {
  check('/privacy/ is reachable', false, err.message)
}

// ── the two-file drift this script mainly exists to catch ─────────────────────────────
//
// The React page is what a person reads. If it has drifted from the shell, the site is
// still compliant to a crawler today — but the next person to "tidy up" the duplication
// will delete the wrong copy.
try {
  const tsx = await readFile(join(ROOT, 'apps', 'landing', 'src', 'Landing.tsx'), 'utf8')
  const inTsx = /profile picture/i.test(tsx) && /Gmail/i.test(tsx) && /privacy/i.test(tsx)
  check(
    'src/Landing.tsx carries the same disclosure as index.html',
    inTsx,
    'the rendered page and the served HTML no longer say the same thing — see the header of this file',
  )

  // ── the check that was missing, and it is the one that mattered ─────────────────────
  //
  // Everything above this line reads the *served* HTML, which never executes JavaScript.
  // Google does. By the time it looks, createRoot() has thrown the shell away and this
  // component is the document — so asserting the shell's <h1> proved nothing about the
  // page under test. It passed 13/13 while brand verification rejected the app for
  // "the app name 'Grindz' ... does not match the app name on your homepage", because the
  // rendered h1 was "Train on purpose. Know what you trained."
  //
  // Confirmed from Search Console's own rendered capture, not inferred.
  //
  // There is no browser here, so this is a source-level assertion rather than a real
  // render. It is narrow on purpose: the h1 is the single thing that was wrong, and a
  // regex over the JSX catches it being demoted back to a <span> or handed to a tagline.
  //
  // Strip comments before matching. A comment explaining the rule will naturally quote the
  // tag it is about, and the first match would then be prose rather than JSX — the check
  // would be grading this file's own documentation. Caught exactly that way.
  const tsxCode = tsx.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '').replace(/^\s*\/\/.*$/gm, '')
  const tsxH1 = (tsxCode.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  check(
    `src/Landing.tsx renders <h1> as exactly "${APP_NAME}"`,
    tsxH1 === APP_NAME,
    tsxH1
      ? `the rendered <h1> would read ${JSON.stringify(tsxH1)} — Google reads this one, not index.html`
      : 'no <h1> found in Landing.tsx — the rendered page would have no heading at all',
  )
} catch {
  console.warn('  skipped  src/Landing.tsx not readable from here')
}

console.log()
if (failed) {
  console.error(`FAILED — ${failed} of ${checked} requirements not met.`)
  console.error('Fixing these is what keeps the consent screen saying "Grindz" instead of the')
  console.error('Supabase project hostname. See docs/OAUTH-VERIFICATION.md.')
  process.exit(1)
}
console.log(`OK — all ${checked} brand-verification requirements are met by ${origin}.`)
