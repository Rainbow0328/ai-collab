import type {
  Agent,
  Session,
  MessageRecord,
  SessionInsight,
  AgentQueueStats
} from "@ai-collab/protocol";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

export interface SessionWithMembers extends Session {
  members: Agent[];
}

export interface SessionDetail {
  session: SessionWithMembers;
  queueStats: AgentQueueStats[];
  insight: SessionInsight;
}

export interface MessageListFilter {
  pendingOnly?: boolean;
  claimedOnly?: boolean;
}

export type { Agent, Session, MessageRecord, SessionInsight, AgentQueueStats };
