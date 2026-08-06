/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#050505',
        panel: '#0a0a0f',
        panel2: '#101018',
        ink: '#ffffff',
        ink2: '#e7e9ee',
        muted: '#8b8b94',
        muted2: '#a7a7b0',
        line: 'rgba(255,255,255,0.08)',
        line2: 'rgba(255,255,255,0.14)',
        cyan: {
          DEFAULT: '#00c6ff',
          deep: '#0072ff',
          soft: '#5fdcff',
          ink: '#00232e',
        },
        good: '#00e0a4',
        warn: '#ffb020',
        bad: '#ff5c7a',
      },
      fontFamily: {
        heading: ['Poppins', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 24px rgba(0,198,255,0.28)',
        'glow-sm': '0 0 14px rgba(0,198,255,0.35)',
        /*
         * A black shadow on a #050505 canvas is invisible — it costs paint and buys nothing,
         * which is exactly what the old `0 18px 50px -24px rgba(0,0,0,0.9)` was doing. On very
         * dark UI depth comes from a hairline ring plus a 1px inset highlight along the top
         * edge: it reads as a light source above the interface and lifts the panel off the page.
         */
        card: '0 0 0 1px rgba(255,255,255,0.055), inset 0 1px 0 0 rgba(255,255,255,0.06), 0 1px 2px rgba(0,0,0,0.6)',
        raise:
          '0 0 0 1px rgba(255,255,255,0.09), inset 0 1px 0 0 rgba(255,255,255,0.10), 0 14px 34px -12px rgba(0,0,0,0.95)',
      },
      backgroundImage: {
        cyan: 'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)',
      },
      keyframes: {
        fadeUp: { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        pop: { '0%': { transform: 'scale(0.85)', opacity: '0' }, '60%': { transform: 'scale(1.04)' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        ringSpin: { to: { transform: 'rotate(360deg)' } },
      },
      animation: {
        fadeUp: 'fadeUp 0.45s cubic-bezier(0.22,1,0.36,1) both',
        fadeIn: 'fadeIn 0.45s cubic-bezier(0.22,1,0.36,1) both',
        pop: 'pop 0.4s cubic-bezier(0.22,1,0.36,1) both',
      },
    },
  },
  plugins: [],
}
