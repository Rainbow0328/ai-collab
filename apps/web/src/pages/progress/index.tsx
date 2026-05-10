import { useState } from 'react';
import { DataTable, PageHeader, Button, StatusBadge } from '@/components/admin';
import { useProgress } from '@/hooks/use-progress';
import { useWebSocket } from '@/lib/websocket-client';
import { useSelectedSessionId } from '@/state/session-store';
import { useI18n } from '@/i18n';
import type { Progress, ProgressStatus } from '@/types/progress';

function getStatusText(status: ProgressStatus): string {
  const map: Record<ProgressStatus, string> = {
    in_progress: 'Running',
    completed: 'Completed',
    failed: 'Failed',
    pending: 'Pending',
    cancelled: 'Cancelled',
  };
  return map[status] || 'Unknown';
}

function getStatusBadgeStatus(status: ProgressStatus): string {
  const map: Record<ProgressStatus, string> = {
    in_progress: 'working',
    completed: 'active',
    failed: 'failed',
    pending: 'waiting',
    cancelled: 'offline',
  };
  return map[status] || 'offline';
}

function formatTime(dateString: string): string {
  try {
    return new Date(dateString).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '-';
  }
}

function formatDuration(start: string, end: string): string {
  try {
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    const diffSeconds = Math.floor((endTime - startTime) / 1000);

    if (diffSeconds < 60) {
      return `${diffSeconds}s`;
    }
    if (diffSeconds < 3600) {
      return `${Math.floor(diffSeconds / 60)}m ${diffSeconds % 60}s`;
    }
    const minutes = Math.floor((diffSeconds % 3600) / 60);
    const hours = Math.floor(diffSeconds / 3600);
    return `${hours}h ${minutes}m`;
  } catch {
    return '-';
  }
}

