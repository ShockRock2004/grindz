import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { getProfile, type Profile } from './auth'
import {
  allSets,
  listSessions,
  listFavorites,
  listCustom,
  getPlan,
  listBodyweights,
  listTemplates,
  saveSession as dbSaveSession,
  type SavedSession,
  type Bodyweight,
} from './db'
import { buildPRs } from './stats'
import type { ActiveSession, SetRow, SessionRow, CustomExerciseRow, PlanRow, ExercisePR, TemplateRow } from './types'
import type { WeightUnit } from './util'
import { loadActive, saveActive, clearActive, getUnitPref, setUnitPref } from './store'
import { VERIFY, VERIFY_SESSION, VERIFY_PROFILE, buildVerifyData } from './verify-fixture'
import { hydrateCatalogFromCache, syncCatalogFromNetwork } from '../data/catalogSync'

/* ----------------------------- auth ----------------------------- */
interface AuthValue {
  session: Session | null | undefined
  profile: Profile
  refreshProfile: () => void
}
const AuthCtx = createContext<AuthValue>({ session: undefined, profile: { name: '', avatar: '', email: '' }, refreshProfile: () => {} })
export const useAuth = () => useContext(AuthCtx)

/* ----------------------------- data ----------------------------- */
interface DataValue {
  sets: SetRow[]
  sessions: SessionRow[]
  favorites: string[]
  custom: CustomExerciseRow[]
  plan: PlanRow[]
  bodyweights: Bodyweight[]
  templates: TemplateRow[]
  prs: Record<string, ExercisePR>
  loading: boolean
  refresh: () => Promise<void>
}
const empty: Omit<DataValue, 'refresh'> = { sets: [], sessions: [], favorites: [], custom: [], plan: [], bodyweights: [], templates: [], prs: {}, loading: true }
const DataCtx = createContext<DataValue>({ ...empty, refresh: async () => {} })
export const useData = () => useContext(DataCtx)

/* ----------------------------- prefs ---------------------------- */
interface PrefsValue {
  unit: WeightUnit
  setUnit: (u: WeightUnit) => void
}
const PrefsCtx = createContext<PrefsValue>({ unit: 'kg', setUnit: () => {} })
export const usePrefs = () => useContext(PrefsCtx)

/* --------------------------- session ---------------------------- */
interface SessionValue {
  active: ActiveSession | null
  start: (s: ActiveSession) => void
  update: (fn: (s: ActiveSession) => ActiveSession) => void
  finish: () => Promise<SavedSession | null>
  discard: () => void
}
const SessionCtx = createContext<SessionValue>({ active: null, start: () => {}, update: () => {}, finish: async () => null, discard: () => {} })
export const useSession = () => useContext(SessionCtx)

/* ---------------------------- catalog ---------------------------- */
/*
 * Not the data itself — that lives in data/catalog.ts as mutable module bindings, which any
 * screen already reads directly (`CATALOG.find(...)`, etc). This context carries nothing but
 * a version counter, whose only job is to give screens something to *subscribe* to: mutating
 * a module variable doesn't trigger a re-render on its own, but a changing context value
 * does, for every component that calls useCatalog() — see App.tsx's Shell, which is the one
 * call site that needs it, since Shell's re-render cascades to every screen beneath it.
 */
const CatalogCtx = createContext<number>(0)
export const useCatalog = () => useContext(CatalogCtx)

