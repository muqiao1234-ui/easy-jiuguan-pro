import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'bg-primary': '#020617',
        'bg-secondary': '#0f172a',
        'bg-tertiary': '#1e293b',
        'text-primary': '#f1f5f9',
        'text-secondary': '#94a3b8',
        accent: '#f59e0b',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-left': {
          from: { opacity: '0', transform: 'translateX(-16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 4px rgba(245, 158, 11, 0.3)' },
          '50%': { boxShadow: '0 0 12px rgba(245, 158, 11, 0.6)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-in-left': 'slide-in-left 0.2s ease-out',
        'slide-in-right': 'slide-in-right 0.2s ease-out',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
