/**
 * Tailwind CSS Configuration File
 * Customizes Tailwind CSS for the Universal Lead Finder application
 */

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Custom color palette (optional, can be extended)
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
      },
      // Custom font family (optional)
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      // Custom spacing (optional)
      spacing: {
        '128': '32rem',
      },
      animation: {
        'export-ready': 'exportReady 1.8s ease-in-out 3',
        shimmer: 'shimmer 1.5s linear infinite',
        'slide-in': 'slideIn 0.22s ease-out',
        'fade-up': 'fadeUp 0.2s ease-out',
      },
      keyframes: {
        exportReady: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(79, 70, 229, 0)' },
          '50%': { boxShadow: '0 0 0 6px rgba(79, 70, 229, 0.25)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
