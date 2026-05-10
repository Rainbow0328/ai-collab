import type { DatabaseSync } from "node:sqlite";
import type { SessionMemberModelBinding } from "@ai-collab/protocol";

export class SessionBindingRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public insert(binding: SessionMemberModelBinding): void {
    const statement = this.database.prepare(`
      INSERT INTO session_member_model_bindings (agent_id, model_config_id, agent_profile_id, runtime_parameters_json, system_prompt, created_at)
      VALUES (@agentId, @modelConfigId, @agentProfileId, @runtimeParametersJson, @systemPrompt, @createdAt)
    `);
    statement.run(binding);
  }

  public findByAgentId(agentId: string): SessionMemberModelBinding | null {
    const statement = this.database.prepare(`
      SELECT agent_id AS agentId, model_config_id AS modelConfigId, agent_profile_id AS agentProfileId, runtime_parameters_json AS runtimeParametersJson, system_prompt AS systemPrompt, created_at AS createdAt
      FROM session_member_model_bindings WHERE agent_id = ?
    `);
    return (statement.get(agentId) as SessionMemberModelBinding | undefined) ?? null;
  }

  public deleteByAgentId(agentId: string): void {
    this.database.prepare("DELETE FROM session_member_model_bindings WHERE agent_id = ?").run(agentId);
  }

  public deleteBySessionId(sessionId: string): void {
    this.database.prepare(`
      DELETE FROM session_member_model_bindings
      WHERE agent_id IN (SELECT id FROM agents WHERE session_id = ?)
    `).run(sessionId);
  }
}
