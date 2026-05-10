import type {
  Progress as ProtocolProgress,
  ProgressStatus,
  UpsertProgressInput,
  ListProgressFilter,
} from "@ai-collab/protocol";

export type { ProgressStatus, UpsertProgressInput, ListProgressFilter };

export type Progress = ProtocolProgress;

export interface ProgressState {
  byAgent: Record<string, Progress>;
  bySession: Record<string, string[]>;
  loading: boolean;
  lastFetchedAt?: string;
}

export interface ProgressEvent {
  id: string;
  sessionId: string;
  agentId: string;
  type: "update" | "clear";
  timestamp: string;
  data?: Progress;
}
