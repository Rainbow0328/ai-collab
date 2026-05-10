import type { DatabaseSync } from "node:sqlite";
import type { SQLInputValue } from "node:sqlite";
import type { SkillDefinition, SessionSkillScope } from "@ai-collab/protocol";

export class SkillRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public insert(skill: SkillDefinition): void {
    const statement = this.database.prepare(`
      INSERT INTO skill_definitions (id, name, description, path, role_scope, source, enabled, created_at, updated_at)
      VALUES (@id, @name, @description, @path, @roleScope, @source, @enabled, @createdAt, @updatedAt)
    `);
    statement.run({ ...skill, enabled: skill.enabled ? 1 : 0 });
  }

  public findById(id: string): SkillDefinition | null {
    const statement = this.database.prepare(`
      SELECT id, name, description, path, role_scope AS roleScope, source, enabled, created_at AS createdAt, updated_at AS updatedAt
      FROM skill_definitions WHERE id = ?
    `);
    const row = statement.get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return { ...row, enabled: Boolean(row.enabled) } as SkillDefinition;
  }

  public findByName(name: string): SkillDefinition | null {
    const statement = this.database.prepare(`
      SELECT id, name, description, path, role_scope AS roleScope, source, enabled, created_at AS createdAt, updated_at AS updatedAt
      FROM skill_definitions WHERE name = ?
    `);
    const row = statement.get(name) as Record<string, unknown> | undefined;
    if (!row) return null;
    return { ...row, enabled: Boolean(row.enabled) } as SkillDefinition;
  }

  public listAll(): SkillDefinition[] {
    const statement = this.database.prepare(`
      SELECT id, name, description, path, role_scope AS roleScope, source, enabled, created_at AS createdAt, updated_at AS updatedAt
      FROM skill_definitions ORDER BY updated_at DESC
    `);
    const rows = statement.all() as Record<string, unknown>[];
    return rows.map((row) => ({ ...row, enabled: Boolean(row.enabled) })) as SkillDefinition[];
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

    this.database.prepare(`UPDATE skill_definitions SET ${fields.join(", ")} WHERE id = @id`).run(values);
  }

  public deleteById(id: string): void {
    this.database.prepare("DELETE FROM agent_profile_skills WHERE skill_id = ?").run(id);
    this.database.prepare("DELETE FROM session_skill_scopes WHERE skill_id = ?").run(id);
    this.database.prepare("DELETE FROM skill_definitions WHERE id = ?").run(id);
  }

  public getSessionSkills(sessionId: string): SessionSkillScope[] {
    const statement = this.database.prepare(`
      SELECT session_id AS sessionId, skill_id AS skillId, enabled, created_at AS createdAt
      FROM session_skill_scopes WHERE session_id = ?
    `);
    const rows = statement.all(sessionId) as Record<string, unknown>[];
    return rows.map((row) => ({ ...row, enabled: Boolean(row.enabled) })) as SessionSkillScope[];
  }

  public setSessionSkills(sessionId: string, skillIds: string[]): void {
    this.database.prepare("DELETE FROM session_skill_scopes WHERE session_id = ?").run(sessionId);
    const insert = this.database.prepare(`
      INSERT OR IGNORE INTO session_skill_scopes (session_id, skill_id, enabled, created_at) VALUES (?, ?, 1, ?)
    `);
    const now = new Date().toISOString();
    for (const skillId of skillIds) {
      insert.run(sessionId, skillId, now);
    }
  }

  public deleteSessionSkills(sessionId: string): void {
    this.database.prepare("DELETE FROM session_skill_scopes WHERE session_id = ?").run(sessionId);
  }

  public listDefinitionsBySessionId(sessionId: string): SkillDefinition[] {
    const statement = this.database.prepare(`
      SELECT sd.id, sd.name, sd.description, sd.path, sd.role_scope AS roleScope, sd.source, sd.enabled, sd.created_at AS createdAt, sd.updated_at AS updatedAt
      FROM skill_definitions sd
      INNER JOIN session_skill_scopes sss ON sd.id = sss.skill_id
      WHERE sss.session_id = ? AND sss.enabled = 1 AND sd.enabled = 1
      ORDER BY sd.name
    `);
    const rows = statement.all(sessionId) as Record<string, unknown>[];
    return rows.map((row) => ({ ...row, enabled: Boolean(row.enabled) })) as SkillDefinition[];
  }
}
