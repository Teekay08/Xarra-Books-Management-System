/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#8B1A1A',
        brand: {
          50:  '#fef7f0',
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
          red:        '#8B1A1A',
          'red-light':'#A52422',
          'red-dark': '#6B1414',
          gold:       '#F2B705',
          'gold-light':'#F5C842',
          'gold-dark':'#D4A017',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', '14px'],
        xs:    ['11px', '16px'],
        sm:    ['12px', '18px'],
        base:  ['14px', '20px'],
        lg:    ['15px', '22px'],
        xl:    ['17px', '24px'],
        '2xl': ['20px', '28px'],
        '3xl': ['24px', '32px'],
      },
      borderRadius: {
        sm:  '4px',
        DEFAULT: '6px',
        md:  '8px',
        lg:  '10px',
        xl:  '12px',
        '2xl': '16px',
        '3xl': '20px',
      },
      boxShadow: {
        xs:  '0 1px 2px 0 rgb(0 0 0 / 0.04)',
        sm:  '0 1px 3px 0 rgb(0 0 0 / 0.07), 0 1px 2px -1px rgb(0 0 0 / 0.05)',
        DEFAULT:'0 2px 4px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        md:  '0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
        lg:  '0 10px 15px -3px rgb(0 0 0 / 0.07), 0 4px 6px -4px rgb(0 0 0 / 0.05)',
        xl:  '0 20px 25px -5px rgb(0 0 0 / 0.08), 0 8px 10px -6px rgb(0 0 0 / 0.05)',
        inner: 'inset 0 1px 3px 0 rgb(0 0 0 / 0.06)',
        card: '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        'card-hover': '0 4px 12px -2px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.04)',
      },
      spacing: {
        sidebar: '220px',
        header:  '48px',
      },
      transitionDuration: {
        fast: '120ms',
        base: '180ms',
      },
      maxWidth: {
        content: '1440px',
      },
    },
  },
  plugins: [],
};
