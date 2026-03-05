/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Primary palette - calming violet/purple
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
        // Mood colors
        mood: {
          struggling: '#f43f5e', // rose-500
          low: '#fb923c', // orange-400
          okay: '#fbbf24', // amber-400
          good: '#a3e635', // lime-400
          great: '#10b981', // emerald-500
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'view-enter': 'viewEnter 0.2s ease-out',
        'float-in': 'floatIn 0.15s ease-out',
        'check-bounce': 'checkBounce 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'entry-in': 'entryIn 0.3s ease-out both',
        'mood-pop': 'moodPop 0.9s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'cloud-saved': 'cloudSaved 0.5s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        viewEnter: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        floatIn: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        checkBounce: {
          '0%': { opacity: '0', transform: 'scale(0)' },
          '60%': { transform: 'scale(1.15)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        entryIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        moodPop: {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.45)' },
          '70%': { transform: 'scale(0.92)' },
          '100%': { transform: 'scale(1)' },
        },
        cloudSaved: {
          '0%': { opacity: '0', transform: 'scale(0.8)' },
          '60%': { transform: 'scale(1.1)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
