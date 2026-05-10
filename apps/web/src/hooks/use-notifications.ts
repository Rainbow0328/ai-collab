import { useMemo } from "react";
import type { MessageRecord } from "@/types";
import { useMessagesBySession, useReadMessageIds } from "@/state/message-store";
import { isMessageRead, extractNotificationContent } from "@/types/message-status";

export type NotificationType = "info" | "success" | "warning" | "error";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  sourceMessageId: string;
  sourceAgentId: string;
  importance: "high" | "medium" | "low";
}

/**
 * 从 MessageProcessingStatus 派生通知类型
 * 基于 protocol 正式字段
 */
function deriveTypeFromMessage(message: Pick<MessageRecord, "type" | "processingStatus">): NotificationType {
  if (message.processingStatus === "failed") return "error";
  if (message.processingStatus === "processed") return "success";
  if (message.type === "error") return "error";
  if (message.type === "result") return "success";
  if (message.type === "task") return "info";
  if (message.type === "system") return "info";
  if (message.type === "progress") return "info";
  return "info";
}

/**
 * 从消息类型派生重要度
 * 基于 protocol 正式字段
 */
function deriveImportanceFromMessage(message: Pick<MessageRecord, "type" | "processingStatus">): "high" | "medium" | "low" {
  if (message.type === "error") return "high";
  if (message.processingStatus === "failed") return "high";
  if (message.type === "task") return "medium";
  if (message.processingStatus === "processed") return "medium";
  return "low";
}

function messageToNotification(
  message: MessageRecord,
  readMessageIds: Set<string>
): Notification {
  return {
    id: `notif-${message.id}`,
    type: deriveTypeFromMessage(message),
    title: message.type || "Notification",
    message: extractNotificationContent(message),
    createdAt: message.createdAt,
    read: isMessageRead(message, readMessageIds),
    sourceMessageId: message.id,
    sourceAgentId: message.fromAgentId, // 基于 protocol 正式字段
    importance: deriveImportanceFromMessage(message),
  };
}

export function useNotifications(sessionId?: string) {
  const messages = useMessagesBySession(sessionId ?? "");
  const readMessageIds = useReadMessageIds();

  const notifications = useMemo(() => {
    return messages
      .filter((m) => m.type !== "heartbeat" && m.type !== "ack")
      .slice(0, 50)
      .map((m) => messageToNotification(m, readMessageIds));
  }, [messages, readMessageIds]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const byType = useMemo(() => {
    return notifications.reduce((acc, n) => {
      if (!acc[n.type]) acc[n.type] = [];
      acc[n.type].push(n);
      return acc;
    }, {} as Record<NotificationType, Notification[]>);
  }, [notifications]);

  const byImportance = useMemo(() => {
    return notifications.reduce((acc, n) => {
      if (!acc[n.importance]) acc[n.importance] = [];
      acc[n.importance].push(n);
      return acc;
    }, {} as Record<"high" | "medium" | "low", Notification[]>);
  }, [notifications]);

  return {
    notifications,
    unreadCount,
    byType,
    byImportance,
    highPriority: byImportance.high || [],
    mediumPriority: byImportance.medium || [],
    lowPriority: byImportance.low || [],
  };
}

export function useLatestNotification(sessionId?: string) {
  const { notifications } = useNotifications(sessionId);
  return notifications[0] || null;
}

export function useUnreadNotificationCount(sessionId?: string) {
  const { unreadCount } = useNotifications(sessionId);
  return unreadCount;
}
