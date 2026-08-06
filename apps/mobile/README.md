# Grindz — Android (React Native)

React Native 0.86 on Expo SDK 57, new architecture (Fabric + TurboModules) with Hermes. **This
is the surface that ships** — the APK on the releases page is built from here.

## Run

```bash
npm install
npm run android      # debug build onto a connected device or emulator
npm start            # Metro only
```

Needs a `.env` (not committed):

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

Release builds and the Windows path workaround are in **[../../docs/BUILD.md](../../docs/BUILD.md)**.

## Things that will bite you

**`android/` is committed on purpose.** It carries hand-written changes that `expo prebuild`
would silently destroy: the ARM-only ABI selection, the version literals, and the CMake staging
directory needed to build on Windows. Treat `expo prebuild --clean` as destructive here.

**Bump the version in two places.** `assembleRelease` never runs `expo prebuild`, so it never
reads `app.json`. Editing only `app.json` ships an APK still labelled with the old version:

- `app.json` → `expo.version`, `expo.android.versionCode`
- `android/app/build.gradle` → `versionName`, `versionCode`

**The signing keystore is not in this repo.** `android/app/debug.keystore` signs releases and is
gitignored. Every published release is signed with it — a different key cannot install as an
upgrade over an existing install. Keep a private backup.

**ARM only.** `gradle.properties` pins `armeabi-v7a,arm64-v8a`. x86/x86_64 are emulator-only and
were 46.8 MB of a 104.8 MB APK. For an x86 emulator, override per invocation:
`./gradlew assembleDebug -PreactNativeArchitectures=x86_64`.

**Weigh native modules by ABI count.** A 1 MB `.so` costs 1 MB × the number of ABIs. That is how
a 24.7 MB asset saving netted only ~7 MB once `react-native-keyboard-controller` (→
`react-native-reanimated`) and `expo-image` landed in the same release.

## Notable pieces

- `src/data/bodyMapStyle.ts`, `src/data/assetCdn.ts`, `src/data/bodyMuscles.ts`,
  `src/data/exerciseMuscles.ts`, `src/lib/stats.ts` — **byte-identical** with the web app.
  Verified by `node scripts/check-parity.mjs` from the repo root.
- `src/lib/verify-fixture.ts` — `EXPO_PUBLIC_VERIFY=1` injects a stub session and sample rows so
  every signed-in screen is reachable in an emulator with no Google credentials. Gated on an env
  var absent from `.env`. Confirm the four marker strings are absent from a shipping bundle —
  see [BUILD.md](../../docs/BUILD.md#verification-fixture).
- `src/lib/layout.ts` — Material 3 breakpoints; drives the tablet side rail and grid columns.
- `App.tsx` — `KeyboardProvider` sits at the true root, above `SafeAreaProvider`. Expo SDK 55+
  mandates edge-to-edge, which makes `adjustResize` behave like `adjustNothing` and breaks
  `KeyboardAvoidingView`; `react-native-keyboard-controller` is the fix.

## Known issue

The History screen mis-lays-out at the `expanded` (tablet) breakpoint — week headers collide
with session cards. `src/screens/History.tsx`: the group container becomes
`flexDirection: 'row', flexWrap: 'wrap'` when `L.columns > 1`, but the header is a child of that
flow, so it wraps as a grid item rather than a full-width row. Evidence:
[`docs/screenshots/_known-issues/tablet-history-overlap.png`](../../docs/screenshots/_known-issues/tablet-history-overlap.png).
