import { useSelectedSession } from '@/state/session-store';
import { useSelectedConsole } from '@/hooks/use-console';
import { EmptyState } from '@/components/shared';
import { MemberCard } from '@/components/console/MemberCard';
import { StatusBadge } from '@/components/console/StatusBadge';
import { TaskThreadList } from '@/components/console/TaskThreadList';
import { KnowledgeSummaryPanel } from '@/components/console/KnowledgeSummaryPanel';
import { RecentReports } from '@/components/console/RecentReports';
import { useI18n } from '@/i18n';
import type { ConsoleMember } from '@ai-collab/protocol';

export function Dashboard() {
  const { t } = useI18n();
  const selectedSession = useSelectedSession();
  const {
    console: consoleData,
    host,
    workers,
    members,
    taskThreads,
    knowledgeSummary,
    idleInfo,
    loading,
    error,
    refresh,
    realtimeStatus,
  } = useSelectedConsole();

  if (!selectedSession) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--color-text-tertiary)',
        gap: '16px',
      }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <span style={{ fontSize: 'var(--font-size-md)' }}>{t('dashboard.selectSession')}</span>
      </div>
    );
  }

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '16px',
      }}>
        <div style={{ color: 'var(--color-error)', fontSize: 'var(--font-size-md)' }}>
          Failed to load: {String(error)}
        </div>
        <button
          onClick={() => { void refresh(); }}
          style={{
            padding: '8px 16px',
            background: 'var(--color-accent)',
            color: 'var(--color-text-inverse)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            fontSize: 'var(--font-size-md)',
            fontWeight: 500,
            fontFamily: 'var(--font-body)',
            transition: 'background var(--transition-fast)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-accent-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-accent)'; }}
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  const onlineMembers = members?.filter(
    (m: ConsoleMember) => m.status === 'working' || m.status === 'waiting'
  ).length ?? 0;

  const activeTasks = taskThreads?.filter(
    (t) => t.status === 'working' || t.status === 'pending'
  ).length ?? 0;

  return (
    <div className="responsive-padding-sm" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div className="animate-fade-in-up" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{
              fontSize: 'var(--font-size-2xl)',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-display)',
              letterSpacing: '-0.02em',
              marginBottom: '4px',
            }}>
              {selectedSession.name}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <StatusBadge status={selectedSession.status} />
              {realtimeStatus && (
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)' }}>
                  {realtimeStatus}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => { void refresh(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
              transition: 'all var(--transition-fast)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-accent)';
              e.currentTarget.style.color = 'var(--color-accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border)';
              e.currentTarget.style.color = 'var(--color-text-secondary)';
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {t('common.refresh')}
          </button>
        </div>
      </div>

      <div
        className="animate-fade-in-up stagger-1"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <StatCard
          label={t('dashboard.onlineMembers')}
          value={onlineMembers}
          total={members?.length ?? 0}
          icon={UsersIcon}
          accent="var(--color-accent)"
        />
        <StatCard
          label={t('dashboard.activeTasks')}
          value={activeTasks}
          total={taskThreads?.length ?? 0}
          icon={TasksIcon}
          accent="var(--color-warning)"
        />
        <StatCard
          label={t('dashboard.knowledgeEntries')}
          value={Object.values(knowledgeSummary?.counts ?? {}).reduce((a: number, b: number) => a + b, 0)}
          icon={BookIcon}
          accent="var(--color-info)"
        />
        <StatCard
          label={t('dashboard.idleMembers')}
          value={idleInfo?.pendingMessageCount ?? 0}
          icon={ClockIcon}
          accent="var(--color-success)"
        />
      </div>

      <div
        className="animate-fade-in-up stagger-2"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '24px',
          marginBottom: '24px',
        }}
      >
        <Panel title={t('dashboard.memberStatus')} subtitle={`${onlineMembers}/${members?.length ?? 0}${t('dashboard.onlineSuffix')}`}>
          {members && members.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
              {members.map((member: ConsoleMember) => (
                <MemberCard key={member.agentId} member={member} />
              ))}
            </div>
          ) : (
            <EmptyState message={t('dashboard.noMemberData')} />
          )}
        </Panel>

        <Panel title={t('dashboard.taskThreads')} subtitle={`${activeTasks}${t('dashboard.activeSuffix')}`}>
          {taskThreads && taskThreads.length > 0 ? (
            <TaskThreadList threads={taskThreads} />
          ) : (
            <EmptyState message={t('dashboard.noTasks')} />
          )}
        </Panel>
      </div>

      <div
        className="animate-fade-in-up stagger-3"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '24px',
        }}
      >
        <Panel title={t('dashboard.knowledgeSummary')}>
          {knowledgeSummary ? (
            <KnowledgeSummaryPanel summary={knowledgeSummary} />
          ) : (
            <EmptyState message={t('dashboard.noKnowledgeData')} />
          )}
        </Panel>

        <Panel title={t('dashboard.recentReports')}>
          <RecentReports members={members ?? []} />
        </Panel>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  total,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  total?: number;
  icon: React.FC;
  accent: string;
}) {
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        padding: '20px',
        border: '1px solid var(--color-border)',
        transition: 'all var(--transition-base)',
        cursor: 'default',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = accent;
        e.currentTarget.style.boxShadow = `0 0 0 1px ${accent}20`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)', fontWeight: 500 }}>
          {label}
        </span>
        <div style={{ color: accent, opacity: 0.8 }}>
          <Icon />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <span style={{
          fontSize: 'var(--font-size-3xl)',
          fontWeight: 700,
          color: 'var(--color-text-primary)',
          fontFamily: 'var(--font-display)',
          lineHeight: 1,
        }}>
          {value}
        </span>
        {total !== undefined && (
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)' }}>
            / {total}
          </span>
        )}
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--color-border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {title}
        </h2>
        {subtitle && (
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)' }}>
            {subtitle}
          </span>
        )}
      </div>
      <div style={{ padding: '16px 20px' }}>
        {children}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <div className="skeleton" style={{ height: '28px', width: '200px', marginBottom: '8px' }} />
        <div className="skeleton" style={{ height: '16px', width: '120px' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton" style={{ height: '100px' }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        <div className="skeleton" style={{ height: '300px' }} />
        <div className="skeleton" style={{ height: '300px' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div className="skeleton" style={{ height: '250px' }} />
        <div className="skeleton" style={{ height: '250px' }} />
      </div>
    </div>
  );
}

function UsersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function TasksIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
