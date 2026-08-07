<!--
  Template for a Grindz GitHub release. Copy it, replace every X.Y.Z and the size, rewrite
  "What's new", publish.

  Two things that silently break it:

    - Images must use raw.githubusercontent.com. That host serves .svg as image/svg+xml;
      a github.com/blob/ URL serves HTML and renders as a broken image.
    - The button must link the release ASSET (/releases/download/<tag>/<file>.apk), not the
      release page, or it is two clicks instead of one.

  GitHub strips CSS but allows this subset of HTML, which is why centring uses
  <div align="center"> and the layout uses <table> rather than flexbox.

  Keep "What's new" to four or five bullets. The reasoning belongs in the commit messages.
-->

<div align="center">

<img src="https://raw.githubusercontent.com/ShockRock2004/grindz/main/docs/logo.png" width="92" alt="Grindz" />

# Grindz vX.Y.Z

![APK](https://img.shields.io/badge/Grindz--vX.Y.Z.apk-SIZE%20MB-00c6ff?style=for-the-badge&logo=android&logoColor=white)
![Android 7.0+](https://img.shields.io/badge/Android-7.0%2B-3ddc84?style=for-the-badge&logo=android&logoColor=white)
![ARM](https://img.shields.io/badge/ARM-arm64%20%2B%20v7a-0072ff?style=for-the-badge)

### Click the big blue button below to download the APK

<a href="https://github.com/ShockRock2004/grindz/releases/download/vX.Y.Z/Grindz-vX.Y.Z.apk">
<img src="https://raw.githubusercontent.com/ShockRock2004/grindz/main/docs/download-button.svg" width="340" alt="Get the APK" />
</a>

**Installs over vPREV** — your history is in your account, not on the device.

</div>

---

## 📲 How to install

<table>
<tr>
<td valign="top">

**1 · Download**
Tap **Get the APK** above and confirm the download.

**2 · Open it**
Use the download notification, or **Files → Downloads**.

**3 · Allow the install, once**
If Android says your phone *isn't allowed to install unknown apps from this source*, tap **Settings** and turn the permission on for your browser. You only do this once.

**4 · Play Protect will warn you** →
Tap **Install without scanning**.

This warning appears for **every** app that does not come from the Play Store — it means "not seen before", not "unsafe". Every Grindz release is signed with the same key, and the source is in this repository.

**5 · Install, open, sign in with Google.**

</td>
<td width="300" valign="top">

<img src="https://raw.githubusercontent.com/ShockRock2004/grindz/main/docs/install/play-protect.png" width="290" alt="Google Play Protect: App scan recommended. Tap Install without scanning." />

</td>
</tr>
</table>

> **Already have Grindz?** Just install over it. Same signing key, so it upgrades in place and keeps your data.

---

## ✨ What's new

- **Headline change** — one line on what it does for you.
- **Second change** — one line.
- **Third change** — one line.
- **Fixes** — the short version.

> ⚠️ **Any warning for people on older builds goes here.**

---

<div align="center">

<img src="https://raw.githubusercontent.com/ShockRock2004/grindz/main/docs/screenshots/phone/home.png" width="30%" alt="Home" />
<img src="https://raw.githubusercontent.com/ShockRock2004/grindz/main/docs/screenshots/phone/progress.png" width="30%" alt="Muscle heat map" />
<img src="https://raw.githubusercontent.com/ShockRock2004/grindz/main/docs/screenshots/phone/session.png" width="30%" alt="Live workout" />

**[Full install guide](https://github.com/ShockRock2004/grindz/blob/main/docs/INSTALL.md)** · **[Use it in the browser instead](https://app.grindz.dev)**

</div>
