# Screenshots

Captured from the **React Native app running on Android emulators**, via
`adb exec-out screencap`:

| Folder | AVD | Resolution |
|---|---|---|
| `phone/` | `grindz` — Pixel 7 profile, Android 35 | 1080 × 2400 @ 420dpi |
| `tablet/` | `tab_s9fe` — Galaxy Tab S9 FE+ profile, Android 35 | 2304 × 1440 @ 240dpi |

## How to reproduce

The app talks to Supabase and requires Google sign-in, which an emulator can't do. Build with
the verification fixture instead — it injects a stub session plus sample rows so every
signed-in screen is reachable offline:

```bash
cd apps/mobile/android
EXPO_PUBLIC_VERIFY=1 ./gradlew assembleRelease -PreactNativeArchitectures=x86_64
adb install -r app/build/outputs/apk/release/app-release.apk
```

`-PreactNativeArchitectures=x86_64` is needed because release builds are ARM-only; emulators
are x86_64. On Windows, see the path workaround in [../BUILD.md](../BUILD.md#building-on-windows).

Boot the emulator with an explicit DNS server, or the exercise photos won't load from the CDN
and every card renders blank:

```bash
emulator -avd grindz -gpu host -dns-server 8.8.8.8,1.1.1.1
```

`settings-body-type.png`, `home-female.png` and `progress-female.png` are the same run with
**Body type** switched to Female in Settings — the photo set and the traced anatomy both
follow that one control, which is the whole point of the three being a set.

Two presentation-only notes, so these are honest about what they are:

- The fixture's display name was changed to a demo name for the capture. In the repo it is
  still `Verify User` / `verify@local` — those exact strings are the markers used to prove a
  *shipping* build has the fixture compiled out, so they must not change.
- The data is generated (a 6-week push/pull/legs block), not anyone's real training history.

## `_known-issues/`

`tablet-history-overlap.png` is **not** a showcase image. It records a real layout bug on the
History screen at the `expanded` breakpoint: in `apps/mobile/src/screens/History.tsx`, the
group container becomes `flexDirection: 'row', flexWrap: 'wrap'` when `L.columns > 1`, but the
week header is a child of that flow, so it wraps as a grid item instead of a full-width row and
the 49%-wide session cards collide with it. Confirmed static after a 14-second settle, so it is
not an unfinished entrance animation.
