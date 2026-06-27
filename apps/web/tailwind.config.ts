import type { Config } from 'tailwindcss'

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
        // Primary = pharmacy green. Deep, confident, medical — not a SaaS blue.
        brand: {
          50: '#ecfdf3',
          100: '#d1fae0',
          200: '#a6f4c5',
          300: '#6ee7a8',
          400: '#34d186',
          500: '#12b76a', // accents
          600: '#0a8a52', // primary action
          700: '#077043',
          800: '#085a38',
          900: '#074a30',
          950: '#022c1b',
        },
        // Accent kept for secondary highlights (teal-leaning)
        accent: {
          50: '#eefdfb',
          100: '#d3f8f3',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
        },
        // Neutral surface scale — cool, flat, ERP-grade (relies on borders not shadows)
        surface: {
          50: '#f8fafb',
          100: '#f1f4f6',
          200: '#e3e8ec',
          300: '#cdd5db',
          400: '#9aa5af',
          500: '#6a7681',
          600: '#4b555f',
          700: '#353d45',
          800: '#21272d',
          900: '#12161a',
        },
        success: { 50: '#f0fdf4', 500: '#22c55e', 600: '#16a34a', 700: '#15803d' },
        warning: { 50: '#fff8eb', 500: '#f59e0b', 600: '#d97706', 700: '#b45309' },
        danger:  { 50: '#fef2f2', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c' },
      },
      fontFamily: {
        sans: ['Geist', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'JetBrains Mono', 'monospace'],
      },
      fontSize: {
        // Compact, dense scale for an information-heavy ERP
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      spacing: {
        '4.5': '1.125rem',
      },
      borderRadius: {
        // 8px design system. Nothing balloons into rounded SaaS cards.
        none: '0',
        sm: '0.25rem',     // 4px
        DEFAULT: '0.375rem', // 6px — inputs, chips
        md: '0.375rem',
        lg: '0.5rem',      // 8px — cards, the system default
        xl: '0.5rem',
        '2xl': '0.625rem',
        full: '9999px',
      },
      boxShadow: {
        // Minimal. Depth comes from borders, not big shadows.
        xs: '0 1px 1px 0 rgb(18 22 26 / 0.04)',
        sm: '0 1px 2px 0 rgb(18 22 26 / 0.05)',
        card: '0 1px 2px 0 rgb(18 22 26 / 0.04)',
        'card-hover': '0 2px 6px -1px rgb(18 22 26 / 0.08)',
        elevated: '0 8px 24px -8px rgb(18 22 26 / 0.16)',
        dropdown: '0 4px 16px -4px rgb(18 22 26 / 0.14)',
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
