/**
 * 运行时辅助函数，从 index.ts 提取。
 * 这些函数处理运行时记录的字段提取、消息视图构建和去重逻辑。
 * 它们没有模块级变量依赖，可以安全独立。
 */

import type { WindowProfile } from "../window-profile.js";
import type { WindowRuntimeState } from "../window-runtime-state.js";
import type { MessageRecord } from "@loopmarshal/protocol";

/**
 * 从记录中提取字符串字段。
 */
export const getRuntimeStringField = (
  record: Record<string, unknown>,
  key: string
): string | null => {
  const value = record[key];
  return typeof value === "string" ? value : null;
};

/**
 * 从记录中提取嵌套对象字段。
 */
export const getRuntimeRecordField = (
  record: Record<string, unknown>,
  key: string
): Record<string, unknown> | null => {
  const value = record[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
};

/**
 * 构建窗口调试结果对象。
 */
export const buildWindowDebugResult = (
  profile: WindowProfile,
  commandName: string,
  result: Record<string, unknown>,
  runtimeState: WindowRuntimeState,
  commandTrace?: {
    commandRunId: string;
    tracePath: string;
  }
) => {
  const {
    intervalSeconds: _ignoredIntervalSeconds,
    maxRounds: _ignoredMaxRounds,
    ...sanitizedResult
  } = result;

  return {
    command: commandName,
    window: {
      name: profile.windowName,
      sessionName: profile.sessionName,
      role: profile.role,
      platform: profile.platform,
      identity: profile.identity,
      agentName: profile.agentName
    },
    waitPolicy: {
      ownedByRuntime: true,
      userConfigurable: false,
      doNotChooseIntervalOrRounds: true
    },
    runtimeState,
    ...(commandTrace ? { commandTrace } : {}),
    ...sanitizedResult
  };
};

/**
 * 从 payload 中提取 content 和 result 字段。
 */
export const parseMessagePayloadView = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return {
      content: null,
      result: null
    };
  }

  const payloadRecord = payload as Record<string, unknown>;

  return {
    content:
      typeof payloadRecord.content === "string" ? payloadRecord.content : null,
    result:
      typeof payloadRecord.result === "string" ? payloadRecord.result : null
  };
};

/**
 * 从 payload 中提取 Record 对象，非对象返回 null。
 */
export const extractPayloadRecord = (
  payload: unknown
): Record<string, unknown> | null => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  return payload as Record<string, unknown>;
};

/**
 * 控制消息视图类型。
 */
export type ControlMessageView = {
  messageId: string | null;
  correlationId: string | null;
  type: string | null;
  content: string | null;
  result: string | null;
  payload: unknown;
};

/**
 * 从记录构建控制消息视图。
 */
export const buildControlMessageView = (record: unknown): ControlMessageView | null => {
  const messageRecord =
    record && typeof record === "object" && !Array.isArray(record)
      ? (record as Record<string, unknown>)
      : null;

  if (!messageRecord) {
    return null;
  }

  const payloadView = parseMessagePayloadView(messageRecord.payload ?? null);

  return {
    messageId:
      getRuntimeStringField(messageRecord, "messageId") ??
      getRuntimeStringField(messageRecord, "id"),
    correlationId: getRuntimeStringField(messageRecord, "correlationId"),
    type: getRuntimeStringField(messageRecord, "type"),
    content:
      getRuntimeStringField(messageRecord, "content") ?? payloadView.content,
    result: getRuntimeStringField(messageRecord, "result") ?? payloadView.result,
    payload: messageRecord.payload ?? null
  };
};

/**
 * 向 items 数组追加候选消息视图（支持数组或单条）。
 */
export const appendControlMessageViews = (
  items: ControlMessageView[],
  candidate: unknown
) => {
  if (Array.isArray(candidate)) {
    for (const item of candidate) {
      const view = buildControlMessageView(item);
      if (view) {
        items.push(view);
      }
    }
    return;
  }

  const view = buildControlMessageView(candidate);
  if (view) {
    items.push(view);
  }
};

/**
 * 对控制消息视图按 messageId 去重。
 */
export const dedupeControlMessageViews = (
  items: ControlMessageView[]
): ControlMessageView[] => {
  const seen = new Set<string>();
  const deduped: ControlMessageView[] = [];

  for (const item of items) {
    const key =
      item.messageId ??
      `${item.correlationId ?? ""}:${item.type ?? ""}:${item.content ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
};

/**
 * 从运行时结果推断已领取的消息类型（task 或 report）。
 */
export const inferClaimedMessageKind = (
  result: Record<string, unknown>
): "task" | "report" | null => {
  const messageKind = getRuntimeStringField(result, "messageKind");
  if (messageKind === "task" || messageKind === "report") {
    return messageKind;
  }

  const itemKind = getRuntimeStringField(result, "itemKind");
  if (itemKind === "task" || itemKind === "report") {
    return itemKind;
  }

  const status = getRuntimeStringField(result, "status");
  if (status === "task_claimed" || status === "task-received") {
    return "task";
  }
  if (status === "message_claimed" || status === "report-received") {
    return "report";
  }

  if (result.task || result.tasks) {
    return "task";
  }
  if (result.report || result.reports) {
    return "report";
  }

  return null;
};

/**
 * 从 MessageRecord 构建运行时消息摘要（简化版）。
 */
export const summarizeMessage = (
  message: MessageRecord
): { messageId: string; type: string; content: string | null; result: string | null } => {
  const payloadView = parseMessagePayloadView(message.payload);
  return {
    messageId: message.id,
    type: message.type,
    content: payloadView.content,
    result: payloadView.result
  };
};
