import type { AgentRole } from "./types.js";

export type SessionMemberModelBinding = {
  agentId: string;
  modelConfigId: string | null;
  agentProfileId: string | null;
  runtimeParametersJson: string | null;
  systemPrompt?: string | null;
  createdAt: string;
};

export type CreateSessionWithAgentInput = {
  sessionName: string;
  role: "host";
  agentProfileId?: string | null;
  modelConfigId?: string | null;
  agentName: string;
  displayName: string;
  roleDescription?: string | null;
  skillIds?: string[];
  runtimeParameters?: Record<string, unknown> | null;
};

export type JoinSessionWithAgentInput = {
  sessionId: string;
  role: Exclude<AgentRole, "host">;
  agentProfileId?: string | null;
  modelConfigId?: string | null;
  agentName: string;
  displayName: string;
  roleDescription?: string | null;
  runtimeParameters?: Record<string, unknown> | null;
};
