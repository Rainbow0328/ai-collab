import { useState, useEffect, useCallback } from 'react';
import { DataTable, PageHeader, Button, StatusBadge, Modal } from '@/components/admin';
import { api } from '@/lib/api-client';
import { useI18n } from '@/i18n';
import type { AgentProfileWithSkills, SkillDefinition, ModelConfig } from '@ai-collab/protocol';

export function Agents() {
  const { t } = useI18n();
  const [profiles, setProfiles] = useState<AgentProfileWithSkills[]>([]);
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    defaultModelConfigId: '',
    defaultRole: 'host' as string,
    roleDescription: '',
    systemPrompt: '',
    defaultParameters: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, s, m] = await Promise.all([
        api.agentProfiles.list(),
        api.skills.list(),
        api.models.list(),
      ]);
      setProfiles(p);
      setSkills(s);
      setModels(m);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('agent.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async () => {
    try {
      const params = form.defaultParameters ? JSON.parse(form.defaultParameters) : null;
      if (editingId) {
        await api.agentProfiles.update(editingId, {
          name: form.name,
          description: form.description || null,
          defaultModelConfigId: form.defaultModelConfigId || null,
          defaultRole: form.defaultRole as never || null,
          roleDescription: form.roleDescription || null,
          systemPrompt: form.systemPrompt || null,
          defaultParameters: params,
        });
      } else {
        await api.agentProfiles.create({
          name: form.name,
          description: form.description || null,
          defaultModelConfigId: form.defaultModelConfigId || null,
          defaultRole: form.defaultRole as never || null,
          roleDescription: form.roleDescription || null,
          systemPrompt: form.systemPrompt || null,
          defaultParameters: params,
        });
      }
      setShowModal(false);
      setEditingId(null);
      resetForm();
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('agent.saveFailed'));
    }
  };

  const handleEdit = (profile: AgentProfileWithSkills) => {
    setEditingId(profile.id);
    setForm({
      name: profile.name,
      description: profile.description || '',
      defaultModelConfigId: profile.defaultModelConfigId || '',
      defaultRole: profile.defaultRole || 'host',
      roleDescription: profile.roleDescription || '',
      systemPrompt: profile.systemPrompt || '',
      defaultParameters: profile.defaultParametersJson || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm(t('agent.deleteConfirm'))) {
      try {
        await api.agentProfiles.delete(id);
        fetchData();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('agent.deleteFailed'));
      }
    }
  };

  const resetForm = () => {
    setForm({
      name: '',
      description: '',
      defaultModelConfigId: '',
      defaultRole: 'host',
      roleDescription: '',
      systemPrompt: '',
      defaultParameters: '',
    });
  };

  const handleAddClick = () => {
    setEditingId(null);
    resetForm();
    setShowModal(true);
  };

  const columns = [
    { key: 'name', title: t('common.name') },
    { key: 'defaultRole', title: t('agent.defaultRole') },
    { key: 'description', title: t('common.description'), render: (val: string) => val || '-' },
    { key: 'enabled', title: t('common.status'), render: (_: any, record: AgentProfileWithSkills) => <StatusBadge status={record.enabled ? 'enabled' : 'disabled'} /> },
    {
      key: 'skills',
      title: t('agent.skillCount'),
      render: (_: any, record: AgentProfileWithSkills) => record.skillIds.length,
    },
    {
      key: 'actions',
      title: t('common.actions'),
      render: (_: any, record: AgentProfileWithSkills) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button size="sm" onClick={() => handleEdit(record)}>{t('common.edit')}</Button>
          <Button size="sm" variant="danger" onClick={() => handleDelete(record.id)}>{t('common.delete')}</Button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px', height: '100%' }}>
      <PageHeader
        title={t('agent.mgmt')}
        subtitle={t('agent.mgmtDesc')}
        extra={<Button variant="primary" onClick={handleAddClick}>{t('agent.add')}</Button>}
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

      <DataTable
        columns={columns}
        data={profiles}
        loading={loading}
        emptyText={t('agent.noAgents')}
      />

      <Modal
        open={showModal}
        title={editingId ? t('agent.editTemplate') : t('agent.addTemplate')}
        onClose={() => setShowModal(false)}
        width="600px"
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button onClick={() => setShowModal(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={handleSubmit}>
              {editingId ? t('common.saveChanges') : t('common.create')}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>{t('common.name')}</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                fontSize: '13px',
                background: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>{t('agent.defaultRole')}</label>
            <select
              value={form.defaultRole}
              onChange={(e) => setForm({ ...form, defaultRole: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                fontSize: '13px',
                background: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
              }}
            >
              <option value="host">Host</option>
              <option value="worker">Worker</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>{t('agent.defaultModel')}</label>
            <select
              value={form.defaultModelConfigId}
              onChange={(e) => setForm({ ...form, defaultModelConfigId: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
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
          <div>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>{t('common.description')}</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                fontSize: '13px',
                background: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
              }}
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>{t('form.roleDesc')}</label>
            <input
              value={form.roleDescription}
              onChange={(e) => setForm({ ...form, roleDescription: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                fontSize: '13px',
                background: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
              }}
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>{t('form.systemPrompt')}</label>
            <textarea
              value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              rows={4}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                fontSize: '13px',
                background: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
                resize: 'vertical',
                minHeight: '100px',
              }}
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>{t('form.defaultParams')}</label>
            <textarea
              value={form.defaultParameters}
              onChange={(e) => setForm({ ...form, defaultParameters: e.target.value })}
              rows={3}
              placeholder='{"temperature": 0.7}'
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
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
