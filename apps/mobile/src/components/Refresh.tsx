import { useCallback, useRef, useState } from 'react'
import { RefreshControl } from 'react-native'
import { C } from '../theme'
import { useData } from '../lib/app-context'
import { syncGroqKey } from '../lib/groq'
import { haptic } from '../lib/haptics'

/** Below this the spinner appears and vanishes in the same frame, which reads as a glitch. */
const MIN_VISIBLE_MS = 420

/**
 * Pull-to-refresh for the tab screens.
 *
 * Everything the app shows is server state in Supabase, so a second device — or the web
 * app — can change it while this one is open. There was no way to ask for fresh data
 * short of killing the app; this is it.
 *
 * Deliberately not on the live Session screen: that screen owns unsaved local state,
 * and re-fetching underneath it could only lose work.
 */
export function usePullToRefresh() {
  const { refresh } = useData()
  const [busy, setBusy] = useState(false)
  const running = useRef(false)

  const onRefresh = useCallback(async () => {
    if (running.current) return
    running.current = true
    setBusy(true)
    haptic.pull()
    const started = Date.now()
    try {
      // the profile row carries the AI key, which the other app can change too
      await Promise.all([refresh(), syncGroqKey()])
    } finally {
      const left = MIN_VISIBLE_MS - (Date.now() - started)
      if (left > 0) await new Promise((r) => setTimeout(r, left))
      setBusy(false)
      running.current = false
      haptic.settle()
    }
  }, [refresh])

  return (
    <RefreshControl
      refreshing={busy}
      onRefresh={onRefresh}
      // the stock spinner is white-on-white against a dark sheet without these
      tintColor={C.cyan}
      colors={[C.cyan]}
      progressBackgroundColor={C.panel2}
    />
  )
}
