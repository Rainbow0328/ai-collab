import { t, useI18n } from '@/i18n';
import { Button, Modal, StatusBadge } from '@/components/admin';

type MessageLike = {
  id?: string;
  messageId?: string;
  type?: string;
  semanticType?: string;
  typeStatus?: string;
  fromAgentName?: string | null;
  toAgentName?: string | null;
  senderName?: string | null;
  receiverName?: string | null;
  fromAgentId?: string | null;
  toAgentId?: string | null;
  correlationId?: string | null;
  deliveryStatus?: string | null;
  processingStatus?: string | null;
  result?: string | null;
  createdAt?: string | null;
  content?: string | null;
  payload?: unknown;
};

type MessageFullDetailModalProps = {
  open: boolean;
  message: MessageLike | null;
  relatedMessages?: Array<{
    label: string;
    message: MessageLike;
  }>;
  relatedJudgements?: Array<{
    id: string;
    knowledgeBuildRequired: boolean;
    targetLevels: string[];
    sourceKind: string;
    nextAction: string;
    reason: string;
    fulfilledAt: string | null;
    fulfilledKnowledgeRefs: string[];
    createdAt: string;
  }>;
  onClose: () => void;
};

const extractPayloadContent = (payload: unknown): string => {
  if (typeof payload === 'string') return payload;
  if (payload && typeof payload === 'object' && 'content' in payload) {
    const value = (payload as { content?: unknown }).content;
    return value === undefined || value === null ? '' : String(value);
  }
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const value = (payload as { message?: unknown }).message;
    return value === undefined || value === null ? '' : String(value);
  }
  if (payload === undefined || payload === null) return '';
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
};

const formatPayload = (payload: unknown): string => {
  if (payload === undefined) return '';
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
};

const formatTime = (value?: string | null): string => {
  return value ? new Date(value).toLocaleString('zh-CN') : '-';
};

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '13px', color: 'var(--color-text-primary)', wordBreak: 'break-all' }}>{value || '-'}</div>
    </div>
  );
}

function ContentBlock({ title, value, maxHeight = '48vh' }: { title: string; value: string; maxHeight?: string }) {
  return (
    <div>
      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>{title}</div>
      <pre style={{
        padding: '14px',
        background: 'var(--color-surface-hover)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)',
        fontSize: '13px',
        lineHeight: 1.7,
        color: 'var(--color-text-primary)',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        maxHeight,
        overflow: 'auto',
        margin: 0,
      }}>
        {value || '-'}
      </pre>
    </div>
  );
}

function MessageSummaryBlock({ label, message }: { label: string; message: MessageLike }) {
  const sender = message.senderName ?? message.fromAgentName ?? message.fromAgentId ?? '-';
  const receiver = message.receiverName ?? message.toAgentName ?? message.toAgentId ?? '-';
  const content = message.content ?? extractPayloadContent(message.payload);

  return (
    <div style={{
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--color-surface)',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '10px 12px',
        background: 'var(--color-surface-hover)',
        borderBottom: '1px solid var(--color-border)',
        fontSize: '12px',
        color: 'var(--color-text-secondary)',
      }}>
        <strong style={{ color: 'var(--color-text-primary)' }}>{label}</strong>
        <span>{formatTime(message.createdAt)}</span>
      </div>
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <StatusBadge status={message.typeStatus || 'active'} text={message.semanticType || message.type || t('msg.other')} />
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{sender} {'->'} {receiver}</span>
        </div>
        <pre style={{
          padding: '12px',
          background: 'var(--color-surface-hover)',
          border: '1px solid var(--color-border-light)',
          borderRadius: 'var(--radius-sm)',
          fontSize: '13px',
          lineHeight: 1.7,
          color: 'var(--color-text-primary)',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          maxHeight: '26vh',
          overflow: 'auto',
          margin: 0,
        }}>
          {content || '-'}
        </pre>
      </div>
    </div>
  );
}

export function MessageFullDetailModal({
  open,
  message,
  relatedMessages = [],
  relatedJudgements = [],
  onClose
}: MessageFullDetailModalProps) {
  const { t } = useI18n();

  if (!message) return null;

  const messageId = message.id ?? message.messageId ?? '-';
  const sender = message.senderName ?? message.fromAgentName ?? message.fromAgentId ?? '-';
  const receiver = message.receiverName ?? message.toAgentName ?? message.toAgentId ?? '-';
  const content = message.content ?? extractPayloadContent(message.payload);
  const payloadText = formatPayload(message.payload);

  return (
    <Modal
      open={open}
      title={t('msg.fullContent')}
      onClose={onClose}
      width="1100px"
      footer={<Button onClick={onClose}>{t('common.close')}</Button>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '14px 20px',
        }}>
          <Field label={t('msg.msgId')} value={messageId} />
          <Field label="Correlation ID" value={message.correlationId} />
          <Field label={t('msg.sender')} value={sender} />
          <Field label={t('msg.receiver')} value={receiver} />
          <Field label={t('msg.createdAt')} value={formatTime(message.createdAt)} />
          <Field label={t('msg.processingStatus')} value={message.processingStatus} />
          <Field label={t('msg.deliveryStatus')} value={message.deliveryStatus} />
          <Field label="Result" value={message.result} />
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <StatusBadge status={message.typeStatus || 'active'} text={message.semanticType || message.type || t('msg.other')} />
          {message.type && <StatusBadge status="active" text={message.type} />}
        </div>

        {relatedMessages.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{t('msg.relatedMessages')}</div>
            {relatedMessages.map((item) => (
              <MessageSummaryBlock
                key={`${item.label}-${item.message.id ?? item.message.messageId ?? item.message.createdAt ?? ''}`}
                label={item.label}
                message={item.message}
              />
            ))}
          </div>
        )}

        {relatedJudgements.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{t('msg.relatedJudgement')}</div>
            {relatedJudgements.map((j) => (
              <div key={j.id} style={{
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-surface)',
                overflow: 'hidden',
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                  padding: '10px 12px',
                  background: 'var(--color-surface-hover)',
                  borderBottom: '1px solid var(--color-border)',
                  fontSize: '12px',
                  color: 'var(--color-text-secondary)',
                }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <StatusBadge
                      status={j.knowledgeBuildRequired ? 'working' : 'active'}
                      text={j.knowledgeBuildRequired ? t('msg.needsUpdate') : t('msg.noUpdateNeeded')}
                    />
                    {j.fulfilledAt ? (
                      <StatusBadge status="active" text={t('status.fulfilled')} />
                    ) : j.knowledgeBuildRequired ? (
                      <StatusBadge status="offline" text={t('status.unfulfilled')} />
                    ) : null}
                  </div>
                  <span>{formatTime(j.createdAt)}</span>
                </div>
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '13px', color: 'var(--color-text-primary)', lineHeight: 1.6 }}>
                    {j.reason}
                  </div>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--color-text-secondary)', flexWrap: 'wrap' }}>
                    {j.targetLevels.length > 0 && (
                      <span>{t('msg.targetLevel')}{j.targetLevels.map((l: string) => l.toUpperCase()).join(', ')}</span>
                    )}
                    <span>{t('msg.nextAction')}{j.nextAction}</span>
                    {j.fulfilledKnowledgeRefs.length > 0 && (
                      <span>{t('msg.knowledgeRefs')}{j.fulfilledKnowledgeRefs.join(', ')}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <ContentBlock title={t('msg.fullMsgContent')} value={content} />
        <ContentBlock title={t('msg.rawPayload')} value={payloadText} />
      </div>
    </Modal>
  );
}
