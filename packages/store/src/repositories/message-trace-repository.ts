import type { DatabaseSync } from "node:sqlite";
import type { MessageTrace, MessageTraceInput } from "@ai-collab/protocol";
import { randomUUID } from "node:crypto";

type TraceRow = {
  id: string;
  session_id: string;
  message_id: string;
  agent_id: string;
  trace_type: string;
  correlation_id: string | null;
  metadata_json: string;
  created_at: string;
};

export class MessageTraceRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public insert(input: MessageTraceInput): MessageTrace {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const metadataJson = JSON.stringify(input.metadata ?? {});

    const statement = this.database.prepare(`
      INSERT INTO message_traces (
        id, session_id, message_id, agent_id, trace_type,
        correlation_id, metadata_json, created_at
      )
      VALUES (
        @id, @sessionId, @messageId, @agentId, @traceType,
        @correlationId, @metadataJson, @createdAt
      )
    `);

    statement.run({
      id,
      sessionId: input.sessionId,
      messageId: input.messageId,
      agentId: input.agentId,
      traceType: input.traceType,
      correlationId: input.correlationId ?? null,
      metadataJson,
      createdAt
    });

    return this.getById(id)!;
  }

  public listBySessionId(sessionId: string): MessageTrace[] {
    const statement = this.database.prepare(`
      SELECT * FROM message_traces
      WHERE session_id = @sessionId
      ORDER BY created_at ASC
    `);

    const rows = statement.all({ sessionId }) as TraceRow[];
    return rows.map((row) => this.mapRow(row));
  }

  public getById(id: string): MessageTrace | null {
    const statement = this.database.prepare(`
      SELECT * FROM message_traces WHERE id = @id
    `);

    const row = statement.get({ id }) as TraceRow | undefined;
    return row ? this.mapRow(row) : null;
  }

  private mapRow(row: TraceRow): MessageTrace {
    let metadata: Record<string, unknown> = {};
    try {
      metadata = JSON.parse(row.metadata_json);
    } catch {
      // keep empty
    }

    return {
      id: row.id,
      sessionId: row.session_id,
      messageId: row.message_id,
      agentId: row.agent_id,
      traceType: row.trace_type as MessageTrace["traceType"],
      correlationId: row.correlation_id,
      metadata,
      createdAt: row.created_at
    };
  }
}
