import type { ConsoleMember } from '@ai-collab/protocol';
import { MemberCard } from '@/components/console';
import { EmptyState } from '@/components/shared';
import type { SessionMember } from './types';
import { useI18n, t } from '@/i18n';

interface MemberStatusCardProps {
  members?: SessionMember[];
  consoleMembers?: ConsoleMember[];
  loading?: boolean;
  title?: string;
}

export function MemberStatusCard({
  members = [],
  consoleMembers,
  loading = false,
  title,
}: MemberStatusCardProps) {
  const { t } = useI18n();
  const displayTitle = title ?? t('member.status');
  if (loading) {
    return <LoadingState title={displayTitle} />;
  }

  if (consoleMembers) {
    const counts = {
      offline: consoleMembers.filter((m) => m.status === 'offline').length,
      working: consoleMembers.filter((m) => m.status === 'working').length,
      waiting: consoleMembers.filter((m) => m.status === 'waiting').length,
    };

    return (
      <div style={panelStyle}>
        <Header title={displayTitle} summary={`${t('status.working')} ${counts.working} / ${t('status.waiting')} ${counts.waiting} / ${t('status.offline')} ${counts.offline}`} />

        {consoleMembers.length === 0 ? (
          <EmptyState variant="compact" message={t('member.noMembers')} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
            {consoleMembers.map((member) => (
              <MemberCard key={member.agentId} member={member} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const onlineCount = members.filter((m) => m.status === 'online' || m.status === 'busy').length;

  return (
    <div style={panelStyle}>
      <Header title={displayTitle} summary={`${onlineCount}/${members.length} ${t('common.online')}`} />

      {members.length === 0 ? (
        <EmptyState variant="compact" message={t('member.noMembers')} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
          {members.map((member) => (
            <MemberItem key={member.id} member={member} />
          ))}
        </div>
      )}
    </div>
  );
}

function Header({ title, summary }: { title: string; summary: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{title}</h2>
      <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{summary}</span>
    </div>
  );
}

function LoadingState({ title }: { title: string }) {
  return (
    <div style={panelStyle}>
      <Header title={title} summary={t('member.loading')} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton-pulse" style={{
            height: '120px',
            background: 'var(--color-surface-hover)',
            borderRadius: 'var(--radius-lg)',
          }} />
        ))}
      </div>
    </div>
  );
}

function MemberItem({ member }: { member: SessionMember }) {
  const avatarColor = member.avatarColor || '#8b5cf6';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '12px',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--color-surface)',
    }}>
      <div style={{
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        background: avatarColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ffffff',
        fontWeight: 600,
        fontSize: '14px',
        flexShrink: 0,
      }}>
        {member.name.charAt(0).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 600,
          fontSize: '14px',
          color: 'var(--color-text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>{member.name}</div>
        <div style={{
          fontSize: '12px',
          color: 'var(--color-text-tertiary)',
        }}>{member.role}</div>
      </div>
      <span style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: member.status === 'online' || member.status === 'busy' ? 'var(--color-success)' :
                     member.status === 'idle' || member.status === 'paused' ? 'var(--color-warning)' :
                     'var(--color-text-tertiary)',
        flexShrink: 0,
      }} />
    </div>
  );
}

const panelStyle = {
  background: 'var(--color-surface)',
  borderRadius: 'var(--radius-lg)',
  padding: '20px',
  boxShadow: 'var(--shadow-card)',
  border: '1px solid var(--color-border)',
};
