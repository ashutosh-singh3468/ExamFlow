import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/*
 * "Paper & Ink" design language.
 * - indigo  → ExamFlow electric blue (actions, focus, selection)
 * - slate   → warm ink neutrals that sit on exam-paper backgrounds
 * - mark    → highlighter yellow, used sparingly for emphasis
 */
const brand = {
  50: '#f0f1ff',
  100: '#e3e5ff',
  200: '#cbceff',
  300: '#a6abff',
  400: '#7d82fb',
  500: '#5a60f7',
  600: '#3d44f0',
  700: '#3036cf',
  800: '#282ca6',
  900: '#252983',
  950: '#16184d',
};
const ink = {
  50: '#f9f8f4',
  100: '#f1efe8',
  200: '#e5e2d8',
  300: '#cdc9bc',
  400: '#a19d90',
  500: '#757267',
  600: '#5a5850',
  700: '#41403a',
  800: '#2b2b28',
  900: '#18181b',
  950: '#0e0e10',
};

/** @type {import('tailwindcss').Config} */
export default {
  content: [path.join(here, 'index.html'), path.join(here, 'src/**/*.{ts,tsx}')],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
        display: ['"Fraunces Variable"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'Consolas', 'monospace'],
      },
      colors: {
        indigo: brand,
        violet: brand,
        slate: ink,
        ink: { DEFAULT: '#15161c', soft: '#2a2b33' },
        paper: { DEFAULT: '#f4f2ea', deep: '#ebe8dc' },
        mark: { DEFAULT: '#ddf75b', soft: '#f1fcc0', deep: '#c6e42f' },
        coral: { DEFAULT: '#ff5b3a', soft: '#fff0ec' },
        bg: token('bg'),
        card: token('card'),
        fg: token('fg'),
        muted: token('muted'),
        subtle: token('subtle'),
        line: token('line'),
        primary: {
          DEFAULT: token('primary'),
          fg: token('primary-fg'),
          soft: token('primary-soft'),
          strong: token('primary-strong'),
        },
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(21 22 28 / 0.05)',
        card: '0 1px 0 0 rgb(21 22 28 / 0.04), 0 1px 2px -1px rgb(21 22 28 / 0.06)',
        soft: '0 2px 4px -2px rgb(21 22 28 / 0.06), 0 10px 24px -12px rgb(21 22 28 / 0.12)',
        pop: '0 28px 60px -20px rgb(21 22 28 / 0.30), 0 10px 20px -12px rgb(21 22 28 / 0.12)',
        ink: '4px 4px 0 0 #15161c',
        'ink-sm': '2px 2px 0 0 #15161c',
        'ink-lg': '7px 7px 0 0 #15161c',
        brand: '3px 3px 0 0 #3d44f0',
        mark: '3px 3px 0 0 #ddf75b',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
      keyframes: {
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'slide-up': { from: { opacity: 0, transform: 'translateY(10px)' }, to: { opacity: 1, transform: 'none' } },
        page: { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
        'slide-in-right': { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
        'scale-in': { from: { opacity: 0, transform: 'scale(.97) translateY(6px)' }, to: { opacity: 1, transform: 'none' } },
        'seat-in': { from: { opacity: 0, transform: 'scale(.6)' }, to: { opacity: 1, transform: 'none' } },
        float: { '0%,100%': { transform: 'translateY(0) rotate(var(--r,0deg))' }, '50%': { transform: 'translateY(-8px) rotate(var(--r,0deg))' } },
        stamp: { '0%': { opacity: 0, transform: 'scale(1.6) rotate(-14deg)' }, '60%': { opacity: 1, transform: 'scale(.94) rotate(-8deg)' }, '100%': { transform: 'scale(1) rotate(-8deg)' } },
        'mark-in': { from: { backgroundSize: '0% 100%' }, to: { backgroundSize: '100% 100%' } },
        shimmer: { from: { backgroundPosition: '200% 0' }, to: { backgroundPosition: '-200% 0' } },
        blink: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.25 } },
      },
      animation: {
        'fade-in': 'fade-in .18s ease-out',
        'slide-up': 'slide-up .3s cubic-bezier(.2,.8,.2,1) both',
        page: 'page .4s cubic-bezier(.2,.8,.2,1) both',
        'slide-in-right': 'slide-in-right .3s cubic-bezier(.32,.72,0,1)',
        'scale-in': 'scale-in .2s cubic-bezier(.2,.8,.2,1)',
        'seat-in': 'seat-in .45s cubic-bezier(.2,.9,.3,1.3) both',
        float: 'float 7s ease-in-out infinite',
        stamp: 'stamp .55s cubic-bezier(.2,.9,.3,1.2) both',
        'mark-in': 'mark-in .7s cubic-bezier(.6,0,.2,1) .25s both',
        blink: 'blink 1.2s steps(2) infinite',
      },
    },
  },
  plugins: [],
};
