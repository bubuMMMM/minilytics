/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ['./src/dashboard/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        canvas: v('canvas'), surface: v('surface'), well: v('well'), line: v('line'), 'line-strong': v('line-strong'),
        ink: v('ink'), 'ink-2': v('ink-2'), 'ink-3': v('ink-3'), 'ink-4': v('ink-4'),
        accent: { DEFAULT: v('accent'), soft: v('accent-soft'), fg: v('accent-fg') },
        success: { DEFAULT: v('success'), soft: v('success-soft') },
        danger: { DEFAULT: v('danger'), soft: v('danger-soft') },
        warning: { DEFAULT: v('warning'), soft: v('warning-soft') },
        // legacy names used by a few components, now on the same tokens
        paper: v('surface'), visitors: v('accent'), revenue: v('success'), revenueSoft: v('success-soft'), visitorsSoft: v('accent-soft'),
        brand: { DEFAULT: v('accent'), soft: v('accent-soft') },
      },
      borderRadius: { sm: '6px', DEFAULT: '8px', md: '8px', lg: '10px', xl: '12px', '2xl': '16px' },
      boxShadow: {
        xs: '0 1px 2px rgb(0 0 0 / 0.04)',
        card: '0 1px 2px rgb(0 0 0 / 0.04), 0 1px 1px rgb(0 0 0 / 0.02)',
        pop: '0 0 0 1px rgb(var(--line)), 0 8px 24px -4px rgb(0 0 0 / 0.12), 0 2px 6px -2px rgb(0 0 0 / 0.06)',
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '16px' }],
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['13px', { lineHeight: '20px' }],
        base: ['14px', { lineHeight: '22px' }],
        md: ['15px', { lineHeight: '24px' }],
        lg: ['16px', { lineHeight: '24px' }],
        xl: ['18px', { lineHeight: '28px' }],
        '2xl': ['22px', { lineHeight: '30px', letterSpacing: '-0.01em' }],
        '3xl': ['28px', { lineHeight: '36px', letterSpacing: '-0.02em' }],
        '4xl': ['36px', { lineHeight: '44px', letterSpacing: '-0.025em' }],
        '5xl': ['48px', { lineHeight: '54px', letterSpacing: '-0.03em' }],
        '6xl': ['60px', { lineHeight: '64px', letterSpacing: '-0.035em' }],
      },
      keyframes: { ping2: { '75%, 100%': { transform: 'scale(2.4)', opacity: '0' } }, fadein: { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } } },
      animation: { ping2: 'ping2 1.6s cubic-bezier(0,0,0.2,1) infinite', fadein: 'fadein .2s ease-out both' },
    },
  },
  plugins: [],
};
