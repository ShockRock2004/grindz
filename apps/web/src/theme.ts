/**
 * Design tokens in TS form. The source of truth for the web build is
 * `tailwind.config.js` — these values are the same set, exposed so code that has to
 * produce colour strings at runtime (SVG paint, canvas) can use the tokens instead of
 * hardcoding hex. `grindz-native/src/theme.ts` carries the identical object.
 *
 * If you change a colour, change it in all three places.
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
 * rgba helper for the many alpha-tinted surfaces in the design.
 *
 * Byte-identical to `grindz-native/src/theme.ts`, so `data/bodyMapStyle.ts` can import
 * it on both platforms and stay a byte-identical file itself.
 */
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}
