import { memo } from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  count?: number;
  gap?: string;
}

export const Skeleton = memo(function Skeleton({
  width = '100%',
  height = '16px',
  borderRadius = 'var(--radius-sm)',
  count = 1,
  gap = '8px',
}: SkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => i);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }} aria-hidden="true">
      {items.map((i) => (
        <div
          key={i}
          className="skeleton-pulse"
          style={{
            width: typeof width === 'number' ? `${width}px` : width,
            height: typeof height === 'number' ? `${height}px` : height,
            borderRadius,
            background: 'var(--color-surface-hover)',
          }}
        />
      ))}
    </div>
  );
});

export const SkeletonTable = memo(function SkeletonTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }} aria-hidden="true">
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gap: '12px',
            padding: '12px 16px',
            borderBottom: '1px solid var(--color-border-light)',
          }}
        >
          {Array.from({ length: columns }, (_, col) => (
            <div
              key={col}
              className="skeleton-pulse"
              style={{
                height: '14px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-surface-hover)',
                width: col === 0 ? '60%' : '80%',
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
});
