/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        rust: {
          dark: '#1a1a1a',
          darker: '#0f0f0f',
          orange: '#ce422b',
          gray: '#2d2d2d',
        }
      }
    },
  },
  plugins: [],
}
