import { memo } from "react";
import type { ConsoleMember } from "./types";
import { clipText, formatDateTime } from "./format";
import { useI18n } from '@/i18n';

export const RecentReports = memo(function RecentReports({ members, maxItems = 6 }: { members: ConsoleMember[]; maxItems?: number }) {
  const { t } = useI18n();
  const reports = members
    .filter((member) => member.role === "worker" && member.latestReport)
    .map((member) => ({
      member,
      report: member.latestReport!,
    }))
    .sort((left, right) => right.report.createdAt.localeCompare(left.report.createdAt))
    .slice(0, maxItems);

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
        <h2 style={{ fontSize: "var(--font-size-xl)", fontWeight: 700, color: "var(--color-text-primary)" }}>{t('recentReports.title')}</h2>
        <span style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-tertiary)" }}>{reports.length}{t('common.items')}</span>
      </div>

      {reports.length === 0 ? (
        <div style={{ padding: "24px", textAlign: "center", color: "var(--color-text-tertiary)", fontSize: "var(--font-size-md)" }}>
          {t('recentReports.noReports')}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {reports.map(({ member, report }) => (
            <div key={report.messageId} style={{ borderBottom: "1px solid var(--color-border-light)", paddingBottom: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", marginBottom: "4px" }}>
                <strong style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-primary)" }}>{member.agentName}</strong>
                <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-tertiary)" }}>{formatDateTime(report.createdAt)}</span>
              </div>
              <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
                {clipText(report.content, 220)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
});
