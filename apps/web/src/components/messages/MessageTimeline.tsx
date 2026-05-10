import { t, useI18n } from '@/i18n';
import type { MessageItem, MessageType, MessageFilter } from './types';

interface MessageTimelineProps {
  messages: MessageItem[];
  selectedId: string | null;
  onSelect: (messageId: string) => void;
  loading?: boolean;
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

export function MessageTimeline({
  messages,
  selectedId,
  onSelect,
  loading = false,
  emptyText,
}: MessageTimelineProps) {
  const { t } = useI18n();
  const typeLabels = getTypeLabels();

  if (loading) {
    return <TimelineSkeleton />;
  }

  if (messages.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        color: 'var(--color-text-tertiary)',
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: 'var(--color-surface-hover)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 12px',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <div style={{ fontSize: '14px' }}>{emptyText ?? t('msg.noMessages')}</div>
      </div>
    );
  }

  const grouped = groupMessagesByDate(messages);

  return (
    <div style={{ overflow: 'auto', flex: 1 }}>
      {Object.entries(grouped).map(([date, msgs]) => (
        <div key={date}>
          <div style={{
            padding: '12px 16px 8px',
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--color-text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            position: 'sticky',
            top: 0,
            background: 'var(--color-surface)',
            zIndex: 1,
            borderBottom: '1px solid var(--color-border-light)',
          }}>
            {date}
          </div>
          {msgs.map((message) => (
            <MessageItemCard
              key={message.id}
              message={message}
              selected={selectedId === message.id}
              onClick={() => onSelect(message.id)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

interface MessageItemCardProps {
  message: MessageItem;
  selected: boolean;
  onClick: () => void;
}

function MessageItemCard({ message, selected, onClick }: MessageItemCardProps) {
  const typeLabels = getTypeLabels();
  const typeStyle = typeLabels[message.type] || typeLabels.system;

  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--color-border-light)',
        cursor: 'pointer',
        background: selected ? 'var(--color-accent-subtle)' : 'transparent',
        borderLeft: selected ? '2px solid var(--color-accent)' : '2px solid transparent',
        transition: 'background var(--duration-hover) ease, border-color var(--duration-hover) ease',
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '4px',
      }}>
        <span style={{
          fontWeight: selected ? 600 : 500,
          fontSize: '13px',
          color: selected ? 'var(--color-accent)' : 'var(--color-text-primary)',
        }}>
          {message.senderName}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
          {formatTime(message.createdAt)}
        </span>
      </div>

      <div style={{
        fontSize: '12px',
        color: 'var(--color-text-secondary)',
        marginBottom: '6px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {message.summary}
      </div>

      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <span style={{
          padding: '1px 8px',
          borderRadius: 'var(--radius-full)',
          fontSize: '11px',
          fontWeight: 500,
          background: typeStyle.bg,
          color: typeStyle.text,
          border: '1px solid ' + typeStyle.text + '33',
        }}>
          {typeStyle.label}
        </span>
        {message.attachments && message.attachments > 0 && (
          <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: '2px' }}>
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            {message.attachments}
          </span>
        )}
        {!message.isRead && (
          <span style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: 'var(--color-accent)',
            marginLeft: 'auto',
          }} />
        )}
      </div>
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div style={{ padding: '16px' }}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} style={{ marginBottom: '20px' }}>
          <div className="skeleton-pulse" style={{
            height: '14px',
            width: '40%',
            background: 'var(--color-surface-hover)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '8px',
          }} />
          <div className="skeleton-pulse" style={{
            height: '12px',
            width: '80%',
            background: 'var(--color-surface-hover)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '8px',
          }} />
          <div className="skeleton-pulse" style={{
            height: '14px',
            width: '60px',
            background: 'var(--color-surface-hover)',
            borderRadius: 'var(--radius-full)',
          }} />
        </div>
      ))}
    </div>
  );
}

function groupMessagesByDate(messages: MessageItem[]): Record<string, MessageItem[]> {
  const grouped: Record<string, MessageItem[]> = {};

  for (const msg of messages) {
    const date = formatDate(msg.createdAt);
    if (!grouped[date]) {
      grouped[date] = [];
    }
    grouped[date].push(msg);
  }

  return grouped;
}

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return t('msg.today');
    if (date.toDateString() === yesterday.toDateString()) return t('msg.yesterday');

    return date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
  } catch {
    return t('msg.unknownDate');
  }
}

function formatTime(dateString: string): string {
  try {
    return new Date(dateString).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
}
