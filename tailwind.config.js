/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Tajawal', 'system-ui', 'sans-serif'] },
      // مبنية على كحلي شعار فيض #022D71
      colors: {
        brand: {
          50: '#EEF3FA', 100: '#D6E2F3', 200: '#A9C1E6', 300: '#7099D6',
          400: '#3B72C4', 500: '#1450AD', 600: '#0A3C8F', 700: '#022D71',
          800: '#02245A', 900: '#011B44',
        },
      },
    },
  },
  plugins: [],
};
