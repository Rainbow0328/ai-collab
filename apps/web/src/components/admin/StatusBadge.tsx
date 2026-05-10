import React from 'react';

interface StatusBadgeProps {
  status: string;
  text?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, text }) => {
  const displayText = text || status;

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '1px 8px',
      fontSize: '11px',
      fontWeight: 500,
      color: 'var(--color-text-primary)',
      background: 'transparent',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-full)',
    }}>
      {displayText}
    </span>
  );
};
