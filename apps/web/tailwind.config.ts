import type { Config } from 'tailwindcss';
import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Design System Astrum — Dark Mode First
        brand: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e', // verde primário
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
        surface: {
          950: '#070711',
          900: '#0d0d1a',
          800: '#13131f',
          700: '#1a1a2e',
          600: '#252540',
          500: '#2e2e52',
        },
        neon: {
          green: '#39ff14',
          blue:  '#00f5ff',
          purple: '#bf5af2',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in': 'slideIn 0.2s ease-out',
        'fade-in': 'fadeIn 0.15s ease-out',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        slideIn: {
          from: { transform: 'translateY(-8px)', opacity: '0' },
          to:   { transform: 'translateY(0)',    opacity: '1' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-glass': 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'neon-green': '0 0 20px rgba(57,255,20,0.3)',
        'neon-blue':  '0 0 20px rgba(0,245,255,0.3)',
        glass: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 24px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [forms, typography],
} satisfies Config;
