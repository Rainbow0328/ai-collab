import { memo } from 'react';
import type { ConsoleMember } from "./types";
import { clipText, formatDateTime } from "./format";
import { MemberStatusBadge } from "./StatusBadge";
import { useI18n } from '@/i18n';

export const MemberCard = memo(function MemberCard({ member }: { member: ConsoleMember }) {
  const { t } = useI18n();
  return (
    <div
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: "14px",
        background: "var(--color-surface)",
        minWidth: 0,
        transition: "all var(--transition-fast)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--color-accent)";
        e.currentTarget.style.boxShadow = "var(--shadow-md)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--color-border)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "10px" }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: "var(--font-size-md)",
              fontWeight: 700,
              color: "var(--color-text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={member.displayName || member.agentName}
          >
            {member.displayName || member.agentName}
          </div>
          <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-tertiary)", marginTop: "2px" }}>
            {member.role === "host" ? t('role.host') : t('role.worker')}
          </div>
        </div>
        <MemberStatusBadge status={member.status} />
      </div>

      {member.duty && (
        <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.5, marginBottom: "10px" }}>
          {clipText(member.duty, 120)}
        </div>
      )}

      <InfoBlock title={t('member.currentTask')} value={clipText(member.currentTask?.content, 150)} />
      <InfoBlock title={t('member.latestReport')} value={clipText(member.latestReport?.content, 150)} />

      <div style={{ marginTop: "10px", fontSize: "var(--font-size-xs)", color: "var(--color-text-tertiary)" }}>
        {t('heartbeat.lastBeat')}{formatDateTime(member.lastHeartbeatAt)}
      </div>
    </div>
  );
});

function InfoBlock({ title, value }: { title: string; value: string }) {
  return (
    <div style={{ marginTop: "8px" }}>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-tertiary)", marginBottom: "3px" }}>{title}</div>
      <div
        style={{
          fontSize: "var(--font-size-base)",
          color: value === "-" ? "var(--color-text-tertiary)" : "var(--color-text-secondary)",
          lineHeight: 1.5,
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}
