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
  /** 上次自主维护触发时间，独立于 lastTickAt 心跳 */
  lastSelfMaintenanceAt: string | null;
  /** 用户创建时选择的外部 MCP Server ID 列表 */
  externalMcpServerIds: string[];
  /** 用户自定义职责描述，注入到 system prompt */
  customDuty: string | null;
  /** 用户额外添加的自定义 Skill ID 列表 */
  customSkillIds: string[];
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
  externalMcpServerIds?: string[];
  customDuty?: string | null;
  customSkillIds?: string[];
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
  lastSelfMaintenanceAt?: string | null;
  externalMcpServerIds?: string[];
  customDuty?: string | null;
  customSkillIds?: string[];
};
