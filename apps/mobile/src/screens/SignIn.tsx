import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg'
import { GrindzMark } from '../components/Icons'
import { C } from '../theme'
import { T } from '../components/ui'
import { signInWithGoogle } from '../lib/auth'

function GoogleG() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.8 6.1C12.2 13.2 17.6 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.7 7l7.2 5.6c4.2-3.9 6.6-9.6 6.6-16.1z" />
      <Path fill="#FBBC05" d="M10.3 28.5c-.5-1.4-.8-3-.8-4.5s.3-3.1.8-4.5l-7.8-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.5 10.6l7.8-6.1z" />
      <Path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.2-5.6c-2 1.4-4.6 2.2-8 2.2-6.4 0-11.8-3.7-13.7-9.1l-7.8 6.1C6.4 42.6 14.6 48 24 48z" />
    </Svg>
  )
}

export function SignIn() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  return (
    <View style={s.wrap}>
      {/* the shared mark, so sign-in matches the launcher icon and the header */}
      <View accessibilityElementsHidden importantForAccessibility="no">
        <GrindzMark size={88} />
      </View>

      <T style={s.title}>Grindz</T>
      <T style={s.sub}>Log your lifts, chase every PR, and plan your week. Synced to your account.</T>

      <Pressable
        onPress={async () => {
          setBusy(true)
          setErr(null)
          const res = await signInWithGoogle()
          setBusy(false)
          if (!res.ok) setErr(res.error ?? 'Sign-in failed')
        }}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
        accessibilityState={{ disabled: busy, busy }}
        style={({ pressed }) => [s.gbtn, busy && { opacity: 0.6 }, pressed && { transform: [{ scale: 0.98 }] }]}
      >
        <GoogleG />
        <T style={s.gtext}>{busy ? 'Opening Google…' : 'Continue with Google'}</T>
      </Pressable>

      {err ? (
        <View style={s.errBox} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <T style={s.err}>{err}</T>
        </View>
      ) : null}

      <T style={s.fine}>Your training data is private to your account and never shared with other users.</T>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, backgroundColor: C.bg },
  title: { marginTop: 24, fontSize: 38, fontWeight: '800', letterSpacing: -0.5 },
  sub: { marginTop: 12, maxWidth: 300, textAlign: 'center', fontSize: 15, lineHeight: 22, color: C.muted },
  gbtn: {
    marginTop: 40, width: '100%', maxWidth: 380, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 12, backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 24, paddingVertical: 16,
  },
  gtext: { color: '#111', fontSize: 15, fontWeight: '800' },
  errBox: { marginTop: 14, maxWidth: 340, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,90,90,0.35)', backgroundColor: 'rgba(255,90,90,0.08)', paddingHorizontal: 14, paddingVertical: 10 },
  err: { color: C.bad, fontSize: 13, textAlign: 'center' },
  // was rgba(...,0.7) on near-black, under the 4.5:1 minimum
  fine: { marginTop: 24, maxWidth: 340, textAlign: 'center', fontSize: 12, lineHeight: 18, color: C.muted },
})
