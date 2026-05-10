import type { AgentRole } from "./types.js";

export type AgentProfile = {
  id: string;
  name: string;
  description: string | null;
  defaultModelConfigId: string | null;
  defaultRole: AgentRole | null;
  roleDescription: string | null;
  systemPrompt: string | null;
  defaultParametersJson: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AgentProfileWithSkills = AgentProfile & {
  skillIds: string[];
};

export type CreateAgentProfileInput = {
  name: string;
  description?: string | null;
  defaultModelConfigId?: string | null;
  defaultRole?: AgentRole | null;
  roleDescription?: string | null;
  systemPrompt?: string | null;
  defaultParameters?: Record<string, unknown> | null;
};

export type UpdateAgentProfileInput = {
  name?: string;
  description?: string | null;
  defaultModelConfigId?: string | null;
  defaultRole?: AgentRole | null;
  roleDescription?: string | null;
  systemPrompt?: string | null;
  defaultParameters?: Record<string, unknown> | null;
  enabled?: boolean;
};

export type UpdateAgentProfileSkillsInput = {
  skillIds: string[];
};
