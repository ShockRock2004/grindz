/**
 * Design tokens lifted verbatim from the web app's tailwind.config.js so the
 * native build is the same product, not a lookalike.
 */
export const C = {
  bg: '#050505',
  panel: '#0a0a0f',
  panel2: '#101018',
  ink: '#ffffff',
  ink2: '#e7e9ee',
  muted: '#8b8b94',
  muted2: '#a7a7b0',
  line: 'rgba(255,255,255,0.08)',
  line2: 'rgba(255,255,255,0.14)',
  cyan: '#00c6ff',
  cyanDeep: '#0072ff',
  cyanSoft: '#5fdcff',
  cyanInk: '#00232e',
  good: '#00e0a4',
  warn: '#ffb020',
  bad: '#ff5c7a',
  /** translucent fills used for cards / chips */
  glass: 'rgba(255,255,255,0.045)',
  glassStrong: 'rgba(10,10,16,0.72)',
  cyanWash: 'rgba(0,198,255,0.12)',
  cyanWash2: 'rgba(0,198,255,0.10)',
  white5: 'rgba(255,255,255,0.05)',
  white7: 'rgba(255,255,255,0.07)',
} as const

/**
 * The web app uses Poppins for headings and Inter for body. Those are loaded at
 * runtime from Google Fonts on the web; here they'd need bundling, so headings
 * fall back to the platform sans with heavy weights, which reads closest.
 */
export const F = {
  heading: undefined as string | undefined,
  body: undefined as string | undefined,
}

export const R = { sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, pill: 999 } as const

/** rgba helper for the many alpha-tinted surfaces in the design */
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}
