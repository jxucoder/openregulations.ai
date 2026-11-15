import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.js'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#0a0e1a',
          900: '#0a0e1a',
          800: '#161c2e',
          700: '#2b3248',
          600: '#48506a',
          500: '#5d6680',
          400: '#8d94a6',
          300: '#c4c9d4',
          200: '#d5d9e2',
          100: '#e4e7ed',
          50: '#eef0f4',
        },
        paper: {
          DEFAULT: '#f5f6f8',
          100: '#eef0f4',
          200: '#e4e7ed',
        },
        accent: {
          50: '#eef0ff',
          100: '#dfe2ff',
          200: '#b9bfff',
          300: '#8d96fa',
          500: '#3a48f2',
          600: '#2433f0',
          700: '#1b26c4',
          800: '#141c94',
        },
        campaign: {
          100: '#fff6c2',
          400: '#ffe14a',
          500: '#f2c500',
          700: '#5c4a06',
        },
        alert: { 500: '#e8590c', 700: '#b8330a' },
      },
      fontFamily: {
        sans: ['"Public Sans"', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        none: '0',
        sm: '0',
        DEFAULT: '0',
        md: '0',
        lg: '0',
        xl: '0',
        full: '9999px',
      },
      typography: ({ theme }) => ({
        report: {
          css: {
            '--tw-prose-body': theme('colors.ink.700'),
            '--tw-prose-headings': theme('colors.ink.900'),
            '--tw-prose-lead': theme('colors.ink.600'),
            '--tw-prose-links': theme('colors.accent.700'),
            '--tw-prose-bold': theme('colors.ink.900'),
            '--tw-prose-counters': theme('colors.ink.500'),
            '--tw-prose-bullets': theme('colors.ink.300'),
            '--tw-prose-hr': theme('colors.ink.100'),
            '--tw-prose-quotes': theme('colors.ink.800'),
            '--tw-prose-quote-borders': theme('colors.ink.200'),
            '--tw-prose-captions': theme('colors.ink.500'),
          },
        },
      }),
    },
  },
  plugins: [typography],
};
