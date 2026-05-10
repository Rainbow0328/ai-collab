import type { SessionItem } from './types';
import { useI18n, t } from '@/i18n';

interface SessionListProps {
  sessions: SessionItem[];
  selectedId: string | null;
  onSelect: (sessionId: string) => void;
  loading?: boolean;
  emptyText?: string;
}

export function SessionList({
  sessions,
  selectedId,
  onSelect,
  loading = false,
  emptyText,
}: SessionListProps) {
  const { t } = useI18n();
  const displayEmptyText = emptyText ?? t('session.noSessions');
  if (loading) {
    return <SessionListSkeleton />;
  }

  if (sessions.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        color: '#9ca3af',
      }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>💬</div>
        <div style={{ fontSize: '14px' }}>{displayEmptyText}</div>
      </div>
    );
  }

  return (
    <div style={{ overflow: 'auto', flex: 1 }}>
      {sessions.map((session) => (
        <SessionListItem
          key={session.id}
          session={session}
          selected={selectedId === session.id}
          onClick={() => onSelect(session.id)}
        />
      ))}
    </div>
  );
}

interface SessionListItemProps {
  session: SessionItem;
  selected: boolean;
  onClick: () => void;
}

function SessionListItem({ session, selected, onClick }: SessionListItemProps) {
  const { t } = useI18n();
  return (
    <div
      onClick={onClick}
      style={{
        padding: '16px',
        borderBottom: '1px solid #f3f4f6',
        cursor: 'pointer',
        background: selected ? '#eff6ff' : 'transparent',
        transition: 'background 0.15s',
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px',
      }}>
        <span style={{
          fontWeight: selected ? 600 : 500,
          fontSize: '14px',
          color: selected ? '#3b82f6' : '#111827',
        }}>
          {session.name}
        </span>
        <span style={{
          padding: '2px 8px',
          borderRadius: '10px',
          fontSize: '11px',
          background: session.status === 'active' ? '#dcfce7'
            : session.status === 'paused' ? '#fef3c7'
            : '#f3f4f6',
          color: session.status === 'active' ? '#166534'
            : session.status === 'paused' ? '#92400e'
            : '#6b7280',
        }}>
          {session.status === 'active' ? t('status.active') : session.status === 'paused' ? t('status.paused') : t('status.closed')}
        </span>
      </div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '13px',
        color: '#6b7280',
      }}>
        <span>{session.activeMemberCount}/{session.memberCount} {t('common.online')}</span>
        <span>{formatRelativeTime(session.lastActiveAt)}</span>
      </div>
    </div>
  );
}

function SessionListSkeleton() {
  return (
    <div style={{ padding: '16px' }}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ marginBottom: '16px' }}>
          <div style={{
            height: '16px',
            width: '60%',
            background: '#f3f4f6',
            borderRadius: '4px',
            marginBottom: '8px',
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
          <div style={{
            height: '14px',
            width: '40%',
            background: '#f3f4f6',
            borderRadius: '4px',
            animation: 'pulse 1.5s ease-in-out infinite',
            animationDelay: '0.2s',
          }} />
        </div>
      ))}
    </div>
  );
}

function formatRelativeTime(dateString: string): string {
  try {
    const now = new Date().getTime();
    const date = new Date(dateString).getTime();
    const diffSeconds = Math.floor((now - date) / 1000);

    if (diffSeconds < 60) return t('msg.justNow');
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}${t('msg.minutesAgo')}`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}${t('msg.hoursAgo')}`;
    return `${Math.floor(diffSeconds / 86400)}${t('msg.daysAgo')}`;
  } catch {
    return '-';
  }
}
