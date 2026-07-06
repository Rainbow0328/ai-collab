/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: {
          DEFAULT: 'var(--color-surface)',
          hover: 'var(--color-surface-hover)',
          raised: 'var(--color-surface-raised)',
        },
        border: {
          DEFAULT: 'var(--color-border)',
          light: 'var(--color-border-light)',
        },
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          tertiary: 'var(--color-text-tertiary)',
          inverse: 'var(--color-text-inverse)',
          disabled: 'var(--color-text-disabled)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
          subtle: 'var(--color-accent-subtle)',
        },
        success: {
          DEFAULT: 'var(--color-success)',
          subtle: 'var(--color-success-subtle)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          subtle: 'var(--color-warning-subtle)',
        },
        error: {
          DEFAULT: 'var(--color-error)',
          subtle: 'var(--color-error-subtle)',
          hover: 'var(--color-error-hover)',
        },
        info: {
          DEFAULT: 'var(--color-info)',
          subtle: 'var(--color-info-subtle)',
        },
        sidebar: {
          bg: 'var(--color-sidebar-bg)',
          hover: 'var(--color-sidebar-hover)',
          active: 'var(--color-sidebar-active)',
          border: 'var(--color-sidebar-border)',
          text: 'var(--color-sidebar-text)',
          'text-active': 'var(--color-sidebar-text-active)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'DM Sans', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'DM Sans', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        surface: 'var(--shadow-surface)',
        modal: 'var(--shadow-modal)',
        'glow-sm': 'var(--shadow-glow-sm)',
        'glow-md': 'var(--shadow-glow-md)',
        'glow-lg': 'var(--shadow-glow-lg)',
      },
      transitionDuration: {
        75: '75ms',
        100: '100ms',
        150: '150ms',
        200: '200ms',
        300: '300ms',
        500: '500ms',
      },
      transitionTimingFunction: {
        spring: 'var(--ease-spring)',
        'spring-smooth': 'var(--ease-spring-smooth)',
        'spring-bouncy': 'var(--ease-spring-bouncy)',
      },
      animation: {
        'fade-in': 'fadeIn 200ms ease',
        'fade-in-up': 'fadeInUp 200ms ease',
        'fade-in-down': 'fadeInDown 200ms ease',
        'fade-in-left': 'fadeInLeft 200ms ease',
        'fade-in-right': 'fadeInRight 200ms ease',
        'scale-in': 'scaleIn 200ms var(--ease-spring)',
        'slide-in-up': 'slideInUp 300ms ease',
        'slide-in-down': 'slideInDown 300ms ease',
        pulse: 'pulse 2s ease-in-out infinite',
        spin: 'spin 1s linear infinite',
        ping: 'ping 1s ease infinite',
        bounce: 'bounce 1s infinite',
        skeleton: 'skeleton-pulse 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
