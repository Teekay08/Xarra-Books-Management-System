/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0faf6',
          100: '#d4f0e4',
          200: '#a8e1c9',
          300: '#6ecba5',
          400: '#3bb07f',
          500: '#1a9650',
          600: '#147a42',
          700: '#105f34',
          800: '#0d4a29',
          900: '#093a20',
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
