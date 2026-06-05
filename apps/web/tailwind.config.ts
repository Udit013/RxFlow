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
        // RxFlow brand palette — refined to feel a touch more clinical-yet-warm
        brand: {
          50: '#edfaff',
          100: '#d6f1ff',
          200: '#b5e7ff',
          300: '#82d8ff',
          400: '#48c0fd',
          500: '#1ea2f0',
          600: '#0c83d0', // primary action
          700: '#0a67a8',
          800: '#0e588a',
          900: '#114b73',
          950: '#0a2e4a',
        },
        // Accent (used sparingly for highlights, success-leaning actions)
        accent: {
          50: '#ecfdf5',
          100: '#d1fae5',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
        },
        // Surface gray scale — slightly warm to avoid clinical sterility
        surface: {
          50: '#fafbfd',
          100: '#f3f5f8',
          200: '#e4e8ee',
          300: '#cdd4dd',
          400: '#9aa3b1',
          500: '#6b7484',
          600: '#4a525f',
          700: '#363c47',
          800: '#23282f',
          900: '#11141a',
        },
        success: { 50: '#f0fdf4', 500: '#22c55e', 600: '#16a34a', 700: '#15803d' },
        warning: { 50: '#fffbeb', 500: '#f59e0b', 600: '#d97706', 700: '#b45309' },
        danger:  { 50: '#fef2f2', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Tighter display sizing for headings
        'display-sm': ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.015em', fontWeight: '700' }],
        'display':    ['2rem',   { lineHeight: '2.5rem', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-lg': ['2.5rem', { lineHeight: '3rem', letterSpacing: '-0.025em', fontWeight: '700' }],
      },
      borderRadius: {
        sm: '0.375rem',
        DEFAULT: '0.5rem',
        lg: '0.75rem',
        xl: '1rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
      boxShadow: {
        // Softer, more layered shadow scale
        xs: '0 1px 2px 0 rgb(15 23 42 / 0.04)',
        sm: '0 1px 3px 0 rgb(15 23 42 / 0.06), 0 1px 2px -1px rgb(15 23 42 / 0.05)',
        card: '0 1px 3px 0 rgb(15 23 42 / 0.06), 0 1px 2px -1px rgb(15 23 42 / 0.04)',
        'card-hover': '0 8px 24px -8px rgb(12 131 208 / 0.18), 0 4px 8px -4px rgb(15 23 42 / 0.08)',
        elevated: '0 12px 32px -12px rgb(15 23 42 / 0.18), 0 4px 12px -4px rgb(15 23 42 / 0.08)',
        ring: '0 0 0 4px rgb(12 131 208 / 0.12)',
        // Inset for subtle inputs
        'inset-sm': 'inset 0 1px 2px 0 rgb(15 23 42 / 0.06)',
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out',
        'rise': 'rise 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        'shimmer': 'shimmer 1.5s linear infinite',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        rise: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-brand': 'linear-gradient(135deg, #0c83d0 0%, #0a67a8 100%)',
        'gradient-mesh':
          'radial-gradient(at 20% 0%, rgba(72, 192, 253, 0.12) 0px, transparent 50%),' +
          'radial-gradient(at 80% 0%, rgba(16, 185, 129, 0.06) 0px, transparent 50%),' +
          'radial-gradient(at 0% 50%, rgba(12, 131, 208, 0.06) 0px, transparent 50%)',
      },
    },
  },
  plugins: [],
}

export default config