export function AppProviders({ children }: { children: ReactNode }) {
  /* auth */
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [profile, setProfile] = useState<Profile>({ name: '', avatar: '', email: '' })
  const refreshProfile = useCallback(() => {
    getProfile().then(setProfile).catch(() => {})
  }, [])
  useEffect(() => {
    if (VERIFY) { setSession(VERIFY_SESSION); setProfile(VERIFY_PROFILE); return }
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!VERIFY && session) refreshProfile()
  }, [session, refreshProfile])

  /* data */
  const [data, setData] = useState<Omit<DataValue, 'refresh'>>(empty)
  const refresh = useCallback(async () => {
    if (VERIFY) {
      const v = buildVerifyData()
      setData({ ...v, custom: [], templates: [], loading: false })
      return
    }
    const { data: u } = await supabase.auth.getUser()
    if (!u.user) {
      setData({ ...empty, loading: false })
      return
    }
    const [sets, sessions, favorites, custom, plan, bodyweights, templates] = await Promise.all([
      allSets(),
      listSessions(),
      listFavorites(),
      listCustom(),
      getPlan(),
      listBodyweights(),
      listTemplates(),
    ])
    setData({ sets, sessions, favorites, custom, plan, bodyweights, templates, prs: buildPRs(sets), loading: false })
  }, [])
  useEffect(() => {
    if (session) refresh()
    else if (session === null) setData({ ...empty, loading: false })
  }, [session, refresh])

  /*
   * prefs — AsyncStorage is async, so unlike web these hydrate once on mount
   * instead of being read synchronously in a useState initialiser.
   */
  const [unit, setUnitState] = useState<WeightUnit>('kg')
  useEffect(() => {
    getUnitPref().then(setUnitState)
  }, [])
  const setUnit = useCallback((u: WeightUnit) => {
    setUnitState(u)
    void setUnitPref(u)
  }, [])

  /* active session — likewise hydrated, not read inline */
  const [active, setActive] = useState<ActiveSession | null>(null)
  useEffect(() => {
    loadActive().then((s) => setActive(s))
  }, [])
  const start = useCallback((s: ActiveSession) => {
    setActive(s)
    void saveActive(s)
  }, [])
  const update = useCallback((fn: (s: ActiveSession) => ActiveSession) => {
    setActive((prev) => {
      if (!prev) return prev
      const next = fn(prev)
      void saveActive(next)
      return next
    })
  }, [])
  const discard = useCallback(() => {
    setActive(null)
    void clearActive()
  }, [])
  const finish = useCallback(async (): Promise<SavedSession | null> => {
    if (!active) return null
    const saved = await dbSaveSession(active)
    // Only clear once safely persisted — on a failed save keep it on-device.
    if (saved) {
      setActive(null)
      await clearActive()
      await refresh()
    }
    return saved
  }, [active, refresh])

  /*
   * catalog — cache first (fast, works offline), then a network check behind it. Each step
   * bumps the version only if it actually changed something, so a device that already has
   * the latest copy re-renders zero extra times. Runs once per app launch, same as the other
   * hydration effects above; VERIFY (screenshot/test mode) skips the network leg so a run
   * never depends on cdn.grindz.dev being reachable.
   */
  const [catalogVersion, setCatalogVersion] = useState(0)
  useEffect(() => {
    let cancelled = false
    hydrateCatalogFromCache()
      .then((changed) => { if (changed && !cancelled) setCatalogVersion((v) => v + 1) })
      .then(() => (VERIFY ? false : syncCatalogFromNetwork()))
      .then((changed) => { if (changed && !cancelled) setCatalogVersion((v) => v + 1) })
      .catch(() => {}) // belt and braces — catalogSync already fails soft internally
    return () => { cancelled = true }
  }, [])

  const authValue = useMemo(() => ({ session, profile, refreshProfile }), [session, profile, refreshProfile])
  const dataValue = useMemo(() => ({ ...data, refresh }), [data, refresh])
  const prefsValue = useMemo(() => ({ unit, setUnit }), [unit, setUnit])
  const sessionValue = useMemo(() => ({ active, start, update, finish, discard }), [active, start, update, finish, discard])

  return (
    <AuthCtx.Provider value={authValue}>
      <DataCtx.Provider value={dataValue}>
        <PrefsCtx.Provider value={prefsValue}>
          <SessionCtx.Provider value={sessionValue}>
            <CatalogCtx.Provider value={catalogVersion}>{children}</CatalogCtx.Provider>
          </SessionCtx.Provider>
        </PrefsCtx.Provider>
      </DataCtx.Provider>
    </AuthCtx.Provider>
  )
}
