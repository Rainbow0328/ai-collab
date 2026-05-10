import { memo } from 'react';
import type { ReactNode } from 'react';
import { t } from '@/i18n';

interface EmptyStateProps {
  message?: string;
  icon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  variant?: 'default' | 'compact';
}

export const EmptyState = memo(function EmptyState({
  message = t('common.noData'),
  icon,
  actionLabel,
  onAction,
  variant = 'default',
}: EmptyStateProps) {
  const isCompact = variant === 'compact';

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isCompact ? '16px' : '32px 24px',
        textAlign: 'center',
        color: 'var(--color-text-tertiary)',
        fontSize: isCompact ? 'var(--font-size-base)' : 'var(--font-size-md)',
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
        minHeight: isCompact ? 'auto' : '120px',
      }}
    >
      {icon && (
        <div style={{ marginBottom: '12px', opacity: 0.5 }} aria-hidden="true">
          {icon}
        </div>
      )}
      <p style={{ margin: 0, lineHeight: 1.6 }}>{message}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          style={{
            marginTop: '14px',
            padding: '8px 18px',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-accent)',
            color: 'var(--color-text-inverse)',
            fontSize: 'var(--font-size-md)',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
            transition: 'background var(--transition-fast)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-accent-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-accent)'; }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
});
