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
  AgentQueueStats,
  MessageRecord,
  MessageType
} from "@loopmarshal/protocol";

type MessageRow = Omit<MessageRecord, "payload"> & {
  payloadJson: string;
};

export type AtomicInsertResult = {
  message: MessageRecord;
  idempotent: boolean;
  supersededMessageIds: string[];
};

export class MessageRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public insert(message: MessageRecord): void {
    const statement = this.database.prepare(`
      INSERT INTO messages (
        id,
        session_id,
        from_agent_id,
        to_agent_id,
        type,
        payload_json,
        idempotency_key,
        correlation_id,
        delivery_status,
        processing_status,
        claimed_by_agent_id,
        claimed_at,
        processed_at,
        failed_at,
        failure_reason,
        created_at
      )
      VALUES (
        @id,
        @sessionId,
        @fromAgentId,
        @toAgentId,
        @type,
        @payloadJson,
        @idempotencyKey,
        @correlationId,
        @deliveryStatus,
        @processingStatus,
        @claimedByAgentId,
        @claimedAt,
        @processedAt,
        @failedAt,
        @failureReason,
        @createdAt
      )
    `);

    statement.run({
      id: message.id,
      sessionId: message.sessionId,
      fromAgentId: message.fromAgentId,
      toAgentId: message.toAgentId ?? null,
      type: message.type,
      payloadJson: JSON.stringify(message.payload),
      idempotencyKey: message.idempotencyKey ?? null,
      correlationId: message.correlationId ?? null,
      deliveryStatus: message.deliveryStatus,
      processingStatus: message.processingStatus,
      claimedByAgentId: message.claimedByAgentId ?? null,
      claimedAt: message.claimedAt ?? null,
      processedAt: message.processedAt ?? null,
      failedAt: message.failedAt ?? null,
      failureReason: message.failureReason ?? null,
      createdAt: message.createdAt
    });
  }

  public insertAtomically(input: {
    message: MessageRecord;
    supersedeMessageIds?: string[];
    processedAt: string;
  }): AtomicInsertResult | null {
    const supersedeMessageIds = [...new Set(input.supersedeMessageIds ?? [])];
    this.database.exec("BEGIN IMMEDIATE");
    try {
      if (input.message.idempotencyKey) {
        const existing = this.findByIdempotencyKey(
          input.message.sessionId,
          input.message.fromAgentId,
          input.message.idempotencyKey
        );
        if (existing) {
          this.database.exec("COMMIT");
          return {
            message: existing,
            idempotent: true,
            supersededMessageIds: []
          };
        }
      }

      if (
        supersedeMessageIds.length > 0 &&
        !this.validateSupersededMessages(input.message, supersedeMessageIds)
      ) {
        this.database.exec("ROLLBACK");
        return null;
      }

      try {
        this.insert(input.message);
      } catch (error) {
        if (
          input.message.idempotencyKey &&
          this.isUniqueIdempotencyViolation(error)
        ) {
          const existing = this.findByIdempotencyKey(
            input.message.sessionId,
            input.message.fromAgentId,
            input.message.idempotencyKey
          );
          if (existing) {
            this.database.exec("COMMIT");
            return {
              message: existing,
              idempotent: true,
              supersededMessageIds: []
            };
          }
        }

        throw error;
      }

      if (supersedeMessageIds.length > 0) {
        const updatedCount = this.markSupersededMessagesProcessed(
          supersedeMessageIds,
          input.processedAt
        );
        if (updatedCount !== supersedeMessageIds.length) {
          this.database.exec("ROLLBACK");
          return null;
        }
      }

      this.database.exec("COMMIT");
      return {
        message: input.message,
        idempotent: false,
        supersededMessageIds: supersedeMessageIds
      };
    } catch (error) {
      this.safeRollback();
      throw error;
    }
  }

  public findById(messageId: string): MessageRecord | null {
    const statement = this.database.prepare(`
      SELECT
        id,
        session_id AS sessionId,
        from_agent_id AS fromAgentId,
        to_agent_id AS toAgentId,
        type,
        payload_json AS payloadJson,
        idempotency_key AS idempotencyKey,
        correlation_id AS correlationId,
        delivery_status AS deliveryStatus,
        processing_status AS processingStatus,
        claimed_by_agent_id AS claimedByAgentId,
        claimed_at AS claimedAt,
        processed_at AS processedAt,
        failed_at AS failedAt,
        failure_reason AS failureReason,
        created_at AS createdAt
      FROM messages
      WHERE id = ?
    `);

    const row = statement.get(messageId) as MessageRow | undefined;
    return row ? this.mapRow(row) : null;
  }

  public findByIdempotencyKey(
    sessionId: string,
    fromAgentId: string,
    idempotencyKey: string
  ): MessageRecord | null {
    const statement = this.database.prepare(`
      SELECT
        id,
        session_id AS sessionId,
        from_agent_id AS fromAgentId,
        to_agent_id AS toAgentId,
        type,
        payload_json AS payloadJson,
        idempotency_key AS idempotencyKey,
        correlation_id AS correlationId,
        delivery_status AS deliveryStatus,
        processing_status AS processingStatus,
        claimed_by_agent_id AS claimedByAgentId,
        claimed_at AS claimedAt,
        processed_at AS processedAt,
        failed_at AS failedAt,
        failure_reason AS failureReason,
        created_at AS createdAt
      FROM messages
      WHERE session_id = @sessionId
        AND from_agent_id = @fromAgentId
        AND idempotency_key = @idempotencyKey
      ORDER BY created_at ASC
      LIMIT 1
    `);

    const row = statement.get({
      sessionId,
      fromAgentId,
      idempotencyKey
    }) as MessageRow | undefined;

    return row ? this.mapRow(row) : null;
  }

  public listInboxForAgent(
    agentId: string,
    options: {
      pendingOnly?: boolean;
      claimedOnly?: boolean;
    } = {}
  ): MessageRecord[] {
    const sessionStatement = this.database.prepare(`
      SELECT session_id AS sessionId
      FROM agents
      WHERE id = ?
    `);
    const agentRow = sessionStatement.get(agentId) as { sessionId: string } | undefined;
    if (!agentRow) {
      return [];
    }

    const statement = this.database.prepare(`
      SELECT
        id,
        session_id AS sessionId,
        from_agent_id AS fromAgentId,
        to_agent_id AS toAgentId,
        type,
        payload_json AS payloadJson,
        idempotency_key AS idempotencyKey,
        correlation_id AS correlationId,
        delivery_status AS deliveryStatus,
        processing_status AS processingStatus,
        claimed_by_agent_id AS claimedByAgentId,
        claimed_at AS claimedAt,
        processed_at AS processedAt,
        failed_at AS failedAt,
        failure_reason AS failureReason,
        created_at AS createdAt
      FROM messages
      WHERE session_id = @sessionId
        AND (to_agent_id = @agentId OR to_agent_id IS NULL)
        AND (@pendingOnly = 0 OR processing_status = 'pending')
        AND (
          @claimedOnly = 0 OR
          (claimed_by_agent_id = @agentId AND processing_status = 'claimed')
        )
      ORDER BY created_at ASC
    `);

    const rows = statement.all({
      sessionId: agentRow.sessionId,
      agentId,
      pendingOnly: options.pendingOnly ? 1 : 0,
      claimedOnly: options.claimedOnly ? 1 : 0
    }) as MessageRow[];

    return rows.map((row) => this.mapRow(row));
  }

  public claimNextForAgent(
    agentId: string,
    claimedAt: string,
    options: {
      types?: MessageType[];
      fromAgentId?: string;
      correlationId?: string;
    } = {}
  ): MessageRecord | null {
    const sessionStatement = this.database.prepare(`
      SELECT session_id AS sessionId
      FROM agents
      WHERE id = ?
    `);
    const agentRow = sessionStatement.get(agentId) as
      | { sessionId: string }
      | undefined;
    if (!agentRow) {
      return null;
    }

    if (options.types && options.types.length === 0) {
      return null;
    }

    const typeFilter = options.types
      ? `AND type IN (${options.types
          .map((_, index) => `@type${index}`)
          .join(", ")})`
      : "";
    const fromAgentFilter = options.fromAgentId
      ? "AND from_agent_id = @fromAgentId"
      : "";
    const correlationFilter = options.correlationId
      ? "AND correlation_id = @correlationId"
      : "";

    const statement = this.database.prepare(`
      WITH target AS (
        SELECT id
        FROM messages
        WHERE session_id = @sessionId
          AND to_agent_id = @agentId
          AND processing_status = 'pending'
          AND NOT EXISTS (
            SELECT 1
            FROM messages existing_claim
            WHERE existing_claim.session_id = @sessionId
              AND existing_claim.claimed_by_agent_id = @agentId
              AND existing_claim.processing_status = 'claimed'
          )
          ${typeFilter}
          ${fromAgentFilter}
          ${correlationFilter}
        ORDER BY created_at ASC
        LIMIT 1
      )
      UPDATE messages
      SET processing_status = 'claimed',
          delivery_status = 'delivered',
          claimed_by_agent_id = @agentId,
          claimed_at = @claimedAt
      WHERE id = (SELECT id FROM target)
      RETURNING
        id,
        session_id AS sessionId,
        from_agent_id AS fromAgentId,
        to_agent_id AS toAgentId,
        type,
        payload_json AS payloadJson,
        idempotency_key AS idempotencyKey,
        correlation_id AS correlationId,
        delivery_status AS deliveryStatus,
        processing_status AS processingStatus,
        claimed_by_agent_id AS claimedByAgentId,
        claimed_at AS claimedAt,
        processed_at AS processedAt,
        failed_at AS failedAt,
        failure_reason AS failureReason,
        created_at AS createdAt
    `);

    const statementInput: Record<string, string> = {
      sessionId: agentRow.sessionId,
      agentId,
      claimedAt
    };

    for (const [index, type] of (options.types ?? []).entries()) {
      statementInput[`type${index}`] = type;
    }
    if (options.fromAgentId) {
      statementInput.fromAgentId = options.fromAgentId;
    }
    if (options.correlationId) {
      statementInput.correlationId = options.correlationId;
    }

    const row = statement.get(statementInput) as MessageRow | undefined;

    return row ? this.mapRow(row) : null;
  }

  public claimManyForAgent(
    agentId: string,
    claimedAt: string,
    options: {
      types?: MessageType[];
      fromAgentId?: string;
      correlationId?: string;
      maxMessages?: number;
    } = {}
  ): MessageRecord[] {
    const sessionStatement = this.database.prepare(`
      SELECT session_id AS sessionId
      FROM agents
      WHERE id = ?
    `);
    const agentRow = sessionStatement.get(agentId) as
      | { sessionId: string }
      | undefined;
    if (!agentRow) {
      return [];
    }

    if (options.types && options.types.length === 0) {
      return [];
    }

    const maxMessages = Math.max(1, Math.min(options.maxMessages ?? 10, 50));
    const typeFilter = options.types
      ? `AND type IN (${options.types
          .map((_, index) => `@type${index}`)
          .join(", ")})`
      : "";
    const fromAgentFilter = options.fromAgentId
      ? "AND from_agent_id = @fromAgentId"
      : "";
    const correlationFilter = options.correlationId
      ? "AND correlation_id = @correlationId"
      : "";

    const statement = this.database.prepare(`
      WITH target AS (
        SELECT id
        FROM messages
        WHERE session_id = @sessionId
          AND to_agent_id = @agentId
          AND processing_status = 'pending'
          ${typeFilter}
          ${fromAgentFilter}
          ${correlationFilter}
        ORDER BY created_at ASC
        LIMIT @maxMessages
      )
      UPDATE messages
      SET processing_status = 'claimed',
          delivery_status = 'delivered',
          claimed_by_agent_id = @agentId,
          claimed_at = @claimedAt
      WHERE id IN (SELECT id FROM target)
      RETURNING
        id,
        session_id AS sessionId,
        from_agent_id AS fromAgentId,
        to_agent_id AS toAgentId,
        type,
        payload_json AS payloadJson,
        idempotency_key AS idempotencyKey,
        correlation_id AS correlationId,
        delivery_status AS deliveryStatus,
        processing_status AS processingStatus,
        claimed_by_agent_id AS claimedByAgentId,
        claimed_at AS claimedAt,
        processed_at AS processedAt,
        failed_at AS failedAt,
        failure_reason AS failureReason,
        created_at AS createdAt
    `);

    const statementInput: Record<string, string | number> = {
      sessionId: agentRow.sessionId,
      agentId,
      claimedAt,
      maxMessages
    };

    for (const [index, type] of (options.types ?? []).entries()) {
      statementInput[`type${index}`] = type;
    }
    if (options.fromAgentId) {
      statementInput.fromAgentId = options.fromAgentId;
    }
    if (options.correlationId) {
      statementInput.correlationId = options.correlationId;
    }

    const rows = statement.all(statementInput) as MessageRow[];

    return rows.map((row) => this.mapRow(row));
  }

  public listQueueStatsForSession(sessionId: string): AgentQueueStats[] {
    const statement = this.database.prepare(`
      SELECT
        a.id AS agentId,
        COALESCE(SUM(CASE WHEN m.to_agent_id = a.id THEN 1 ELSE 0 END), 0) AS total,
        COALESCE(
          SUM(
            CASE
              WHEN m.to_agent_id = a.id AND m.processing_status = 'pending' THEN 1
              ELSE 0
            END
          ),
          0
        ) AS pending,
        COALESCE(
          SUM(
            CASE
              WHEN m.to_agent_id = a.id AND m.processing_status = 'claimed' THEN 1
              ELSE 0
            END
          ),
          0
        ) AS claimed
      FROM agents a
      LEFT JOIN messages m
        ON m.session_id = a.session_id
       AND m.to_agent_id = a.id
      WHERE a.session_id = ?
      GROUP BY a.id
    `);

    const rows = statement.all(sessionId) as Array<{
      agentId: string;
      pending: number;
      claimed: number;
      total: number;
    }>;

    return rows.map((row) => ({
      agentId: row.agentId,
      pending: Number(row.pending),
      claimed: Number(row.claimed),
      total: Number(row.total)
    }));
  }

  public acknowledge(
    messageId: string,
    processed: boolean,
    processedAt?: string
  ): void {
    const statement = this.database.prepare(`
      UPDATE messages
      SET delivery_status = @deliveryStatus,
          processing_status = @processingStatus,
          processed_at = @processedAt
      WHERE id = @messageId
        AND processing_status = 'pending'
    `);

    statement.run({
      messageId,
      deliveryStatus: processed ? "processed" : "acknowledged",
      processingStatus: processed ? "processed" : "pending",
      processedAt: processed ? processedAt ?? null : null
    });
  }

  public markProcessed(
    messageId: string,
    agentId: string,
    processedAt: string
  ): MessageRecord | null {
    const statement = this.database.prepare(`
      UPDATE messages
      SET processing_status = 'processed',
          delivery_status = 'processed',
          processed_at = @processedAt
      WHERE id = @messageId
        AND claimed_by_agent_id = @agentId
        AND processing_status = 'claimed'
      RETURNING
        id,
        session_id AS sessionId,
        from_agent_id AS fromAgentId,
        to_agent_id AS toAgentId,
        type,
        payload_json AS payloadJson,
        idempotency_key AS idempotencyKey,
        correlation_id AS correlationId,
        delivery_status AS deliveryStatus,
        processing_status AS processingStatus,
        claimed_by_agent_id AS claimedByAgentId,
        claimed_at AS claimedAt,
        processed_at AS processedAt,
        failed_at AS failedAt,
        failure_reason AS failureReason,
        created_at AS createdAt
    `);

    const row = statement.get({
      messageId,
      agentId,
      processedAt
    }) as MessageRow | undefined;

    return row ? this.mapRow(row) : null;
  }

  public markFailed(
    messageId: string,
    agentId: string,
    failedAt: string,
    reason?: string
  ): MessageRecord | null {
    const statement = this.database.prepare(`
      UPDATE messages
      SET processing_status = 'failed',
          delivery_status = 'delivery_failed',
          failed_at = @failedAt,
          failure_reason = @failureReason
      WHERE id = @messageId
        AND claimed_by_agent_id = @agentId
        AND processing_status = 'claimed'
      RETURNING
        id,
        session_id AS sessionId,
        from_agent_id AS fromAgentId,
        to_agent_id AS toAgentId,
        type,
        payload_json AS payloadJson,
        idempotency_key AS idempotencyKey,
        correlation_id AS correlationId,
        delivery_status AS deliveryStatus,
        processing_status AS processingStatus,
        claimed_by_agent_id AS claimedByAgentId,
        claimed_at AS claimedAt,
        processed_at AS processedAt,
        failed_at AS failedAt,
        failure_reason AS failureReason,
        created_at AS createdAt
    `);

    const row = statement.get({
      messageId,
      agentId,
      failedAt,
      failureReason: reason ?? null
    }) as MessageRow | undefined;

    return row ? this.mapRow(row) : null;
  }

  public deleteBySessionId(sessionId: string): void {
    const statement = this.database.prepare(`
      DELETE FROM messages
      WHERE session_id = ?
    `);

    statement.run(sessionId);
  }

  public deleteByAgentId(agentId: string): void {
    const statement = this.database.prepare(`
      DELETE FROM messages
      WHERE from_agent_id = @agentId
         OR to_agent_id = @agentId
         OR claimed_by_agent_id = @agentId
    `);

    statement.run({
      agentId
    });
  }

  public listBySessionId(sessionId: string): MessageRecord[] {
    const statement = this.database.prepare(`
      SELECT
        id,
        session_id AS sessionId,
        from_agent_id AS fromAgentId,
        to_agent_id AS toAgentId,
        type,
        payload_json AS payloadJson,
        idempotency_key AS idempotencyKey,
        correlation_id AS correlationId,
        delivery_status AS deliveryStatus,
        processing_status AS processingStatus,
        claimed_by_agent_id AS claimedByAgentId,
        claimed_at AS claimedAt,
        processed_at AS processedAt,
        failed_at AS failedAt,
        failure_reason AS failureReason,
        created_at AS createdAt
      FROM messages
      WHERE session_id = ?
      ORDER BY created_at DESC
    `);

    const rows = statement.all(sessionId) as MessageRow[];
    return rows.map((row) => this.mapRow(row));
  }

  private mapRow(row: MessageRow): MessageRecord {
    return {
      id: row.id,
      sessionId: row.sessionId,
      fromAgentId: row.fromAgentId,
      type: row.type,
      payload: JSON.parse(row.payloadJson),
      deliveryStatus: row.deliveryStatus,
      processingStatus: row.processingStatus,
      createdAt: row.createdAt,
      ...(row.claimedByAgentId
        ? { claimedByAgentId: row.claimedByAgentId }
        : {}),
      ...(row.claimedAt ? { claimedAt: row.claimedAt } : {}),
      ...(row.processedAt ? { processedAt: row.processedAt } : {}),
      ...(row.failedAt ? { failedAt: row.failedAt } : {}),
      ...(row.failureReason ? { failureReason: row.failureReason } : {}),
      ...(row.toAgentId ? { toAgentId: row.toAgentId } : {}),
      ...(row.idempotencyKey ? { idempotencyKey: row.idempotencyKey } : {}),
      ...(row.correlationId ? { correlationId: row.correlationId } : {})
    };
  }

  private validateSupersededMessages(
    message: MessageRecord,
    supersedeMessageIds: string[]
  ): boolean {
    const placeholders = supersedeMessageIds
      .map((_, index) => `@messageId${index}`)
      .join(", ");
    const statement = this.database.prepare(`
      SELECT COUNT(*) AS count
      FROM messages
      WHERE id IN (${placeholders})
        AND session_id = @sessionId
        AND to_agent_id = @toAgentId
        AND processing_status = 'pending'
    `);

    const params: Record<string, string> = {
      sessionId: message.sessionId,
      toAgentId: message.toAgentId ?? ""
    };
    for (const [index, messageId] of supersedeMessageIds.entries()) {
      params[`messageId${index}`] = messageId;
    }

    const row = statement.get(params) as { count: number } | undefined;
    return Number(row?.count ?? 0) === supersedeMessageIds.length;
  }

  private markSupersededMessagesProcessed(
    supersedeMessageIds: string[],
    processedAt: string
  ): number {
    const placeholders = supersedeMessageIds
      .map((_, index) => `@messageId${index}`)
      .join(", ");
    const statement = this.database.prepare(`
      UPDATE messages
      SET delivery_status = 'processed',
          processing_status = 'processed',
          processed_at = @processedAt
      WHERE id IN (${placeholders})
        AND processing_status = 'pending'
    `);

    const params: Record<string, string> = {
      processedAt
    };
    for (const [index, messageId] of supersedeMessageIds.entries()) {
      params[`messageId${index}`] = messageId;
    }

    const result = statement.run(params);
    return Number(result.changes ?? 0);
  }

  private isUniqueIdempotencyViolation(error: unknown): boolean {
    return (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed") &&
      error.message.includes("messages.session_id") &&
      error.message.includes("messages.from_agent_id") &&
      error.message.includes("messages.idempotency_key")
    );
  }

  private safeRollback(): void {
    try {
      this.database.exec("ROLLBACK");
    } catch {
      // Ignore rollback errors when the transaction has already been closed.
    }
  }
}
