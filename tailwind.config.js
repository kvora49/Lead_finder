/**
 * Tailwind CSS Configuration File
 * Customizes Tailwind CSS for the Universal Lead Finder application
 */

/** @type {import('tailwindcss').Config} */
export default {
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
    },
  },
  plugins: [],
}
