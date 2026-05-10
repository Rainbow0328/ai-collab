import { useState, useEffect, useCallback } from 'react';
import { DataTable, PageHeader, Button, StatusBadge, Modal } from '@/components/admin';
import { api } from '@/lib/api-client';
import { useI18n } from '@/i18n';
import type { ModelConfig } from '@ai-collab/protocol';

export function Models() {
  const { t } = useI18n();
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState('');

  const [form, setForm] = useState({
    name: '',
    provider: 'openai' as ModelConfig['provider'],
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    modelName: '',
    temperature: 0.7,
    maxTokens: 4096,
    topP: 1.0,
    timeoutSeconds: 60,
  });

  const fetchModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.models.list();
      setModels(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load models');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const handleSubmit = async () => {
    try {
      if (editingId) {
        const updateData: Record<string, unknown> = { ...form };
        if (!form.apiKey.trim()) {
          delete updateData.apiKey;
        }
        await api.models.update(editingId, updateData as never);
      } else {
        await api.models.create(form);
      }
      setShowModal(false);
      setEditingId(null);
      resetForm();
      fetchModels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save model');
    }
  };

  const handleEdit = (model: ModelConfig) => {
    setEditingId(model.id);
    setForm({
      name: model.name,
      provider: model.provider,
      baseUrl: model.baseUrl,
      apiKey: '',
      modelName: model.modelName,
      temperature: model.temperature,
      maxTokens: model.maxTokens,
      topP: model.topP,
      timeoutSeconds: model.timeoutSeconds,
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm(t('model.deleteConfirm'))) {
      try {
        await api.models.delete(id);
        fetchModels();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete model');
      }
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const result = await api.models.test(id);
      setTestResult(result.ok ? `OK (${result.latencyMs}ms): ${result.response}` : `Error: ${result.error}`);
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTestingId(null);
    }
  };

  const resetForm = () => {
    setForm({
      name: '',
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      modelName: '',
      temperature: 0.7,
      maxTokens: 4096,
      topP: 1.0,
      timeoutSeconds: 60,
    });
  };

  const handleAddClick = () => {
    setEditingId(null);
    resetForm();
    setShowModal(true);
  };

  const filteredModels = models.filter((m) => {
    if (searchQuery && !m.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (providerFilter && m.provider !== providerFilter) return false;
    return true;
  });

  const columns = [
    { key: 'name', title: t('common.name') },
    { key: 'provider', title: t('model.provider') },
    { key: 'modelName', title: t('model.modelName') },
    { key: 'enabled', title: t('common.status'), render: (_: any, record: ModelConfig) => <StatusBadge status={record.enabled ? 'enabled' : 'disabled'} /> },
    { key: 'temperature', title: 'Temperature' },
    { key: 'maxTokens', title: 'Max Tokens' },
    { key: 'apiKeyHint', title: 'API Key', render: (val: string) => val || t('model.notSet') },
    {
      key: 'actions',
      title: t('common.actions'),
      render: (_: any, record: ModelConfig) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button size="sm" onClick={() => handleEdit(record)}>{t('common.edit')}</Button>
          <Button size="sm" onClick={() => handleTest(record.id)} disabled={testingId === record.id}>
            {testingId === record.id ? t('model.testing') : t('model.test')}
          </Button>
          <Button size="sm" variant="danger" onClick={() => handleDelete(record.id)}>{t('common.delete')}</Button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px', height: '100%' }}>
      <PageHeader
        title={t('model.mgmt')}
        subtitle={t('model.mgmtDesc')}
        extra={<Button variant="primary" onClick={handleAddClick}>{t('model.add')}</Button>}
      />

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder={t('model.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            padding: '8px 14px',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            fontSize: '13px',
            background: 'var(--color-surface)',
            color: 'var(--color-text-primary)',
            flex: 1,
            maxWidth: '320px',
          }}
        />
        <select
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          style={{
            padding: '8px 14px',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            fontSize: '13px',
            background: 'var(--color-surface)',
            color: 'var(--color-text-primary)',
          }}
        >
          <option value="">{t('model.allProviders')}</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="deepseek">DeepSeek</option>
          <option value="google">Google</option>
          <option value="custom">{t('model.custom')}</option>
        </select>
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

      {testResult && (
        <div style={{
          padding: '12px 16px',
          background: 'var(--color-info-subtle)',
          color: 'var(--color-info)',
          borderRadius: 'var(--radius-md)',
          marginBottom: '16px',
          fontSize: '13px',
          wordBreak: 'break-all',
        }}>
          {testResult}
        </div>
      )}

      <DataTable
        columns={columns}
        data={filteredModels}
        loading={loading}
        emptyText={t('model.noModels')}
      />

      <Modal
        open={showModal}
        title={editingId ? t('model.editModel') : t('model.addModel')}
        onClose={() => setShowModal(false)}
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button onClick={() => setShowModal(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={handleSubmit}>
              {editingId ? t('common.saveChanges') : t('model.createModel')}
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
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>{t('model.provider')}</label>
            <select
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value as ModelConfig['provider'] })}
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
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="deepseek">DeepSeek</option>
              <option value="google">Google</option>
              <option value="custom">{t('model.custom')}</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Base URL</label>
            <input
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
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
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>API Key</label>
            <input
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              placeholder={editingId ? t('model.apiKeyPlaceholder') : ''}
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
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>{t('model.modelName')}</label>
            <input
              value={form.modelName}
              onChange={(e) => setForm({ ...form, modelName: e.target.value })}
              placeholder={t('model.modelPlaceholder')}
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
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Temperature</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={form.temperature}
              onChange={(e) => setForm({ ...form, temperature: parseFloat(e.target.value) || 0 })}
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
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>Max Tokens</label>
            <input
              type="number"
              value={form.maxTokens}
              onChange={(e) => setForm({ ...form, maxTokens: parseInt(e.target.value) || 0 })}
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
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>{t('model.timeout')}</label>
            <input
              type="number"
              value={form.timeoutSeconds}
              onChange={(e) => setForm({ ...form, timeoutSeconds: parseInt(e.target.value) || 0 })}
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
        </div>
      </Modal>
    </div>
  );
}
