import type { Config } from 'tailwindcss'

/**
 * RxFlow design tokens — "Dispensary Ledger"
 * ─────────────────────────────────────────────────────────────────────────────
 * A pharmacy ERP is a book of record. The visual language borrows from the
 * pharmacist's ledger: warm paper surfaces, ink text, hairline rules, sharp
 * corners, tabular numerals — and one signature color, viridian (the deep
 * green of the pharmacy cross), used to mean something, never to decorate.
 */

// Warm chalk/bone neutrals — replaces cool gray everywhere (incl. legacy `slate`)
const chalk = {
  50: '#faf9f6',
  100: '#f2f0ea',
  200: '#e5e2d8',
  300: '#cfcbbe',
  400: '#a3a094',
  500: '#77756b',
  600: '#57564e',
  700: '#403f39',
  800: '#2b2b26',
  900: '#1f1f1b',
  950: '#131311',
}

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Signature viridian — identity, active states, links, focus
        brand: {
          50: '#eef7f3',
          100: '#d8ede4',
          200: '#b0dbc9',
          300: '#7dc2a9',
          400: '#46a186',
          500: '#1d8169',
          600: '#0e5f52', // signature
          700: '#0b4d43',
          800: '#0a3e37',
          900: '#08322d',
          950: '#052220',
        },
        // Positive/stock states — moss, adjacent to brand but lighter-hearted
        secondary: {
          50: '#f1f8ec',
          100: '#deeed3',
          200: '#bfdda9',
          300: '#98c579',
          400: '#74aa50',
          500: '#578d38',
          600: '#43702c',
          700: '#365825',
          800: '#2d4721',
          900: '#263c1e',
        },
        // Attention — burnt saffron (warm, ledger-marginalia amber)
        accent: {
          50: '#fdf6ec',
          100: '#f9e8cd',
          400: '#e39a3b',
          500: '#d47f16',
          600: '#b4640a',
          700: '#8f4c0b',
        },
        // Paper + chalk neutral system (also aliased over legacy `slate`)
        surface: chalk,
        slate: chalk,
        paper: '#fdfcf9',
        ink: '#1f231f',
        success: { 50: '#f1f8ec', 500: '#578d38', 600: '#43702c', 700: '#365825' },
        warning: { 50: '#fdf6ec', 500: '#d47f16', 600: '#b4640a', 700: '#8f4c0b' },
        danger:  { 50: '#fbf0ee', 500: '#c03b2d', 600: '#a02c21', 700: '#82251c' },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      spacing: {
        '4.5': '1.125rem',
      },
      borderRadius: {
        // Ledger geometry: sharp. Softness comes from paper, not corners.
        none: '0',
        sm: '2px',
        DEFAULT: '2px',
        md: '3px',
        lg: '4px',
        xl: '6px',
        '2xl': '8px',
        full: '9999px',
      },
      boxShadow: {
        // Warm, low-opacity ink shadows — paper sheets lifting off the desk.
        // Two-layer construction keeps them soft at tiny radii (no blue haze).
        xs: '0 1px 1.5px -0.5px rgb(19 19 17 / 0.05)',
        sm: '0 1px 2px 0 rgb(19 19 17 / 0.05), 0 1px 3px -1px rgb(19 19 17 / 0.04)',
        card: '0 1px 2px 0 rgb(19 19 17 / 0.04), 0 2px 5px -2px rgb(19 19 17 / 0.05)',
        'card-hover': '0 3px 6px -2px rgb(19 19 17 / 0.08), 0 8px 18px -6px rgb(19 19 17 / 0.10)',
        // Dark sidebar rail floating over the chalk workspace (rightward cast).
        rail: '6px 0 20px -10px rgb(19 19 17 / 0.30)',
        // Slim toolbar separating from scrolled content.
        toolbar: '0 1px 3px -1px rgb(19 19 17 / 0.06)',
        elevated: '0 16px 40px -16px rgb(19 19 17 / 0.28)',
        dropdown: '0 8px 24px -8px rgb(19 19 17 / 0.22)',
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'rise': 'rise 0.22s ease-out',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        rise: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
