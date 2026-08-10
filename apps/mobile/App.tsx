import { useEffect, useState } from 'react'
import { ActivityIndicator, BackHandler, Image, Pressable, StatusBar, StyleSheet, TextInput, View } from 'react-native'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { KeyboardProvider, useKeyboardState } from 'react-native-keyboard-controller'
import { C, R, alpha } from './src/theme'
import { T, Button, Modal, Select } from './src/components/ui'
import { GrindzMark, IconCalendar, IconChart, IconDumbbell, IconHistory, IconLogout, IconPlay, IconPlus, IconTrash } from './src/components/Icons'
import { AppProviders, useAuth, useCatalog, useData, usePrefs, useSession } from './src/lib/app-context'
import { deleteCustom } from './src/lib/db'
import { syncGroqKey, setGroqKey, maskKey } from './src/lib/groq'
import { testGroqKey } from './src/lib/exercise-ai'
import { AddExercise } from './src/components/AddExercise'
import { useLayout } from './src/lib/layout'
import { Opening } from './src/components/Opening'
import { signOut } from './src/lib/auth'
import { CATALOG } from './src/data/catalog'
import { greeting, firstName } from './src/lib/util'
import { haptic } from './src/lib/haptics'
import { SignIn } from './src/screens/SignIn'
import { Home } from './src/screens/Home'
import { Category } from './src/screens/Category'
import { Session } from './src/screens/Session'
import { Planner } from './src/screens/Planner'
import { BuildWorkout } from './src/screens/BuildWorkout'
import { Progress } from './src/screens/Progress'
import { History } from './src/screens/History'
import { SessionDetail } from './src/screens/SessionDetail'

type Tab = 'train' | 'plan' | 'progress' | 'history'
/** Stacked views that sit above the tabs, mirroring the web app's routes. */
type Overlay =
  | { kind: 'none' }
  | { kind: 'category'; key: string }
  // the session builder: pick exercises across muscle groups, then hand off to the session
  | { kind: 'build' }
  | { kind: 'session' }
  | { kind: 'detail'; id: string }

const TABS: { key: Tab; label: string; Icon: typeof IconDumbbell }[] = [
  { key: 'train', label: 'Train', Icon: IconDumbbell },
  { key: 'plan', label: 'Plan', Icon: IconCalendar },
  { key: 'progress', label: 'Progress', Icon: IconChart },
  { key: 'history', label: 'History', Icon: IconHistory },
]

