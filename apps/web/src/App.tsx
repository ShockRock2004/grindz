import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/app-context'
import { isMarketingHost } from './lib/domains'
import { DesktopShell } from './components/DesktopShell'
import { Landing } from './pages/Landing'
import { Home } from './pages/Home'
import { Category } from './pages/Category'
import { Session } from './pages/Session'
import { History } from './pages/History'
import { SessionDetail } from './pages/SessionDetail'
import { Progress } from './pages/Progress'
import { Planner } from './pages/Planner'

function Loading() {
  return (
    <div className="flex min-h-full items-center justify-center">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/10 border-t-cyan" />
    </div>
  )
}

export default function App() {
  const { session } = useAuth()

  /*
   * grindz.dev is the shop window; app.grindz.dev is the shop.
   *
   * On the marketing host we render the pitch and stop — no session check, no Supabase
   * round-trip, no loading spinner. A visitor there is not being asked to prove anything,
   * and blocking the fold on an auth request they do not need is pure latency. (Anyone who
   * *has* signed in before never reaches this component: main.tsx redirected them already.)
   */
  if (isMarketingHost()) return <Landing variant="marketing" />

  if (session === undefined) return <Loading />
  // Signed out, the marketing landing page IS the sign-in page. Everything below is behind
  // auth, so there is no route to guard individually — the tree simply does not exist yet.
  if (session === null) return <Landing variant="signin" />
  return (
    <Routes>
      <Route element={<DesktopShell />}>
        <Route index element={<Home />} />
        <Route path="category/:key" element={<Category />} />
        <Route path="planner" element={<Planner />} />
        <Route path="progress" element={<Progress />} />
        <Route path="history" element={<History />} />
        <Route path="history/:id" element={<SessionDetail />} />
        {/*
          The phone build hides its tab bar during a workout because a handset has no room
          to spare. A 1440px browser does, and losing the rail mid-session means losing the
          only way to check the plan or a past lift without abandoning the log — so the
          session lives inside the shell here.
        */}
        <Route path="session" element={<Session />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
