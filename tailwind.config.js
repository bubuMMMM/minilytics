/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/dashboard/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"DM Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'], display: ['"DM Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: {
        paper: '#ffffff',
        ink: '#101828',
        visitors: '#879cff',
        revenue: '#16b99c',
        revenueSoft: '#e3f9f2',
        visitorsSoft: '#edf2ff',
        brand: { DEFAULT: '#4f62ef', soft: '#eef1ff' },
      },
      boxShadow: { card: '0 1px 2px rgba(28,25,23,0.04), 0 1px 1px rgba(28,25,23,0.02)', pop: '0 16px 40px rgba(22,36,85,.1), 0 2px 6px rgba(22,36,85,.05)' },
      keyframes: { ping2: { '75%, 100%': { transform: 'scale(2.4)', opacity: '0' } }, fadein: { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } } },
      animation: { ping2: 'ping2 1.6s cubic-bezier(0,0,0.2,1) infinite', fadein: 'fadein .25s ease-out both' },
    },
  },
  plugins: [],
};
