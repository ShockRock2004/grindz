# Google OAuth brand verification

What makes the Google sign-in screen say **Grindz**, with the logo, instead of
`zwqtrkulbxlwzbxmassg.supabase.co`.

```bash
node scripts/check-oauth-compliance.mjs        # all 13 requirements, against grindz.dev
```

> **It is not a permanent pass.** Google re-checks. A homepage that stops complying loses the
> branding again — quietly, and long after whoever changed the page has forgotten doing it.
> That is what the script is for.

---

## Why the consent screen shows a hostname by default

Until an app's branding is verified, Google falls back to the **top private domain behind the
OAuth client** — which for any Supabase-backed app is the project host. It is cosmetic, and
sign-in works either way, but it reads as somebody else's app asking for your account.

Two ways out:

| | Cost | What the screen says |
|---|---|---|
| **Brand verification** | free, needs a compliant homepage | Grindz + logo |
| Supabase **custom auth domain** (`auth.grindz.dev`) | Supabase Pro | `grindz.dev` — no Supabase ref anywhere |

---

## The five invariants

Redesign the landing page freely. These must survive:

| # | Invariant | Lives in |
|---|---|---|
| 1 | `<h1>` in the static shell is **exactly** `Grindz` | `apps/landing/index.html` |
| 2 | The "What Grindz asks Google for" disclosure — email, name, picture, the reason for each, and the Gmail/Drive/Contacts/Calendar exclusion | `index.html` **and** `src/Landing.tsx` |
| 3 | A link to `/privacy/` from the homepage | both files |
| 4 | `grindz.dev/privacy/` returns 200 without signing in | `apps/landing/public/privacy/` |
| 5 | `grindz.dev` serves the homepage directly — no cross-domain redirect, no login wall | `apps/landing/vercel.json` |

### Invariant 2 is the one that breaks

The copy exists **twice**, on either side of the render boundary:

```
index.html      → what a crawler that does not execute JavaScript reads
Landing.tsx     → what a person reads
```

Rewrite the React page, forget the shell, and the site looks perfect in a browser while the
crawler-visible copy silently falls out of compliance. The script checks both.

---

## What changes require re-verification

| Change | Consequence |
|---|---|
| App name | re-verification |
| App logo | re-verification |
| Homepage or privacy policy URL | re-verification |
| **Adding scopes** beyond `email` / `profile` / `openid` | a much heavier review — sensitive scopes need a security assessment |

Grindz requests only the three basic scopes. That is why verification here is **brand-only**
and does not require a demo video or a third-party audit. Keep it that way if you can.

---

## Things that cost hours the first time

### "Purpose of your app" does not mean what it says

The rejection reads:

> Your homepage does not explain the purpose of your app.

The requirement it maps to is:

> "Explain with transparency **the purpose for which your app requests user data**"

Not *describe your product* — the page already did that, twice, and was rejected both times.
It means: say which Google data you ask for and why. Invariant 2.

### The verifier reads Google's index, not your site

The landing page is client-rendered. For a while it served **2,627 bytes of HTML and zero
characters of text** — a browser showed a full page, a crawler saw nothing. Both content
rejections followed from that.

But fixing it was not enough, because verification reads Google's **crawl index**, and
`grindz.dev` had never been crawled — `Last crawl: N/A`. An uncrawled homepage reads to
Google as a homepage with nothing on it, no matter what it actually serves.

So after any change to invariants 1-3:

1. Deploy
2. Search Console → **URL inspection** → `https://grindz.dev/` → **Request indexing**
3. Wait for **Last crawl** to show a timestamp *newer than the deploy*
4. Only then re-run verification

Submitting before the recrawl re-checks the old copy and burns an attempt.

### The verifier runs JavaScript — the static shell is not what gets read

This one cost two rejections on its own, and it quietly invalidates the obvious reading of
the section above.

`index.html` carries a static shell so the page says something before the bundle loads. That
shell contains `<h1>Grindz</h1>`. It is **not** what Google checks. Google *renders* the page
first, and `createRoot()` replaces the shell wholesale on mount — so what the verifier reads
is `src/Landing.tsx`, where the `<h1>` used to be the tagline and the app name was a `<span>`.

Confirmed from Search Console → URL inspection → **VIEW CRAWLED PAGE** → HTML, which is the
DOM Google actually holds:

```html
<h1 class="mt-10 font-heading text-[clamp(2.25rem,4.6vw,3.75rem)] ...">
  Train on purpose.Know what you trained.
```

That class attribute is `Landing.tsx`'s. The shell's heading is nowhere in the capture. The
rejection that follows is *"the app name 'Grindz' configured for your OAuth consent screen
does not match the app name on your homepage"* — accurate, and impossible to diagnose from
`curl` output, which shows the shell and looks perfect.

**The trap this laid for us:** `scripts/check-oauth-compliance.mjs` fetches without executing
JavaScript, so it asserted the shell's `<h1>` and reported 13/13 green through both
rejections. A guard that reads a different document from the verifier is worse than no guard
— it manufactures confidence. It now also asserts the `<h1>` inside `Landing.tsx`.

Rules that follow:

- **Both copies must independently satisfy every content invariant.** The shell is for
  no-JavaScript readers; the component is for Google. Neither is a fallback for the other.
- **Verify against the rendered capture, never `curl`.** `curl` cannot see what Google sees.
- Prefer **VIEW CRAWLED PAGE** (what Google holds) over **TEST LIVE URL** (what it would get
  now) when asking why a *past* attempt failed.

### Preconditions, in order

Each depends on the one before it:

```
domain delegated + serving          →  docs/DOMAINS.md
      ↓
homepage compliant                  →  the five invariants above
      ↓
domain verified in Search Console   →  a TXT record; NEVER delete it
      ↓                                (deleting it un-verifies the domain)
crawled AND indexed                 →  robots.txt + sitemap.xml help; a link
      ↓                                from the GitHub repo's About helps more
submit brand verification
```

The Search Console property must be owned by the **same Google account as the Cloud
project**. A different account produces "the website of your homepage URL is not registered
to you", and the message never says that is what it means.

### The console's issues drawer is unreliable

The "I have fixed the issues" radio in **Branding → View issues** frequently will not accept
a click. Tab to it and press Space, reset zoom with `Ctrl+0`, try Incognito, or submit from
**Verification centre** instead — same request, different page.

That drawer also keeps listing the *previous* attempt's issues after you submit. It is a log,
not a live result. The field that tells you anything is **Verification status**.

---

## Related

- [DOMAINS.md](DOMAINS.md) — the three hostnames and why sign-in must happen on the app host
- [SUPABASE-SETUP.md](SUPABASE-SETUP.md) — the OAuth client, scopes and redirect URLs
- Google's own requirements:
  [verification](https://support.google.com/cloud/answer/13807376) ·
  [app identity and branding](https://support.google.com/cloud/answer/13804963)
