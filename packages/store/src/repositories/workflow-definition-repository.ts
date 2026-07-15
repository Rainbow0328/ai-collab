import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { WorkflowDefinitionRecord } from "@ai-collab/protocol";

export class WorkflowDefinitionRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public upsert(workflow: WorkflowDefinitionRecord): void {
    this.database.prepare(`
      INSERT INTO workflow_definitions (
        id, name, description, role, nodes_json, edges_json, enabled, builtin, created_at, updated_at
      )
      VALUES (
        @id, @name, @description, @role, @nodesJson, @edgesJson, @enabled, @builtin, @createdAt, @updatedAt
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        role = excluded.role,
        nodes_json = excluded.nodes_json,
        edges_json = excluded.edges_json,
        enabled = excluded.enabled,
        builtin = excluded.builtin,
        updated_at = excluded.updated_at
    `).run({
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      role: workflow.role,
      nodesJson: JSON.stringify(workflow.nodes),
      edgesJson: JSON.stringify(workflow.edges),
      enabled: workflow.enabled ? 1 : 0,
      builtin: workflow.builtin ? 1 : 0,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt
    });
  }

  public findById(id: string): WorkflowDefinitionRecord | null {
    const row = this.database.prepare(`
      SELECT id, name, description, role, nodes_json AS nodesJson, edges_json AS edgesJson,
        enabled, builtin, created_at AS createdAt, updated_at AS updatedAt
      FROM workflow_definitions WHERE id = ?
    `).get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  public listAll(): WorkflowDefinitionRecord[] {
    const rows = this.database.prepare(`
      SELECT id, name, description, role, nodes_json AS nodesJson, edges_json AS edgesJson,
        enabled, builtin, created_at AS createdAt, updated_at AS updatedAt
      FROM workflow_definitions ORDER BY role ASC, builtin DESC, updated_at DESC
    `).all() as Record<string, unknown>[];
    return rows.map((row) => this.mapRow(row));
  }

  public update(id: string, updates: Record<string, SQLInputValue>): void {
    const fields: string[] = [];
    const values: Record<string, SQLInputValue> = { id };

    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue;
      const column = key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
      fields.push(`${column} = @${key}`);
      values[key] = key === "enabled" || key === "builtin" ? (value ? 1 : 0) : value;
    }

    if (fields.length === 0) return;
    fields.push("updated_at = @updatedAt");
    values.updatedAt = new Date().toISOString();
    this.database.prepare(`UPDATE workflow_definitions SET ${fields.join(", ")} WHERE id = @id`).run(values);
  }

  public deleteById(id: string): void {
    this.database.prepare("DELETE FROM workflow_definitions WHERE id = ? AND builtin = 0").run(id);
  }

  private mapRow(row: Record<string, unknown>): WorkflowDefinitionRecord {
    return {
      id: String(row.id),
      name: String(row.name),
      description: typeof row.description === "string" ? row.description : null,
      role: String(row.role) as WorkflowDefinitionRecord["role"],
      nodes: parseJsonArray(row.nodesJson),
      edges: parseJsonArray(row.edgesJson),
      enabled: Boolean(row.enabled),
      builtin: Boolean(row.builtin),
      createdAt: String(row.createdAt),
      updatedAt: String(row.updatedAt)
    };
  }
}

const parseJsonArray = <T>(value: unknown): T[] => {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
};
