import type { DatabaseSync } from "node:sqlite";

import type { Task } from "@loopmarshal/protocol";

type TaskRow = {
  id: string;
  sessionId: string;
  title: string;
  description: string;
  createdByAgentId: string;
  assignedToAgentId: string | null;
  status: Task["status"];
  priority: Task["priority"];
  capabilityHint: string | null;
  parentTaskId: string | null;
  createdAt: string;
  updatedAt: string;
};

export class TaskRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public insert(task: Task): void {
    const statement = this.database.prepare(`
      INSERT INTO tasks (
        id,
        session_id,
        title,
        description,
        created_by_agent_id,
        assigned_to_agent_id,
        status,
        priority,
        capability_hint,
        parent_task_id,
        created_at,
        updated_at
      )
      VALUES (
        @id,
        @sessionId,
        @title,
        @description,
        @createdByAgentId,
        @assignedToAgentId,
        @status,
        @priority,
        @capabilityHint,
        @parentTaskId,
        @createdAt,
        @updatedAt
      )
    `);

    statement.run({
      id: task.id,
      sessionId: task.sessionId,
      title: task.title,
      description: task.description,
      createdByAgentId: task.createdByAgentId,
      assignedToAgentId: task.assignedToAgentId ?? null,
      status: task.status,
      priority: task.priority,
      capabilityHint: task.capabilityHint ?? null,
      parentTaskId: task.parentTaskId ?? null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    });
  }

  public findById(taskId: string): Task | null {
    const statement = this.database.prepare(`
      SELECT
        id,
        session_id AS sessionId,
        title,
        description,
        created_by_agent_id AS createdByAgentId,
        assigned_to_agent_id AS assignedToAgentId,
        status,
        priority,
        capability_hint AS capabilityHint,
        parent_task_id AS parentTaskId,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM tasks
      WHERE id = ?
    `);

    const row = statement.get(taskId) as TaskRow | undefined;
    return row ? this.mapRow(row) : null;
  }

  public listBySessionId(sessionId: string): Task[] {
    const statement = this.database.prepare(`
      SELECT
        id,
        session_id AS sessionId,
        title,
        description,
        created_by_agent_id AS createdByAgentId,
        assigned_to_agent_id AS assignedToAgentId,
        status,
        priority,
        capability_hint AS capabilityHint,
        parent_task_id AS parentTaskId,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM tasks
      WHERE session_id = ?
      ORDER BY created_at DESC
    `);

    const rows = statement.all(sessionId) as TaskRow[];
    return rows.map((row) => this.mapRow(row));
  }

  public updateStatus(input: {
    taskId: string;
    status: Task["status"];
    updatedAt: string;
  }): Task | null {
    const statement = this.database.prepare(`
      UPDATE tasks
      SET status = @status,
          updated_at = @updatedAt
      WHERE id = @taskId
      RETURNING
        id,
        session_id AS sessionId,
        title,
        description,
        created_by_agent_id AS createdByAgentId,
        assigned_to_agent_id AS assignedToAgentId,
        status,
        priority,
        capability_hint AS capabilityHint,
        parent_task_id AS parentTaskId,
        created_at AS createdAt,
        updated_at AS updatedAt
    `);

    const row = statement.get(input) as TaskRow | undefined;
    return row ? this.mapRow(row) : null;
  }

  public clearAssignmentsForAgent(agentId: string, updatedAt: string): void {
    const statement = this.database.prepare(`
      UPDATE tasks
      SET assigned_to_agent_id = NULL,
          status = CASE
            WHEN status IN ('assigned', 'accepted', 'in_progress') THEN 'awaiting_reassign'
            ELSE status
          END,
          updated_at = @updatedAt
      WHERE assigned_to_agent_id = @agentId
    `);

    statement.run({
      agentId,
      updatedAt
    });
  }

  public deleteBySessionId(sessionId: string): void {
    const statement = this.database.prepare(`
      DELETE FROM tasks
      WHERE session_id = ?
    `);

    statement.run(sessionId);
  }

  private mapRow(row: TaskRow): Task {
    return {
      id: row.id,
      sessionId: row.sessionId,
      title: row.title,
      description: row.description,
      createdByAgentId: row.createdByAgentId,
      status: row.status,
      priority: row.priority,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ...(row.assignedToAgentId ? { assignedToAgentId: row.assignedToAgentId } : {}),
      ...(row.capabilityHint ? { capabilityHint: row.capabilityHint } : {}),
      ...(row.parentTaskId ? { parentTaskId: row.parentTaskId } : {})
    };
  }
}
