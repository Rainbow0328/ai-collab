import { t, useI18n } from '@/i18n';
import type { MessageDetail } from './types';

interface MessageDetailProps {
  message: MessageDetail | null;
  loading?: boolean;
  onMarkAsRead?: (messageId: string) => void;
  onReply?: (messageId: string) => void;
  emptyText?: string;
}

function getTypeLabels(): Record<string, { label: string; bg: string; text: string }> {
  return {
    task: { label: t('msg.task'), bg: 'var(--color-warning-subtle)', text: 'var(--color-warning)' },
    result: { label: t('msg.result'), bg: 'var(--color-success-subtle)', text: 'var(--color-success)' },
    system: { label: t('msg.system'), bg: 'var(--color-surface-hover)', text: 'var(--color-text-secondary)' },
    instruction: { label: t('msg.instruction'), bg: 'var(--color-accent-subtle)', text: 'var(--color-accent)' },
    progress: { label: t('msg.progress'), bg: 'var(--color-success-subtle)', text: 'var(--color-success)' },
    heartbeat: { label: t('msg.heartbeat'), bg: 'var(--color-info-subtle)', text: 'var(--color-info)' },
    ack: { label: t('msg.ack'), bg: 'var(--color-warning-subtle)', text: 'var(--color-warning)' },
    error: { label: t('msg.error'), bg: 'var(--color-error-subtle)', text: 'var(--color-error)' },
  };
}

export function MessageDetail({
  message,
  loading = false,
  onMarkAsRead,
  onReply,
  emptyText,
}: MessageDetailProps) {
  const { t } = useI18n();
  const typeLabels = getTypeLabels();

  if (loading) {
    return <DetailSkeleton />;
  }

  if (!message) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--color-text-tertiary)',
        padding: '40px 20px',
      }}>
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'var(--color-surface-hover)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </div>
        <div style={{ fontSize: '14px' }}>{emptyText ?? t('msg.selectMessage')}</div>
      </div>
    );
  }

  const typeStyle = typeLabels[message.type] || typeLabels.system;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: 'var(--color-accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '15px',
          }}>
            {message.senderName.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--color-text-primary)' }}>{message.senderName}</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
              {formatFullTime(message.createdAt)}
            </div>
          </div>
          <span style={{
            padding: '3px 10px',
            borderRadius: 'var(--radius-full)',
            fontSize: '11px',
            fontWeight: 500,
            background: typeStyle.bg,
            color: typeStyle.text,
            border: '1px solid ' + typeStyle.text + '33',
          }}>
            {typeStyle.label}
          </span>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
        {message.relatedTaskTitle && (
          <div style={{
            padding: '10px 14px',
            background: 'var(--color-success-subtle)',
            border: '1px solid var(--color-success-subtle)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '16px',
            fontSize: '13px',
          }}>
            <span style={{ color: 'var(--color-success)', fontWeight: 500 }}>{t('msg.relatedTask')}</span>
            <span style={{ color: 'var(--color-text-primary)' }}>{message.relatedTaskTitle}</span>
          </div>
        )}

        <div style={{
          fontSize: '13px',
          lineHeight: 1.8,
          whiteSpace: 'pre-wrap',
          color: 'var(--color-text-primary)',
        }}>
          {message.content}
        </div>
      </div>

      <div style={{
        padding: '12px 20px',
        borderTop: '1px solid var(--color-border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--color-surface-hover)',
      }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {message.tags?.map((tag) => (
            <span key={tag} style={{
              padding: '3px 8px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              fontSize: '11px',
              color: 'var(--color-text-secondary)',
            }}>
              {tag}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {!message.isRead && onMarkAsRead && (
            <button
              onClick={() => onMarkAsRead(message.id)}
              style={{
                padding: '6px 12px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontSize: '12px',
                color: 'var(--color-text-primary)',
                fontFamily: 'inherit',
              }}
            >
              {t('msg.markAsRead')}
            </button>
          )}
          {onReply && (
            <button
              onClick={() => onReply(message.id)}
              style={{
                padding: '6px 14px',
                border: 'none',
                background: 'var(--color-accent)',
                color: '#ffffff',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                fontFamily: 'inherit',
              }}
            >
              {t('msg.reply')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <div className="skeleton-pulse" style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          background: 'var(--color-surface-hover)',
        }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton-pulse" style={{
            height: '16px',
            width: '100px',
            background: 'var(--color-surface-hover)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '8px',
          }} />
          <div className="skeleton-pulse" style={{
            height: '12px',
            width: '150px',
            background: 'var(--color-surface-hover)',
            borderRadius: 'var(--radius-sm)',
          }} />
        </div>
      </div>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="skeleton-pulse" style={{
          height: '12px',
          width: `${Math.random() * 30 + 60}%`,
          background: 'var(--color-surface-hover)',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '10px',
        }} />
      ))}
    </div>
  );
}

function formatFullTime(dateString: string): string {
  try {
    return new Date(dateString).toLocaleString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
}
