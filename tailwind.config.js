/** @type {import('tailwindcss').Config} */

/**
 * Design tokens are CSS variables holding space-separated RGB channels, so Tailwind
 * can inject `<alpha-value>` and `bg-primary/80` style modifiers keep working.
 *
 * The variables are prefixed `--m-` because this project already defines `--brand`,
 * `--border` and `--radius-*` for the pre-Tailwind pages (LoginPage, ProtectedRoute,
 * DashboardPage read them through inline styles). Prefixing keeps both sets intact
 * while the utility names below stay exactly what the design spec calls for.
 */
const token = (name) => `rgb(var(--m-${name}) / <alpha-value>)`;

module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: token('background'),
        foreground: token('foreground'),
        surface: token('surface'),
        card: { DEFAULT: token('card'), foreground: token('card-foreground') },
        popover: { DEFAULT: token('popover'), foreground: token('popover-foreground') },
        primary: { DEFAULT: token('primary'), foreground: token('primary-foreground') },
        secondary: { DEFAULT: token('secondary'), foreground: token('secondary-foreground') },
        muted: { DEFAULT: token('muted'), foreground: token('muted-foreground') },
        accent: { DEFAULT: token('accent'), foreground: token('accent-foreground') },
        destructive: { DEFAULT: token('destructive'), foreground: token('destructive-foreground') },
        border: token('border'),
        input: token('input'),
        ring: token('ring'),

        // Brand
        brand: {
          DEFAULT: token('brand'),
          foreground: token('brand-foreground'),
          hover: token('brand-hover'),
          subtle: token('brand-subtle'),
        },
        cars: token('brand'),
        'cars-ink': token('brand-hover'),

        // Neutrals — unchanged from the spec.
        ink: { DEFAULT: token('ink'), soft: token('ink-soft') },
        paper: { DEFAULT: token('paper'), warm: token('paper-warm'), cool: token('paper-cool') },
        rule: token('rule'),
        mute: token('mute'),

        success: token('success'),
        warning: token('warning'),
        info: token('info'),
        'chart-1': token('chart-1'),
        'chart-2': token('chart-2'),
        'chart-3': token('chart-3'),
        'chart-4': token('chart-4'),
        'chart-5': token('chart-5'),
      },
      borderRadius: {
        sm: 'calc(var(--m-radius) * 0.5)',
        md: 'calc(var(--m-radius) * 0.67)',
        lg: 'var(--m-radius)',
        xl: 'calc(var(--m-radius) * 1.33)',
        '2xl': 'calc(var(--m-radius) * 1.67)',
        '3xl': 'calc(var(--m-radius) * 2)',
        '4xl': 'calc(var(--m-radius) * 2.5)',
        card: '14px',
        control: '12px',
        chip: '6px',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
