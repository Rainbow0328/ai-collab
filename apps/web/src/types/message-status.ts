import type { MessageRecord, MessageProcessingStatus } from "@ai-collab/protocol";

export type MessageReadStatus = "unread" | "read";

/**
 * 处理状态终态列表 — 基于 protocol 正式定义
 * pending = 待处理（未读）
 * claimed = 已认领（处理中，视为已读）
 * processed = 已处理（终态，视为已读）
 * failed = 失败（终态，视为已读）
 */
const TERMINAL_PROCESSING_STATUSES: MessageProcessingStatus[] = [
  "claimed",
  "processed",
  "failed",
];

/**
 * 检查消息 processingStatus 是否已达终态
 * 基于 protocol 正式字段，而非错误的 status 字段
 */
export function isMessageTerminalProcessingStatus(
  message: Pick<MessageRecord, "processingStatus">
): boolean {
  return TERMINAL_PROCESSING_STATUSES.includes(message.processingStatus);
}

export interface ReadStatusContext {
  isLocallyRead: boolean;
  isTerminalProcessing: boolean;
}

/**
 * 统一消息已读/未读判定规则 — 基于 protocol 正式字段
 *
 * 已读 = 本地已读标记 OR processingStatus 为终态 (claimed/processed/failed)
 * 未读 = !本地已读标记 AND processingStatus === "pending"
 *
 * 语义合同：
 * 1. processingStatus 是后端状态的唯一来源
 * 2. readMessageIds 是本地 UI 标记的唯一来源
 * 3. 两者 OR 关系，任一满足即为已读
 * 4. 永不修改后端字段，本地状态完全独立
 */
export function getMessageReadStatus(
  message: Pick<MessageRecord, "processingStatus" | "id">,
  locallyReadIds?: Set<string> | null
): MessageReadStatus {
  const isTerminal = isMessageTerminalProcessingStatus(message);
  const isLocallyRead = locallyReadIds?.has(message.id) ?? false;
  return isTerminal || isLocallyRead ? "read" : "unread";
}

export function isMessageRead(
  message: Pick<MessageRecord, "processingStatus" | "id">,
  locallyReadIds?: Set<string> | null
): boolean {
  return getMessageReadStatus(message, locallyReadIds) === "read";
}

export function isMessageUnread(
  message: Pick<MessageRecord, "processingStatus" | "id">,
  locallyReadIds?: Set<string> | null
): boolean {
  return !isMessageRead(message, locallyReadIds);
}

/**
 * 从 MessageRecord.payload 安全提取通知内容
 * 基于 protocol 正式结构，不再读取不存在的字段
 */
export function extractNotificationContent(
  message: Pick<MessageRecord, "payload" | "type">
): string {
  if (message.payload === null || message.payload === undefined) {
    return "";
  }

  // payload 可能是 string 或对象，安全提取
  if (typeof message.payload === "string") {
    return message.payload.slice(0, 120);
  }

  if (typeof message.payload === "object") {
    // 尝试提取常见字段
    const p = message.payload as Record<string, unknown>;
    if (p.content && typeof p.content === "string") {
      return p.content.slice(0, 120);
    }
    if (p.message && typeof p.message === "string") {
      return p.message.slice(0, 120);
    }
    if (p.summary && typeof p.summary === "string") {
      return p.summary.slice(0, 120);
    }
    if (p.title && typeof p.title === "string") {
      return p.title.slice(0, 120);
    }
    // 兜底：返回消息类型作为内容
  }

  return message.type || "";
}
