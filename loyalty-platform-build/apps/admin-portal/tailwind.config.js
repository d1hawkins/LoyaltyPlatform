/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff5f5',
          100: '#ffe0e0',
          200: '#ffb3b3',
          300: '#ff8080',
          400: '#ff4d4d',
          500: '#EB1256',
          600: '#EB1256',
          700: '#D41050',
          800: '#990008',
          900: '#5C0928',
        },
      },
    },
  },
  plugins: [],
};
