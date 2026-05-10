import { useState, useEffect, useCallback } from 'react';
import { DataTable, PageHeader, Button, StatusBadge, Modal } from '@/components/admin';
import { useSessions } from '@/hooks/use-sessions';
import { api } from '@/lib/api-client';
import { useI18n } from '@/i18n';
import type { Session, AgentProfileWithSkills, ModelConfig, SkillDefinition, AgentRole } from '@ai-collab/protocol';

export function SessionList() {
  const { t } = useI18n();
  const { sessions, loading: listLoading, fetchSessions } = useSessions();
  const [profiles, setProfiles] = useState<AgentProfileWithSkills[]>([]);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'join'>('create');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  const [form, setForm] = useState({
    sessionName: '',
    sessionId: '',
    role: 'host' as AgentRole,
    agentName: '',
    displayName: '',
    agentProfileId: '',
    modelConfigId: '',
    roleDescription: '',
    systemPrompt: '',
    runtimeParameters: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, m, sk] = await Promise.all([
        api.agentProfiles.list(),
        api.models.list(),
        api.skills.list(),
      ]);
      setProfiles(p);
      setModels(m);
      setSkills(sk);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async () => {
    try {
      const params = form.runtimeParameters ? JSON.parse(form.runtimeParameters) : null;

      if (modalMode === 'create') {
        await api.sessionWithAgent.create({
          sessionName: form.sessionName,
          role: form.role as "host",
          agentName: form.agentName,
          displayName: form.displayName,
          agentProfileId: form.agentProfileId || null,
          modelConfigId: form.modelConfigId || null,
          roleDescription: form.roleDescription || null,
          runtimeParameters: params,
        });
      } else {
        await api.sessionWithAgent.join({
          sessionId: form.sessionId,
          role: form.role as Exclude<any, "host">,
          agentName: form.agentName,
          displayName: form.displayName,
          agentProfileId: form.agentProfileId || null,
          modelConfigId: form.modelConfigId || null,
          roleDescription: form.roleDescription || null,
          runtimeParameters: params,
        });
      }

      setShowModal(false);
      resetForm();
      setSelectedSkills([]);
      fetchSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.loadFailed'));
    }
  };

  const resetForm = () => {
    setForm({
      sessionName: '',
      sessionId: '',
      role: 'host',
      agentName: '',
      displayName: '',
      agentProfileId: '',
      modelConfigId: '',
      roleDescription: '',
      systemPrompt: '',
      runtimeParameters: '',
    });
  };

  const handleCreateClick = () => {
    setModalMode('create');
    resetForm();
    setSelectedSkills([]);
    setShowModal(true);
  };

  const handleJoinClick = (session: Session) => {
    setModalMode('join');
    resetForm();
    setForm({
      ...form,
      sessionId: session.id,
      role: 'worker',
    });
    setSelectedSkills([]);
    setShowModal(true);
  };

  const columns = [
    { key: 'name', title: t('form.sessionName') },
    { key: 'status', title: t('common.status'), render: (_: any, record: Session) => (
      <StatusBadge status={record.status === 'active' ? 'enabled' : 'disabled'} />
    )},
    { key: 'hostAgentId', title: t('role.host'), render: (val: string) => val.substring(0, 12) + '...' },
    {
      key: 'actions',
      title: t('common.actions'),
      render: (_: any, record: Session) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button size="sm" onClick={() => handleJoinClick(record)}>{t('session.join')}</Button>
        </div>
      ),
    },
  ];

  const selectedProfile = profiles.find(p => p.id === form.agentProfileId);

  return (
    <div style={{ padding: '24px', height: '100%' }}>
      <PageHeader
        title={t('session.createJoin')}
        subtitle={t('session.createJoinDesc')}
        extra={
          <div style={{ display: 'flex', gap: '12px' }}>
            <Button variant="primary" onClick={handleCreateClick}>{t('session.create')}</Button>
          </div>
        }
      />

      {error && (
        <div style={{
          padding: '12px 16px',
          background: 'var(--color-error-subtle)',
          color: 'var(--color-error)',
          borderRadius: '4px',
          marginBottom: '16px',
          fontSize: '13px',
        }}>
          {error}
        </div>
      )}

      <DataTable
        columns={columns}
        data={sessions}
        loading={loading || listLoading}
        emptyText={t('session.noSessionsHint')}
      />

      <Modal
        open={showModal}
        title={modalMode === 'create' ? t('session.createNew') : t('session.join')}
        onClose={() => setShowModal(false)}
        width="650px"
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button onClick={() => setShowModal(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={handleSubmit}>
              {modalMode === 'create' ? t('common.create') : t('session.join')}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {modalMode === 'create' ? (
            <div>
              <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>{t('form.sessionName')}</label>
              <input
                value={form.sessionName}
                onChange={(e) => setForm({ ...form, sessionName: e.target.value })}
                placeholder="my-session"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  fontSize: '13px',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text-primary)',
                }}
              />
            </div>
          ) : (
            <div>
              <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>{t('session.id')}</label>
              <input
                value={form.sessionId}
                onChange={(e) => setForm({ ...form, sessionId: e.target.value })}
                disabled
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  fontSize: '13px',
                  background: 'var(--color-surface-hover)',
                  color: 'var(--color-text-primary)',
                }}
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>{t('form.role')}</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as AgentRole })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: '4px',
                fontSize: '13px',
                background: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
              }}
            >
              {modalMode === 'create' ? (
                <option value="host">Host</option>
              ) : (
                <>
                  <option value="worker">Worker</option>
                </>
              )}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>{t('form.agentName')}</label>
            <input
              value={form.agentName}
              onChange={(e) => setForm({ ...form, agentName: e.target.value })}
              placeholder="my-agent"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: '4px',
                fontSize: '13px',
                background: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>{t('form.displayName')}</label>
            <input
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              placeholder="My Agent"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: '4px',
                fontSize: '13px',
                background: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>{t('form.agentTemplate')}</label>
            <select
              value={form.agentProfileId}
              onChange={(e) => setForm({ ...form, agentProfileId: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: '4px',
                fontSize: '13px',
                background: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
              }}
            >
              <option value="">{t('agent.noTemplate')}</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>{t('form.modelConfig')}</label>
            <select
              value={form.modelConfigId}
              onChange={(e) => setForm({ ...form, modelConfigId: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: '4px',
                fontSize: '13px',
                background: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
              }}
            >
              <option value="">{t('form.notSpecified')}</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.provider})
                </option>
              ))}
            </select>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>{t('form.roleDesc')}</label>
            <input
              value={form.roleDescription}
              onChange={(e) => setForm({ ...form, roleDescription: e.target.value })}
              placeholder={t('form.roleDescPlaceholder')}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: '4px',
                fontSize: '13px',
                background: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
              }}
            />
          </div>

          {modalMode === 'create' && (
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
              <span>{t('form.skills')}</span>
              <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{t('skill.onlyForHost')}</span>
            </label>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              padding: '12px',
              border: '1px solid var(--color-border)',
              borderRadius: '4px',
              background: 'var(--color-surface)',
              maxHeight: '150px',
              overflowY: 'auto',
            }}>
              {skills.map((skill) => (
                <label
                  key={skill.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 10px',
                    background: selectedSkills.includes(skill.id) ? 'var(--color-accent-subtle)' : 'var(--color-surface-hover)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    color: 'var(--color-text-primary)',
                    border: selectedSkills.includes(skill.id) ? '1px solid var(--color-accent)' : '1px solid transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedSkills.includes(skill.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedSkills([...selectedSkills, skill.id]);
                      } else {
                        setSelectedSkills(selectedSkills.filter(id => id !== skill.id));
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                  {skill.name}
                </label>
              ))}
            </div>
          </div>
          )}

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>{t('form.systemPrompt')}</label>
            <textarea
              value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              rows={3}
              placeholder={selectedProfile?.systemPrompt || ''}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: '4px',
                fontSize: '13px',
                background: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
                resize: 'vertical',
                minHeight: '80px',
              }}
            />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>{t('form.runtimeParams')}</label>
            <textarea
              value={form.runtimeParameters}
              onChange={(e) => setForm({ ...form, runtimeParameters: e.target.value })}
              rows={3}
              placeholder='{"temperature": 0.7}'
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: '4px',
                fontSize: '13px',
                background: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
                resize: 'vertical',
                fontFamily: 'var(--font-mono)',
              }}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
