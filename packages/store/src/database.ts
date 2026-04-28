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
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { initialMigrations } from "./migrations.js";

export class DatabaseManager {
  private readonly database: DatabaseSync;

  public constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
  }

  public get connection(): DatabaseSync {
    return this.database;
  }

  public migrate(): void {
    for (const migration of initialMigrations) {
      this.database.exec(migration);
    }

    this.ensureColumn("agents", "agent_name", "TEXT");
    this.database.exec(`
      UPDATE agents
      SET agent_name = id
      WHERE agent_name IS NULL OR agent_name = ''
    `);
    this.database.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_session_agent_name
      ON agents (session_id, agent_name)
    `);
    this.ensureColumn(
      "agents",
      "default_wait_interval_seconds",
      "INTEGER NOT NULL DEFAULT 10"
    );
    this.ensureColumn("agents", "role_description", "TEXT");
    this.ensureColumn(
      "agents",
      "default_wait_max_rounds",
      "INTEGER NOT NULL DEFAULT 600"
    );
    this.ensureColumn("agents", "runtime_active_flow", "TEXT");
    this.ensureColumn("agents", "runtime_current_message_id", "TEXT");
    this.ensureColumn("agents", "runtime_current_correlation_id", "TEXT");
    this.ensureColumn("agents", "runtime_current_message_kind", "TEXT");
    this.ensureColumn("agents", "runtime_wait_chain_id", "TEXT");
    this.ensureColumn("agents", "runtime_wait_chain_status", "TEXT");
    this.ensureColumn("agents", "runtime_last_poll_at", "TEXT");
    this.ensureColumn("agents", "runtime_last_claim_at", "TEXT");
    this.ensureColumn("agents", "runtime_last_submit_at", "TEXT");
    this.ensureColumn("agents", "runtime_pending_inbox_count", "INTEGER");
    this.ensureColumn("agents", "runtime_claimed_inbox_count", "INTEGER");
    this.ensureColumn("agents", "runtime_last_command", "TEXT");
    this.ensureColumn("agents", "runtime_last_status", "TEXT");
    this.ensureColumn("agents", "runtime_last_workflow_step", "TEXT");
    this.ensureColumn("agents", "runtime_last_automation_state", "TEXT");
    this.ensureColumn("agents", "runtime_last_turn_disposition", "TEXT");
    this.ensureColumn("agents", "runtime_updated_at", "TEXT");

    this.ensureColumn("messages", "processing_status", "TEXT");
    this.ensureColumn("messages", "claimed_by_agent_id", "TEXT");
    this.ensureColumn("messages", "claimed_at", "TEXT");
    this.ensureColumn("messages", "processed_at", "TEXT");
    this.ensureColumn("messages", "failed_at", "TEXT");
    this.ensureColumn("messages", "failure_reason", "TEXT");
    this.database.exec(`
      UPDATE messages
      SET processing_status = CASE
        WHEN delivery_status = 'processed' THEN 'processed'
        WHEN delivery_status = 'delivery_failed' THEN 'failed'
        WHEN delivery_status = 'acknowledged' AND to_agent_id IS NOT NULL
          THEN 'claimed'
        ELSE 'pending'
      END
      WHERE processing_status IS NULL OR processing_status = ''
    `);
    this.database.exec(`
      UPDATE messages
      SET claimed_by_agent_id = to_agent_id,
          claimed_at = COALESCE(claimed_at, created_at)
      WHERE processing_status = 'claimed'
        AND claimed_by_agent_id IS NULL
        AND to_agent_id IS NOT NULL
    `);
    this.database.exec(`
      DELETE FROM messages
      WHERE rowid IN (
        SELECT duplicate.rowid
        FROM messages duplicate
        INNER JOIN (
          SELECT
            MIN(rowid) AS keep_rowid,
            session_id,
            from_agent_id,
            idempotency_key
          FROM messages
          WHERE idempotency_key IS NOT NULL
            AND idempotency_key <> ''
          GROUP BY session_id, from_agent_id, idempotency_key
          HAVING COUNT(*) > 1
        ) dedup
          ON duplicate.session_id = dedup.session_id
         AND duplicate.from_agent_id = dedup.from_agent_id
         AND duplicate.idempotency_key = dedup.idempotency_key
        WHERE duplicate.rowid <> dedup.keep_rowid
      )
    `);
    this.database.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_session_from_idempotency
      ON messages (session_id, from_agent_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
        AND idempotency_key <> ''
    `);
    this.database.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_operation_dedup_scope
      ON operation_dedup (agent_id, operation_type, idempotency_key)
    `);
    this.database.exec(`
      CREATE INDEX IF NOT EXISTS idx_identity_leases_lease_until
      ON identity_leases (lease_until)
    `);

    this.ensureColumn("session_insights", "project_summary", "TEXT");
    this.ensureColumn("session_insights", "user_intent_summary", "TEXT");
    this.ensureColumn(
      "session_insights",
      "recent_user_inputs_json",
      "TEXT NOT NULL DEFAULT '[]'"
    );
    this.ensureColumn(
      "session_insights",
      "unapplied_user_inputs_json",
      "TEXT NOT NULL DEFAULT '[]'"
    );
    this.ensureColumn(
      "session_insights",
      "user_preferences_json",
      "TEXT NOT NULL DEFAULT '[]'"
    );
    this.ensureColumn(
      "session_insights",
      "acceptance_criteria_json",
      "TEXT NOT NULL DEFAULT '[]'"
    );
    this.ensureColumn(
      "session_insights",
      "latest_user_directive_revision",
      "INTEGER NOT NULL DEFAULT 0"
    );
    this.ensureColumn(
      "session_insights",
      "applied_user_directive_revision",
      "INTEGER NOT NULL DEFAULT 0"
    );
    this.ensureColumn(
      "session_insights",
      "current_plan_revision",
      "INTEGER NOT NULL DEFAULT 0"
    );
    this.ensureColumn("session_insights", "active_plan_summary", "TEXT");
    this.ensureColumn("session_insights", "last_dispatch_worker_name", "TEXT");
    this.ensureColumn("session_insights", "last_dispatch_agent_id", "TEXT");
    this.ensureColumn("session_insights", "last_dispatch_message_id", "TEXT");
    this.ensureColumn(
      "session_insights",
      "last_dispatch_correlation_id",
      "TEXT"
    );
    this.ensureColumn("session_insights", "last_dispatch_task_focus", "TEXT");
  }

  public close(): void {
    this.database.close();
  }

  private ensureColumn(
    tableName: string,
    columnName: string,
    columnDefinition: string
  ): void {
    const normalizedTableName = tableName.replace(/[^a-z_]/gi, "");
    const statement = this.database.prepare(`
      SELECT 1 AS value
      FROM pragma_table_info('${normalizedTableName}')
      WHERE name = ?
      LIMIT 1
    `);
    const existing = statement.get(columnName) as
      | { value: number }
      | undefined;

    if (!existing) {
      this.database.exec(`
        ALTER TABLE ${tableName}
        ADD COLUMN ${columnName} ${columnDefinition}
      `);
    }
  }
}
