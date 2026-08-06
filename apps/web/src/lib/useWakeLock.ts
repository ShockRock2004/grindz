import { useEffect, useRef } from 'react'

/** Keep the screen awake while `active` (e.g. during a live workout). No-ops where unsupported. */
export function useWakeLock(active: boolean): void {
  const ref = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    let cancelled = false
    async function acquire() {
      try {
        if (active && 'wakeLock' in navigator) {
          ref.current = await (navigator as Navigator & { wakeLock: { request(t: 'screen'): Promise<WakeLockSentinel> } }).wakeLock.request('screen')
        }
      } catch {
        /* denied / unsupported */
      }
    }
    function onVisible() {
      if (document.visibilityState === 'visible' && active) acquire()
    }
    if (active) {
      acquire()
      document.addEventListener('visibilitychange', onVisible)
    }
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      ref.current?.release().catch(() => {})
      ref.current = null
      void cancelled
    }
  }, [active])
}
