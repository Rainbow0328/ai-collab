import type { MessageRecord, MessageType as ProtocolMessageType } from '@ai-collab/protocol';

/**
 * 消息类型枚举
 * 与协议层 MessageType 对齐
 */
export type MessageType = ProtocolMessageType;

/**
 * 消息列表项数据结构
 * 基于协议层 MessageRecord，补充展示层字段
 */
export interface MessageItem extends MessageRecord {
  // 协议层已有：id, sessionId, fromAgentId, type, createdAt, payload, etc.
  senderName: string;
  senderRole?: string;
  senderAvatar?: string;
  summary?: string;
  isRead: boolean;
  tags?: string[];
  attachments?: number;
}

/**
 * 消息详情数据结构
 */
export interface MessageDetail extends MessageItem {
  content: string;
  formattedContent?: string;
  relatedTaskId?: string;
  relatedTaskTitle?: string;
  updatedAt?: string;
}

/**
 * 实时通知类型
 */
export type NotificationType = 'info' | 'success' | 'warning' | 'error';

/**
 * 实时通知数据结构
 */
export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  content: string;
  timestamp: string;
  isRead: boolean;
  relatedMessageId?: string;
}

/**
 * 消息过滤选项
 */
export interface MessageFilter {
  type?: MessageType;
  senderName?: string;
  isRead?: boolean;
  startDate?: string;
  endDate?: string;
  query?: string;
}
