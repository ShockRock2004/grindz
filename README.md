<div align="center">

<img src="docs/logo.png" width="104" alt="Grindz" />

# Grindz

**Log every set. See every muscle.**

[![Download APK](https://img.shields.io/badge/Download-Grindz%20v1.3.0%20APK-00c6ff?style=for-the-badge&logo=android&logoColor=white)](../../releases/latest)
[![How to install](https://img.shields.io/badge/How%20to%20install-555?style=for-the-badge)](docs/INSTALL.md)
[![Open in browser](https://img.shields.io/badge/Open%20in%20browser-0072ff?style=for-the-badge)](https://app.grindz.dev)

![Android 7.0+](https://img.shields.io/badge/Android-7.0%2B-3ddc84?logo=android&logoColor=white)
![APK 52.7 MB](https://img.shields.io/badge/APK-52.7%20MB-informational)
![Free](https://img.shields.io/badge/Free-no%20ads-00c6ff)

<br/>

<img src="docs/screenshots/phone/home.png" width="30%" alt="Home" />
<img src="docs/screenshots/phone/progress.png" width="30%" alt="Muscle heat map" />
<img src="docs/screenshots/phone/session.png" width="30%" alt="Live workout" />

</div>

---

## You do not remember what you actually trained

You think you hit back twice this week. You did not. You did shoulders twice and told yourself it counted.

Grindz answers that question and nothing else. Log a set and the muscle it worked lights up. Open the map on Sunday and the gap is obvious.

It is free. No ads. No trackers. No subscription waiting three screens in.

---

## 🗺️ The muscle map is the point

Every other log gives you a list of numbers. This one draws you.

The figures are traced anatomy and every muscle is addressable on its own. Train chest and the pecs go bright. The triceps that helped go faint. Everything you skipped stays flat.

That is the whole idea. A week you can read in one look.

<div align="center">
<img src="docs/screenshots/tablet/progress.png" width="82%" alt="The muscle map on a tablet" />
</div>

---

## 🏋️ What it does

| | |
|---|---|
| **Log as you lift** | Weight and reps one set at a time. RPE on the set you just finished so the number is still honest. |
| **Rest timer** | Starts itself. Vibrates when it is up. Keeps the screen awake so it does not die mid set. |
| **Progression** | Last time and your best sit where you type the next number. PRs get caught as they happen. |
| **Plan the week** | Drag a split onto any day. Up to three blocks. Today shows on the home screen. |
| **History** | A 16 week heatmap and a streak. Search every session you have logged. |
| **Bodyweight** | Track it and watch the trend. |
| **AI assist** | Optional. Adding a custom exercise files it under the right muscle and writes a form cue. Uses your own key. |

One session can span as many muscle groups as you like. Chest and triceps is one trip to the gym and one workout.

---

## 📲 Get it

**Android.** Grab the APK from the [latest release](../../releases/latest) and open it. Android will ask you to allow installs from your browser the first time. Play Protect will warn you because the app did not come from the Play Store. Tap **Install without scanning** and carry on.

Full walkthrough with screenshots is in [docs/INSTALL.md](docs/INSTALL.md).

**Browser.** Open [app.grindz.dev](https://app.grindz.dev) and add it to your home screen. Same account. Same data. Nothing to install.

The APK lives on a Release rather than in the repo. A 52 MB binary in git history is a tax every clone pays forever.

---

## 🧱 How it is built

Two apps. One backend. React Native for Android and React with Vite for the web. Supabase holds the data and does Google sign in. Exercise photos come from Cloudflare so neither app ships 33 MB of images.

```
apps/landing    grindz.dev        the pitch
apps/web        app.grindz.dev    the installable web app
apps/mobile     the APK
cdn             42 exercise photos
supabase        the whole schema
```

The two apps deliberately do not share a component library. A Tailwind div and a React Native View do not usefully unify. What they do share is everything a disagreement would break. The muscle geometry and the palette and the PR maths are byte identical and a script proves it.

```bash
node scripts/check-parity.mjs
```

---

## 📚 Docs

| | |
|---|---|
| [Install](docs/INSTALL.md) | Getting the APK onto a phone |
| [Build](docs/BUILD.md) | Running it and shipping a release |
| [Architecture](docs/ARCHITECTURE.md) | How the pieces fit |
| [Images and CDN](docs/IMAGES.md) | Why the photos are not in the app |
| [Domains](docs/DOMAINS.md) | The two origins and why |
| [Supabase](docs/SUPABASE-SETUP.md) | Setting up your own backend |

---

<div align="center">
<sub>Built for one lifter who wanted the log to be honest about what he had actually trained.</sub>
</div>