export function Progress() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'overview' | 'stream' | 'logs'>('overview');
  const selectedSessionId = useSelectedSessionId();
  const { progressList, loading, lastFetchedAt, onProgressUpdate } = useProgress(selectedSessionId || "");

  const { status: wsStatus } = useWebSocket({
    enabled: Boolean(selectedSessionId),
    sessionId: selectedSessionId ?? undefined,
    onProgressUpdate: onProgressUpdate,
  });

  const getWsStatusText = (status: string): string => {
    const map: Record<string, string> = {
      connected: t('progress.wsRealtime'),
      connecting: t('progress.wsConnecting'),
      reconnecting: t('progress.wsReconnecting'),
      disconnected: t('progress.wsDisconnected'),
    };
    return map[status] || t('status.unknown');
  };

  const getWsStatusBadge = (status: string): string => {
    const map: Record<string, string> = {
      connected: 'active',
      connecting: 'waiting',
      reconnecting: 'pending',
      disconnected: 'offline',
    };
    return map[status] || 'offline';
  };

  const stats = {
    activeAgents: progressList.filter((p: Progress) => p.status === 'in_progress').length,
    completedToday: progressList.filter((p: Progress) => p.status === 'completed').length,
    successRate: progressList.length > 0 ? `${Math.round((progressList.filter((p: Progress) => p.status === 'completed').length / progressList.length) * 100)}%` : '-',
  };

  const columns = [
    { key: 'agentName', title: t('progress.agentName') },
    { key: 'status', title: t('common.status'), render: (_: any, p: Progress) => (
      <StatusBadge status={getStatusBadgeStatus(p.status)} text={getStatusText(p.status)} />
    ) },
    { key: 'currentStep', title: t('progress.currentStep'), render: (v: string, p: Progress) => v || p.message || '-' },
    { key: 'percentage', title: t('progress.progress'), render: (v: number) => `${v ?? 0}%` },
    { key: 'createdAt', title: t('progress.startTime'), render: (v: string) => formatTime(v) },
    { key: 'updatedAt', title: t('session.updatedAt'), render: (v: string) => formatTime(v) },
    { key: 'duration', title: t('progress.duration'), render: (_: any, p: Progress) => formatDuration(p.createdAt, p.updatedAt) },
  ];

  const recentUpdates = progressList
    .filter((p: Progress) => p.message)
    .sort((a: Progress, b: Progress) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 20);

  const logs = progressList
    .flatMap((p: Progress) => ((p.details as { logs?: string[] })?.logs || []).map((log: string) => ({
      time: p.updatedAt,
      source: p.agentName,
      content: log,
    })))
    .sort((a: any, b: any) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 30);

  return (
    <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title={t('progress.systemStatus')}
        subtitle={selectedSessionId ? t('progress.viewAndStatus') : t('session.selectFirst')}
        extra={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              WebSocket: 
            </span>
            <StatusBadge status={getWsStatusBadge(wsStatus)} text={getWsStatusText(wsStatus)} />
            {lastFetchedAt && (
              <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
                {t('progress.lastUpdate')}{new Date(lastFetchedAt).toLocaleTimeString('zh-CN')}
              </span>
            )}
          </div>
        }
      />

      {selectedSessionId ? (
        <>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '1px solid var(--color-border)', paddingBottom: '0' }}>
            {[
              { id: 'overview', label: t('progress.tabOverview') },
              { id: 'stream', label: t('progress.tabRealtime') },
              { id: 'logs', label: t('progress.tabLogs') },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  padding: '10px 16px',
                  border: 'none',
                  background: 'transparent',
                  fontSize: '13px',
                  fontWeight: activeTab === tab.id ? 600 : 400,
                  color: activeTab === tab.id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  borderBottom: activeTab === tab.id ? '2px solid var(--color-accent)' : '2px solid transparent',
                  marginBottom: '-1px',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflow: 'auto' }}>
            {activeTab === 'overview' && (
              <div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '16px',
                  marginBottom: '24px',
                }}>
                  <div style={{
                    padding: '16px',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-surface)',
                  }}>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>{t('progress.activeAgents')}</div>
                    <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-accent)' }}>{stats.activeAgents}</div>
                  </div>
                  <div style={{
                    padding: '16px',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-surface)',
                  }}>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>{t('progress.completed')}</div>
                    <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-success)' }}>{stats.completedToday}</div>
                  </div>
                  <div style={{
                    padding: '16px',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-surface)',
                  }}>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>{t('progress.successRate')}</div>
                    <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-accent)' }}>{stats.successRate}</div>
                  </div>
                </div>

                <DataTable
                  columns={columns}
                  data={progressList}
                  loading={loading}
                  emptyText={t('progress.noProgress')}
                />
              </div>
            )}

            {activeTab === 'stream' && (
              <div>
                {recentUpdates.length === 0 ? (
                  <div style={{
                    padding: '40px',
                    textAlign: 'center',
                    color: 'var(--color-text-secondary)',
                  }}>
                    {t('progress.noRealtime')}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {recentUpdates.map((progress: Progress, i: number) => (
                      <div key={i} style={{
                        padding: '12px 16px',
                        background: 'var(--color-surface-hover)',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        gap: '12px',
                        alignItems: 'flex-start',
                      }}>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', minWidth: '70px', whiteSpace: 'nowrap' }}>
                          {formatTime(progress.updatedAt)}
                        </span>
                        <StatusBadge status={getStatusBadgeStatus(progress.status)} text={progress.agentName || 'Agent'} />
                        <span style={{ fontSize: '13px', flex: 1, color: 'var(--color-text-primary)' }}>
                          {progress.message || progress.currentStep || '-'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'logs' && (
              <div>
                {logs.length === 0 ? (
                  <div style={{
                    padding: '40px',
                    textAlign: 'center',
                    color: 'var(--color-text-secondary)',
                  }}>
                    {t('progress.noLogs')}
                  </div>
                ) : (
                  <div style={{
                    padding: '16px',
                    background: 'var(--color-surface-raised)',
                    borderRadius: 'var(--radius-md)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                  }}>
                    {logs.map((log: { time: string; source: string; content: string }, i: number) => (
                      <div key={i} style={{
                        padding: '4px 0',
                        color: 'var(--color-text-primary)',
                        borderBottom: '1px solid var(--color-border)',
                      }}>
                        <span style={{ color: 'var(--color-text-tertiary)' }}>[{formatTime(log.time)}]</span>
                        <span style={{ color: 'var(--color-accent)', marginLeft: '8px' }}>[{log.source}]</span>
                        <span style={{ marginLeft: '8px' }}>{log.content}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-secondary)',
        }}>
          {t('session.selectFirst')}
        </div>
      )}
    </div>
  );
}
