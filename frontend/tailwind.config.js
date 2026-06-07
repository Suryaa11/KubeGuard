/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        base: 'var(--color-base)',
        surface: 'var(--color-surface)',
        elevated: 'var(--color-elevated)',
        border: 'var(--color-border)',
        'border-bright': 'var(--color-border-bright)',
        indigo: 'var(--color-indigo)',
        'indigo-dim': 'var(--color-indigo-dim)',
        green: 'var(--color-green)',
        amber: 'var(--color-amber)',
        rose: 'var(--color-rose)',
        cyan: 'var(--color-cyan)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-muted': 'var(--color-text-muted)',
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 rgba(99,102,241,0.15)' },
          '50%': { boxShadow: '0 0 24px rgba(99,102,241,0.45)' },
        },
        'grid-pulse': {
          '0%, 100%': { opacity: 0.03 },
          '50%': { opacity: 0.07 },
        },
        'count-up': {
          '0%': { opacity: 0, transform: 'translateY(6px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.5s linear infinite',
        'glow-pulse': 'glow-pulse 2.2s ease-in-out infinite',
        'grid-pulse': 'grid-pulse 8s ease-in-out infinite',
        'count-up': 'count-up 0.4s ease-out',
      },
    },
  },
  plugins: [],
}
