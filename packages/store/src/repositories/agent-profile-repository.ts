import type { DatabaseSync } from "node:sqlite";
import type { SQLInputValue } from "node:sqlite";
import type { AgentProfile, AgentProfileWithSkills } from "@ai-collab/protocol";

export class AgentProfileRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public insert(profile: AgentProfile): void {
    const statement = this.database.prepare(`
      INSERT INTO agent_profiles (id, name, description, default_model_config_id, default_role, role_description, system_prompt, default_parameters_json, enabled, created_at, updated_at)
      VALUES (@id, @name, @description, @defaultModelConfigId, @defaultRole, @roleDescription, @systemPrompt, @defaultParametersJson, @enabled, @createdAt, @updatedAt)
    `);
    statement.run({ ...profile, enabled: profile.enabled ? 1 : 0 });
  }

  public findById(id: string): AgentProfile | null {
    const statement = this.database.prepare(`
      SELECT
        id, name, description, default_model_config_id AS defaultModelConfigId,
        default_role AS defaultRole, role_description AS roleDescription,
        system_prompt AS systemPrompt, default_parameters_json AS defaultParametersJson,
        enabled, created_at AS createdAt, updated_at AS updatedAt
      FROM agent_profiles WHERE id = ?
    `);
    const row = statement.get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return { ...row, enabled: Boolean(row.enabled) } as AgentProfile;
  }

  public findByName(name: string): AgentProfile | null {
    const statement = this.database.prepare(`
      SELECT
        id, name, description, default_model_config_id AS defaultModelConfigId,
        default_role AS defaultRole, role_description AS roleDescription,
        system_prompt AS systemPrompt, default_parameters_json AS defaultParametersJson,
        enabled, created_at AS createdAt, updated_at AS updatedAt
      FROM agent_profiles WHERE name = ?
    `);
    const row = statement.get(name) as Record<string, unknown> | undefined;
    if (!row) return null;
    return { ...row, enabled: Boolean(row.enabled) } as AgentProfile;
  }

  public listAll(): AgentProfile[] {
    const statement = this.database.prepare(`
      SELECT
        id, name, description, default_model_config_id AS defaultModelConfigId,
        default_role AS defaultRole, role_description AS roleDescription,
        system_prompt AS systemPrompt, default_parameters_json AS defaultParametersJson,
        enabled, created_at AS createdAt, updated_at AS updatedAt
      FROM agent_profiles ORDER BY updated_at DESC
    `);
    const rows = statement.all() as Record<string, unknown>[];
    return rows.map((row) => ({ ...row, enabled: Boolean(row.enabled) })) as AgentProfile[];
  }

  public listAllWithSkills(): AgentProfileWithSkills[] {
    const profiles = this.listAll();
    return profiles.map((profile) => {
      const skillIds = this.getSkillIds(profile.id);
      return { ...profile, skillIds };
    });
  }

  public getSkillIds(profileId: string): string[] {
    const statement = this.database.prepare(`
      SELECT skill_id FROM agent_profile_skills WHERE agent_profile_id = ? AND enabled = 1
    `);
    const rows = statement.all(profileId) as { skill_id: string }[];
    return rows.map((r) => r.skill_id);
  }

  public setSkills(profileId: string, skillIds: string[]): void {
    this.database.prepare("DELETE FROM agent_profile_skills WHERE agent_profile_id = ?").run(profileId);
    const insert = this.database.prepare(`
      INSERT OR IGNORE INTO agent_profile_skills (agent_profile_id, skill_id, enabled) VALUES (?, ?, 1)
    `);
    for (const skillId of skillIds) {
      insert.run(profileId, skillId);
    }
  }

  public update(id: string, updates: Record<string, SQLInputValue>): void {
    const fields: string[] = [];
    const values: Record<string, SQLInputValue> = { id };

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        const column = key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
        fields.push(`${column} = @${key}`);
        values[key] = key === "enabled" ? (value ? 1 : 0) : value;
      }
    }

    if (fields.length === 0) return;

    fields.push("updated_at = @updatedAt");
    values.updatedAt = new Date().toISOString();

    this.database.prepare(`UPDATE agent_profiles SET ${fields.join(", ")} WHERE id = @id`).run(values);
  }

  public deleteById(id: string): void {
    this.database.prepare("DELETE FROM agent_profile_skills WHERE agent_profile_id = ?").run(id);
    this.database.prepare("DELETE FROM agent_profiles WHERE id = ?").run(id);
  }
}
