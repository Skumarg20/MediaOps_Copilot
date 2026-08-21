import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0b0f14',
          900: '#111820',
          800: '#18212c',
          700: '#22303f',
          600: '#2f4155',
          400: '#7d93ab',
          200: '#c3d0dd',
        },
        signal: {
          ok: '#3fb950',
          warn: '#d29922',
          bad: '#f85149',
          info: '#58a6ff',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
