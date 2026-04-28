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

import type { Task, TaskStatus } from "@ai-collab/protocol";

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
      ...task,
      assignedToAgentId: task.assignedToAgentId ?? null,
      capabilityHint: task.capabilityHint ?? null,
      parentTaskId: task.parentTaskId ?? null
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

    return (statement.get(taskId) as Task | undefined) ?? null;
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
      ORDER BY created_at ASC
    `);

    return statement.all(sessionId) as Task[];
  }

  public updateStatus(taskId: string, status: TaskStatus, updatedAt: string): void {
    const statement = this.database.prepare(`
      UPDATE tasks
      SET status = @status, updated_at = @updatedAt
      WHERE id = @taskId
    `);

    statement.run({
      taskId,
      status,
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

  public clearAssignmentsForAgent(agentId: string, updatedAt: string): void {
    const statement = this.database.prepare(`
      UPDATE tasks
      SET assigned_to_agent_id = NULL,
          status = CASE
            WHEN status IN ('assigned', 'accepted', 'in_progress', 'awaiting_reassign')
              THEN 'awaiting_reassign'
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
}
