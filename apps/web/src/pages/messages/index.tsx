import { useMemo, useState } from 'react';
import { DataTable, PageHeader, StatusBadge } from '@/components/admin';
import { MessageFullDetailModal } from '@/components/messages';
import { useMessages } from '@/hooks/use-messages';
import { useSelectedSessionId } from '@/state/session-store';
import { useI18n, t } from '@/i18n';
import type { MessageType } from '@/components/messages/types';

function getMessageContent(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  if (payload && typeof payload === 'object' && 'content' in payload) {
    return String((payload as { content: string }).content);
  }
  if (payload && typeof payload === 'object' && 'description' in payload) {
    return String((payload as { description: string }).description);
  }
  return '-';
}

function getSemanticType(msg: any): string {
  if (msg.type === 'instruction' || msg.type === 'task') return t('semantic.hostInstruction');
  if (msg.type === 'result' || msg.type === 'progress') return t('semantic.workerReport');
  if (msg.type === 'error') return t('semantic.error');
  if (msg.type === 'system') return t('semantic.system');
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

const hostTaskTypes = new Set(['instruction', 'task']);
const workerReportTypes = new Set(['result', 'progress', 'error']);

function getMessageId(message: any): string | null {
  return message?.id ?? message?.messageId ?? null;
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

export function Messages() {
  const { t } = useI18n();
  const [filterType, setFilterType] = useState<MessageType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [showDetail, setShowDetail] = useState(false);

  const sessionId = useSelectedSessionId();
  const { messages, loading } = useMessages(sessionId ?? undefined);

  const messageItems = useMemo(() => {
    return messages.map((msg) => ({
      ...msg,
      senderName: (msg as any).fromAgentName || (msg as any).fromAgentId || t('msg.unknown'),
      receiverName: (msg as any).toAgentName || (msg as any).toAgentId || '-',
      content: getMessageContent(msg.payload),
      semanticType: getSemanticType(msg),
      typeStatus: getTypeStatus(msg.type),
    }));
  }, [messages]);

  const filteredMessages = useMemo(() => {
    let result = [...messageItems];

    if (filterType !== 'all') {
      result = result.filter((m) => m.type === filterType);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((m) =>
        m.content.toLowerCase().includes(query) ||
        m.senderName.toLowerCase().includes(query)
      );
    }

    return result;
  }, [messageItems, filterType, searchQuery]);

  const relatedMessages = useMemo(
    () => buildRelatedMessages(selectedMessage, messageItems),
    [selectedMessage, messageItems]
  );

  const columns = [
    { key: 'createdAt', title: t('msg.time'), render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-' },
    { key: 'senderName', title: t('msg.sender') },
    { key: 'receiverName', title: t('msg.receiver') },
    { key: 'type', title: t('msg.msgType') },
    { key: 'semanticType', title: t('msg.semanticType'), render: (_: any, m: any) => (
      <StatusBadge status={m.typeStatus} text={m.semanticType} />
    ) },
    { key: 'content', title: t('msg.contentSummary'), render: (v: string) => v.length > 50 ? v.substring(0, 50) + '...' : v },
  ];

  return (
    <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title={t('msg.history')}
        subtitle={sessionId ? t('msg.viewAll') : t('msg.noSession')}
      />

      {sessionId ? (
        <>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as MessageType | 'all')}
              style={{
                padding: '8px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '13px',
                background: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
              }}
            >
              <option value="all">{t('msg.allMessages')}</option>
              <option value="task">{t('msg.taskMessages')}</option>
              <option value="result">{t('msg.resultMessages')}</option>
              <option value="system">{t('msg.systemMessages')}</option>
              <option value="instruction">{t('msg.instructionMessages')}</option>
              <option value="progress">{t('msg.progressMessages')}</option>
              <option value="error">{t('msg.errorMessages')}</option>
            </select>

            <input
              type="text"
              placeholder={t('msg.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '13px',
                background: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
                flex: 1,
                maxWidth: '400px',
              }}
            />
          </div>

          <div style={{ flex: 1, overflow: 'auto' }}>
            <DataTable
              columns={columns}
              data={filteredMessages}
              loading={loading}
              onRowClick={(msg) => {
                setSelectedMessage(msg);
                setShowDetail(true);
              }}
              emptyText={t('msg.noData')}
            />
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
          {t('msg.noSession')}
        </div>
      )}

      <MessageFullDetailModal
        open={showDetail}
        message={selectedMessage}
        relatedMessages={relatedMessages}
        onClose={() => setShowDetail(false)}
      />
    </div>
  );
}
