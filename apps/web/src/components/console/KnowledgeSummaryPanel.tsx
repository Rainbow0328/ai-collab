import { memo } from "react";
import type { ConsoleKnowledgeSummary } from "./types";
import { formatDateTime } from "./format";
import { getSourceKindLabel } from "@/components/shared";
import { useI18n } from '@/i18n';

export const KnowledgeSummaryPanel = memo(function KnowledgeSummaryPanel({ summary }: { summary: ConsoleKnowledgeSummary | null }) {
  const { t } = useI18n();
  const counts = summary?.counts ?? { l1: 0, l2: 0, l3: 0 };
  const changes = summary?.recentChanges ?? [];

  return (
    <section
      style={{
        background: "var(--color-surface)",
        borderRadius: "var(--radius-md)",
        padding: "18px",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
        <h2 style={{ fontSize: "var(--font-size-xl)", fontWeight: 700, color: "var(--color-text-primary)" }}>{t('knowledgeSummary.overview')}</h2>
        <span style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-tertiary)" }}>
          L1 {counts.l1} / L2 {counts.l2} / L3 {counts.l3}
        </span>
      </div>

      {changes.length === 0 ? (
        <div style={{ padding: "24px", textAlign: "center", color: "var(--color-text-tertiary)", fontSize: "var(--font-size-md)" }}>
          {t('knowledgeSummary.noChanges')}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {changes.slice(0, 6).map((change) => (
            <div
              key={`${change.level}:${change.slug}:${change.createdAt}`}
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                padding: "10px 12px",
                transition: "border-color var(--transition-fast)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", marginBottom: "4px" }}>
                <div style={{ fontSize: "var(--font-size-base)", fontWeight: 700, color: "var(--color-text-primary)" }}>
                  {change.level.toUpperCase()} / {change.slug}
                </div>
                <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-tertiary)", whiteSpace: "nowrap" }}>
                  {formatDateTime(change.createdAt)}
                </div>
              </div>
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
                {change.kind} · {getSourceKindLabel(change.sourceKind)}
                {change.summary ? ` · ${change.summary}` : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
});
