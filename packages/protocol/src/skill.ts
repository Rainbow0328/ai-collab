import type { AgentRole } from "./types.js";

export const skillSources = ["local_scan", "manual"] as const;
export type SkillSource = (typeof skillSources)[number];

export type SkillDefinition = {
  id: string;
  name: string;
  description: string | null;
  path: string;
  roleScope: AgentRole | null;
  source: SkillSource;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SessionSkillScope = {
  sessionId: string;
  skillId: string;
  enabled: boolean;
  createdAt: string;
};

export type ScanSkillsResult = {
  scanned: number;
  added: number;
  updated: number;
  skills: SkillDefinition[];
};