function Shell() {
  const { session, profile } = useAuth()
  const { active } = useSession()
  // subscribing here is what makes a synced-in exercise appear without navigating away and
  // back: Shell's re-render cascades to every screen below it (Home, Category, BuildWorkout,
  // Planner...), none of which are memoized — see the comment on CatalogCtx for why a plain
  // reassignment in data/catalog.ts isn't enough on its own. The version number itself is unused.
  useCatalog()
  const insets = useSafeAreaInsets()
  // `isVisible` flips as the keyboard starts animating, so the bar leaves with it rather
  // than popping out after it has already settled
  const keyboardUp = useKeyboardState().isVisible
  const L = useLayout()
  const [tab, setTab] = useState<Tab>('train')
  const [overlay, setOverlay] = useState<Overlay>({ kind: 'none' })
  const [settings, setSettings] = useState(false)

  /*
   * System back.
   *
   * Category / SessionDetail / the live session are conditional renders rather than
   * routes, so without this Android's back gesture leaves the app from what looks
   * like a sub-screen. Modals are not handled here — RN's Modal already routes back
   * to its own onRequestClose, and this handler is registered below them.
   */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (settings) { setSettings(false); return true }
      if (overlay.kind !== 'none') { setOverlay({ kind: 'none' }); return true }
      if (tab !== 'train') { setTab('train'); return true }
      return false // root tab — let the system close the app
    })
    return () => sub.remove()
  }, [overlay.kind, settings, tab])

  if (session === undefined) return <View style={s.boot}><ActivityIndicator color={C.cyan} /></View>
  if (session === null) return <SignIn />

  const openCategory = (key: string) => setOverlay({ kind: 'category', key })
  const openBuild = () => setOverlay({ kind: 'build' })
  const openSession = () => setOverlay({ kind: 'session' })
  const closeOverlay = () => setOverlay({ kind: 'none' })

  const initial = (profile.name || profile.email || '?').trim()[0]?.toUpperCase() ?? '?'
  const showResume = !!active && overlay.kind !== 'session' && overlay.kind !== 'category' && overlay.kind !== 'build'

  // the live workout is full-screen with no shell chrome — same as web's /session
  if (overlay.kind === 'session') {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <Session onExit={closeOverlay} onSaved={() => { closeOverlay(); setTab('history') }} />
      </View>
    )
  }

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 8, paddingLeft: L.rail ? 88 : 16 }]}>
        <View style={[s.headerPill, { maxWidth: L.content, width: '100%', alignSelf: 'center' }]}>
          <View style={s.brandRow}>
            <View style={s.logo}><GrindzMark size={26} /></View>
            <View style={{ flex: 1 }}>
              <T style={s.brand}>Grindz</T>
              <T style={s.greet} numberOfLines={1}>
                {greeting()}{firstName(profile.name) ? `, ${firstName(profile.name)}` : ''}
              </T>
            </View>
          </View>
          <Pressable onPress={() => { haptic.nav(); setSettings(true) }} style={s.avatar} accessibilityLabel="Settings">
            {profile.avatar ? <Image source={{ uri: profile.avatar }} style={s.avatarImg} /> : <T style={s.avatarText}>{initial}</T>}
          </Pressable>
        </View>
      </View>

      <View style={[s.stage, { flexDirection: L.rail ? 'row' : 'column' }]}>
        {/* navigation rail — a bottom bar stretched across 1700dp is not a bar */}
        {L.rail ? (
          <View style={[s.rail, { paddingTop: 8, paddingBottom: insets.bottom + 8 }]}>
            {TABS.map(({ key, label, Icon }) => {
              const on = tab === key && overlay.kind === 'none'
              return (
                <Pressable
                  key={key}
                  onPress={() => { haptic.nav(); setTab(key); closeOverlay() }}
                  style={[s.railBtn, on && s.railBtnOn]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={label}
                >
                  <Icon size={22} color={on ? C.cyan : C.muted} />
                  <T style={[s.railLabel, on && { color: C.cyan }]} numberOfLines={1}>{label}</T>
                </Pressable>
              )
            })}
            <View style={{ flex: 1 }} />
            {showResume ? (
              <Pressable onPress={openSession} style={s.railResume} accessibilityRole="button" accessibilityLabel="Resume workout">
                <IconPlay size={20} color={C.cyanInk} />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <View style={s.stageCentre}>
        <View style={[s.stageInner, { maxWidth: L.content }]}>
        {overlay.kind === 'category' ? (
          <Category categoryKey={overlay.key} onBack={closeOverlay} onStarted={openSession} />
        ) : overlay.kind === 'build' ? (
          <BuildWorkout onClose={closeOverlay} onStarted={openSession} />
        ) : overlay.kind === 'detail' ? (
          <SessionDetail id={overlay.id} onBack={closeOverlay} />
        ) : tab === 'train' ? (
          <Home onOpenCategory={openCategory} onBuildWorkout={openBuild} />
        ) : tab === 'plan' ? (
          <Planner onOpenCategory={openCategory} />
        ) : tab === 'progress' ? (
          <Progress onOpenCategory={openCategory} onStart={() => setTab('train')} />
        ) : (
          <History onOpenSession={(id) => setOverlay({ kind: 'detail', id })} onStart={() => setTab('train')} />
        )}
        </View>
        </View>
      </View>

      {/*
        * The tab bar is hidden while the keyboard is up. react-navigation solves this with
        * `tabBarHideOnKeyboard`, but these tabs are hand-rolled, so it is done explicitly:
        * left mounted it would sit on top of the keyboard, stealing ~72dp from exactly the
        * region the focused input needs, and swallowing the first tap aimed at an input.
        */}
      {/*
        The builder hides the tabs too. It carries its own fixed action bar at the bottom of
        the screen, and the tab pill is drawn over it — leaving both mounted means the Start
        button is behind the tabs and the session cannot be started at all. The builder is a
        focused sub-flow with its own close button and a back gesture, so nothing is lost.
      */}
      {L.rail || keyboardUp || overlay.kind === 'build' ? null : (
      <View style={[s.nav, { paddingBottom: insets.bottom + 8 }]}>
        {showResume ? (
          <View style={s.resumeWrap}>
            <Button onPress={openSession}>
              <View style={s.row}><IconPlay size={18} color={C.cyanInk} /><T style={s.resumeText}>Resume Workout</T></View>
            </Button>
          </View>
        ) : null}
        <View style={s.navPill}>
          {TABS.map(({ key, label, Icon }) => {
            const on = tab === key && overlay.kind === 'none'
            return (
              <Pressable
                key={key}
                onPress={() => { haptic.nav(); setTab(key); closeOverlay() }}
                style={s.navBtn}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={label}
              >
                <View style={s.navIcon}>
                  <Icon size={21} color={on ? C.cyan : C.muted} />
                </View>
                <T style={[s.navLabel, on && s.navLabelOn]}>{label}</T>
                <View style={[s.navBar, on && s.navBarOn]} />
              </Pressable>
            )
          })}
        </View>
      </View>
      )}

      <SettingsModal open={settings} onClose={() => setSettings(false)} />
    </View>
  )
}

function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth()
  const { custom, refresh } = useData()
  const { unit, setUnit } = usePrefs()
  const [adding, setAdding] = useState(false)

  // the AI key lives on the user's own profile row, so it follows them across devices
  const [key, setKey] = useState('')
  const [keyOpen, setKeyOpen] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const [keyBusy, setKeyBusy] = useState(false)
  const [keyErr, setKeyErr] = useState<string | null>(null)

  useEffect(() => {
    if (open) void syncGroqKey().then(setKey)
  }, [open])

  const saveKey = async () => {
    const k = keyDraft.trim()
    if (!k) return
    setKeyBusy(true); setKeyErr(null)
    if (!(await testGroqKey(k))) {
      setKeyErr("That key didn't work. Check it and try again.")
      setKeyBusy(false)
      return
    }
    await setGroqKey(k)
    setKey(k); setKeyDraft(''); setKeyOpen(false); setKeyBusy(false)
    haptic.success()
  }

  return (
    <Modal open={open} onClose={onClose} title="Settings">
      <View style={s.profileRow}>
        <View style={s.avatarLg}>
          {profile.avatar ? <Image source={{ uri: profile.avatar }} style={s.avatarLgImg} /> : <T style={s.avatarText}>{(profile.name || '?')[0]?.toUpperCase()}</T>}
        </View>
        <View style={{ flex: 1 }}>
          <T style={{ fontWeight: '800' }} numberOfLines={1}>{profile.name || 'Athlete'}</T>
          <T style={{ fontSize: 12, color: C.muted }} numberOfLines={1}>{profile.email}</T>
        </View>
      </View>

      <View style={s.settingRow}>
        <View style={{ flex: 1 }}>
          <T style={{ fontSize: 14, fontWeight: '800' }}>Units</T>
          <T style={{ fontSize: 12, color: C.muted }}>Display weights in kg or lbs</T>
        </View>
        <View style={s.unitTgl}>
          {(['kg', 'lbs'] as const).map((u) => (
            <Pressable key={u} onPress={() => { haptic.select(); setUnit(u) }} style={[s.unitBtn, unit === u && { backgroundColor: C.cyan }]}>
              <T style={[s.unitText, unit === u && { color: C.cyanInk }]}>{u}</T>
            </Pressable>
          ))}
        </View>
      </View>

      {/* AI key — optional; only AI-assisted exercise authoring needs it */}
      <View style={[s.settingRow, { flexDirection: 'column', alignItems: 'stretch', gap: 10 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <T style={{ fontSize: 14, fontWeight: '800' }}>AI key</T>
            <T style={{ fontSize: 12, color: C.muted }}>
              {key ? `Connected · ${maskKey(key)}` : 'Not set — exercise checking is off'}
            </T>
          </View>
          <View style={[s.keyPill, key ? { borderColor: alpha(C.cyan, 0.4), backgroundColor: C.cyanWash } : null]}>
            <T style={[s.keyPillText, key ? { color: C.cyan } : null]}>{key ? 'Active' : 'Off'}</T>
          </View>
        </View>

        {keyOpen ? (
          <>
            <TextInput
              value={keyDraft}
              onChangeText={setKeyDraft}
              placeholder="gsk_…"
              placeholderTextColor={C.muted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={[s.input, keyErr ? { borderColor: C.bad } : null]}
              accessibilityLabel="Groq API key"
            />
            {keyErr ? (
              <T style={{ fontSize: 12, color: C.bad }} accessibilityRole="alert" accessibilityLiveRegion="polite">{keyErr}</T>
            ) : (
              <T style={{ fontSize: 11, lineHeight: 16, color: C.muted }}>
                Stored on your account, so it works on every device you sign in on.
              </T>
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button variant="ghost" style={{ flex: 1 }} onPress={() => { setKeyOpen(false); setKeyErr(null); setKeyDraft('') }}>Cancel</Button>
              <Button style={{ flex: 1 }} disabled={!keyDraft.trim() || keyBusy} onPress={saveKey}>
                {keyBusy ? 'Checking…' : 'Save key'}
              </Button>
            </View>
          </>
        ) : (
          <Button variant="outline" onPress={() => { haptic.nav(); setKeyOpen(true) }}>
            {key ? 'Replace key' : 'Add Groq API key'}
          </Button>
        )}
      </View>

      {/* Custom exercises — one button; everything else moved into the guided flow */}
      <View style={[s.settingRow, { flexDirection: 'column', alignItems: 'stretch', gap: 10 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <T style={{ flex: 1, fontSize: 14, fontWeight: '800' }}>Custom exercises</T>
          <T style={{ fontSize: 12, color: C.muted }}>{custom.length}</T>
        </View>
        {custom.length === 0 ? (
          <T style={{ fontSize: 12, lineHeight: 17, color: C.muted }}>
            Anything the catalogue is missing — add it once and it shows up in that muscle group from then on.
          </T>
        ) : (
          custom.map((c) => (
            <View key={c.id} style={s.customRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <T numberOfLines={1} style={{ fontWeight: '700' }}>{c.name}</T>
                <T style={{ fontSize: 11, color: C.muted }} numberOfLines={1}>
                  {CATALOG.find((x) => x.key === c.category_key)?.title}{c.target ? ` · ${c.target}` : ''}
                </T>
              </View>
              <Pressable
                onPress={async () => { haptic.warn(); await deleteCustom(c.id); await refresh() }}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${c.name}`}
              >
                <IconTrash size={16} color={C.muted} />
              </Pressable>
            </View>
          ))
        )}
        <Button onPress={() => { haptic.nav(); setAdding(true) }}>
          <View style={s.row}><IconPlus size={17} color={C.cyanInk} /><T style={{ color: C.cyanInk, fontWeight: '800', fontSize: 15 }}>Add Exercise</T></View>
        </Button>
      </View>

      <AddExercise open={adding} onClose={() => setAdding(false)} onSaved={refresh} />

      <Button variant="danger" style={{ marginTop: 16 }} onPress={() => signOut()}>
        <View style={s.row}><IconLogout size={18} color={C.bad} /><T style={{ color: C.bad, fontWeight: '800', fontSize: 15 }}>Sign out</T></View>
      </Button>
    </Modal>
  )
}

export default function App() {
  // the opening sits above everything, including the auth gate, so a cold start never
  // flashes the sign-in screen before the animation has finished
  const [opened, setOpened] = useState(false)
  return (
    /*
     * KeyboardProvider has to sit at the true root, above everything, and must never be
     * mounted conditionally — the library resolves view tags through it, and a late or
     * remounted provider is the known cause of the focused input failing to scroll.
     *
     * It is required, not a nicety. Expo made edge-to-edge mandatory from SDK 55, and under
     * edge-to-edge Android stops resizing the window for the keyboard — `adjustResize`
     * effectively behaves like `adjustNothing`. That is why entering weight/reps on the last
     * exercise of a long session was impossible: nothing moved, so the row stayed under the
     * keyboard. KeyboardAvoidingView cannot fix this because there is no resize to react to.
     */
    <KeyboardProvider>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <AppProviders>
          <Shell />
        </AppProviders>
        {opened ? null : <Opening onDone={() => setOpened(true)} />}
      </SafeAreaProvider>
    </KeyboardProvider>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  header: { paddingHorizontal: 16, paddingBottom: 8, backgroundColor: C.bg },
  headerPill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: R.xl, backgroundColor: C.glassStrong, borderWidth: 1, borderColor: C.line2,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  brandRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 34, height: 34, borderRadius: 17, backgroundColor: alpha(C.cyan, 0.15), alignItems: 'center', justifyContent: 'center' },
  logoText: { color: C.cyan, fontSize: 20, fontWeight: '800' },
  brand: { fontSize: 19, fontWeight: '800' },
  greet: { fontSize: 12, color: C.muted, marginTop: 2 },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: C.line2, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: 40, height: 40 },
  avatarText: { color: C.cyan, fontWeight: '800' },
  // sits inside the bottom chrome rather than floating over the list - a full-width
  // slab hovering mid-scroll read as covering content rather than as a layer
  resumeWrap: { marginBottom: 10 },
  resumeText: { color: C.cyanInk, fontSize: 15, fontWeight: '800' },
  // hairline top edge so scrolled content terminates against the bar instead of bleeding to it
  // the stage is a row on tablets (rail + content) and a column on phones
  stage: { flex: 1 },
  // alignSelf is the cross axis inside a row, so horizontal centring needs its
  // own wrapper — without it the column hugs the rail and leaves a void beside it
  stageCentre: { flex: 1, alignItems: 'center' },
  stageInner: { flex: 1, width: '100%' },
  rail: {
    width: 88, alignItems: 'center', gap: 6, paddingHorizontal: 8,
    borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.line,
  },
  railBtn: { width: 72, minHeight: 60, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: R.xl },
  railBtnOn: { backgroundColor: alpha(C.cyan, 0.12) },
  railLabel: { fontSize: 10, fontWeight: '700', color: C.muted },
  railResume: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: C.cyan },
  nav: {
    position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10,
    backgroundColor: C.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line,
  },
  navPill: {
    flexDirection: 'row', justifyContent: 'space-around',
    borderRadius: 26, backgroundColor: 'rgba(14,14,20,0.94)', borderWidth: 1, borderColor: C.line2,
    paddingHorizontal: 6, paddingVertical: 7,
  },
  // 48dp min touch target per Android guidance
  navBtn: { flex: 1, alignItems: 'center', gap: 2, minHeight: 48, justifyContent: 'center' },
  navIcon: { height: 26, alignItems: 'center', justifyContent: 'center' },
  // a boxed indicator behind a 21dp glyph reads as a stray rectangle at this size.
  // colour plus a short underline marks the tab without drawing a container.
  navBar: { marginTop: 3, height: 3, width: 18, borderRadius: 2, backgroundColor: 'transparent' },
  navBarOn: { backgroundColor: C.cyan },
  // weight is fixed across states - only colour changes, so the label never reflows on tab switch
  navLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2, color: C.muted },
  navLabelOn: { color: C.cyan },
  keyPill: { borderRadius: R.pill, borderWidth: 1, borderColor: C.line2, paddingHorizontal: 10, paddingVertical: 4 },
  keyPillText: { fontSize: 11, fontWeight: '800', color: C.muted },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: R.xl, borderWidth: 1, borderColor: C.line, paddingHorizontal: 16, paddingVertical: 12 },
  avatarLg: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: C.line2, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarLgImg: { width: 48, height: 48 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, borderRadius: R.xl, borderWidth: 1, borderColor: C.line, paddingHorizontal: 16, paddingVertical: 12 },
  unitTgl: { flexDirection: 'row', borderRadius: R.md, borderWidth: 1, borderColor: C.line2, padding: 2 },
  unitBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  unitText: { fontSize: 12, fontWeight: '800', color: C.muted },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: R.md, backgroundColor: C.white5, paddingHorizontal: 12, paddingVertical: 8 },
  input: { borderRadius: R.md, borderWidth: 1, borderColor: C.line2, backgroundColor: C.panel2, color: C.ink, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
})
