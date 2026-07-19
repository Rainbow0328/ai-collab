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
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import type { DatabaseSync } from "node:sqlite";

import type {
  AgentContextSnapshot,
  ContextTurn,
  UpdateAgentContextSnapshotInput
} from "@loopmarshal/protocol";

type AgentContextRow = {
  runtimeId: string;
  sessionId: string;
  agentId: string;
  role: string;
  conversationSummary: string | null;
  recentTurnsJson: string;
  confirmedDecisionsJson: string;
  unresolvedQuestionsJson: string;
  pendingActionsJson: string;
  lastProcessedMessageId: string | null;
  summaryRevision: number;
  updatedAt: string;
};

const parseJsonStringArray = (value: string): string[] => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
};

const parseTurns = (value: string): ContextTurn[] => {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is ContextTurn =>
          item !== null &&
          typeof item === "object" &&
          typeof (item as { role?: unknown }).role === "string" &&
          typeof (item as { content?: unknown }).content === "string"
      )
      .map((item) => {
        const turn = item as ContextTurn;
        return {
          role: turn.role,
          content: turn.content,
          ...(turn.messageId ? { messageId: turn.messageId } : {}),
          ...(turn.timestamp ? { timestamp: turn.timestamp } : {}),
          ...(turn.important ? { important: turn.important } : {}),
        };
      });
  } catch {
    return [];
  }
};

export class AgentContextRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public findByRuntimeId(runtimeId: string): AgentContextSnapshot | null {
    const row = this.database
      .prepare(
        `SELECT
          runtime_id AS runtimeId,
          session_id AS sessionId,
          agent_id AS agentId,
          role,
          conversation_summary AS conversationSummary,
          recent_turns_json AS recentTurnsJson,
          confirmed_decisions_json AS confirmedDecisionsJson,
          unresolved_questions_json AS unresolvedQuestionsJson,
          pending_actions_json AS pendingActionsJson,
          last_processed_message_id AS lastProcessedMessageId,
          summary_revision AS summaryRevision,
          updated_at AS updatedAt
        FROM agent_context_snapshots
        WHERE runtime_id = ?`
      )
      .get(runtimeId) as AgentContextRow | undefined;

    if (!row) return null;

    return {
      runtimeId: row.runtimeId,
      sessionId: row.sessionId,
      agentId: row.agentId,
      role: row.role,
      conversationSummary: row.conversationSummary,
      recentTurns: parseTurns(row.recentTurnsJson),
      confirmedDecisions: parseJsonStringArray(row.confirmedDecisionsJson),
      unresolvedQuestions: parseJsonStringArray(row.unresolvedQuestionsJson),
      pendingActions: parseJsonStringArray(row.pendingActionsJson),
      lastProcessedMessageId: row.lastProcessedMessageId,
      summaryRevision: row.summaryRevision,
      updatedAt: row.updatedAt,
    };
  }

  public upsert(input: UpdateAgentContextSnapshotInput): AgentContextSnapshot {
    const now = new Date().toISOString();
    const existing = this.findByRuntimeId(input.runtimeId);

    const merged: AgentContextSnapshot = {
      runtimeId: input.runtimeId,
      sessionId: input.sessionId,
      agentId: input.agentId,
      role: input.role,
      conversationSummary: input.conversationSummary ?? existing?.conversationSummary ?? null,
      recentTurns: input.recentTurns ?? existing?.recentTurns ?? [],
      confirmedDecisions: input.confirmedDecisions ?? existing?.confirmedDecisions ?? [],
      unresolvedQuestions: input.unresolvedQuestions ?? existing?.unresolvedQuestions ?? [],
      pendingActions: input.pendingActions ?? existing?.pendingActions ?? [],
      lastProcessedMessageId: input.lastProcessedMessageId ?? existing?.lastProcessedMessageId ?? null,
      summaryRevision: input.summaryRevision ?? existing?.summaryRevision ?? 0,
      updatedAt: now,
    };

    this.database
      .prepare(
        `INSERT INTO agent_context_snapshots (
          runtime_id, session_id, agent_id, role,
          conversation_summary, recent_turns_json,
          confirmed_decisions_json, unresolved_questions_json, pending_actions_json,
          last_processed_message_id, summary_revision, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(runtime_id) DO UPDATE SET
          conversation_summary = COALESCE(excluded.conversation_summary, agent_context_snapshots.conversation_summary),
          recent_turns_json = excluded.recent_turns_json,
          confirmed_decisions_json = excluded.confirmed_decisions_json,
          unresolved_questions_json = excluded.unresolved_questions_json,
          pending_actions_json = excluded.pending_actions_json,
          last_processed_message_id = COALESCE(excluded.last_processed_message_id, agent_context_snapshots.last_processed_message_id),
          summary_revision = excluded.summary_revision,
          updated_at = excluded.updated_at`
      )
      .run(
        merged.runtimeId,
        merged.sessionId,
        merged.agentId,
        merged.role,
        merged.conversationSummary,
        JSON.stringify(merged.recentTurns),
        JSON.stringify(merged.confirmedDecisions),
        JSON.stringify(merged.unresolvedQuestions),
        JSON.stringify(merged.pendingActions),
        merged.lastProcessedMessageId,
        merged.summaryRevision,
        merged.updatedAt
      );

    return merged;
  }

  public deleteByRuntimeId(runtimeId: string): void {
    this.database
      .prepare("DELETE FROM agent_context_snapshots WHERE runtime_id = ?")
      .run(runtimeId);
  }
}
