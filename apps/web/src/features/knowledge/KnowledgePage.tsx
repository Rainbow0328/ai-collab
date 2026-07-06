import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { KnowledgeLevel } from "@ai-collab/protocol";
import { api } from "@/lib/api-client";

const levels: KnowledgeLevel[] = ["l1", "l2", "l3"];

const levelLabels: Record<KnowledgeLevel, string> = {
  l1: "L1 Direction",
  l2: "L2 Map",
  l3: "L3 Details",
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
    queryKey: ["knowledge", "document", selectedLevel, selectedSlug],
    queryFn: () => api.knowledge.get(selectedLevel as KnowledgeLevel, selectedSlug as string),
    enabled: Boolean(selectedLevel && selectedSlug),
  });

  const items = listQuery.data ?? [];
  const grouped = useMemo(
    () => ({
      l1: items.filter((item) => item.level === "l1"),
      l2: items.filter((item) => item.level === "l2"),
      l3: items.filter((item) => item.level === "l3"),
    }),
    [items]
  );
  const activeItem = selectedLevel && selectedSlug
    ? items.find((item) => item.level === selectedLevel && item.slug === selectedSlug)
    : items[0] ?? null;
  const effectiveLevel = selectedLevel ?? activeItem?.level ?? null;
  const effectiveSlug = selectedSlug ?? activeItem?.slug ?? null;
  const document = effectiveLevel === selectedLevel && effectiveSlug === selectedSlug ? documentQuery.data : null;
  const counts = manifestQuery.data?.counts ?? { l1: grouped.l1.length, l2: grouped.l2.length, l3: grouped.l3.length };

  return (
    <>
      <header className="workbench-topbar">
        <div>
          <div className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>Repository Memory</div>
          <h1 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>Knowledge</h1>
        </div>
        <button
          className="btn-secondary rounded-md border px-4 py-2 text-sm"
          onClick={() => {
            void manifestQuery.refetch();
            void listQuery.refetch();
            void changesQuery.refetch();
            void documentQuery.refetch();
          }}
        >
          Refresh
        </button>
      </header>
      <main className="workbench-content overflow-hidden p-4">
        <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[300px_minmax(0,1fr)_340px]">
          <section className="workbench-pane">
            <PaneTitle title="Documents" subtitle={`${items.length} knowledge files`} />
            <div className="workbench-pane__body">
              {listQuery.isLoading ? (
                <EmptyText text="Loading knowledge..." />
              ) : items.length === 0 ? (
                <EmptyText text="Knowledge base is empty." />
              ) : (
                <div className="space-y-4">
                  {levels.map((level) => (
                    <div key={level}>
                      <div className="mb-2 flex items-center justify-between text-xs font-bold" style={{ color: "var(--color-text-secondary)" }}>
                        <span>{levelLabels[level]}</span>
                        <span>{counts[level]}</span>
                      </div>
                      <div className="space-y-1">
                        {grouped[level].map((item) => {
                          const active = effectiveLevel === item.level && effectiveSlug === item.slug;
                          return (
                            <button
                              key={`${item.level}:${item.slug}`}
                              className={`worker-button ${active ? "worker-button--selected" : ""}`}
                              type="button"
                              onClick={() => {
                                setSelectedLevel(item.level);
                                setSelectedSlug(item.slug);
                              }}
                            >
                              <div className="truncate text-sm font-semibold">{item.title}</div>
                              <div className="truncate text-xs" style={{ color: "var(--color-text-tertiary)" }}>{item.level}/{item.slug}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="workbench-pane">
            <PaneTitle title={activeItem?.title ?? "Document"} subtitle={activeItem ? `${activeItem.level}/${activeItem.slug}` : "Select a document"} />
            <div className="workbench-pane__body">
              {!activeItem ? (
                <EmptyText text="Select a document from the left." />
              ) : documentQuery.isLoading && selectedSlug ? (
                <EmptyText text="Loading document..." />
              ) : document ? (
                <article className="space-y-4">
                  {document.summary && (
                    <div className="rounded-md border p-4 text-sm" style={{ borderColor: "var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-secondary)" }}>
                      {document.summary}
                    </div>
                  )}
                  {document.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {document.tags.map((tag) => <span key={tag} className="tag-pill">{tag}</span>)}
                    </div>
                  )}
                  <pre className="message-text m-0 font-sans">{document.content || "No document content."}</pre>
                </article>
              ) : (
                <EmptyText text="Select the document again to load its content." />
              )}
              {documentQuery.error && <ErrorText text={documentQuery.error.message} />}
            </div>
          </section>

          <section className="workbench-pane">
            <PaneTitle title="Recent Changes" subtitle={`${changesQuery.data?.length ?? 0} records`} />
            <div className="workbench-pane__body">
              {changesQuery.isLoading ? (
                <EmptyText text="Loading changes..." />
              ) : (changesQuery.data ?? []).length === 0 ? (
                <EmptyText text="No knowledge changes yet." />
              ) : (
                <div className="space-y-3">
                  {(changesQuery.data ?? []).map((change) => (
                    <article key={`${change.level}:${change.slug}:${change.createdAt}`} className="rounded-md border p-3" style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <strong className="truncate text-sm">{change.level}/{change.slug}</strong>
                        <span className="badge badge-working">{change.kind}</span>
                      </div>
                      <div className="text-xs leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                        {formatTime(change.createdAt)}
                        {change.summary ? <><br />{change.summary}</> : null}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

function PaneTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="workbench-pane__header">
      <h2 className="truncate text-base font-bold" style={{ color: "var(--color-text-primary)" }}>{title}</h2>
      <p className="mt-1 truncate text-xs" style={{ color: "var(--color-text-secondary)" }}>{subtitle}</p>
    </div>
  );
}

function EmptyText({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed p-8 text-center text-sm" style={{ borderColor: "var(--color-border)", color: "var(--color-text-tertiary)" }}>{text}</div>;
}

function ErrorText({ text }: { text: string }) {
  return <p className="mt-3 text-sm" style={{ color: "var(--color-error)" }}>{text}</p>;
}

function formatTime(value?: string | null): string {
  return value ? new Date(value).toLocaleString("zh-CN") : "-";
}
