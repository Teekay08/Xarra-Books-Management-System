/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fef7f0',
          100: '#fcecd8',
          200: '#f8d5ab',
          300: '#f2b705',
          400: '#d4a017',
          500: '#b8860b',
          600: '#9a7209',
          700: '#7c5c07',
          800: '#5e4605',
          900: '#403004',
        },
        xarra: {
          red: '#8B1A1A',
          'red-light': '#A52422',
          'red-dark': '#6B1414',
          gold: '#F2B705',
          'gold-light': '#F5C842',
          'gold-dark': '#D4A017',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
