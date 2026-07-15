import type { DatabaseSync } from "node:sqlite";

import type { TaskEvent } from "@loopmarshal/protocol";

type TaskEventRow = Omit<TaskEvent, "payload"> & {
  payloadJson: string;
};

export class TaskEventRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public insert(event: TaskEvent): void {
    const statement = this.database.prepare(`
      INSERT INTO task_events (
        id,
        task_id,
        event_type,
        actor_agent_id,
        payload_json,
        created_at
      )
      VALUES (
        @id,
        @taskId,
        @eventType,
        @actorAgentId,
        @payloadJson,
        @createdAt
      )
    `);

    statement.run({
      id: event.id,
      taskId: event.taskId,
      eventType: event.eventType,
      actorAgentId: event.actorAgentId,
      payloadJson: JSON.stringify(event.payload),
      createdAt: event.createdAt
    });
  }

  public listByTaskId(taskId: string): TaskEvent[] {
    const statement = this.database.prepare(`
      SELECT
        id,
        task_id AS taskId,
        event_type AS eventType,
        actor_agent_id AS actorAgentId,
        payload_json AS payloadJson,
        created_at AS createdAt
      FROM task_events
      WHERE task_id = ?
      ORDER BY created_at ASC
    `);

    const rows = statement.all(taskId) as TaskEventRow[];
    return rows.map((row) => this.mapRow(row));
  }

  public deleteBySessionId(sessionId: string): void {
    const statement = this.database.prepare(`
      DELETE FROM task_events
      WHERE task_id IN (
        SELECT id
        FROM tasks
        WHERE session_id = ?
      )
    `);

    statement.run(sessionId);
  }

  private mapRow(row: TaskEventRow): TaskEvent {
    return {
      id: row.id,
      taskId: row.taskId,
      eventType: row.eventType,
      actorAgentId: row.actorAgentId,
      payload: JSON.parse(row.payloadJson),
      createdAt: row.createdAt
    };
  }
}
