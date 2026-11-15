import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.js'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#0e1a2b',
          900: '#0e1a2b',
          800: '#1b2940',
          700: '#2e3d55',
          600: '#48566e',
          500: '#647189',
          400: '#8b96aa',
          300: '#b7bfcc',
          200: '#d8dde5',
          100: '#eaedf1',
          50: '#f4f5f7',
        },
        paper: {
          DEFAULT: '#fbfaf7',
          100: '#f5f3ed',
          200: '#ebe7dc',
        },
        accent: {
          50: '#eef3ff',
          100: '#dbe4fe',
          200: '#b9cbfc',
          500: '#3563e9',
          600: '#1f4fd1',
          700: '#1a41ab',
          800: '#173785',
        },
        campaign: {
          100: '#fdecc8',
          400: '#f0a43a',
          500: '#d98a1c',
          700: '#94570b',
        },
      },
      fontFamily: {
        serif: ['"Source Serif 4"', 'Georgia', 'Cambria', 'serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
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
            '--tw-prose-quote-borders': theme('colors.campaign.400'),
            '--tw-prose-captions': theme('colors.ink.500'),
          },
        },
      }),
    },
  },
  plugins: [typography],
};
