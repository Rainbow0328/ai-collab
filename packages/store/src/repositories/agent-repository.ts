/*
 * Copyright 2024 Cloud Skill Team
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import type { DatabaseSync } from "node:sqlite";

import type {
  Agent,
  UpdateWindowBindingDefaultsInput,
  UpdateWindowRuntimeStateInput,
  WindowBinding
} from "@ai-collab/protocol";

type AgentRow = Omit<Agent, "capabilities"> & { capabilitiesJson: string };

type WindowBindingRow = {
  windowKey: string;
  identity: string;
  sessionId: string;
  sessionName: string;
  agentId: string;
  agentName: string;
  windowName: string;
  displayName: string;
  platform: Agent["platform"];
  role: Agent["role"];
  roleDescription: string | null;
  capabilitiesJson: string;
  connectionMode: Agent["connectionMode"];
  defaultWaitIntervalSeconds: number;
  defaultWaitMaxRounds: number;
  runtimeActiveFlow: string | null;
  runtimeCurrentMessageId: string | null;
  runtimeCurrentCorrelationId: string | null;
  runtimeCurrentMessageKind: "task" | "report" | null;
  runtimeWaitChainId: string | null;
  runtimeWaitChainStatus: string | null;
  runtimeLastPollAt: string | null;
  runtimeLastClaimAt: string | null;
  runtimeLastSubmitAt: string | null;
  runtimePendingInboxCount: number | null;
  runtimeClaimedInboxCount: number | null;
  runtimeLastCommand: string | null;
  runtimeLastStatus: string | null;
  runtimeLastWorkflowStep: string | null;
  runtimeLastAutomationState: string | null;
  runtimeLastTurnDisposition: string | null;
  runtimeUpdatedAt: string | null;
  createdAt: string;
  lastHeartbeatAt: string;
};

export class AgentRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public insert(agent: Agent): void {
    const statement = this.database.prepare(`
      INSERT INTO agents (
        id,
        session_id,
        agent_name,
        display_name,
        platform,
        role,
        role_description,
        capabilities_json,
        connection_mode,
        status,
        last_heartbeat_at,
        created_at,
        default_wait_interval_seconds,
        default_wait_max_rounds
      )
      VALUES (
        @id,
        @sessionId,
        @agentName,
        @displayName,
        @platform,
        @role,
        @roleDescription,
        @capabilitiesJson,
        @connectionMode,
        @status,
        @lastHeartbeatAt,
        @createdAt,
        @defaultWaitIntervalSeconds,
        @defaultWaitMaxRounds
      )
    `);

    statement.run({
      id: agent.id,
      sessionId: agent.sessionId,
      agentName: agent.agentName,
      displayName: agent.displayName,
      platform: agent.platform,
      role: agent.role,
      roleDescription: agent.roleDescription,
      capabilitiesJson: JSON.stringify(agent.capabilities),
      connectionMode: agent.connectionMode,
      status: agent.status,
      lastHeartbeatAt: agent.lastHeartbeatAt,
      createdAt: agent.createdAt,
      defaultWaitIntervalSeconds: 10,
      defaultWaitMaxRounds: 600
    });
  }

  public findById(id: string): Agent | null {
    const statement = this.database.prepare(`
      SELECT
        id,
        session_id AS sessionId,
        agent_name AS agentName,
        display_name AS displayName,
        platform,
        role,
        role_description AS roleDescription,
        capabilities_json AS capabilitiesJson,
        connection_mode AS connectionMode,
        status,
        last_heartbeat_at AS lastHeartbeatAt,
        created_at AS createdAt
      FROM agents
      WHERE id = ?
    `);

    const row = statement.get(id) as AgentRow | undefined;

    if (!row) {
      return null;
    }

    return this.mapAgentRow(row);
  }

  public listBySessionId(sessionId: string): Agent[] {
    const statement = this.database.prepare(`
      SELECT
        id,
        session_id AS sessionId,
        agent_name AS agentName,
        display_name AS displayName,
        platform,
        role,
        role_description AS roleDescription,
        capabilities_json AS capabilitiesJson,
        connection_mode AS connectionMode,
        status,
        last_heartbeat_at AS lastHeartbeatAt,
        created_at AS createdAt
      FROM agents
      WHERE session_id = ?
      ORDER BY created_at ASC
    `);

    const rows = statement.all(sessionId) as AgentRow[];

    return rows.map((row) => this.mapAgentRow(row));
  }

  public findBySessionIdAndAgentName(
    sessionId: string,
    agentName: string,
    role?: Agent["role"]
  ): Agent | null {
    const roleClause = role ? "AND role = @role" : "";
    const statement = this.database.prepare(`
      SELECT
        id,
        session_id AS sessionId,
        agent_name AS agentName,
        display_name AS displayName,
        platform,
        role,
        role_description AS roleDescription,
        capabilities_json AS capabilitiesJson,
        connection_mode AS connectionMode,
        status,
        last_heartbeat_at AS lastHeartbeatAt,
        created_at AS createdAt
      FROM agents
      WHERE session_id = @sessionId
        AND agent_name = @agentName
        ${roleClause}
      LIMIT 1
    `);

    const row = statement.get({
      sessionId,
      agentName,
      ...(role ? { role } : {})
    }) as AgentRow | undefined;

    if (!row) {
      return null;
    }

    return this.mapAgentRow(row);
  }

  public existsBySessionIdAndAgentName(
    sessionId: string,
    agentName: string
  ): boolean {
    const statement = this.database.prepare(`
      SELECT 1
      FROM agents
      WHERE session_id = @sessionId
        AND agent_name = @agentName
      LIMIT 1
    `);
    const row = statement.get({ sessionId, agentName }) as
      | { 1: number }
      | undefined;

    return row !== undefined;
  }

  public deleteById(agentId: string): void {
    const statement = this.database.prepare(`
      DELETE FROM agents
      WHERE id = ?
    `);

    statement.run(agentId);
  }

  public deleteBySessionId(sessionId: string): void {
    const statement = this.database.prepare(`
      DELETE FROM agents
      WHERE session_id = ?
    `);

    statement.run(sessionId);
  }

  public countBySessionId(sessionId: string): number {
    const statement = this.database.prepare(`
      SELECT COUNT(*) AS total
      FROM agents
      WHERE session_id = ?
    `);
    const row = statement.get(sessionId) as { total: number };
    return row.total;
  }

  public updateHeartbeat(agentId: string, lastHeartbeatAt: string): void {
    const statement = this.database.prepare(`
      UPDATE agents
      SET last_heartbeat_at = @lastHeartbeatAt, status = 'idle'
      WHERE id = @agentId
    `);

    statement.run({
      lastHeartbeatAt,
      agentId
    });
  }

  public countOnlineAgents(): number {
    const statement = this.database.prepare(`
      SELECT COUNT(*) AS total
      FROM agents
      WHERE status != 'offline'
    `);

    const row = statement.get() as { total: number };
    return row.total;
  }

  public refreshExistingAgent(input: {
    agentId: string;
    displayName: string;
    platform: Agent["platform"];
    roleDescription: string | null;
    capabilities: string[];
    connectionMode: Agent["connectionMode"];
    lastHeartbeatAt: string;
  }): Agent {
    const statement = this.database.prepare(`
      UPDATE agents
      SET display_name = @displayName,
          platform = @platform,
          role_description = @roleDescription,
          capabilities_json = @capabilitiesJson,
          connection_mode = @connectionMode,
          status = 'idle',
          last_heartbeat_at = @lastHeartbeatAt
      WHERE id = @agentId
    `);

    statement.run({
      agentId: input.agentId,
      displayName: input.displayName,
      platform: input.platform,
      roleDescription: input.roleDescription,
      capabilitiesJson: JSON.stringify(input.capabilities),
      connectionMode: input.connectionMode,
      lastHeartbeatAt: input.lastHeartbeatAt
    });

    const refreshed = this.findById(input.agentId);
    if (!refreshed) {
      throw new Error(`Agent "${input.agentId}" was not found after refresh.`);
    }

    return refreshed;
  }

  public listWindowBindings(sessionName?: string): WindowBinding[] {
    const sessionClause = sessionName ? "WHERE s.name = @sessionName" : "";
    const statement = this.database.prepare(`
      SELECT
        s.name || '::' || a.agent_name AS windowKey,
        s.name || '::' || a.agent_name AS identity,
        s.id AS sessionId,
        s.name AS sessionName,
        a.id AS agentId,
        a.agent_name AS agentName,
        a.agent_name AS windowName,
        a.display_name AS displayName,
        a.platform AS platform,
        a.role AS role,
        a.role_description AS roleDescription,
        a.capabilities_json AS capabilitiesJson,
        a.connection_mode AS connectionMode,
        a.default_wait_interval_seconds AS defaultWaitIntervalSeconds,
        a.default_wait_max_rounds AS defaultWaitMaxRounds,
        a.runtime_active_flow AS runtimeActiveFlow,
        a.runtime_current_message_id AS runtimeCurrentMessageId,
        a.runtime_current_correlation_id AS runtimeCurrentCorrelationId,
        a.runtime_current_message_kind AS runtimeCurrentMessageKind,
        a.runtime_wait_chain_id AS runtimeWaitChainId,
        a.runtime_wait_chain_status AS runtimeWaitChainStatus,
        a.runtime_last_poll_at AS runtimeLastPollAt,
        a.runtime_last_claim_at AS runtimeLastClaimAt,
        a.runtime_last_submit_at AS runtimeLastSubmitAt,
        a.runtime_pending_inbox_count AS runtimePendingInboxCount,
        a.runtime_claimed_inbox_count AS runtimeClaimedInboxCount,
        a.runtime_last_command AS runtimeLastCommand,
        a.runtime_last_status AS runtimeLastStatus,
        a.runtime_last_workflow_step AS runtimeLastWorkflowStep,
        a.runtime_last_automation_state AS runtimeLastAutomationState,
        a.runtime_last_turn_disposition AS runtimeLastTurnDisposition,
        a.runtime_updated_at AS runtimeUpdatedAt,
        a.created_at AS createdAt,
        a.last_heartbeat_at AS lastHeartbeatAt
      FROM agents a
      INNER JOIN sessions s
        ON s.id = a.session_id
      ${sessionClause}
      ORDER BY s.created_at ASC, a.created_at ASC
    `);

    const rows = (sessionName
      ? statement.all({ sessionName })
      : statement.all()) as WindowBindingRow[];

    return rows.map((row) => this.mapWindowBindingRow(row));
  }

  public findWindowBinding(
    sessionName: string,
    windowName: string
  ): WindowBinding | null {
    const statement = this.database.prepare(`
      SELECT
        s.name || '::' || a.agent_name AS windowKey,
        s.name || '::' || a.agent_name AS identity,
        s.id AS sessionId,
        s.name AS sessionName,
        a.id AS agentId,
        a.agent_name AS agentName,
        a.agent_name AS windowName,
        a.display_name AS displayName,
        a.platform AS platform,
        a.role AS role,
        a.role_description AS roleDescription,
        a.capabilities_json AS capabilitiesJson,
        a.connection_mode AS connectionMode,
        a.default_wait_interval_seconds AS defaultWaitIntervalSeconds,
        a.default_wait_max_rounds AS defaultWaitMaxRounds,
        a.runtime_active_flow AS runtimeActiveFlow,
        a.runtime_current_message_id AS runtimeCurrentMessageId,
        a.runtime_current_correlation_id AS runtimeCurrentCorrelationId,
        a.runtime_current_message_kind AS runtimeCurrentMessageKind,
        a.runtime_wait_chain_id AS runtimeWaitChainId,
        a.runtime_wait_chain_status AS runtimeWaitChainStatus,
        a.runtime_last_poll_at AS runtimeLastPollAt,
        a.runtime_last_claim_at AS runtimeLastClaimAt,
        a.runtime_last_submit_at AS runtimeLastSubmitAt,
        a.runtime_pending_inbox_count AS runtimePendingInboxCount,
        a.runtime_claimed_inbox_count AS runtimeClaimedInboxCount,
        a.runtime_last_command AS runtimeLastCommand,
        a.runtime_last_status AS runtimeLastStatus,
        a.runtime_last_workflow_step AS runtimeLastWorkflowStep,
        a.runtime_last_automation_state AS runtimeLastAutomationState,
        a.runtime_last_turn_disposition AS runtimeLastTurnDisposition,
        a.runtime_updated_at AS runtimeUpdatedAt,
        a.created_at AS createdAt,
        a.last_heartbeat_at AS lastHeartbeatAt
      FROM agents a
      INNER JOIN sessions s
        ON s.id = a.session_id
      WHERE s.name = @sessionName
        AND a.agent_name = @windowName
      LIMIT 1
    `);

    const row = statement.get({
      sessionName,
      windowName
    }) as WindowBindingRow | undefined;

    return row ? this.mapWindowBindingRow(row) : null;
  }

  public updateWindowBindingDefaults(
    agentId: string,
    input: UpdateWindowBindingDefaultsInput
  ): WindowBinding | null {
    const statement = this.database.prepare(`
      UPDATE agents
      SET default_wait_interval_seconds = @intervalSeconds,
          default_wait_max_rounds = @maxRounds
      WHERE id = @agentId
    `);

    statement.run({
      agentId,
      intervalSeconds: input.intervalSeconds,
      maxRounds: input.maxRounds
    });

    return this.findWindowBindingByAgentId(agentId);
  }

  public updateWindowRuntimeState(
    agentId: string,
    input: UpdateWindowRuntimeStateInput,
    updatedAt: string
  ): WindowBinding | null {
    const updates = [
      "runtime_active_flow = @activeFlow",
      "runtime_current_message_id = @currentMessageId",
      "runtime_current_correlation_id = @currentCorrelationId",
      "runtime_current_message_kind = @currentMessageKind",
      "runtime_wait_chain_id = @waitChainId",
      "runtime_wait_chain_status = @waitChainStatus",
      "runtime_last_poll_at = @lastPollAt",
      "runtime_last_claim_at = @lastClaimAt",
      "runtime_last_submit_at = @lastSubmitAt",
      "runtime_pending_inbox_count = @pendingInboxCount",
      "runtime_claimed_inbox_count = @claimedInboxCount",
      "runtime_last_command = @lastCommand",
      "runtime_last_status = @lastStatus",
      "runtime_last_workflow_step = @lastWorkflowStep",
      "runtime_last_automation_state = @lastAutomationState",
      "runtime_last_turn_disposition = @lastTurnDisposition",
      "runtime_updated_at = @updatedAt"
    ];
    const statement = this.database.prepare(`
      UPDATE agents
      SET ${updates.join(", ")}
      WHERE id = @agentId
    `);

    statement.run({
      agentId,
      activeFlow:
        input.activeFlow === undefined ? null : input.activeFlow,
      currentMessageId:
        input.currentMessageId === undefined ? null : input.currentMessageId,
      currentCorrelationId:
        input.currentCorrelationId === undefined
          ? null
          : input.currentCorrelationId,
      currentMessageKind:
        input.currentMessageKind === undefined ? null : input.currentMessageKind,
      waitChainId:
        input.waitChainId === undefined ? null : input.waitChainId,
      waitChainStatus:
        input.waitChainStatus === undefined ? null : input.waitChainStatus,
      lastPollAt: input.lastPollAt === undefined ? null : input.lastPollAt,
      lastClaimAt:
        input.lastClaimAt === undefined ? null : input.lastClaimAt,
      lastSubmitAt:
        input.lastSubmitAt === undefined ? null : input.lastSubmitAt,
      pendingInboxCount:
        input.pendingInboxCount === undefined ? null : input.pendingInboxCount,
      claimedInboxCount:
        input.claimedInboxCount === undefined ? null : input.claimedInboxCount,
      lastCommand:
        input.lastCommand === undefined ? null : input.lastCommand,
      lastStatus: input.lastStatus === undefined ? null : input.lastStatus,
      lastWorkflowStep:
        input.lastWorkflowStep === undefined ? null : input.lastWorkflowStep,
      lastAutomationState:
        input.lastAutomationState === undefined
          ? null
          : input.lastAutomationState,
      lastTurnDisposition:
        input.lastTurnDisposition === undefined
          ? null
          : input.lastTurnDisposition,
      updatedAt
    });

    return this.findWindowBindingByAgentId(agentId);
  }

  public clearWindowRuntimeState(
    agentId: string,
    updatedAt: string
  ): WindowBinding | null {
    const statement = this.database.prepare(`
      UPDATE agents
      SET runtime_active_flow = NULL,
          runtime_current_message_id = NULL,
          runtime_current_correlation_id = NULL,
          runtime_current_message_kind = NULL,
          runtime_wait_chain_id = NULL,
          runtime_wait_chain_status = NULL,
          runtime_last_poll_at = NULL,
          runtime_last_claim_at = NULL,
          runtime_last_submit_at = NULL,
          runtime_pending_inbox_count = NULL,
          runtime_claimed_inbox_count = NULL,
          runtime_last_command = NULL,
          runtime_last_status = NULL,
          runtime_last_workflow_step = NULL,
          runtime_last_automation_state = NULL,
          runtime_last_turn_disposition = NULL,
          runtime_updated_at = @updatedAt
      WHERE id = @agentId
    `);

    statement.run({
      agentId,
      updatedAt
    });

    return this.findWindowBindingByAgentId(agentId);
  }

  private findWindowBindingByAgentId(agentId: string): WindowBinding | null {
    const statement = this.database.prepare(`
      SELECT
        s.name || '::' || a.agent_name AS windowKey,
        s.name || '::' || a.agent_name AS identity,
        s.id AS sessionId,
        s.name AS sessionName,
        a.id AS agentId,
        a.agent_name AS agentName,
        a.agent_name AS windowName,
        a.display_name AS displayName,
        a.platform AS platform,
        a.role AS role,
        a.role_description AS roleDescription,
        a.capabilities_json AS capabilitiesJson,
        a.connection_mode AS connectionMode,
        a.default_wait_interval_seconds AS defaultWaitIntervalSeconds,
        a.default_wait_max_rounds AS defaultWaitMaxRounds,
        a.runtime_active_flow AS runtimeActiveFlow,
        a.runtime_current_message_id AS runtimeCurrentMessageId,
        a.runtime_current_correlation_id AS runtimeCurrentCorrelationId,
        a.runtime_current_message_kind AS runtimeCurrentMessageKind,
        a.runtime_wait_chain_id AS runtimeWaitChainId,
        a.runtime_wait_chain_status AS runtimeWaitChainStatus,
        a.runtime_last_poll_at AS runtimeLastPollAt,
        a.runtime_last_claim_at AS runtimeLastClaimAt,
        a.runtime_last_submit_at AS runtimeLastSubmitAt,
        a.runtime_pending_inbox_count AS runtimePendingInboxCount,
        a.runtime_claimed_inbox_count AS runtimeClaimedInboxCount,
        a.runtime_last_command AS runtimeLastCommand,
        a.runtime_last_status AS runtimeLastStatus,
        a.runtime_last_workflow_step AS runtimeLastWorkflowStep,
        a.runtime_last_automation_state AS runtimeLastAutomationState,
        a.runtime_last_turn_disposition AS runtimeLastTurnDisposition,
        a.runtime_updated_at AS runtimeUpdatedAt,
        a.created_at AS createdAt,
        a.last_heartbeat_at AS lastHeartbeatAt
      FROM agents a
      INNER JOIN sessions s
        ON s.id = a.session_id
      WHERE a.id = @agentId
      LIMIT 1
    `);

    const row = statement.get({ agentId }) as WindowBindingRow | undefined;
    return row ? this.mapWindowBindingRow(row) : null;
  }

  private mapAgentRow(row: AgentRow): Agent {
    const { capabilitiesJson, ...agent } = row;
    return {
      ...agent,
      capabilities: JSON.parse(capabilitiesJson) as string[]
    };
  }

  private mapWindowBindingRow(row: WindowBindingRow): WindowBinding {
    return {
      windowKey: row.windowKey,
      identity: row.identity,
      sessionId: row.sessionId,
      sessionName: row.sessionName,
      agentId: row.agentId,
      agentName: row.agentName,
      windowName: row.windowName,
      displayName: row.displayName,
      platform: row.platform,
      role: row.role,
      roleDescription: row.roleDescription,
      capabilities: JSON.parse(row.capabilitiesJson) as string[],
      connectionMode: row.connectionMode,
      defaults: {
        intervalSeconds: row.defaultWaitIntervalSeconds,
        maxRounds: row.defaultWaitMaxRounds
      },
      runtimeState: {
        activeFlow: row.runtimeActiveFlow,
        currentMessageId: row.runtimeCurrentMessageId,
        currentCorrelationId: row.runtimeCurrentCorrelationId,
        currentMessageKind: row.runtimeCurrentMessageKind,
        waitChainId: row.runtimeWaitChainId,
        waitChainStatus: row.runtimeWaitChainStatus,
        lastPollAt: row.runtimeLastPollAt,
        lastClaimAt: row.runtimeLastClaimAt,
        lastSubmitAt: row.runtimeLastSubmitAt,
        pendingInboxCount: row.runtimePendingInboxCount,
        claimedInboxCount: row.runtimeClaimedInboxCount,
        lastCommand: row.runtimeLastCommand,
        lastStatus: row.runtimeLastStatus,
        lastWorkflowStep: row.runtimeLastWorkflowStep,
        lastAutomationState: row.runtimeLastAutomationState,
        lastTurnDisposition: row.runtimeLastTurnDisposition,
        updatedAt: row.runtimeUpdatedAt
      },
      createdAt: row.createdAt,
      lastHeartbeatAt: row.lastHeartbeatAt
    };
  }
}
