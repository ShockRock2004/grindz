import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AppProviders } from './lib/app-context'
import App from './App'
import './index.css'
import { installKeyboardHandling } from './lib/keyboard'

// keyboard-aware scrolling for every text field in the app; see src/lib/keyboard.ts
installKeyboardHandling()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/*
      Opt into the two v7 behaviours now rather than carrying the deprecation warnings.
      startTransition batches route state updates, which is what we want anyway on a
      desktop app where a click can swap a whole dashboard; relativeSplatPath only affects
      resolution under the `*` route, which here just redirects home.
    */}
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppProviders>
        <App />
      </AppProviders>
    </BrowserRouter>
  </StrictMode>,
)

/*
 * Dismiss the boot splash in index.html the instant the app has painted.
 *
 * Deliberately no minimum hold. An earlier version kept the splash up for a fixed ~900ms so
 * the intro animation could finish, which meant a warm load that was ready in 80ms still sat
 * there for the best part of a second — the app was made measurably slower to show an
 * animation about how fast it is. The splash exists to cover a wait, not to create one.
 *
 * Two nested frames rather than one: the first fires after React commits, the second after the
 * browser has actually painted that commit, so the splash never lifts onto a blank screen.
 */
requestAnimationFrame(() =>
  requestAnimationFrame(() => document.documentElement.classList.add('app-ready')),
)
