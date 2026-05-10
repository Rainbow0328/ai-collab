import React from 'react';

interface DataTableProps {
  columns: {
    key: string;
    title: string;
    width?: string;
    render?: (value: any, record: any, index: number) => React.ReactNode;
  }[];
  data: any[];
  loading?: boolean;
  onRowClick?: (record: any, index: number) => void;
  rowKey?: string;
  emptyText?: string;
}

export const DataTable: React.FC<DataTableProps> = ({
  columns,
  data,
  loading,
  onRowClick,
  rowKey = 'id',
  emptyText = 'No data',
}) => {
  if (loading) {
    return (
      <div style={{
        padding: '48px',
        textAlign: 'center',
        color: 'var(--color-text-tertiary)',
        fontSize: 'var(--font-size-sm)',
      }}>
        Loading...
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div style={{
        padding: '64px 24px',
        textAlign: 'center',
        color: 'var(--color-text-tertiary)',
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-card)',
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: 'var(--color-surface-hover)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <polyline points="13 2 13 9 20 9" />
          </svg>
        </div>
        <div style={{ fontSize: 'var(--font-size-base)', marginBottom: '4px' }}>{emptyText}</div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--color-surface)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--color-border)',
      boxShadow: 'var(--shadow-card)',
      overflow: 'hidden',
    }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontVariantNumeric: 'tabular-nums',
      }}>
        <thead>
          <tr style={{
            background: 'var(--color-surface-hover)',
            borderBottom: '1px solid var(--color-border)',
          }}>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  padding: '10px 16px',
                  textAlign: 'left',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--color-text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  width: col.width,
                  whiteSpace: 'nowrap',
                }}
              >
                {col.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((record, index) => (
            <tr
              key={record[rowKey] ?? index}
              onClick={() => onRowClick?.(record, index)}
              style={{
                borderBottom: '1px solid var(--color-border-light)',
                cursor: onRowClick ? 'pointer' : 'default',
                transition: 'background var(--duration-hover) ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-surface-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={{
                    padding: '10px 16px',
                    fontSize: '13px',
                    color: 'var(--color-text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: col.width || '300px',
                  }}
                >
                  {col.render
                    ? col.render(record[col.key], record, index)
                    : record[col.key] ?? '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
