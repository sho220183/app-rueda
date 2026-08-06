/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#EEF1EC',
        surface: '#FFFFFF',
        ink: '#14231F',
        muted: '#66766F',
        line: '#DCE1DA',
        primary: {
          DEFAULT: '#1B4B43',
          dark: '#0F332C',
          light: '#2F6D62'
        },
        gold: {
          DEFAULT: '#C9962B',
          light: '#E8C77A'
        },
        alert: '#D65F45'
      },
      fontFamily: {
        display: ['"Fraunces"', 'serif'],
        body: ['"Public Sans"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace']
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '16px'
      }
    }
  },
  plugins: []
}
