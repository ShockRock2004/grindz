import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Landing } from './Landing'
import './index.css'
import { redirectToAppIfSignedIn } from './lib/domains'

/*
 * The redirect runs BEFORE React mounts, not inside an effect.
 *
 * A returning user should never see this page. From a `useEffect` the tree would mount and
 * paint a frame or two of marketing copy at somebody who already uses the product, which
 * reads as a bug. `location.replace()` also means the render below never runs at all.
 */
if (!redirectToAppIfSignedIn()) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Landing />
    </StrictMode>,
  )
}
