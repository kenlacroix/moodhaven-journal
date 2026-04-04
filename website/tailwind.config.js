/** @type {import('tailwindcss').Config} */
const plugin = require('tailwindcss/plugin');
const typography = require('@tailwindcss/typography');

module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
          950: '#2e1065',
        },
        accent: {
          cta: '#F28C38',
          ctaDecor: '#F28C38',
        },
        mood: {
          struggling: '#f43f5e',
          low: '#fb923c',
          okay: '#fbbf24',
          good: '#a3e635',
          great: '#10b981',
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      maskImage: {
        'fade-edges':
          'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.6) 10%, rgba(0,0,0,1) 20%, rgba(0,0,0,1) 80%, rgba(0,0,0,0.6) 90%, rgba(0,0,0,0) 100%)',
      },
      keyframes: {
        scrollSlow: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'scroll-slow': 'scrollSlow 60s linear infinite',
        fadeUp: 'fadeUp 0.6s ease-out forwards',
      },
      animationDelay: {
        100: '100ms',
        200: '200ms',
        300: '300ms',
        400: '400ms',
        500: '500ms',
        600: '600ms',
        700: '700ms',
        800: '800ms',
        900: '900ms',
      },
    },
  },
  plugins: [
    // Custom animation delay plugin
    plugin(function ({ addUtilities, theme }) {
      const delays = theme('animationDelay');
      const utilities = {};
      for (const key in delays) {
        utilities[`.delay-${key}`] = {
          animationDelay: delays[key],
        };
      }
      addUtilities(utilities, ['responsive']);
    }),

    // Custom mask-image utility plugin
    function ({ matchUtilities, theme }) {
      matchUtilities(
        {
          'mask-image': (value) => ({
            maskImage: value,
            WebkitMaskImage: value,
          }),
        },
        { values: theme('maskImage') }
      );
    },

    // ✅ Tailwind Typography plugin
    typography,
  ],
};
