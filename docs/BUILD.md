# Building Grindz

Two surfaces come out of this repo. Pick the one you need.

| Surface | Path | Output |
|---|---|---|
| Web app / PWA | `apps/web` | `dist/`, deployable as static files |
| React Native Android app | `apps/mobile` | `Grindz-vX.Y.Z.apk` — **this is the shipped APK** |

---

## Prerequisites

- **Node** 20+
- **JDK 17** and the **Android SDK** for anything Android (`ANDROID_HOME` must be set)
- A `.env` in each app directory. Neither is committed. Both apps read the **same Supabase
  project**:

  `apps/web/.env`
  ```
  VITE_SUPABASE_URL=...
  VITE_SUPABASE_ANON_KEY=...
  ```

  `apps/mobile/.env`
  ```
  EXPO_PUBLIC_SUPABASE_URL=...
  EXPO_PUBLIC_SUPABASE_ANON_KEY=...
  ```

  The anon key is a *publishable* client key — it is designed to be shipped and is already in
  the web bundle. Row-level security is what protects the data, not the key.

---

## Web app

```bash
cd apps/web
npm install
npm run dev        # http://localhost:5173
npm run build      # -> dist/
npm run preview    # serve the build
npm run typecheck
npm run verify:paint   # asserts the body-map palette matches its documentation
```

For Google sign-in to work, add your origin to the Supabase dashboard under
**Authentication → URL Configuration → Redirect URLs**.

### Demo mode

`apps/web` has a dev-only bypass that skips Google OAuth and swaps Supabase for a
localStorage mock seeded with a realistic 6-week training block. It is double-gated —
`import.meta.env.DEV` **and** an explicit env var — so it cannot reach a production bundle:

```bash
VITE_DEV_BYPASS_AUTH=1 VITE_DEV_SEED=1 npm run dev
```

---

## React Native app (the shipped APK)

```bash
cd apps/mobile
npm install
npm run android          # debug build onto a connected device/emulator
```

Release APK:

```bash
cd apps/mobile/android
./gradlew assembleRelease
# -> app/build/outputs/apk/release/app-release.apk
```

### Signing

`apps/mobile/android/app/debug.keystore` signs release builds and is **deliberately not in
this repo** (`*.keystore` is gitignored). Two consequences:

- You must supply your own before `assembleRelease` will work.
- **Keep the original safe.** Every published Grindz release is signed with it; a build signed
  with a different key cannot install as an upgrade over an existing install — Android rejects
  it with a signature mismatch, and the user has to uninstall first.

### Versioning — change it in TWO places

`assembleRelease` does **not** run `expo prebuild`, so it never reads `app.json`. Bumping only
`app.json` produces an APK still labelled with the old version.

- `apps/mobile/app.json` → `expo.version`, `expo.android.versionCode`
- `apps/mobile/android/app/build.gradle` → `versionName`, `versionCode`

### Why `android/` is committed

Expo's usual advice is to let `expo prebuild` generate `android/`. This project commits it
because it carries hand-written changes that a regenerate would silently destroy: the ABI
selection, the version literals above, and the Windows path workaround below. Treat
`expo prebuild --clean` as a destructive operation here.

### APK size

`android/gradle.properties` pins **ARM only**:

```properties
reactNativeArchitectures=armeabi-v7a,arm64-v8a
```

x86/x86_64 exist for emulators on Intel machines — no physical Android phone uses them — and
they were 46.8 MB of a 104.8 MB APK, measured by unzipping it:

```
23.52 MB  lib/x86_64       emulator only
23.30 MB  lib/x86          emulator only
22.03 MB  lib/arm64-v8a    modern phones
15.27 MB  lib/armeabi-v7a  older phones
```

Dropping the two took the APK from 104.8 MB to **55.4 MB**.

To run on an x86 emulator, override per invocation rather than editing the property back:

```bash
./gradlew assembleDebug -PreactNativeArchitectures=x86_64
```

Measure rather than guess — this is how the numbers above were obtained:

```bash
unzip -l app-release.apk | awk '$4 ~ /^lib\// {split($4,a,"/"); s[a[2]]+=$1} \
  END {for(x in s) printf "%7.2f MB  %s\n", s[x]/1048576, x}' | sort -rn
```

**Native libraries dominate APK size; assets barely register.** Before adding any native
module, multiply its `.so` size by the ABI count — that is its true cost, and it can silently
cancel a large asset saving. It did exactly that when the CDN migration landed alongside
`react-native-keyboard-controller` (which pulls in `react-native-reanimated`) and `expo-image`.

### Building on Windows

`assembleRelease` hits the 260-character path limit. The new-architecture codegen compiles
sources out of `node_modules`, and CMake names each object file after the source's **absolute**
path; for `react-native-safe-area-context` that comes to 373 characters and ninja aborts with
*"Filename longer than 260 characters"*. `LongPathsEnabled=1` does not help — the ninja bundled
with Android SDK cmake 3.22.1 ignores it — and lowering `CMAKE_OBJECT_PATH_MAX` does not help
because CMake's Ninja generator emits the long name regardless.

Only shortening both paths works. Measured, not guessed:

```
staging dir alone .......... 304  (still over)
short project path alone ... 267  (still over)
both ....................... 249  (fits)
```

Half of it is already in `android/app/build.gradle`:

```gradle
externalNativeBuild { cmake { buildStagingDirectory = file('C:/x') } }
```

The other half is the project path, and it has to be a **real** short directory — copy the
project out and build the copy:

```bash
robocopy <project> C:\g /E /MT:32 /XD android\build android\app\build
cd /d C:\g\android && gradlew assembleRelease
```

Neither shortcut works: a junction is canonicalised straight back to the long path by Gradle,
and a `subst` drive breaks Expo autolinking (`settings.gradle` fails evaluating
`expoAutolinking.useExpoModules()`). Both were tried; only the copy builds.

### Verification fixture

`apps/mobile/src/lib/verify-fixture.ts` injects a stub session plus sample rows when
`EXPO_PUBLIC_VERIFY=1`, so every signed-in screen can be reached in an emulator with no Google
credentials. It is gated on an env var absent from `.env`, so a normal build cannot enable it.

Before shipping, confirm it is **absent** from the bundle:

```bash
unzip -p app-release.apk assets/index.android.bundle > /tmp/b.js
for m in "Verify User" "verify@local" "vf-s-" "VERIFICATION ONLY"; do
  echo "$m: $(grep -c "$m" /tmp/b.js)"    # all four must be 0
done
```

---

## Repo-wide checks

```bash
node scripts/check-parity.mjs   # the 5 files that must stay byte-identical across both apps
```
