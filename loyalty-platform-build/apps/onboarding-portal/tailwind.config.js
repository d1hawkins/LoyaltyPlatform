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
        accent: {
          50: '#fdf4ff',
          100: '#fae8ff',
          200: '#f5d0fe',
          300: '#f0abfc',
          400: '#e879f9',
          500: '#d946ef',
          600: '#c026d3',
          700: '#a21caf',
          800: '#86198f',
          900: '#701a75',
        },
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #EB1256 0%, #8E0E3C 50%, #5C0928 100%)',
        'gradient-hero': 'linear-gradient(135deg, #5C0928 0%, #8E0E3C 50%, #EB1256 100%)',
      },
    },
  },
  plugins: [],
};
