import { useEffect, useMemo, useState } from 'react';
import { DataTable, PageHeader, Button, Modal, StatusBadge } from '@/components/admin';
import { useKnowledge, useKnowledgeDocument, useKnowledgeManifest } from '@/hooks/use-knowledge';
import { useSelectedConsole } from '@/hooks/use-console';
import { api } from '@/lib/api-client';
import { useI18n } from '@/i18n';
import type { KnowledgeLevel } from '@ai-collab/protocol';
import { Markdown } from '@/components/shared/Markdown';

export function Knowledge() {
  const { t } = useI18n();

  const levelTitles: Record<KnowledgeLevel, string> = {
    l1: t('knowledge.l1'),
    l2: t('knowledge.l2'),
    l3: t('knowledge.l3'),
  };

  const [selectedLevel, setSelectedLevel] = useState<KnowledgeLevel | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackResult, setFeedbackResult] = useState<string | null>(null);
  const [feedbackIsError, setFeedbackIsError] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  const { knowledgeSummary, session } = useSelectedConsole();
  const sessionId = session?.id;

  const { manifest, loading: manifestLoading, fetch: refetchManifest } = useKnowledgeManifest(sessionId);
  const { items: allItems, loading: listLoading, fetchList } = useKnowledge(undefined, sessionId);
  const { document, loading: docLoading, fetch: refetchDocument } = useKnowledgeDocument(selectedLevel, selectedSlug, sessionId);

  const groupedItems = useMemo(() => ({
    l1: allItems.filter((item) => item.level === 'l1'),
    l2: allItems.filter((item) => item.level === 'l2'),
    l3: allItems.filter((item) => item.level === 'l3'),
  }), [allItems]);

  useEffect(() => {
    if (selectedLevel && selectedSlug) return;
    if (allItems.length === 0) return;

    const firstItem = groupedItems.l1[0] ?? allItems[0];
    setSelectedLevel(firstItem.level);
    setSelectedSlug(firstItem.slug);
  }, [allItems, groupedItems.l1, selectedLevel, selectedSlug]);

  const loading = manifestLoading || listLoading;
  const counts = knowledgeSummary?.counts ?? manifest?.counts ?? { l1: 0, l2: 0, l3: 0 };
  const changes = knowledgeSummary?.recentChanges ?? [];

  const handleRefresh = () => {
    void refetchManifest();
    void fetchList(undefined, sessionId);
    if (selectedLevel && selectedSlug) {
      void refetchDocument();
    }
  };

  const handleSelect = (item: any) => {
    setSelectedLevel(item.level);
    setSelectedSlug(item.slug);
    setShowDetail(true);
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackText.trim() || !selectedLevel || !selectedSlug) return;
    const sid = session?.id;
    if (!sid) {
      setFeedbackResult(t('knowledge.noSession'));
      setFeedbackIsError(true);
      return;
    }
    setFeedbackSubmitting(true);
    setFeedbackResult(null);
    try {
      await api.knowledge.feedback({
        sessionId: sid,
        level: selectedLevel,
        slug: selectedSlug,
        feedback: feedbackText.trim(),
      });
      setFeedbackText('');
      setFeedbackResult(t('knowledge.feedbackSent'));
      setFeedbackIsError(false);
      setTimeout(() => setFeedbackResult(null), 3000);
    } catch (err) {
      setFeedbackResult(err instanceof Error ? err.message : t('knowledge.feedbackFailed'));
      setFeedbackIsError(true);
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const columns = [
    { key: 'level', title: t('session.level'), render: (v: KnowledgeLevel) => levelTitles[v] },
    { key: 'title', title: t('session.title') },
    { key: 'slug', title: t('session.slug') },
    { key: 'updatedAt', title: t('session.updatedAt'), render: (v: string) => v ? new Date(v).toLocaleString() : '-' },
  ];

  return (
    <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title={t('knowledge.base')}
        subtitle={t('knowledge.viewAndFeedback')}
        extra={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={handleRefresh}>{t('common.refresh')}</Button>
          </div>
        }
      />

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
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface)',
          }}>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>{levelTitles[level]}</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-accent)' }}>{counts[level]}</div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <DataTable
          columns={columns}
          data={allItems}
          loading={loading}
          onRowClick={handleSelect}
          emptyText={t('knowledge.empty')}
        />
      </div>

      {showDetail && document && (
        <Modal
          open={true}
          title={`${levelTitles[document.level]} - ${document.title}`}
          onClose={() => setShowDetail(false)}
          width="700px"
          footer={
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button onClick={() => setShowDetail(false)}>{t('common.close')}</Button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <StatusBadge status="active" text={levelTitles[document.level]} />
              {document.updatedAt && (
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  {t('knowledge.updatedAt')} {new Date(document.updatedAt).toLocaleString()}
                </span>
              )}
            </div>

            {document.summary && (
              <div style={{
                padding: '12px',
                background: 'var(--color-surface-hover)',
                borderRadius: 'var(--radius-sm)',
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
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
            }}>
              <Markdown>{document.content || t('knowledge.noDetailedContent')}</Markdown>
            </div>

            {document.tags && document.tags.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {document.tags.map((tag: string) => (
                  <span key={tag} style={{
                    padding: '4px 10px',
                    background: 'var(--color-accent-subtle)',
                    color: 'var(--color-accent)',
                    borderRadius: 'var(--radius-sm)',
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
                  borderRadius: 'var(--radius-sm)',
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
                    color: feedbackIsError ? 'var(--color-error)' : 'var(--color-success)',
                  }}>
                    {feedbackResult}
                  </span>
                )}
                <Button
                  variant="primary"
                  onClick={handleSubmitFeedback}
                  disabled={feedbackSubmitting || !feedbackText.trim()}
                >
                  {feedbackSubmitting ? t('knowledge.sending') : t('knowledge.submitFeedback')}
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
