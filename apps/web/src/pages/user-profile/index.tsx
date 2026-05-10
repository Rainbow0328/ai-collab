import { useState, useEffect, useCallback } from 'react';
import { PageHeader, Button, Modal } from '@/components/admin';
import { api } from '@/lib/api-client';
import { useI18n } from '@/i18n';
import type { UserProfileEntry, Session, Agent } from '@ai-collab/protocol';

export function UserProfile() {
  const { t } = useI18n();
  const [entries, setEntries] = useState<UserProfileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hostAgentId, setHostAgentId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ key: '', value: '' });

  const detectHostAgent = useCallback(async () => {
    try {
      const sessions = await api.sessions.list();
      for (const session of sessions) {
        const members = await api.sessions.getMembers(session.id);
        const host = members.find((m: Agent) => m.role === 'host');
        if (host) {
          setHostAgentId(host.id);
          return host.id;
        }
      }
    } catch {
      // ignore
    }
    return null;
  }, []);

  const fetchEntries = useCallback(async (agentId: string) => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await api.userProfile.get(agentId);
      setEntries(snapshot.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('userProfile.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const agentId = hostAgentId ?? await detectHostAgent();
      if (agentId) {
        fetchEntries(agentId);
      } else {
        setLoading(false);
        setError(t('userProfile.noHost'));
      }
    })();
  }, [hostAgentId, detectHostAgent, fetchEntries]);

  const handleSubmit = async () => {
    if (!hostAgentId || !form.key.trim()) return;
    try {
      await api.userProfile.set(form.key.trim(), form.value, hostAgentId);
      setShowModal(false);
      setEditingKey(null);
      setForm({ key: '', value: '' });
      fetchEntries(hostAgentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('userProfile.saveFailed'));
    }
  };

  const handleDelete = async (key: string) => {
    if (!hostAgentId) return;
    if (!confirm(t('userProfile.deleteConfirm', { key }))) return;
    try {
      await api.userProfile.delete(key, hostAgentId);
      fetchEntries(hostAgentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('userProfile.deleteFailed'));
    }
  };

  const handleEdit = (entry: UserProfileEntry) => {
    setEditingKey(entry.key);
    setForm({ key: entry.key, value: entry.value });
    setShowModal(true);
  };

  const handleAddClick = () => {
    setEditingKey(null);
    setForm({ key: '', value: '' });
    setShowModal(true);
  };

  const toggleExpand = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const renderMarkdown = (text: string) => {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('### ')) {
        return <h4 key={i} style={{ margin: '12px 0 6px', fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{line.slice(4)}</h4>;
      }
      if (line.startsWith('## ')) {
        return <h3 key={i} style={{ margin: '14px 0 8px', fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{line.slice(3)}</h3>;
      }
      if (line.startsWith('- ')) {
        return <div key={i} style={{ paddingLeft: '16px', margin: '2px 0', color: 'var(--color-text-secondary)', fontSize: '13px', lineHeight: 1.6 }}>{line}</div>;
      }
      if (line.trim() === '') {
        return <div key={i} style={{ height: '8px' }} />;
      }
      return <p key={i} style={{ margin: '4px 0', color: 'var(--color-text-secondary)', fontSize: '13px', lineHeight: 1.6 }}>{line}</p>;
    });
  };

  return (
    <div style={{ padding: '24px', height: '100%' }}>
      <PageHeader
        title={t('userProfile.title')}
        subtitle={t('userProfile.subtitle')}
        extra={<Button variant="primary" onClick={handleAddClick}>{t('userProfile.addHabit')}</Button>}
      />

      {error && (
        <div style={{
          padding: '12px 16px',
          background: 'var(--color-error-subtle)',
          color: 'var(--color-error)',
          borderRadius: 'var(--radius-md)',
          marginBottom: '16px',
          fontSize: '13px',
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0', color: 'var(--color-text-muted)', fontSize: '14px' }}>
          {t('common.loading')}
        </div>
      ) : entries.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: 'var(--color-text-muted)',
          fontSize: '14px',
        }}>
          {t('userProfile.noHabits')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {entries.map((entry) => {
            const isExpanded = expandedKeys.has(entry.key);
            const lines = entry.value.split('\n');
            const preview = lines[0] || '';
            const hasMore = lines.length > 1 || preview.length > 120;

            return (
              <div
                key={entry.key}
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 18px',
                    cursor: hasMore ? 'pointer' : 'default',
                    borderBottom: isExpanded ? '1px solid var(--color-border)' : 'none',
                  }}
                  onClick={hasMore ? () => toggleExpand(entry.key) : undefined}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{
                        fontWeight: 600,
                        fontSize: '14px',
                        color: 'var(--color-text-primary)',
                      }}>
                        {entry.key}
                      </span>
                      {hasMore && (
                        <span style={{
                          fontSize: '11px',
                          color: 'var(--color-text-muted)',
                          transition: 'transform 0.15s',
                          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                          display: 'inline-block',
                        }}>
                          &#9654;
                        </span>
                      )}
                    </div>
                    {!isExpanded && (
                      <div style={{
                        marginTop: '4px',
                        fontSize: '13px',
                        color: 'var(--color-text-secondary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '600px',
                      }}>
                        {preview.length > 120 ? preview.slice(0, 120) + '...' : preview}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '12px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      {formatDate(entry.updatedAt)}
                    </span>
                    <Button size="sm" onClick={(e) => { e.stopPropagation(); handleEdit(entry); }}>{t('common.edit')}</Button>
                    <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); handleDelete(entry.key); }}>{t('common.delete')}</Button>
                  </div>
                </div>
                {isExpanded && (
                  <div style={{ padding: '14px 18px' }}>
                    {renderMarkdown(entry.value)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={showModal}
        title={editingKey ? t('userProfile.editHabit') : t('userProfile.addHabitModal')}
        onClose={() => { setShowModal(false); setEditingKey(null); }}
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button onClick={() => { setShowModal(false); setEditingKey(null); }}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={handleSubmit}>
              {editingKey ? t('common.save') : t('common.add')}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>{t('userProfile.key')}</label>
            <input
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value })}
              disabled={!!editingKey}
              placeholder={t('userProfile.keyPlaceholder')}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                fontSize: '13px',
                background: editingKey ? 'var(--color-surface-muted, #f5f5f5)' : 'var(--color-surface)',
                color: 'var(--color-text-primary)',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>{t('userProfile.value')}</label>
            <textarea
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              rows={10}
              placeholder={t('userProfile.valuePlaceholder')}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                fontSize: '13px',
                background: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
                resize: 'vertical',
                fontFamily: 'monospace',
              }}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
