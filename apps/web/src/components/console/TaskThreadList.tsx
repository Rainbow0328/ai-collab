import { memo } from "react";
import type { CSSProperties } from "react";
import type { ConsoleTaskThread, ConsoleTaskThreadStatus } from "./types";
import { clipText, formatDateTime } from "./format";
import { ThreadStatusBadge } from "./StatusBadge";
import { EmptyState } from "@/components/shared";
import { useI18n } from '@/i18n';

type TaskThreadListProps = {
  threads: ConsoleTaskThread[];
  title?: string;
  maxItems?: number;
  statusFilter?: ConsoleTaskThreadStatus | "all";
  workerFilter?: string;
};

export const TaskThreadList = memo(function TaskThreadList({
  threads,
  title,
  maxItems,
  statusFilter = "all",
  workerFilter = "all",
}: TaskThreadListProps) {
  const { t } = useI18n();
  const displayTitle = title ?? t('taskThread.title');
  const filtered = threads
    .filter((thread) => statusFilter === "all" || thread.status === statusFilter)
    .filter((thread) => workerFilter === "all" || thread.workerAgentId === workerFilter);
  const visibleThreads = maxItems ? filtered.slice(0, maxItems) : filtered;

  return (
    <section style={panelStyle}>
      <div style={sectionHeaderStyle}>
        <h2 style={sectionTitleStyle}>{displayTitle}</h2>
        <span style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-tertiary)" }}>{filtered.length}{t('common.items')}</span>
      </div>

      {visibleThreads.length === 0 ? (
        <EmptyState variant="compact" message={t('taskThread.noThreads')} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {visibleThreads.map((thread) => (
            <article key={thread.hostMessage.messageId} style={threadStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "10px" }}>
                <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)" }}>
                  Host {"->"} <strong style={{ color: "var(--color-text-primary)" }}>{thread.workerName ?? t('taskThread.unassigned')}</strong>
                </div>
                <ThreadStatusBadge status={thread.status} />
              </div>

              <MessageBlock label={t('taskThread.task')} text={thread.hostMessage.content} time={thread.hostMessage.createdAt} />
              <div style={{ height: "1px", background: "var(--color-border-light)", margin: "10px 0" }} />
              {thread.workerReport ? (
                <MessageBlock label={t('taskThread.report')} text={thread.workerReport.content} time={thread.workerReport.createdAt} />
              ) : (
                <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-tertiary)" }}>{t('taskThread.noReport')}</div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
});

function MessageBlock({ label, text, time }: { label: string; text: string; time: string }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "4px" }}>
        <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", fontWeight: 700 }}>{label}</span>
        <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-tertiary)" }}>{formatDateTime(time)}</span>
      </div>
      <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", lineHeight: 1.6, wordBreak: "break-word" }}>
        {clipText(text, 260)}
      </div>
    </div>
  );
}

const panelStyle = {
  background: "var(--color-surface)",
  borderRadius: "var(--radius-md)",
  padding: "18px",
  boxShadow: "var(--shadow-sm)",
} satisfies CSSProperties;

const sectionHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "14px",
} satisfies CSSProperties;

const sectionTitleStyle = {
  fontSize: "var(--font-size-xl)",
  fontWeight: 700,
  color: "var(--color-text-primary)",
} satisfies CSSProperties;

const threadStyle = {
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  padding: "14px",
  background: "var(--color-surface)",
  transition: "border-color var(--transition-fast)",
} satisfies CSSProperties;
