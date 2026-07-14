import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { Badge, Dialog, Field, EmptyState, Loading, pushToast, ConfirmDialog } from "@/components/ui";

const PROVIDERS = [
  { value: "openai", label: "OpenAI / 兼容" },
  { value: "anthropic", label: "Anthropic" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "custom", label: "自定义" },
];

export function ModelsPage() {
  const qc = useQueryClient();
  const modelsQuery = useQuery({
    queryKey: ["models"],
    queryFn: () => api.models.list(),
  });

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.models.delete(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["models"] });
      pushToast("模型已删除", "success");
    },
    onError: (e) => pushToast(e.message, "error"),
  });

  const models = modelsQuery.data ?? [];

  return (
    <>
      <PageHeader
        title="模型配置"
        subtitle={`${models.length} 个可用模型`}
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => modelsQuery.refetch()}>刷新</button>
            <button className="btn btn-primary" onClick={() => setShowAddDialog(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              添加模型
            </button>
          </>
        }
      />
      <PageContainer>
        {modelsQuery.isLoading ? (
          <Loading text="加载模型列表…" />
        ) : models.length === 0 ? (
          <EmptyState
            title="暂无模型配置"
            desc="添加一个模型以开始使用"
            action={
              <button className="btn btn-primary" onClick={() => setShowAddDialog(true)}>
                添加模型
              </button>
            }
          />
        ) : (
          <div style={{
            display: "grid", gap: "var(--sp-3)",
            gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
          }}>
            {models.map((model) => (
              <div key={model.id} className="card card-hover" style={{ padding: "var(--sp-4)" }}>
                <div style={{
                  display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                  marginBottom: "var(--sp-3)",
                }}>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{
                      fontSize: "var(--fs-md)", fontWeight: 700,
                      color: "var(--c-text-primary)",
                    }}>
                      {model.name}
                    </h3>
                    <p style={{
                      fontSize: "var(--fs-sm)", color: "var(--c-text-tertiary)",
                      marginTop: "2px",
                    }}>
                      {PROVIDERS.find((p) => p.value === model.provider)?.label ?? model.provider}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
                    <Badge variant="success" dot>可用</Badge>
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      onClick={() => setDeleteId(model.id)}
                      title="删除模型"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div style={{
                  display: "flex", flexDirection: "column", gap: "var(--sp-1)",
                  padding: "var(--sp-3)", borderRadius: "var(--r-md)",
                  background: "var(--c-bg-subtle)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "var(--fs-xs)", fontWeight: 600, color: "var(--c-text-tertiary)" }}>模型 ID</span>
                    <code style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-secondary)" }}>{model.modelId}</code>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "var(--fs-xs)", fontWeight: 600, color: "var(--c-text-tertiary)" }}>配置 ID</span>
                    <code style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-secondary)" }}>{model.id}</code>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageContainer>

      <AddModelDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
      />

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) deleteMutation.mutate(deleteId);
        }}
        title="删除模型"
        message="确定要删除此模型配置吗？此操作不可撤销。"
        confirmText="删除"
        danger
      />
    </>
  );
}

/* ==================== Add Model Dialog ==================== */

function AddModelDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("openai");
  const [modelId, setModelId] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  const createMutation = useMutation({
    mutationFn: () => api.models.create({
      name: name.trim(),
      provider,
      modelId: modelId.trim(),
      ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["models"] });
      pushToast("模型已添加", "success");
      onClose();
      setName("");
      setProvider("openai");
      setModelId("");
      setBaseUrl("");
      setApiKey("");
    },
    onError: (e) => pushToast(e.message, "error"),
  });

  const valid = name.trim() && modelId.trim();

  return (
    <Dialog open={open} onClose={onClose} title="添加模型" width={480}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
        <Field label="名称" required hint="给模型起一个好记的名字，如 GPT-4o">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="GPT-4o"
          />
        </Field>

        <Field label="提供商" required>
          <select className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </Field>

        <Field label="模型 ID" required hint="API 调用使用的模型标识符，如 gpt-4o-mini">
          <input
            className="input"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            placeholder="gpt-4o-mini"
          />
        </Field>

        <Field label="Base URL" hint="API 地址，留空则使用默认值">
          <input
            className="input"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
          />
        </Field>

        <Field label="API Key" hint="API 密钥，留空则使用环境变量">
          <input
            className="input"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
          />
        </Field>

        {createMutation.error && (
          <div style={{
            padding: "var(--sp-2) var(--sp-3)",
            borderRadius: "var(--r-sm)",
            background: "var(--c-error-subtle)",
            fontSize: "var(--fs-sm)", color: "var(--c-error)",
            lineHeight: 1.5,
          }}>
            {createMutation.error.message}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--sp-2)" }}>
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button
            className="btn btn-primary"
            disabled={!valid || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? "添加中…" : "添加"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
