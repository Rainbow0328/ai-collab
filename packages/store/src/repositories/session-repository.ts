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

import type { Session } from "@ai-collab/protocol";

export class SessionRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public insert(session: Session): void {
    const statement = this.database.prepare(`
      INSERT INTO sessions (id, name, host_agent_id, status, created_at, updated_at)
      VALUES (@id, @name, @hostAgentId, @status, @createdAt, @updatedAt)
    `);

    statement.run(session);
  }

  public findById(id: string): Session | null {
    const statement = this.database.prepare(`
      SELECT
        id,
        name,
        host_agent_id AS hostAgentId,
        status,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM sessions
      WHERE id = ?
    `);

    return (statement.get(id) as Session | undefined) ?? null;
  }

  public findByName(name: string): Session | null {
    const statement = this.database.prepare(`
      SELECT
        id,
        name,
        host_agent_id AS hostAgentId,
        status,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM sessions
      WHERE name = ?
    `);

    return (statement.get(name) as Session | undefined) ?? null;
  }

  public findOpenByName(name: string): Session | null {
    const statement = this.database.prepare(`
      SELECT
        id,
        name,
        host_agent_id AS hostAgentId,
        status,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM sessions
      WHERE name = ?
        AND status != 'closed'
      ORDER BY updated_at DESC
      LIMIT 1
    `);

    return (statement.get(name) as Session | undefined) ?? null;
  }

  public updateStatus(sessionId: string, status: Session["status"], updatedAt: string): void {
    const statement = this.database.prepare(`
      UPDATE sessions
      SET status = @status,
          updated_at = @updatedAt
      WHERE id = @sessionId
    `);

    statement.run({
      sessionId,
      status,
      updatedAt
    });
  }

  public deleteById(sessionId: string): void {
    const statement = this.database.prepare(`
      DELETE FROM sessions
      WHERE id = ?
    `);

    statement.run(sessionId);
  }

  public countActiveSessions(): number {
    const statement = this.database.prepare(`
      SELECT COUNT(*) AS total
      FROM sessions
      WHERE status != 'closed'
    `);

    const row = statement.get() as { total: number };
    return row.total;
  }
}
