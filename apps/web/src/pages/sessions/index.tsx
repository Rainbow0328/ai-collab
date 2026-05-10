import { useMemo, useState, useCallback, useEffect } from 'react';
import { DataTable, PageHeader, Button, StatusBadge, Modal } from '@/components/admin';
import { useSessions } from '@/hooks/use-sessions';
import { useSelectedConsole } from '@/hooks/use-console';
import { useKnowledge, useKnowledgeDocument, useKnowledgeManifest } from '@/hooks/use-knowledge';
import { useMessages } from '@/hooks/use-messages';
import { api } from '@/lib/api-client';
import { MessageFullDetailModal } from '@/components/messages';
import type { KnowledgeLevel } from '@ai-collab/protocol';
import { useI18n, t } from '@/i18n';

const hostTaskTypes = new Set(['instruction', 'task']);
const workerReportTypes = new Set(['result', 'progress', 'error']);

function getMessageContent(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  if (payload && typeof payload === 'object' && 'content' in payload) {
    return String((payload as { content: unknown }).content ?? '');
  }
  return '';
}

function getMessageId(message: any): string | null {
  return message?.id ?? message?.messageId ?? null;
}

function getSemanticType(type: string): string {
  if (type === 'instruction' || type === 'task') return t('semantic.hostInstruction');
  if (type === 'result' || type === 'progress') return t('semantic.workerReport');
  if (type === 'error') return t('semantic.error');
  if (type === 'system') return t('semantic.system');
  return t('semantic.other');
}

function getTypeStatus(type: string): string {
  const map: Record<string, string> = {
    task: 'pending',
    result: 'reported',
    error: 'failed',
    instruction: 'working',
    progress: 'working',
    system: 'active',
  };
  return map[type] || 'active';
}

function buildRelatedMessages(message: any, messages: any[]) {
  if (!message?.correlationId) return [];
  const currentId = getMessageId(message);
  const currentTime = message.createdAt ?? '';
  const sameCorrelation = messages.filter((item) =>
    item.correlationId === message.correlationId &&
    getMessageId(item) !== currentId
  );

  if (workerReportTypes.has(message.type)) {
    return sameCorrelation
      .filter((item) => hostTaskTypes.has(item.type) && (!currentTime || item.createdAt <= currentTime))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((item) => ({ label: t('msg.relatedHostTask'), message: item }));
  }

  if (hostTaskTypes.has(message.type)) {
    return sameCorrelation
      .filter((item) => workerReportTypes.has(item.type) && (!currentTime || item.createdAt >= currentTime))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((item) => ({ label: t('msg.relatedWorkerReport'), message: item }));
  }

  return sameCorrelation
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map((item) => ({ label: t('msg.sameThread'), message: item }));
}

