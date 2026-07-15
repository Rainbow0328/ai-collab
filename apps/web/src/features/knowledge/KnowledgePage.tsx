import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { KnowledgeLevel } from "@loopmarshal/protocol";
import { api } from "@/lib/api-client";
import { renderMarkdown } from "@/lib/markdown";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { Badge, EmptyState, Loading, pushToast } from "@/components/ui";
import { formatTime, formatTimeFull } from "@/features/workbench/text";

const LEVEL_CONFIG: Record<KnowledgeLevel, { label: string; desc: string; variant: "warning" | "info" | "success" }> = {
  l1: { label: "L1 · 项目方向", desc: "长期原则、当前方向、需求约束", variant: "warning" },
  l2: { label: "L2 · 领域规则", desc: "模块边界、协议、状态机", variant: "info" },
  l3: { label: "L3 · 字段对齐", desc: "字段、接口参数、数据结构", variant: "success" },
};

export function KnowledgePage() {
  const [selectedLevel, setSelectedLevel] = useState<KnowledgeLevel | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const manifestQuery = useQuery({
    queryKey: ["knowledge", "manifest"],
    queryFn: () => api.knowledge.getManifest(),
  });
  const listQuery = useQuery({
    queryKey: ["knowledge", "list"],
    queryFn: () => api.knowledge.list(),
  });
  const changesQuery = useQuery({
    queryKey: ["knowledge", "changes"],
    queryFn: () => api.knowledge.listChanges({ limit: 20 }),
  });
  const documentQuery = useQuery({
    queryKey: ["knowledge", "doc", selectedLevel, selectedSlug],
    queryFn: () => api.knowledge.get(selectedLevel as KnowledgeLevel, selectedSlug as string),
    enabled: Boolean(selectedLevel && selectedSlug),
  });

  const items = listQuery.data ?? [];
  const grouped = useMemo(() => ({
    l1: items.filter((i) => i.level === "l1"),
    l2: items.filter((i) => i.level === "l2"),
    l3: items.filter((i) => i.level === "l3"),
  }), [items]);

  const activeItem = selectedLevel && selectedSlug
    ? items.find((i) => i.level === selectedLevel && i.slug === selectedSlug)
    : items[0] ?? null;
  const effectiveLevel = selectedLevel ?? activeItem?.level ?? null;
  const effectiveSlug = selectedSlug ?? activeItem?.slug ?? null;
  const document = effectiveLevel === selectedLevel && effectiveSlug === selectedSlug ? documentQuery.data : null;
  const counts = manifestQuery.data?.counts ?? { l1: grouped.l1.length, l2: grouped.l2.length, l3: grouped.l3.length };

  const refreshAll = () => {
    void manifestQuery.refetch();
    void listQuery.refetch();
    void changesQuery.refetch();
    void documentQuery.refetch();
    pushToast("已刷新", "info");
  };

  return (
    <>
      <PageHeader
        title="知识库"
        subtitle={`${manifestQuery.data?.rootPath ?? "—"} · ${items.length} 篇文档`}
        actions={
          <button className="btn btn-secondary" onClick={refreshAll}>刷新</button>
        }
      />
      <PageContainer>
        <div style={{
          display: "grid",
          gridTemplateColumns: "280px 1fr 320px",
          gap: "var(--sp-4)",
          height: "calc(100vh - var(--header-h) - var(--sp-10))",
        }}>
          {/* Document tree */}
          <div className="card" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "var(--sp-3) var(--sp-4)", borderBottom: "1px solid var(--c-border-subtle)" }}>
              <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--c-text-primary)" }}>文档列表</div>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "var(--sp-2)" }}>
              {listQuery.isLoading ? (
                <Loading text="加载中…" />
              ) : items.length === 0 ? (
                <EmptyState title="知识库为空" desc="AI 在协作过程中会自动写入" />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
                  {(Object.keys(LEVEL_CONFIG) as KnowledgeLevel[]).map((level) => (
                    <div key={level}>
                      <div style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "0 var(--sp-2) var(--sp-1)",
                      }}>
                        <Badge variant={LEVEL_CONFIG[level].variant} dot>
                          {LEVEL_CONFIG[level].label}
                        </Badge>
                        <span style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-tertiary)" }}>{counts[level]}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        {grouped[level].map((item) => {
                          const active = effectiveLevel === item.level && effectiveSlug === item.slug;
                          return (
                            <button
                              key={`${item.level}:${item.slug}`}
                              onClick={() => { setSelectedLevel(item.level); setSelectedSlug(item.slug); }}
                              style={{
                                display: "block", width: "100%", textAlign: "left",
                                padding: "var(--sp-2) var(--sp-3)",
                                borderRadius: "var(--r-md)",
                                border: "1px solid transparent",
                                background: active ? "var(--c-accent-subtle)" : "transparent",
                                fontSize: "var(--fs-sm)", fontWeight: active ? 600 : 400,
                                color: active ? "var(--c-accent)" : "var(--c-text-primary)",
                                transition: "all var(--t-fast)",
                              }}
                              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--c-bg-hover)"; }}
                              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                            >
                              <div className="truncate">{item.title}</div>
                              <div style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-tertiary)" }}>{item.level}/{item.slug}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Document content */}
          <div className="card" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "var(--sp-3) var(--sp-4)", borderBottom: "1px solid var(--c-border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--c-text-primary)" }} className="truncate">
                  {activeItem?.title ?? "选择文档"}
                </div>
                {activeItem && (
                  <div style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-tertiary)" }}>
                    {activeItem.level}/{activeItem.slug} · v{activeItem.version} · {formatTime(activeItem.updatedAt)}
                  </div>
                )}
              </div>
              {activeItem && (
                <Badge variant={LEVEL_CONFIG[activeItem.level].variant} dot>
                  {LEVEL_CONFIG[activeItem.level].label}
                </Badge>
              )}
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "var(--sp-4)" }}>
              {!activeItem ? (
                <EmptyState title="未选择文档" desc="从左侧列表中选择一篇文档" />
              ) : documentQuery.isLoading && selectedSlug ? (
                <Loading text="加载文档…" />
              ) : document ? (
                <article>
                  {document.summary && (
                    <div style={{
                      padding: "var(--sp-3) var(--sp-4)",
                      marginBottom: "var(--sp-4)",
                      borderRadius: "var(--r-md)",
                      background: "var(--c-bg-subtle)",
                      border: "1px solid var(--c-border-subtle)",
                      fontSize: "var(--fs-sm)", color: "var(--c-text-secondary)",
                      lineHeight: 1.6,
                    }}>
                        {document.summary}
                      </div>
                  )}
                  {document.tags.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-1)", marginBottom: "var(--sp-4)" }}>
                      {document.tags.map((tag) => (
                        <Badge key={tag} variant="neutral">{tag}</Badge>
                      ))}
                    </div>
                  )}
                  <div
                    className="markdown-body"
                    style={{
                      color: "var(--c-text-primary)",
                      lineHeight: 1.7,
                    }}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(document.content || "无文档内容") }}
                  />
                </article>
              ) : (
                <EmptyState title="点击文档重新加载" desc="文档内容加载失败" />
              )}
            </div>
          </div>

          {/* Recent changes */}
          <div className="card" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "var(--sp-3) var(--sp-4)", borderBottom: "1px solid var(--c-border-subtle)" }}>
              <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--c-text-primary)" }}>
                近期变更
              </div>
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-tertiary)" }}>
                {changesQuery.data?.length ?? 0} 条记录
              </div>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "var(--sp-2)" }}>
              {changesQuery.isLoading ? (
                <Loading text="加载中…" />
              ) : (changesQuery.data ?? []).length === 0 ? (
                <EmptyState title="暂无变更" />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                  {(changesQuery.data ?? []).map((change) => (
                    <div key={`${change.level}:${change.slug}:${change.createdAt}`} style={{
                      padding: "var(--sp-3)",
                      borderRadius: "var(--r-md)",
                      border: "1px solid var(--c-border-subtle)",
                      background: "var(--c-bg-elevated)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--sp-1)" }}>
                        <span style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--c-text-primary)" }} className="truncate">
                          {change.level}/{change.slug}
                        </span>
                        <Badge variant={change.kind === "created" ? "success" : change.kind === "deleted" ? "error" : "info"}>
                          {change.kind}
                        </Badge>
                      </div>
                      <div style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-tertiary)" }}>
                        {formatTimeFull(change.createdAt)}
                      </div>
                      {change.summary && (
                        <div style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-secondary)", marginTop: "var(--sp-1)" }}>
                          {change.summary}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </PageContainer>
    </>
  );
}
