import { useEffect, useRef, useState } from 'react'

const prefersReduced = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Animate a number from its previous value to `value` with an ease-out curve. */
export function CountUp({
  value,
  format = (n: number) => String(Math.round(n)),
  duration = 750,
  className,
}: {
  value: number
  format?: (n: number) => string
  duration?: number
  className?: string
}) {
  const [shown, setShown] = useState(value)
  const fromRef = useRef(0)
  const rafRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (prefersReduced()) {
      setShown(value)
      fromRef.current = value
      return
    }
    const start = performance.now()
    const startVal = fromRef.current
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const cur = startVal + (value - startVal) * eased
      setShown(cur)
      if (t < 1) rafRef.current = requestAnimationFrame(step)
      else fromRef.current = value
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      fromRef.current = value
    }
  }, [value, duration])

  return <span className={className}>{format(shown)}</span>
}
