import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  children,
  className,
  ...props
}) => {
  const getStyles = () => {
    const base = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 'var(--radius-md)',
      border: '1px solid transparent',
      fontWeight: 500,
      cursor: 'pointer',
      transition: 'transform var(--duration-press) var(--ease-spring), background var(--duration-hover) ease, box-shadow var(--duration-hover) ease, border-color var(--duration-hover) ease',
      outline: 'none',
      fontFamily: 'inherit',
      lineHeight: 1,
    };

    const typeStyles: Record<string, any> = {
      primary: {
        background: 'var(--color-accent)',
        color: '#ffffff',
        borderColor: 'var(--color-accent)',
      },
      secondary: {
        background: 'var(--color-surface)',
        color: 'var(--color-text-primary)',
        borderColor: 'var(--color-border)',
      },
      danger: {
        background: 'transparent',
        color: 'var(--color-error)',
        borderColor: 'var(--color-error)',
      },
    };

    const sizeStyles: Record<string, any> = {
      sm: { padding: '6px 12px', fontSize: '12px', height: '30px' },
      md: { padding: '8px 16px', fontSize: '13px', height: '34px' },
      lg: { padding: '10px 20px', fontSize: '14px', height: '38px' },
    };

    return { ...base, ...typeStyles[variant], ...sizeStyles[size] };
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (props.disabled) return;
    if (variant === 'primary') {
      e.currentTarget.style.background = 'var(--color-accent-hover)';
      e.currentTarget.style.borderColor = 'var(--color-accent-hover)';
    } else if (variant === 'secondary') {
      e.currentTarget.style.background = 'var(--color-surface-hover)';
      e.currentTarget.style.borderColor = 'var(--color-border)';
    } else if (variant === 'danger') {
      e.currentTarget.style.background = 'var(--color-error-subtle)';
      e.currentTarget.style.borderColor = 'var(--color-error-hover)';
      e.currentTarget.style.color = 'var(--color-error-hover)';
    }
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (props.disabled) return;
    if (variant === 'primary') {
      e.currentTarget.style.background = 'var(--color-accent)';
      e.currentTarget.style.borderColor = 'var(--color-accent)';
    } else if (variant === 'secondary') {
      e.currentTarget.style.background = 'var(--color-surface)';
      e.currentTarget.style.borderColor = 'var(--color-border)';
    } else if (variant === 'danger') {
      e.currentTarget.style.background = 'transparent';
      e.currentTarget.style.borderColor = 'var(--color-error)';
      e.currentTarget.style.color = 'var(--color-error)';
    }
  };

  return (
    <button
      {...props}
      style={{
        ...getStyles(),
        ...(props.disabled && {
          opacity: 0.35,
          cursor: 'not-allowed',
        }),
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={(e) => { if (!props.disabled) e.currentTarget.style.transform = 'scale(0.97)'; }}
      onMouseUp={(e) => { if (!props.disabled) e.currentTarget.style.transform = 'scale(1)'; }}
      className={className}
    >
      {children}
    </button>
  );
};
