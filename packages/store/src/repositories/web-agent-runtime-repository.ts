import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { WebAgentRuntime } from "@ai-collab/protocol";

type WebAgentRuntimeRow = {
  id: string;
  sessionId: string;
  agentId: string;
  role: string;
  modelConfigId: string;
  agentProfileId: string | null;
  toolsetId: string;
  status: string;
  enabled: number;
  currentStep: string | null;
  lastError: string | null;
  lastTickAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export class WebAgentRuntimeRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public upsert(runtime: WebAgentRuntime): void {
    const statement = this.database.prepare(`
      INSERT INTO web_agent_runtimes (
        id, session_id, agent_id, role, model_config_id, agent_profile_id,
        toolset_id, status, enabled, current_step, last_error, last_tick_at,
        created_at, updated_at
      )
      VALUES (
        @id, @sessionId, @agentId, @role, @modelConfigId, @agentProfileId,
        @toolsetId, @status, @enabled, @currentStep, @lastError, @lastTickAt,
        @createdAt, @updatedAt
      )
      ON CONFLICT(agent_id) DO UPDATE SET
        session_id = excluded.session_id,
        role = excluded.role,
        model_config_id = excluded.model_config_id,
        agent_profile_id = excluded.agent_profile_id,
        toolset_id = excluded.toolset_id,
        status = excluded.status,
        enabled = excluded.enabled,
        current_step = excluded.current_step,
        last_error = excluded.last_error,
        last_tick_at = excluded.last_tick_at,
        updated_at = excluded.updated_at
    `);
    statement.run({
      ...runtime,
      enabled: runtime.enabled ? 1 : 0
    });
  }

  public findById(id: string): WebAgentRuntime | null {
    const row = this.database.prepare(`
      SELECT
        id,
        session_id AS sessionId,
        agent_id AS agentId,
        role,
        model_config_id AS modelConfigId,
        agent_profile_id AS agentProfileId,
        toolset_id AS toolsetId,
        status,
        enabled,
        current_step AS currentStep,
        last_error AS lastError,
        last_tick_at AS lastTickAt,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM web_agent_runtimes
      WHERE id = ?
    `).get(id) as WebAgentRuntimeRow | undefined;
    return row ? this.mapRow(row) : null;
  }

  public findByAgentId(agentId: string): WebAgentRuntime | null {
    const row = this.database.prepare(`
      SELECT
        id,
        session_id AS sessionId,
        agent_id AS agentId,
        role,
        model_config_id AS modelConfigId,
        agent_profile_id AS agentProfileId,
        toolset_id AS toolsetId,
        status,
        enabled,
        current_step AS currentStep,
        last_error AS lastError,
        last_tick_at AS lastTickAt,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM web_agent_runtimes
      WHERE agent_id = ?
    `).get(agentId) as WebAgentRuntimeRow | undefined;
    return row ? this.mapRow(row) : null;
  }

  public listBySessionId(sessionId: string): WebAgentRuntime[] {
    const rows = this.database.prepare(`
      SELECT
        id,
        session_id AS sessionId,
        agent_id AS agentId,
        role,
        model_config_id AS modelConfigId,
        agent_profile_id AS agentProfileId,
        toolset_id AS toolsetId,
        status,
        enabled,
        current_step AS currentStep,
        last_error AS lastError,
        last_tick_at AS lastTickAt,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM web_agent_runtimes
      WHERE session_id = ?
      ORDER BY updated_at DESC
    `).all(sessionId) as WebAgentRuntimeRow[];
    return rows.map((row) => this.mapRow(row));
  }

  public listRunningEnabled(): WebAgentRuntime[] {
    const rows = this.database.prepare(`
      SELECT
        id,
        session_id AS sessionId,
        agent_id AS agentId,
        role,
        model_config_id AS modelConfigId,
        agent_profile_id AS agentProfileId,
        toolset_id AS toolsetId,
        status,
        enabled,
        current_step AS currentStep,
        last_error AS lastError,
        last_tick_at AS lastTickAt,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM web_agent_runtimes
      WHERE status = 'running' AND enabled = 1
    `).all() as WebAgentRuntimeRow[];
    return rows.map((row) => this.mapRow(row));
  }

  public update(id: string, updates: Record<string, SQLInputValue>): void {
    const fields: string[] = [];
    const values: Record<string, SQLInputValue> = { id };

    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue;
      const column = key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
      fields.push(`${column} = @${key}`);
      values[key] = key === "enabled" ? (value ? 1 : 0) : value;
    }

    if (fields.length === 0) return;
    fields.push("updated_at = @updatedAt");
    values.updatedAt = new Date().toISOString();
    this.database.prepare(`
      UPDATE web_agent_runtimes
      SET ${fields.join(", ")}
      WHERE id = @id
    `).run(values);
  }

  public deleteById(id: string): void {
    this.database.prepare("DELETE FROM web_agent_runtimes WHERE id = ?").run(id);
  }

  private mapRow(row: WebAgentRuntimeRow): WebAgentRuntime {
    return {
      id: row.id,
      sessionId: row.sessionId,
      agentId: row.agentId,
      role: row.role as WebAgentRuntime["role"],
      modelConfigId: row.modelConfigId,
      agentProfileId: row.agentProfileId,
      toolsetId: row.toolsetId as WebAgentRuntime["toolsetId"],
      status: row.status as WebAgentRuntime["status"],
      enabled: Boolean(row.enabled),
      currentStep: row.currentStep,
      lastError: row.lastError,
      lastTickAt: row.lastTickAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }
}
