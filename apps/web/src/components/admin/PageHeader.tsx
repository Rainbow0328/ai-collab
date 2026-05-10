import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  extra?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  extra,
}) => {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 'var(--space-5)',
      paddingBottom: 'var(--space-4)',
      borderBottom: '1px solid var(--color-border)',
    }}>
      <div>
        <h1 style={{
          fontSize: 'var(--font-size-2xl)',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          marginBottom: subtitle ? '6px' : '0',
          letterSpacing: '-0.02em',
        }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{
            fontSize: '13px',
            color: 'var(--color-text-tertiary)',
            margin: 0,
            lineHeight: 1.5,
          }}>
            {subtitle}
          </p>
        )}
      </div>
      {extra && <div>{extra}</div>}
    </div>
  );
};
