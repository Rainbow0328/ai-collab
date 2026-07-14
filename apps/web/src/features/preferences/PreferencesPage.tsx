import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { Badge, Field, EmptyState, Loading, pushToast, ConfirmDialog } from "@/components/ui";
import { formatTime } from "@/features/workbench/text";

const PREFS_KEY = ["preferences"] as const;

export function PreferencesPage() {
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [category, setCategory] = useState("general");
  const [query, setQuery] = useState("");
  const [deleteKey, setDeleteKey] = useState<string | null>(null);

  const preferencesQuery = useQuery({
    queryKey: [...PREFS_KEY, query],
    queryFn: () => api.userPreferences.list({ ...(query.trim() ? { query: query.trim() } : {}) }),
  });

  const saveMutation = useMutation({
    mutationFn: () => api.userPreferences.upsert(key.trim(), {
      value: value.trim(),
      category: category.trim() || null,
      source: "manual",
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PREFS_KEY });
      setKey(""); setValue("");
      pushToast("偏好已保存", "success");
    },
    onError: (e) => pushToast(e.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (targetKey: string) => api.userPreferences.delete(targetKey),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PREFS_KEY });
      pushToast("已删除", "success");
    },
    onError: (e) => pushToast(e.message, "error"),
  });

  const preferences = preferencesQuery.data?.preferences ?? [];
  const manifest = preferencesQuery.data?.manifest ?? null;

  return (
    <>
      <PageHeader
        title="全局偏好"
        subtitle={manifest ? `${manifest.count} 条记录 · ${manifest.rootPath}` : "—"}
        actions={
          <input
            className="input"
            style={{ width: 240 }}
            placeholder="搜索偏好…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        }
      />
      <PageContainer>
        <div style={{
          display: "grid",
          gridTemplateColumns: "380px 1fr",
          gap: "var(--sp-5)",
          alignItems: "flex-start",
        }}>
          {/* Add form */}
          <div className="card" style={{ padding: "var(--sp-5)", position: "sticky", top: 0 }}>
            <h2 style={{
              fontSize: "var(--fs-md)", fontWeight: 700,
              color: "var(--c-text-primary)", marginBottom: "var(--sp-4)",
            }}>
              添加偏好
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
              <Field label="键名" required hint="如 coding.style、output.language">
                <input
                  className="input"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="coding.style"
                />
              </Field>
              <Field label="分类">
                <input
                  className="input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="general"
                />
              </Field>
              <Field label="偏好内容" required>
                <textarea
                  className="input"
                  style={{ minHeight: 120, resize: "vertical" }}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="实现后用简洁中文总结…"
                />
              </Field>
              <button
                className="btn btn-primary"
                disabled={!key.trim() || !value.trim() || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? "保存中…" : "保存"}
              </button>
              {saveMutation.error && (
                <p style={{ fontSize: "var(--fs-sm)", color: "var(--c-error)" }}>
                  {saveMutation.error.message}
                </p>
              )}
            </div>
          </div>

          {/* List */}
          <div>
            {preferencesQuery.isLoading ? (
              <Loading text="加载中…" />
            ) : preferences.length === 0 ? (
              <EmptyState title="暂无全局偏好" desc="添加一条偏好以让 AI 记住你的习惯" />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
                {preferences.map((item) => (
                  <div key={item.id} className="card card-hover" style={{ padding: "var(--sp-4)" }}>
                    <div style={{
                      display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                      marginBottom: "var(--sp-2)",
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <h3 style={{
                          fontSize: "var(--fs-md)", fontWeight: 700,
                          color: "var(--c-text-primary)",
                        }}>
                          {item.key}
                        </h3>
                        <div style={{ display: "flex", gap: "var(--sp-1)", marginTop: "var(--sp-1)" }}>
                          {item.category && <Badge variant="accent">{item.category}</Badge>}
                          <Badge variant="neutral">{item.source}</Badge>
                          <span style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-tertiary)" }}>
                            {formatTime(item.updatedAt)}
                          </span>
                        </div>
                      </div>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={() => setDeleteKey(item.key)}
                        title="删除"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
                      </button>
                    </div>
                    <p className="message-content" style={{ color: "var(--c-text-secondary)" }}>
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </PageContainer>

      <ConfirmDialog
        open={deleteKey !== null}
        onClose={() => setDeleteKey(null)}
        onConfirm={() => { if (deleteKey) deleteMutation.mutate(deleteKey); }}
        title="删除偏好"
        message={`确定要删除偏好「${deleteKey}」吗？`}
        confirmText="删除"
        danger
      />
    </>
  );
}
