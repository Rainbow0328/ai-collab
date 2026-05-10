// WebSocket message protocol definitions.

// Client -> server.
export type WsClientMessage =
  | WsPingMessage
  | WsClaimNextMessage
  | WsAckMessage;

export type WsPingMessage = {
  type: "ping";
  timestamp: string;
};

export type WsClaimNextMessage = {
  type: "claim-next";
  types?: string[];
  fromAgentId?: string;
  correlationId?: string;
};

export type WsAckMessage = {
  type: "ack";
  messageId: string;
  processed: boolean;
};

// Server -> client.
export type WsServerMessage =
  | WsPongMessage
  | WsInboxMessageNotification
  | WsMessageClaimedNotification
  | WsProgressUpdateNotification
  | WsConsoleUpdateNotification
  | WsErrorMessage;

export type WsPongMessage = {
  type: "pong";
  timestamp: string;
};

export type WsInboxMessageNotification = {
  type: "inbox:new-message";
  messageId: string;
  fromAgentId: string;
  toAgentId: string;
  messageType: string;
  createdAt: string;
};

export type WsMessageClaimedNotification = {
  type: "inbox:claimed";
  messageId: string;
  claimedBy: string;
  claimedAt: string;
};

export type WsProgressUpdateNotification = {
  type: "progress:update";
  sessionId: string;
  agentId: string;
  agentName: string;
  status: string;
  percentage: number;
  currentStep: string;
  message?: string | null | undefined;
  details?: Record<string, unknown> | undefined;
  updatedAt: string;
};

export type WsConsoleUpdateReason =
  | "message_sent"
  | "message_claimed"
  | "message_completed"
  | "progress_updated"
  | "knowledge_updated"
  | "member_changed";

export type WsConsoleUpdateNotification = {
  type: "console:update";
  sessionId: string;
  reason: WsConsoleUpdateReason;
  updatedAt: string;
};

export type WsErrorMessage = {
  type: "error";
  code: string;
  message: string;
};
