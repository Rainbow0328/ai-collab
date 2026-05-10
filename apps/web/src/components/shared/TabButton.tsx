import { memo } from 'react';
import type { ReactNode } from 'react';

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  variant?: 'tab' | 'mode';
}

export const TabButton = memo(function TabButton({
  active,
  onClick,
  children,
  variant = 'tab',
}: TabButtonProps) {
  const isMode = variant === 'mode';

  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      style={{
        padding: isMode ? '8px 14px' : '10px 18px',
        border: isMode ? 'none' : 'none',
        borderBottom: !isMode && active ? '2px solid var(--color-accent)' : '2px solid transparent',
        background: isMode
          ? active ? 'var(--color-accent)' : 'var(--color-surface)'
          : 'transparent',
        color: isMode
          ? active ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)'
          : active ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
        cursor: 'pointer',
        fontSize: 'var(--font-size-md)',
        fontWeight: active ? 600 : 400,
        fontFamily: 'var(--font-body)',
        transition: 'all var(--transition-fast)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
});
