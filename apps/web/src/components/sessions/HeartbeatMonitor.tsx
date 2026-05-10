import type { HeartbeatRecord } from './types';
import { useI18n } from '@/i18n';

interface HeartbeatMonitorProps {
  records: HeartbeatRecord[];
  loading?: boolean;
  title?: string;
}

export function HeartbeatMonitor({
  records,
  loading = false,
  title,
}: HeartbeatMonitorProps) {
  const { t } = useI18n();
  const displayTitle = title ?? t('heartbeat.monitor');
  if (loading) {
    return (
      <div style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        padding: '20px',
        boxShadow: 'var(--shadow-card)',
        flex: 1,
      }}>
        <div className="skeleton-pulse" style={{
          height: '20px',
          width: '80px',
          background: 'var(--color-surface-hover)',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '16px',
        }} />
        <div className="skeleton-pulse" style={{
          height: '120px',
          background: 'var(--color-surface-hover)',
          borderRadius: 'var(--radius-lg)',
        }} />
      </div>
    );
  }

  const onlineCount = records.filter((r) => r.status === 'ok').length;
  const lateCount = records.filter((r) => r.status === 'late').length;

  return (
    <div style={{
      background: 'var(--color-surface)',
      borderRadius: 'var(--radius-lg)',
      padding: '20px',
      boxShadow: 'var(--shadow-card)',
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
      }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600 }}>{displayTitle}</h2>
        <div style={{ display: 'flex', gap: '12px', fontSize: '13px' }}>
          <span style={{ color: 'var(--color-success)' }}>{t('heartbeat.normal')} {onlineCount}</span>
          <span style={{ color: 'var(--color-error)' }}>{t('heartbeat.timeout')} {lateCount}</span>
        </div>
      </div>

      {records.length === 0 ? (
        <div style={{
          flex: 1,
          minHeight: '120px',
          background: 'var(--color-surface-hover)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-tertiary)',
          fontSize: '13px',
        }}>
          {t('heartbeat.noData')}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: '8px',
        }}>
          {records.map((r) => (
            <div
              key={r.memberName}
              style={{
                padding: '10px 12px',
                background: r.status === 'ok' ? 'var(--color-success-subtle)' : 'var(--color-error-subtle)',
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${r.status === 'ok' ? 'var(--color-success)' : 'var(--color-error)'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: r.status === 'ok' ? 'var(--color-success)' : 'var(--color-error)',
                flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--color-text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {r.memberName}
                </div>
                <div style={{
                  fontSize: '11px',
                  color: r.status === 'ok' ? 'var(--color-success)' : 'var(--color-error)',
                  opacity: 0.7,
                }}>
                  {r.status === 'ok' ? t('common.online') : t('heartbeat.timeout')}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
