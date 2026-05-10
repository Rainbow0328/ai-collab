import type { ConsoleMemberStatus, ConsoleTaskThreadStatus } from "./types";
import { t } from '@/i18n';

export const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN");
};

export const clipText = (value?: string | null, max = 180) => {
  const normalized = value?.trim();
  if (!normalized) return "-";
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
};

export const memberStatusMeta: Record<
  ConsoleMemberStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  offline: { label: t('status.offline'), bg: "#f3f4f6", text: "#4b5563", dot: "#9ca3af" },
  working: { label: t('status.working'), bg: "#fef3c7", text: "#92400e", dot: "#f59e0b" },
  waiting: { label: t('status.waiting'), bg: "#dcfce7", text: "#166534", dot: "#10b981" },
};

export const threadStatusMeta: Record<
  ConsoleTaskThreadStatus,
  { label: string; bg: string; text: string }
> = {
  pending: { label: t('status.pending'), bg: "#eff6ff", text: "#1d4ed8" },
  working: { label: t('status.working'), bg: "#fef3c7", text: "#92400e" },
  reported: { label: t('status.reported'), bg: "#dcfce7", text: "#166534" },
  failed: { label: t('status.failed'), bg: "#fee2e2", text: "#991b1b" },
};
