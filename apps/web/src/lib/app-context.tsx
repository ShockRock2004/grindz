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
import { DEV_BYPASS, devSession } from './dev-auth'
import { setSignedInHint } from './domains'
import { loadActive, saveActive, clearActive, getUnitPref, setUnitPref } from './store'

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
/**
 * Display preferences live in state (mirrored to localStorage) rather than
 * being read from storage at render time — otherwise flipping kg/lbs updates
 * nothing until an unrelated re-render, leaving both units on screen at once.
 */
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

export function AppProviders({ children }: { children: ReactNode }) {
  /* auth */
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [profile, setProfile] = useState<Profile>({ name: '', avatar: '', email: '' })
  const refreshProfile = useCallback(() => {
    getProfile().then(setProfile).catch(() => {})
  }, [])
  useEffect(() => {
    if (DEV_BYPASS) {
      setSession(devSession()) // skip OAuth entirely; see dev-auth.ts
      return
    }
    /*
     * Every auth transition also updates the `gz_hint` cookie on `.grindz.dev`, which is how
     * the landing page on the bare domain knows to send a returning user into the app. It is
     * done here rather than in signInWithGoogle because OAuth returns via a full page load —
     * the sign-in call never gets to run its own success path. This listener does, on every
     * route in, including a token refresh and a session restored from storage.
     */
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSignedInHint(!!data.session)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      setSignedInHint(!!s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (session) refreshProfile()
  }, [session, refreshProfile])

  /* data */
  const [data, setData] = useState<Omit<DataValue, 'refresh'>>(empty)
  const refresh = useCallback(async () => {
    if (!supabase) return
    if (!DEV_BYPASS) {
      // under the bypass there is no Supabase user; db.ts routes to the local mock
      const { data: u } = await supabase.auth.getUser()
      if (!u.user) {
        setData({ ...empty, loading: false })
        return
      }
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

  /* prefs */
  const [unit, setUnitState] = useState<WeightUnit>(() => getUnitPref())
  const setUnit = useCallback((u: WeightUnit) => {
    setUnitState(u)
    setUnitPref(u)
  }, [])

  /* active session */
  const [active, setActive] = useState<ActiveSession | null>(() => loadActive())
  const start = useCallback((s: ActiveSession) => {
    setActive(s)
    saveActive(s)
  }, [])
  const update = useCallback((fn: (s: ActiveSession) => ActiveSession) => {
    setActive((prev) => {
      if (!prev) return prev
      const next = fn(prev)
      saveActive(next)
      return next
    })
  }, [])
  const discard = useCallback(() => {
    setActive(null)
    clearActive()
  }, [])
  const finish = useCallback(async (): Promise<SavedSession | null> => {
    if (!active) return null
    const saved = await dbSaveSession(active)
    // Only clear the in-progress session once it's safely persisted. On a failed
    // save (offline / dropped request) keep it on-device so nothing is lost.
    if (saved) {
      setActive(null)
      clearActive()
      await refresh()
    }
    return saved
  }, [active, refresh])

  const authValue = useMemo(() => ({ session, profile, refreshProfile }), [session, profile, refreshProfile])
  const dataValue = useMemo(() => ({ ...data, refresh }), [data, refresh])
  const prefsValue = useMemo(() => ({ unit, setUnit }), [unit, setUnit])
  const sessionValue = useMemo(() => ({ active, start, update, finish, discard }), [active, start, update, finish, discard])

  return (
    <AuthCtx.Provider value={authValue}>
      <DataCtx.Provider value={dataValue}>
        <PrefsCtx.Provider value={prefsValue}>
          <SessionCtx.Provider value={sessionValue}>{children}</SessionCtx.Provider>
        </PrefsCtx.Provider>
      </DataCtx.Provider>
    </AuthCtx.Provider>
  )
}
