/**
 * 版本化数据库迁移框架。
 *
 * 每个迁移是一个带版本号的函数，按版本号顺序执行。
 * schema_version 表记录已应用的最高版本。
 * ensureColumn 保留为兼容旧数据的 fallback。
 */

import type { DatabaseSync } from "node:sqlite";

export type MigrationFn = (db: DatabaseSync) => void;

export type Migration = {
  version: number;
  description: string;
  up: MigrationFn;
};

/**
 * 所有已注册的迁移。
 * 新增迁移时在数组末尾追加，版本号递增。
 */
export const migrations: Migration[] = [
  {
    version: 1,
    description: "Initial schema: sessions, agents, messages, tasks, model_configs, web_agent_runtimes, workflow_definitions, operation_dedup, identity_leases, session_insights, mcp_servers",
    up: () => {
      // 初始 schema 由 schemaDDL 在 migrate() 中执行，这里不做额外操作。
    }
  },
  {
    version: 2,
    description: "Add model_configs columns: model_id, api_key, base_url, created_at, updated_at",
    up: (db) => {
      ensureColumnIfExists(db, "model_configs", "model_id", "TEXT NOT NULL DEFAULT ''");
      ensureColumnIfExists(db, "model_configs", "api_key", "TEXT");
      ensureColumnIfExists(db, "model_configs", "base_url", "TEXT");
      ensureColumnIfExists(db, "model_configs", "created_at", "TEXT NOT NULL DEFAULT ''");
      ensureColumnIfExists(db, "model_configs", "updated_at", "TEXT NOT NULL DEFAULT ''");
    }
  },
  {
    version: 3,
    description: "Add web_agent_runtimes columns: agent_profile_id, current_step, last_error, last_tick_at",
    up: (db) => {
      ensureColumnIfExists(db, "web_agent_runtimes", "agent_profile_id", "TEXT");
      ensureColumnIfExists(db, "web_agent_runtimes", "current_step", "TEXT");
      ensureColumnIfExists(db, "web_agent_runtimes", "last_error", "TEXT");
      ensureColumnIfExists(db, "web_agent_runtimes", "last_tick_at", "TEXT");
    }
  },
  {
    version: 4,
    description: "Add web_agent_runtimes columns: external_mcp_server_ids_json, custom_duty, custom_skill_ids_json",
    up: (db) => {
      ensureColumnIfExists(db, "web_agent_runtimes", "external_mcp_server_ids_json", "TEXT NOT NULL DEFAULT '[]'");
      ensureColumnIfExists(db, "web_agent_runtimes", "custom_duty", "TEXT");
      ensureColumnIfExists(db, "web_agent_runtimes", "custom_skill_ids_json", "TEXT NOT NULL DEFAULT '[]'");
    }
  },
  {
    version: 5,
    description: "Add workflow_definitions column: status",
    up: (db) => {
      ensureColumnIfExists(db, "workflow_definitions", "status", "TEXT NOT NULL DEFAULT 'planning'");
    }
  },
  {
    version: 6,
    description: "Add agents runtime columns: runtime_state, runtime_required_action, runtime_required_tool, runtime_continuation_token, runtime_user_visible_response_allowed, runtime_lease_expires_at",
    up: (db) => {
      ensureColumnIfExists(db, "agents", "runtime_state", "TEXT");
      ensureColumnIfExists(db, "agents", "runtime_required_action", "TEXT");
      ensureColumnIfExists(db, "agents", "runtime_required_tool", "TEXT");
      ensureColumnIfExists(db, "agents", "runtime_continuation_token", "TEXT");
      ensureColumnIfExists(db, "agents", "runtime_user_visible_response_allowed", "INTEGER");
      ensureColumnIfExists(db, "agents", "runtime_lease_expires_at", "TEXT");
    }
  },
  {
    version: 7,
    description: "Add web_agent_runtimes column: last_self_maintenance_at",
    up: (db) => {
      ensureColumnIfExists(db, "web_agent_runtimes", "last_self_maintenance_at", "TEXT");
    }
  },
  {
    version: 8,
    description: "Migrate unapplied_user_inputs_json from string[] to PendingUserInput[] ({ revision, content })",
    up: (db) => {
      const rows = db.prepare(`
        SELECT session_id, unapplied_user_inputs_json, latest_user_directive_revision
        FROM session_insights
        WHERE unapplied_user_inputs_json IS NOT NULL
          AND unapplied_user_inputs_json != '[]'
          AND unapplied_user_inputs_json != ''
      `).all() as Array<{
        session_id: string;
        unapplied_user_inputs_json: string;
        latest_user_directive_revision: number;
      }>;

      for (const row of rows) {
        try {
          const parsed = JSON.parse(row.unapplied_user_inputs_json);
          if (!Array.isArray(parsed)) continue;

          const revision = row.latest_user_directive_revision || 0;
          const migrated: Array<{ revision: number; content: string }> = [];

          for (const item of parsed) {
            if (typeof item === "string" && item.trim().length > 0) {
              // 旧格式字符串 → 转为结构化对象
              migrated.push({ revision, content: item });
            } else if (
              item !== null &&
              typeof item === "object" &&
              typeof (item as { revision?: unknown }).revision === "number" &&
              Number.isInteger((item as { revision: number }).revision) &&
              typeof (item as { content?: unknown }).content === "string" &&
              ((item as { content: string }).content).length > 0
            ) {
              // 已结构化的合法对象 → 原样保留
              migrated.push({
                revision: (item as { revision: number }).revision,
                content: (item as { content: string }).content,
              });
            }
            // 非法条目（既不是字符串也不是合法结构化对象）被跳过
          }

          db.prepare(`
            UPDATE session_insights
            SET unapplied_user_inputs_json = ?
            WHERE session_id = ?
          `).run(JSON.stringify(migrated), row.session_id);
        } catch {
          // JSON 解析失败时跳过该行
        }
      }
    }
  },
  {
    version: 9,
    description: "Add model_configs columns: context_window_tokens, max_output_tokens, context_reserve_tokens. Add agent_context_snapshots table for role-level context persistence.",
    up: (db) => {
      ensureColumnIfExists(db, "model_configs", "context_window_tokens", "INTEGER NOT NULL DEFAULT 128000");
      ensureColumnIfExists(db, "model_configs", "max_output_tokens", "INTEGER NOT NULL DEFAULT 4096");
      ensureColumnIfExists(db, "model_configs", "context_reserve_tokens", "INTEGER NOT NULL DEFAULT 1000");

      // agent_context_snapshots 表（新数据库由 schemaDDL 创建，这里给旧数据库补建）
      db.exec(`
        CREATE TABLE IF NOT EXISTS agent_context_snapshots (
          runtime_id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          agent_id TEXT NOT NULL,
          role TEXT NOT NULL,
          conversation_summary TEXT,
          recent_turns_json TEXT NOT NULL DEFAULT '[]',
          confirmed_decisions_json TEXT NOT NULL DEFAULT '[]',
          unresolved_questions_json TEXT NOT NULL DEFAULT '[]',
          pending_actions_json TEXT NOT NULL DEFAULT '[]',
          last_processed_message_id TEXT,
          summary_revision INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_agent_context_snapshots_session
        ON agent_context_snapshots(session_id);
        CREATE INDEX IF NOT EXISTS idx_agent_context_snapshots_agent
        ON agent_context_snapshots(agent_id);
      `);
    }
  }
];

/**
 * 运行所有未应用的迁移。
 * 返回应用的迁移数量。
 */
export function runMigrations(db: DatabaseSync): number {
  // 确保 schema_version 表存在
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = db.prepare("SELECT version FROM schema_version").all() as Array<{ version: number }>;
  const appliedVersions = new Set(applied.map((row) => row.version));

  let count = 0;
  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue;

    try {
      db.exec("BEGIN");
      migration.up(db);
      db.prepare("INSERT INTO schema_version (version, applied_at) VALUES (?, ?)")
        .run(migration.version, new Date().toISOString());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    count++;
  }

  return count;
}

/**
 * 检查列是否存在，不存在则 ADD COLUMN。
 * 保留为兼容旧数据的 fallback。
 */
export function ensureColumnIfExists(
  db: DatabaseSync,
  tableName: string,
  columnName: string,
  definition: string
): void {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === columnName)) {
    return;
  }
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}
