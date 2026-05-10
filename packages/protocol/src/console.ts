import type {
  KnowledgeChangeKind,
  KnowledgeLevel,
  KnowledgeSourceKind,
} from "./knowledge.js";
import type { MessageType, Session } from "./types.js";
import type { Progress } from "./progress.js";

export type ConsoleMemberStatus = "offline" | "working" | "waiting";

export const HOST_TASK_TYPES: readonly MessageType[] = ["instruction", "task"];
export const WORKER_REPORT_TYPES: readonly MessageType[] = ["result", "progress", "error"];
export const HIDDEN_RECENT_MESSAGE_TYPES: readonly MessageType[] = ["heartbeat", "ack"];

export type ConsoleMessageBrief = {
  messageId: string;
  fromAgentId: string;
  toAgentId: string | null;
  type: MessageType;
  content: string;
  result: string | null;
  correlationId: string | null;
  createdAt: string;
  fromAgentName?: string | null;
  toAgentName?: string | null;
  fromRole?: "host" | "worker" | "knowledge_keeper" | null;
  toRole?: "host" | "worker" | "knowledge_keeper" | null;
  kind?: string | null;
  source?: string | null;
  level?: string | null;
  slug?: string | null;
};

export type ConsoleMemberRole = "host" | "worker";

export type ConsoleMember = {
  agentId: string;
  agentName: string;
  displayName: string;
  role: ConsoleMemberRole;
  duty: string | null;
  status: ConsoleMemberStatus;
  lastHeartbeatAt: string | null;
  currentTask: ConsoleMessageBrief | null;
  latestReport: ConsoleMessageBrief | null;
  currentProgress: Progress | null;
  pendingCount: number;
  claimedCount: number;
};

export type ConsoleTaskThreadStatus =
  | "pending"
  | "working"
  | "reported"
  | "failed";

export type ConsoleTaskThread = {
  correlationId: string | null;
  workerAgentId: string | null;
  workerName: string | null;
  hostMessage: ConsoleMessageBrief;
  workerReport: ConsoleMessageBrief | null;
  status: ConsoleTaskThreadStatus;
};

export type ConsoleKnowledgeSummary = {
  counts: Record<KnowledgeLevel, number>;
  recentChanges: Array<{
    level: KnowledgeLevel;
    slug: string;
    kind: KnowledgeChangeKind;
    sourceKind: KnowledgeSourceKind;
    summary: string | null;
    createdAt: string;
  }>;
};

export type SessionIdleInfo = {
  allWorkersWaiting: boolean;
  pendingMessageCount: number;
  claimedMessageCount: number;
  latestWorkerReports: ConsoleMessageBrief[];
  suggestedHostAction: string;
};

export type SessionConsole = {
  session: Session;
  members: ConsoleMember[];
  taskThreads: ConsoleTaskThread[];
  recentMessages: ConsoleMessageBrief[];
  knowledgeSummary: ConsoleKnowledgeSummary;
  idleInfo: SessionIdleInfo;
  generatedAt: string;
};
