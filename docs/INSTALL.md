# Installing Grindz on your phone

Grindz is distributed as a **sideloaded APK**, not through the Play Store. Download it from
the [Releases page](../../releases/latest) and install it directly.

Requirements: **Android 7.0 or newer**, ARM processor (every physical Android phone —
see [why](#why-the-apk-is-arm-only)), about **130 MB** of free space.

---

## The quick way — straight from the phone

1. Open the [**latest release**](../../releases/latest) in your phone's browser.
2. Tap `Grindz-v1.1.1.apk` under **Assets**. Chrome will warn that this type of file can
   harm your device — that warning appears for *every* APK, signed or not. Tap **Download
   anyway**.
3. Open the file from the download notification, or via **Files → Downloads**.
4. Android will say *"For your security, your phone is not allowed to install unknown apps
   from this source."* Tap **Settings**, turn on **Allow from this source**, then press back.
5. Tap **Install**.
6. Play Protect may show *"Unsafe app blocked"* or *"App scan"*. Choose **Install anyway** /
   **More details → Install anyway**. This is because the app is not distributed through the
   Play Store, not because anything is wrong with it.

That's it — Grindz appears in your launcher.

## The other way — from a computer over USB

Useful if you're already set up for Android development.

```bash
# 1. Enable Developer options on the phone:
#    Settings → About phone → tap "Build number" seven times
# 2. Enable Settings → Developer options → USB debugging
# 3. Plug the phone in and accept the "Allow USB debugging?" prompt

adb devices                        # confirm the phone is listed as "device"
adb install -r Grindz-v1.1.1.apk   # -r upgrades in place, keeping your data
```

---

## Updating to a newer version

Download the new APK and install it over the top. **Your workout history is safe** — it
lives in your Supabase account, not on the device, and the local cache is preserved anyway.

Every release is signed with the same key, which is what allows an in-place upgrade. If
Android ever refuses an update with *"App not installed"* or a signature-mismatch error,
it means the build was signed with a different key; uninstall the old copy first, then
install the new one. You will not lose any logged workouts by doing this — sign back in
and everything syncs down.

## Signing in

Grindz uses **Google sign-in** through Supabase. There is no username/password to create.
Your sets, sessions, plan and body metrics sync to your account, so the same history shows
up on the web app and on any device you install the APK on.

---

## Prefer not to install anything?

The **web app** is the same product and needs no installation. Open it in a mobile browser
and use **Add to Home Screen** — it installs as a PWA with its own icon, runs full-screen
with no browser chrome, and works offline. See the
[web app README](../apps/web/README.md) for running or deploying it.

---

## Notes

### Why the APK is ARM-only

The release ships `arm64-v8a` and `armeabi-v7a` only. `x86`/`x86_64` builds exist for
**emulators on Intel development machines** — no physical Android phone uses them — and
they were 46.8 MB of a 104.8 MB download. Dropping them nearly halved the APK, to 55.4 MB.
It will install on any real phone. If you want to run it in an x86 emulator, build it
yourself with the override in [BUILD.md](BUILD.md).

### Why it's not on the Play Store

Play Store distribution requires a developer account, a signed App Bundle, a privacy
policy and a review cycle. This is a personal training app, so it's sideloaded instead.

### First launch downloads images

Exercise photos are **not bundled into the APK** — they stream from a Cloudflare CDN the
first time you open an exercise, then stay cached on the device permanently, including
across app updates. So the app is a much smaller download, and the images cost you nothing
after the first view. See [the CDN notes](../cdn/README.md).

Practically: the first time you browse a muscle group you'll want a connection. After
that, those photos load from disk.
