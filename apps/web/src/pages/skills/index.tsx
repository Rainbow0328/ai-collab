import { useState, useEffect, useCallback } from 'react';
import { DataTable, PageHeader, Button, StatusBadge, Modal } from '@/components/admin';
import { api } from '@/lib/api-client';
import { useI18n } from '@/i18n';
import type { SkillDefinition } from '@ai-collab/protocol';

export function Skills() {
  const { t } = useI18n();
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [scanPath, setScanPath] = useState('');

  const [form, setForm] = useState({
    name: '',
    description: '',
    path: '',
    roleScope: '' as string,
  });

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.skills.list();
      setSkills(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('skill.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  const handleSubmit = async () => {
    try {
      if (editingId) {
        await api.skills.update(editingId, {
          name: form.name,
          description: form.description || null,
          roleScope: form.roleScope || null,
        });
      } else {
        await api.skills.create({
          name: form.name,
          description: form.description || null,
          path: form.path,
          roleScope: form.roleScope || null,
        });
      }
      setShowModal(false);
      setEditingId(null);
      resetForm();
      fetchSkills();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('skill.saveFailed'));
    }
  };

  const handleEdit = (skill: SkillDefinition) => {
    setEditingId(skill.id);
    setForm({
      name: skill.name,
      description: skill.description || '',
      path: skill.path,
      roleScope: skill.roleScope || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm(t('skill.deleteConfirm'))) {
      try {
        await api.skills.delete(id);
        fetchSkills();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('skill.deleteFailed'));
      }
    }
  };

  const handleToggle = async (skill: SkillDefinition) => {
    try {
      await api.skills.update(skill.id, { enabled: !skill.enabled });
      fetchSkills();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('skill.toggleFailed'));
    }
  };

  const handleScan = async () => {
    if (!scanPath) return;
    try {
      await api.skills.scan(scanPath);
      setError(null);
      fetchSkills();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('skill.scanFailed'));
    }
  };

  const resetForm = () => {
    setForm({
      name: '',
      description: '',
      path: '',
      roleScope: '',
    });
  };

  const handleAddClick = () => {
    setEditingId(null);
    resetForm();
    setShowModal(true);
  };

  const columns = [
    { key: 'name', title: t('common.name') },
    { key: 'description', title: t('common.description'), render: (val: string) => val || '-' },
    { key: 'path', title: t('skill.path') },
    { key: 'roleScope', title: t('skill.roleScope'), render: (val: string) => val || t('skill.any') },
    { key: 'enabled', title: t('common.status'), render: (_: any, record: SkillDefinition) => <StatusBadge status={record.enabled ? 'enabled' : 'disabled'} /> },
    {
      key: 'actions',
      title: t('common.actions'),
      render: (_: any, record: SkillDefinition) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button size="sm" onClick={() => handleToggle(record)}>
            {record.enabled ? t('skill.disable') : t('skill.enable')}
          </Button>
          <Button size="sm" onClick={() => handleEdit(record)}>{t('common.edit')}</Button>
          <Button size="sm" variant="danger" onClick={() => handleDelete(record.id)}>{t('common.delete')}</Button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px', height: '100%' }}>
      <PageHeader
        title={t('skill.mgmt')}
        subtitle={t('skill.mgmtDesc')}
        extra={<Button variant="primary" onClick={handleAddClick}>{t('skill.add')}</Button>}
      />

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder={t('skill.scanPlaceholder')}
          value={scanPath}
          onChange={(e) => setScanPath(e.target.value)}
          style={{
            padding: '8px 14px',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            fontSize: '13px',
            background: 'var(--color-surface)',
            color: 'var(--color-text-primary)',
            flex: 1,
            maxWidth: '400px',
          }}
        />
        <Button onClick={handleScan}>{t('skill.scan')}</Button>
      </div>

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
        data={skills}
        loading={loading}
        emptyText={t('skill.noSkills')}
      />

      <Modal
        open={showModal}
        title={editingId ? t('skill.editSkill') : t('skill.addSkill')}
        onClose={() => setShowModal(false)}
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button onClick={() => setShowModal(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={handleSubmit}>
              {editingId ? t('common.saveChanges') : t('skill.addSkill')}
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
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>{t('skill.roleScope')}</label>
            <select
              value={form.roleScope}
              onChange={(e) => setForm({ ...form, roleScope: e.target.value })}
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
              <option value="">{t('skill.any')}</option>
              <option value="host">Host</option>
              <option value="worker">Worker</option>
            </select>
          </div>
          {!editingId && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>{t('skill.path')}</label>
              <input
                value={form.path}
                onChange={(e) => setForm({ ...form, path: e.target.value })}
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
          )}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>{t('common.description')}</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                fontSize: '13px',
                background: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
                resize: 'vertical',
              }}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