export function Sessions() {
  const { t } = useI18n();
  const { sessions, loading: listLoading, selectedId, selectSession } = useSessions();
  const { console, members, taskThreads, recentMessages, loading: consoleLoading } = useSelectedConsole();
  const { messages: fullMessages } = useMessages(selectedId ?? undefined);

  const [activeTab, setActiveTab] = useState<'sessions' | 'members' | 'tasks' | 'messages' | 'knowledge' | 'judgements' | 'dashboard'>('sessions');

  const [selectedLevel, setSelectedLevel] = useState<KnowledgeLevel | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackResult, setFeedbackResult] = useState<string | null>(null);
  const [showKnowledgeDetail, setShowKnowledgeDetail] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [showMessageDetail, setShowMessageDetail] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [showTaskDetail, setShowTaskDetail] = useState(false);
  const [judgements, setJudgements] = useState<any[]>([]);
  const [judgementsLoading, setJudgementsLoading] = useState(false);
  const [timeline, setTimeline] = useState<any>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const { manifest, loading: manifestLoading, fetch: refetchManifest } = useKnowledgeManifest(selectedId ?? undefined);
  const { items: allItems, loading: knowledgeListLoading, fetchList } = useKnowledge(undefined, selectedId ?? undefined);
  const { document, loading: docLoading, fetch: refetchDocument } = useKnowledgeDocument(selectedLevel, selectedSlug, selectedId ?? undefined);

  const levelTitles: Record<KnowledgeLevel, string> = {
    l1: t('knowledge.l1'),
    l2: t('knowledge.l2'),
    l3: t('knowledge.l3'),
  };

  const hasSelectedSession = !!selectedId;

  const sessionItems = useMemo(() => {
    return sessions.map((s) => ({
      id: s.id,
      name: s.name,
      memberCount: s.memberCount,
      activeMemberCount: s.onlineMemberCount,
      lastActiveAt: s.lastActivityAt,
      status: s.status,
    }));
  }, [sessions]);

  const groupedKnowledgeItems = useMemo(() => ({
    l1: allItems.filter((item) => item.level === 'l1'),
    l2: allItems.filter((item) => item.level === 'l2'),
    l3: allItems.filter((item) => item.level === 'l3'),
  }), [allItems]);

  const knowledgeCounts = useMemo(() => ({
    l1: groupedKnowledgeItems.l1.length,
    l2: groupedKnowledgeItems.l2.length,
    l3: groupedKnowledgeItems.l3.length,
  }), [groupedKnowledgeItems]);

  const agentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members || []) {
      map.set(member.agentId, member.displayName || member.agentName);
    }
    return map;
  }, [members]);

  const fullMessageItems = useMemo(() => {
    return fullMessages.map((message) => ({
      ...message,
      senderName: agentNameById.get(message.fromAgentId) || message.fromAgentId,
      receiverName: message.toAgentId ? agentNameById.get(message.toAgentId) || message.toAgentId : '-',
      fromAgentName: agentNameById.get(message.fromAgentId) || message.fromAgentId,
      toAgentName: message.toAgentId ? agentNameById.get(message.toAgentId) || message.toAgentId : null,
      content: getMessageContent(message.payload),
      semanticType: getSemanticType(message.type),
      typeStatus: getTypeStatus(message.type),
    }));
  }, [fullMessages, agentNameById]);

  const selectedFullMessage = useMemo(() => {
    const id = getMessageId(selectedMessage);
    if (!id) return selectedMessage;
    return fullMessageItems.find((message) => getMessageId(message) === id) ?? selectedMessage;
  }, [selectedMessage, fullMessageItems]);

  const relatedMessages = useMemo(
    () => buildRelatedMessages(selectedFullMessage, fullMessageItems),
    [selectedFullMessage, fullMessageItems]
  );

  const relatedJudgements = useMemo(() => {
    const messageId = getMessageId(selectedFullMessage);
    if (!messageId) return [];
    return judgements.filter((j) => j.sourceMessageId === messageId);
  }, [selectedFullMessage, judgements]);

  const getStatusLabel = (status: string): string => {
    const map: Record<string, string> = {
      active: t('status.active'),
      closed: t('status.closed'),
      paused: t('status.paused'),
    };
    return map[status] || status;
  };

  const getMemberStatusLabel = (status: string): string => {
    const map: Record<string, string> = {
      online: t('common.online'),
      offline: t('common.offline'),
      busy: t('status.working'),
      idle: t('status.waiting'),
    };
    return map[status] || status;
  };

  const getMemberStatusColor = (status: string): string => {
    const map: Record<string, string> = {
      online: 'active',
      offline: 'offline',
      busy: 'working',
      idle: 'waiting',
    };
    return map[status] || status;
  };

  const getTaskStatusLabel = (status: string): string => {
    const map: Record<string, string> = {
      pending: t('status.pending'),
      in_progress: t('status.active'),
      completed: t('status.completed'),
      failed: t('status.failed'),
      cancelled: t('status.cancelled'),
    };
    return map[status] || status;
  };

  const fetchJudgements = useCallback(async () => {
    if (!selectedId) return;
    setJudgementsLoading(true);
    try {
      const result = await api.knowledge.listJudgements(selectedId);
      setJudgements(result);
    } catch {
      setJudgements([]);
    } finally {
      setJudgementsLoading(false);
    }
  }, [selectedId]);

  const fetchTimeline = useCallback(async () => {
    if (!selectedId) return;
    setTimelineLoading(true);
    try {
      const result = await api.sessions.getTimeline(selectedId);
      setTimeline(result);
    } catch {
      setTimeline(null);
    } finally {
      setTimelineLoading(false);
    }
  }, [selectedId]);

  const handleBackToList = useCallback(() => {
    selectSession(null);
    setActiveTab('sessions');
  }, [selectSession]);

  const handleSelectSession = useCallback((sessionId: string) => {
    selectSession(sessionId);
    setActiveTab('messages');
    void fetchJudgements();
  }, [selectSession, fetchJudgements]);

  const handleKnowledgeRefresh = useCallback(() => {
    void refetchManifest();
    void fetchList(undefined, selectedId ?? undefined);
    if (selectedLevel && selectedSlug) {
      void refetchDocument();
    }
  }, [refetchManifest, fetchList, refetchDocument, selectedLevel, selectedSlug, selectedId]);

  const handleSelectKnowledge = useCallback((item: any) => {
    setSelectedLevel(item.level);
    setSelectedSlug(item.slug);
    setShowKnowledgeDetail(true);
  }, []);

  const handleSelectMessage = useCallback((message: any) => {
    setSelectedMessage(message);
    setShowMessageDetail(true);
  }, []);

  const handleSelectTask = useCallback((task: any) => {
    setSelectedTask(task);
    setShowTaskDetail(true);
  }, []);

  const handleSubmitFeedback = useCallback(async () => {
    if (!feedbackText.trim() || !selectedLevel || !selectedSlug) return;
    const sessionId = console?.session.id;
    if (!sessionId) {
      setFeedbackResult(t('session.selectFirst'));
      return;
    }
    setFeedbackSubmitting(true);
    setFeedbackResult(null);
    try {
      await api.knowledge.feedback({
        sessionId,
        level: selectedLevel,
        slug: selectedSlug,
        feedback: feedbackText.trim(),
      });
      setFeedbackText('');
      setFeedbackResult(t('session.feedbackSent'));
      setTimeout(() => setFeedbackResult(null), 3000);
    } catch (err) {
      setFeedbackResult(err instanceof Error ? err.message : t('session.feedbackFailed'));
    } finally {
      setFeedbackSubmitting(false);
    }
  }, [feedbackText, selectedLevel, selectedSlug, console]);

  useEffect(() => {
    if (activeTab === 'judgements' && selectedId) {
      void fetchJudgements();
    }
  }, [activeTab, selectedId, fetchJudgements]);

  useEffect(() => {
    if (activeTab === 'dashboard' && selectedId) {
      void fetchTimeline();
    }
  }, [activeTab, selectedId, fetchTimeline]);

  const sessionColumns = [
    { key: 'name', title: t('session.name'), width: '200px' },
    { key: 'status', title: t('common.status'), render: (_: any, s: any) => <StatusBadge status={s.status === 'active' ? 'active' : 'offline'} text={getStatusLabel(s.status)} /> },
    { key: 'memberCount', title: t('session.memberCount'), render: (_: any, s: any) => `${s.activeMemberCount}/${s.memberCount} ${t('common.online')}` },
    { key: 'lastActiveAt', title: t('session.lastActive'), render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-' },
  ];

  const memberColumns = [
    { key: 'displayName', title: t('session.displayName') },
    { key: 'agentName', title: t('session.agentName') },
    { key: 'role', title: t('session.role') },
    { key: 'status', title: t('common.status'), render: (_: any, m: any) => <StatusBadge status={getMemberStatusColor(m.status)} text={getMemberStatusLabel(m.status)} /> },
    { key: 'lastHeartbeatAt', title: t('session.lastHeartbeat'), render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-' },
  ];

  const taskItems = useMemo(() => {
    return (taskThreads || []).map((thread) => ({
      ...thread,
      title: thread.hostMessage?.content ?? '-',
      assignee: thread.workerName || t('session.unassigned'),
      createdAt: thread.hostMessage?.createdAt ?? null,
      updatedAt: thread.workerReport?.createdAt ?? thread.hostMessage?.createdAt ?? null,
    }));
  }, [taskThreads]);

  const taskColumns = [
    { key: 'title', title: t('session.taskTitle'), render: (v: string) => (v?.length > 60 ? v.substring(0, 60) + '…' : v || '-') },
    { key: 'status', title: t('common.status'), render: (_: any, task: any) => <StatusBadge status={task.status === 'in_progress' ? 'working' : task.status} text={getTaskStatusLabel(task.status)} /> },
    { key: 'assignee', title: t('session.executor') },
    { key: 'createdAt', title: t('session.createdAt'), render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-' },
    { key: 'updatedAt', title: t('session.updatedAt'), render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-' },
  ];

  const messageColumns = [
    { key: 'type', title: t('session.type') },
    { key: 'fromAgentName', title: t('session.sender') },
    { key: 'toAgentName', title: t('session.receiver'), render: (v: string) => v || '-' },
    { key: 'content', title: t('session.content'), render: (v: string) => (v?.length > 50 ? v.substring(0, 50) + '...' : v || '-') },
    { key: 'createdAt', title: t('session.time'), render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-' },
  ];

  const knowledgeColumns = [
    { key: 'level', title: t('session.level'), render: (v: KnowledgeLevel) => levelTitles[v] },
    { key: 'title', title: t('session.title') },
    { key: 'slug', title: t('session.slug') },
    { key: 'updatedAt', title: t('session.updatedAt'), render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-' },
  ];

  return (
    <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title={t('session.collabMonitor')}
        subtitle={console?.session.name ? `${t('session.currentView')}${console.session.name}` : t('session.selectSession')}
        extra={
          <div style={{ display: 'flex', gap: '8px' }}>
            {hasSelectedSession && (
              <Button onClick={handleBackToList}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
                {t('session.backToList')}
              </Button>
            )}
            {activeTab === 'knowledge' && (
              <Button onClick={handleKnowledgeRefresh}>{t('session.refreshKnowledge')}</Button>
            )}
          </div>
        }
      />

      {!selectedId && sessions.length > 0 && !listLoading && (
        <div style={{ marginBottom: '16px', padding: '12px 16px', background: 'var(--color-warning-subtle)', color: 'var(--color-warning)', borderRadius: 'var(--radius-md)', fontSize: '13px' }}>
          {t('session.selectFromList')}
        </div>
      )}

      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '1px solid var(--color-border)', paddingBottom: '0' }}>
        {[
          { id: 'sessions', label: t('session.tabList'), disabled: false },
          { id: 'members', label: t('session.tabMembers'), disabled: !hasSelectedSession },
          { id: 'tasks', label: t('session.tabTasks'), disabled: !hasSelectedSession },
          { id: 'messages', label: t('session.tabMessages'), disabled: !hasSelectedSession },
          { id: 'knowledge', label: t('session.tabKnowledge'), disabled: !hasSelectedSession },
          { id: 'judgements', label: t('session.tabJudgements'), disabled: !hasSelectedSession },
          { id: 'dashboard', label: t('session.tabCollab'), disabled: !hasSelectedSession },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => !tab.disabled && setActiveTab(tab.id as any)}
            disabled={tab.disabled}
            style={{
              padding: '10px 16px',
              border: 'none',
              background: 'transparent',
              fontSize: '13px',
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: tab.disabled ? 'var(--color-text-disabled)' : (activeTab === tab.id ? 'var(--color-accent)' : 'var(--color-text-secondary)'),
              cursor: tab.disabled ? 'not-allowed' : 'pointer',
              borderBottom: activeTab === tab.id ? '2px solid var(--color-accent)' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {activeTab === 'sessions' && (
          <DataTable
            columns={sessionColumns}
            data={sessionItems}
            loading={listLoading}
            onRowClick={(s) => handleSelectSession(s.id)}
            emptyText={t('session.noCollab')}
          />
        )}

        {activeTab === 'members' && hasSelectedSession && (
          <DataTable
            columns={memberColumns}
            data={members || []}
            loading={consoleLoading && !console}
            emptyText={t('session.noMembers')}
          />
        )}

        {activeTab === 'tasks' && hasSelectedSession && (
          <DataTable
            columns={taskColumns}
            data={taskItems || []}
            loading={consoleLoading && !console}
            onRowClick={handleSelectTask}
            emptyText={t('session.noTasks')}
          />
        )}

        {activeTab === 'messages' && hasSelectedSession && (
          <DataTable
            columns={messageColumns}
            data={recentMessages || []}
            loading={consoleLoading && !console}
            onRowClick={handleSelectMessage}
            emptyText={t('session.noMessages')}
          />
        )}

        {activeTab === 'knowledge' && hasSelectedSession && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
              marginBottom: '20px',
            }}>
              {(['l1', 'l2', 'l3'] as KnowledgeLevel[]).map((level) => (
                <div key={level} style={{
                  padding: '16px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-surface)',
                }}>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>{levelTitles[level]}</div>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-accent)' }}>{knowledgeCounts[level]}</div>
                </div>
              ))}
            </div>

            <div style={{ flex: 1, overflow: 'auto' }}>
              <DataTable
                columns={knowledgeColumns}
                data={allItems}
                loading={manifestLoading || knowledgeListLoading}
                onRowClick={handleSelectKnowledge}
                emptyText={t('knowledge.empty')}
              />
            </div>
          </div>
        )}

        {activeTab === 'judgements' && hasSelectedSession && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                {t('session.judgementCount', { count: judgements.length })}
              </div>
              <Button onClick={fetchJudgements}>{t('common.refresh')}</Button>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {judgementsLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-secondary)' }}>{t('common.loading')}</div>
              ) : judgements.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-tertiary)' }}>{t('session.noJudgements')}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {judgements.map((j) => (
                    <div key={j.id} style={{
                      padding: '16px',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--color-surface)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <StatusBadge
                            status={j.knowledgeBuildRequired ? 'working' : 'active'}
                            text={j.knowledgeBuildRequired ? t('status.needsUpdate') : t('status.noUpdateNeeded')}
                          />
                          {j.fulfilledAt ? (
                            <StatusBadge
                              status="active"
                              text={t('status.fulfilled')}
                            />
                          ) : j.knowledgeBuildRequired ? (
                            <StatusBadge
                              status="offline"
                              text={t('status.unfulfilled')}
                            />
                          ) : null}
                          <span style={{
                            padding: '2px 8px',
                            background: 'var(--color-border-light)',
                            borderRadius: 'var(--radius-md)',
                            fontSize: '11px',
                            color: 'var(--color-text-secondary)',
                          }}>
                            {j.source}
                          </span>
                          <span style={{
                            padding: '2px 8px',
                            background: 'var(--color-accent-subtle)',
                            borderRadius: 'var(--radius-md)',
                            fontSize: '11px',
                            color: 'var(--color-accent)',
                          }}>
                            {j.nextAction}
                          </span>
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                          {new Date(j.createdAt).toLocaleString('zh-CN')}
                        </span>
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--color-text-primary)', marginBottom: '8px', lineHeight: 1.6 }}>
                        {j.reason}
                      </div>
                      <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--color-text-secondary)', flexWrap: 'wrap' }}>
                        {j.sourceMessageId && (
                          <div>{t('msg.messageIdLabel')}{j.sourceMessageId}</div>
                        )}
                        {j.targetLevels && j.targetLevels.length > 0 && (
                          <div>
                            {t('msg.targetLevel')}
                            {j.targetLevels.map((l: string) => (
                              <span key={l} style={{
                                marginLeft: '4px',
                                padding: '1px 6px',
                                background: 'var(--color-surface-hover)',
                                borderRadius: 'var(--radius-sm)',
                              }}>{l.toUpperCase()}</span>
                            ))}
                          </div>
                        )}
                        {j.sourceKind && j.sourceKind !== 'none' && (
                          <div>{t('msg.sourceType')}{j.sourceKind}</div>
                        )}
                        {j.candidateRefs && j.candidateRefs.length > 0 && (
                          <div>{t('msg.candidateRefs')}{j.candidateRefs.join(', ')}</div>
                        )}
                        {j.fulfilledAt && (
                          <div>{t('msg.completedAt')}{new Date(j.fulfilledAt).toLocaleString('zh-CN')}</div>
                        )}
                        {j.fulfilledKnowledgeRefs && j.fulfilledKnowledgeRefs.length > 0 && (
                          <div>{t('msg.knowledgeRefs')}{j.fulfilledKnowledgeRefs.join(', ')}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && hasSelectedSession && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                {timeline
                  ? `${timeline.traces?.length ?? 0} ${t('session.traceCount')} | ${timeline.agentAnalytics?.length ?? 0} ${t('session.memberCount2')}`
                  : t('common.loading')}
              </div>
              <Button onClick={fetchTimeline}>{t('common.refresh')}</Button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {timelineLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-secondary)' }}>{t('common.loading')}</div>
              ) : !timeline ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-tertiary)' }}>{t('common.noData')}</div>
              ) : (
                <>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--color-text-primary)' }}>
                      {t('session.msgTimeline')}
                    </div>
                    {timeline.traces && timeline.traces.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '280px', overflow: 'auto' }}>
                        {timeline.traces.map((trace: any, idx: number) => (
                          <div key={trace.id ?? idx} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '8px 12px',
                            background: idx % 2 === 0 ? 'var(--color-surface)' : 'transparent',
                            borderLeft: '3px solid ' + (trace.traceType === 'sent' ? 'var(--color-accent)' :
                              trace.traceType === 'claimed' ? '#f59e0b' :
                              trace.traceType === 'submitted' ? '#10b981' :
                              trace.traceType === 'failed' ? '#ef4444' : 'var(--color-border)'),
                            fontSize: '12px',
                          }}>
                            <StatusBadge
                              status={trace.traceType === 'failed' ? 'offline' : trace.traceType === 'submitted' ? 'active' : 'working'}
                              text={trace.traceType === 'sent' ? t('trace.sent') :
                                trace.traceType === 'claimed' ? t('trace.claimed') :
                                trace.traceType === 'submitted' ? t('trace.submitted') :
                                trace.traceType === 'failed' ? t('status.failed') : trace.traceType}
                            />
                            <span style={{ color: 'var(--color-text-secondary)', minWidth: '80px' }}>
                              {trace.createdAt ? new Date(trace.createdAt).toLocaleTimeString('zh-CN') : '-'}
                            </span>
                            <span style={{ color: 'var(--color-text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {trace.agentId?.substring(0, 8) ?? '-'} · {trace.messageId?.substring(0, 8) ?? '-'}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: 'var(--color-text-tertiary)', fontSize: '12px' }}>{t('session.noTraceEvents')}</div>
                    )}
                  </div>

                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--color-text-primary)' }}>
                      {t('session.memberEfficiency')}
                    </div>
                    {timeline.agentAnalytics && timeline.agentAnalytics.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {timeline.agentAnalytics.map((a: any) => (
                          <div key={a.agentId} style={{
                            padding: '14px 16px',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-md)',
                            background: 'var(--color-surface)',
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <StatusBadge
                                  status={a.status === 'online' ? 'active' : a.status === 'busy' ? 'working' : 'offline'}
                                  text={a.status === 'online' ? t('common.online') : a.status === 'busy' ? t('status.working') : a.status}
                                />
                                <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-primary)' }}>
                                  {a.agentName ?? a.agentId?.substring(0, 8) ?? '-'}
                                </span>
                                <span style={{
                                  padding: '2px 6px',
                                  background: 'var(--color-border-light)',
                                  borderRadius: 'var(--radius-md)',
                                  fontSize: '11px',
                                  color: 'var(--color-text-secondary)',
                                }}>
                                  {a.role}
                                </span>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '24px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                              <div>
                                <span style={{ color: 'var(--color-text-tertiary)' }}>{t('session.dispatched')}</span>
                                <span style={{ fontWeight: 500 }}>{a.totalDispatched ?? 0}</span>
                              </div>
                              <div>
                                <span style={{ color: 'var(--color-text-tertiary)' }}>{t('session.completed')}</span>
                                <span style={{ fontWeight: 500, color: '#10b981' }}>{a.totalCompleted ?? 0}</span>
                              </div>
                              <div>
                                <span style={{ color: 'var(--color-text-tertiary)' }}>{t('session.failed2')}</span>
                                <span style={{ fontWeight: 500, color: '#ef4444' }}>{a.totalFailed ?? 0}</span>
                              </div>
                              <div>
                                <span style={{ color: 'var(--color-text-tertiary)' }}>{t('session.avgDuration')}</span>
                                <span style={{ fontWeight: 500 }}>
                                  {a.avgProcessingSeconds != null ? `${Math.round(a.avgProcessingSeconds)}s` : '-'}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: 'var(--color-text-tertiary)', fontSize: '12px' }}>{t('session.noMemberData')}</div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {showKnowledgeDetail && document && (
        <Modal
          open={true}
          title={`${levelTitles[document.level]} - ${document.title}`}
          onClose={() => setShowKnowledgeDetail(false)}
          width="700px"
          footer={
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button onClick={() => setShowKnowledgeDetail(false)}>{t('common.close')}</Button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <StatusBadge status="active" text={levelTitles[document.level]} />
              {document.updatedAt && (
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  {t('session.updatedAt2')}{new Date(document.updatedAt).toLocaleString('zh-CN')}
                </span>
              )}
            </div>

            {document.summary && (
              <div style={{
                padding: '12px',
                background: 'var(--color-surface-hover)',
                borderRadius: 'var(--radius-md)',
                fontSize: '13px',
                color: 'var(--color-text-primary)',
                lineHeight: 1.6,
              }}>
                {document.summary}
              </div>
            )}

            <div style={{
              padding: '16px',
              background: 'var(--color-bg)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
            }}>
              <pre style={{
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                fontFamily: 'inherit',
                fontSize: '13px',
                lineHeight: 1.8,
                margin: 0,
                color: 'var(--color-text-primary)',
              }}>{document.content || t('knowledge.noDetailedContent')}</pre>
            </div>

            {document.tags && document.tags.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {document.tags.map((tag: string) => (
                  <span key={tag} style={{
                    padding: '4px 10px',
                    background: 'var(--color-accent-subtle)',
                    color: 'var(--color-accent)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '12px',
                  }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div style={{
              paddingTop: '16px',
              borderTop: '1px solid var(--color-border)',
            }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                {t('knowledge.submitFeedback')}
              </div>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
                {t('knowledge.feedbackDesc')}
                {!console && <span style={{ color: 'var(--color-error)' }}>（{t('session.selectFirst')}）</span>}
              </p>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder={t('knowledge.feedbackPlaceholder')}
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text-primary)',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                  marginBottom: '12px',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {feedbackResult && (
                  <span style={{
                    fontSize: '12px',
                    color: feedbackResult === t('session.feedbackSent') ? 'var(--color-success)' : 'var(--color-error)',
                  }}>
                    {feedbackResult}
                  </span>
                )}
                <Button
                  variant="primary"
                  onClick={handleSubmitFeedback}
                  disabled={feedbackSubmitting || !feedbackText.trim() || !console}
                >
                  {feedbackSubmitting ? t('knowledge.sending') : t('knowledge.submitFeedback')}
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      <MessageFullDetailModal
        open={showMessageDetail}
        message={selectedFullMessage}
        relatedMessages={relatedMessages}
        relatedJudgements={relatedJudgements}
        onClose={() => setShowMessageDetail(false)}
      />

      <Modal
        open={showTaskDetail}
        title={t('taskThread.detail')}
        onClose={() => setShowTaskDetail(false)}
        width="900px"
        footer={<Button onClick={() => setShowTaskDetail(false)}>{t('common.close')}</Button>}
      >
        {selectedTask && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: '14px 20px',
            }}>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>{t('taskThread.taskStatus')}</div>
                <StatusBadge status={selectedTask.status === 'in_progress' ? 'working' : selectedTask.status} text={getTaskStatusLabel(selectedTask.status)} />
              </div>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>{t('session.executor')}</div>
                <div style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>{selectedTask.assignee || '-'}</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Correlation ID</div>
                <div style={{ fontSize: '13px', color: 'var(--color-text-primary)', wordBreak: 'break-all' }}>{selectedTask.correlationId || '-'}</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Worker Agent ID</div>
                <div style={{ fontSize: '13px', color: 'var(--color-text-primary)', wordBreak: 'break-all' }}>{selectedTask.workerAgentId || '-'}</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>{t('session.createdAt')}</div>
                <div style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>{selectedTask.createdAt ? new Date(selectedTask.createdAt).toLocaleString('zh-CN') : '-'}</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>{t('session.updatedAt')}</div>
                <div style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>{selectedTask.updatedAt ? new Date(selectedTask.updatedAt).toLocaleString('zh-CN') : '-'}</div>
              </div>
            </div>

            <div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>{t('taskThread.taskContent')}</div>
              <pre style={{
                padding: '14px',
                background: 'var(--color-surface-hover)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                fontSize: '13px',
                lineHeight: 1.7,
                color: 'var(--color-text-primary)',
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                maxHeight: '36vh',
                overflow: 'auto',
                margin: 0,
              }}>
                {selectedTask.title || '-'}
              </pre>
            </div>

            {selectedTask.workerReport && (
              <div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>{t('taskThread.workerReport')}</div>
                <pre style={{
                  padding: '14px',
                  background: 'var(--color-surface-hover)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '13px',
                  lineHeight: 1.7,
                  color: 'var(--color-text-primary)',
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                  maxHeight: '30vh',
                  overflow: 'auto',
                  margin: 0,
                }}>
                  {selectedTask.workerReport.content || '-'}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
