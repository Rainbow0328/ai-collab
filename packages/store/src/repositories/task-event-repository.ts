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

import type { TaskEvent } from "@ai-collab/protocol";

export class TaskEventRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public insert(taskEvent: TaskEvent): void {
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
      id: taskEvent.id,
      taskId: taskEvent.taskId,
      eventType: taskEvent.eventType,
      actorAgentId: taskEvent.actorAgentId,
      payloadJson: JSON.stringify(taskEvent.payload),
      createdAt: taskEvent.createdAt
    });
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
}
