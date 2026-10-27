/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/dashboard/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"DM Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: {
        paper: '#ffffff',
        ink: '#101828',
        visitors: '#879cff',
        revenue: '#16b99c',
        revenueSoft: '#e3f9f2',
        visitorsSoft: '#edf2ff',
      },
      boxShadow: { card: '0 1px 2px rgba(28,25,23,0.04), 0 1px 1px rgba(28,25,23,0.02)' },
    },
  },
  plugins: [],
};
