import { randomUUID } from "node:crypto";
import type { SQLInputValue } from "node:sqlite";
import type { AgentProfile, AgentProfileWithSkills, CreateAgentProfileInput, UpdateAgentProfileInput, UpdateAgentProfileSkillsInput } from "@ai-collab/protocol";
import { coreErrors } from "../errors.js";
import type { AgentProfileRepository } from "@ai-collab/store";

export class AgentProfileService {
  public constructor(private readonly repository: AgentProfileRepository) {}

  public create(input: CreateAgentProfileInput): AgentProfile {
    const existing = this.repository.findByName(input.name);
    if (existing) {
      throw coreErrors.duplicateSessionName(input.name);
    }

    const now = new Date().toISOString();
    const profile: AgentProfile = {
      id: randomUUID(),
      name: input.name,
      description: input.description ?? null,
      defaultModelConfigId: input.defaultModelConfigId ?? null,
      defaultRole: input.defaultRole ?? null,
      roleDescription: input.roleDescription ?? null,
      systemPrompt: input.systemPrompt ?? null,
      defaultParametersJson: input.defaultParameters ? JSON.stringify(input.defaultParameters) : null,
      enabled: true,
      createdAt: now,
      updatedAt: now
    };

    this.repository.insert(profile);
    return profile;
  }

  public get(id: string): AgentProfileWithSkills {
    const profile = this.repository.findById(id);
    if (!profile) {
      throw coreErrors.agentNotFound(id);
    }
    const skillIds = this.repository.getSkillIds(id);
    return { ...profile, skillIds };
  }

  public list(): AgentProfileWithSkills[] {
    return this.repository.listAllWithSkills();
  }

  public update(id: string, input: UpdateAgentProfileInput): AgentProfile {
    const existing = this.repository.findById(id);
    if (!existing) {
      throw coreErrors.agentNotFound(id);
    }

    if (input.name && input.name !== existing.name) {
      const nameConflict = this.repository.findByName(input.name);
      if (nameConflict && nameConflict.id !== id) {
        throw coreErrors.duplicateSessionName(input.name);
      }
    }

    const updates: Record<string, SQLInputValue> = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.defaultModelConfigId !== undefined) updates.defaultModelConfigId = input.defaultModelConfigId;
    if (input.defaultRole !== undefined) updates.defaultRole = input.defaultRole;
    if (input.roleDescription !== undefined) updates.roleDescription = input.roleDescription;
    if (input.systemPrompt !== undefined) updates.systemPrompt = input.systemPrompt;
    if (input.defaultParameters !== undefined) updates.defaultParametersJson = JSON.stringify(input.defaultParameters);
    if (input.enabled !== undefined) updates.enabled = input.enabled ? 1 : 0;

    this.repository.update(id, updates);
    return this.repository.findById(id)!;
  }

  public updateSkills(id: string, input: UpdateAgentProfileSkillsInput): AgentProfileWithSkills {
    const existing = this.repository.findById(id);
    if (!existing) {
      throw coreErrors.agentNotFound(id);
    }

    this.repository.setSkills(id, input.skillIds);
    return this.get(id);
  }

  public delete(id: string): { deleted: boolean } {
    const existing = this.repository.findById(id);
    if (!existing) {
      throw coreErrors.agentNotFound(id);
    }
    this.repository.deleteById(id);
    return { deleted: true };
  }
}
