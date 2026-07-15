import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { schemaDDL } from "./schema.js";

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
    this.database.exec(schemaDDL);
    this.ensureColumn("model_configs", "model_id", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("model_configs", "api_key", "TEXT");
    this.ensureColumn("model_configs", "base_url", "TEXT");
    this.ensureColumn("model_configs", "created_at", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("model_configs", "updated_at", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("web_agent_runtimes", "agent_profile_id", "TEXT");
    this.ensureColumn("web_agent_runtimes", "current_step", "TEXT");
    this.ensureColumn("web_agent_runtimes", "last_error", "TEXT");
    this.ensureColumn("web_agent_runtimes", "last_tick_at", "TEXT");
    this.ensureColumn("agents", "runtime_state", "TEXT");
    this.ensureColumn("agents", "runtime_required_action", "TEXT");
    this.ensureColumn("agents", "runtime_required_tool", "TEXT");
    this.ensureColumn("agents", "runtime_continuation_token", "TEXT");
    this.ensureColumn("agents", "runtime_user_visible_response_allowed", "INTEGER");
    this.ensureColumn("agents", "runtime_lease_expires_at", "TEXT");
  }

  public close(): void {
    this.database.close();
  }

  private ensureColumn(tableName: string, columnName: string, definition: string): void {
    const columns = this.database
      .prepare(`PRAGMA table_info(${tableName})`)
      .all() as Array<{ name: string }>;
    if (columns.some((column) => column.name === columnName)) {
      return;
    }
    this.database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}
