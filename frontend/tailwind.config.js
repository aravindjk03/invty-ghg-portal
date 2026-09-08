/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)',
        surface: {
          DEFAULT: 'var(--surface)',
          raised: 'var(--surface-raised)',
          sunken: 'var(--surface-sunken)',
        },
        brand: {
          heading: 'var(--text-heading)',
          body: 'var(--text-body)',
          link: 'var(--text-link)',
          muted: 'var(--text-muted)',
          decorative: 'var(--text-decorative)',
        },
        blue: {
          50: 'var(--blue-50)',
          100: 'var(--blue-100)',
          200: 'var(--blue-200)',
          500: 'var(--blue-500)',
          600: 'var(--blue-600)',
          700: 'var(--blue-700)',
        },
        border: {
          DEFAULT: 'var(--border)',
          strong: 'var(--border-strong)',
        },
        scope: {
          1: 'var(--scope-1)',
          2: 'var(--scope-2)',
          3: 'var(--scope-3)',
          biogenic: 'var(--biogenic)',
        },
        status: {
          success: 'var(--success)',
          warning: 'var(--warning)',
          danger: 'var(--danger)',
          info: 'var(--info)',
        },
        grade: {
          a: 'var(--grade-a)',
          b: 'var(--grade-b)',
          c: 'var(--grade-c)',
          d: 'var(--grade-d)',
          e: 'var(--grade-e)',
        },
      },
      borderRadius: {
        sm: 'var(--r-sm)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)',
        pill: 'var(--r-pill)',
      },
      boxShadow: {
        'nm-raised': 'var(--nm-raised)',
        'nm-raised-sm': 'var(--nm-raised-sm)',
        'nm-raised-lg': 'var(--nm-raised-lg)',
        'nm-pressed': 'var(--nm-pressed)',
        'nm-inset-input': 'var(--nm-inset-input)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
