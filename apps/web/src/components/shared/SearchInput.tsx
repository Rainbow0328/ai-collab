import { memo } from 'react';
import { t } from '@/i18n';

interface SearchInputProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  width?: string;
  id?: string;
}

export const SearchInput = memo(function SearchInput({
  value,
  onChange,
  placeholder = t('common.search'),
  width = '100%',
  id,
}: SearchInputProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        background: 'var(--color-bg)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border)',
        width,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <label htmlFor={id} className="sr-only">{placeholder}</label>
      <input
        id={id}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        style={{
          border: 'none',
          background: 'transparent',
          outline: 'none',
          fontSize: 'var(--font-size-md)',
          color: 'var(--color-text-primary)',
          width: '100%',
          fontFamily: 'var(--font-body)',
        }}
      />
    </div>
  );
});
