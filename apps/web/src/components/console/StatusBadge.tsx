import { memo } from "react";
import type { ConsoleMemberStatus, ConsoleTaskThreadStatus } from "./types";
import type { SessionStatus } from "@ai-collab/protocol";
import { memberStatusMeta, threadStatusMeta } from "./format";
import { t } from '@/i18n';

const sessionStatusMeta: Record<SessionStatus, { bg: string; text: string; dot: string; label: string }> = {
  active: { bg: "#dcfce7", text: "#166534", dot: "#10b981", label: t('status.active') },
  paused: { bg: "#fef3c7", text: "#92400e", dot: "#f59e0b", label: t('status.paused') },
  closed: { bg: "#f3f4f6", text: "#6b7280", dot: "#9ca3af", label: t('status.closed') },
};

export const StatusBadge = memo(function StatusBadge({ status }: { status: SessionStatus }) {
  const meta = sessionStatusMeta[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "4px 9px",
        borderRadius: "var(--radius-full)",
        background: meta.bg,
        color: meta.text,
        fontSize: "var(--font-size-sm)",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: "7px",
          height: "7px",
          borderRadius: "50%",
          background: meta.dot,
          boxShadow: `0 0 4px ${meta.dot}`,
        }}
      />
      {meta.label}
    </span>
  );
});

export const MemberStatusBadge = memo(function MemberStatusBadge({ status }: { status: ConsoleMemberStatus }) {
  const meta = memberStatusMeta[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "4px 9px",
        borderRadius: "var(--radius-full)",
        background: meta.bg,
        color: meta.text,
        fontSize: "var(--font-size-sm)",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: "7px",
          height: "7px",
          borderRadius: "50%",
          background: meta.dot,
          boxShadow: `0 0 4px ${meta.dot}`,
        }}
      />
      {meta.label}
    </span>
  );
});

export const ThreadStatusBadge = memo(function ThreadStatusBadge({ status }: { status: ConsoleTaskThreadStatus }) {
  const meta = threadStatusMeta[status];
  return (
    <span
      style={{
        display: "inline-flex",
        padding: "4px 9px",
        borderRadius: "var(--radius-full)",
        background: meta.bg,
        color: meta.text,
        fontSize: "var(--font-size-sm)",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {meta.label}
    </span>
  );
});
