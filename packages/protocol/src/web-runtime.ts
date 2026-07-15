import type { AgentRole } from "./types.js";
import type { McpToolsetId } from "./mcp.js";

export const webAgentRuntimeStatuses = [
  "stopped",
  "running",
  "paused",
  "error"
] as const;

export type WebAgentRuntimeStatus =
  (typeof webAgentRuntimeStatuses)[number];

export type WebAgentRuntime = {
  id: string;
  sessionId: string;
  agentId: string;
  role: Extract<AgentRole, "host" | "knowledge_keeper">;
  modelConfigId: string;
  agentProfileId: string | null;
  toolsetId: McpToolsetId;
  status: WebAgentRuntimeStatus;
  enabled: boolean;
  currentStep: string | null;
  lastError: string | null;
  lastTickAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateWebAgentRuntimeInput = {
  sessionId: string;
  agentId: string;
  role: Extract<AgentRole, "host" | "knowledge_keeper">;
  modelConfigId: string;
  agentProfileId?: string | null;
  toolsetId: McpToolsetId;
};

export type UpdateWebAgentRuntimeInput = {
  modelConfigId?: string;
  agentProfileId?: string | null;
  toolsetId?: McpToolsetId;
  status?: WebAgentRuntimeStatus;
  enabled?: boolean;
  currentStep?: string | null;
  lastError?: string | null;
  lastTickAt?: string | null;
};
