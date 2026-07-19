import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { schemaDDL } from "../schema.js";
import { runMigrations, migrations, ensureColumnIfExists } from "../migrations.js";
import { SessionInsightRepository } from "../repositories/session-insight-repository.js";
import type { PendingUserInput } from "@loopmarshal/protocol";

function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(schemaDDL);
  return db;
}

describe("Database Migrations", () => {
  it("runs all migrations on a fresh database", () => {
    const db = createTestDb();
    const count = runMigrations(db);
    // Version 1 is already inserted by schemaDDL, so migrations 2-8 run (7 total)
    expect(count).toBe(migrations.length - 1);
    db.close();
  });

  it("skips already applied migrations on second run", () => {
    const db = createTestDb();
    const firstRun = runMigrations(db);
    const secondRun = runMigrations(db);
    expect(firstRun).toBe(migrations.length - 1);
    expect(secondRun).toBe(0);
    db.close();
  });

  it("creates schema_version table with all versions", () => {
    const db = createTestDb();
    runMigrations(db);
    const versions = db.prepare("SELECT version FROM schema_version ORDER BY version ASC").all() as Array<{ version: number }>;
    expect(versions).toHaveLength(migrations.length);
    expect(versions[0]?.version).toBe(1);
    expect(versions[versions.length - 1]?.version).toBe(migrations.length);
    db.close();
  });

  it("ensureColumnIfExists is idempotent", () => {
    const db = createTestDb();
    db.exec("CREATE TABLE test_table (id TEXT PRIMARY KEY)");
    ensureColumnIfExists(db, "test_table", "name", "TEXT");
    ensureColumnIfExists(db, "test_table", "name", "TEXT"); // should not throw
    const columns = db.prepare("PRAGMA table_info(test_table)").all() as Array<{ name: string }>;
    expect(columns.map((c) => c.name)).toContain("name");
    db.close();
  });
});

// ============================================
// Version 8 迁移测试：string[] → PendingUserInput[]
// 使用真实 runMigrations() + SessionInsightRepository 验证
// ============================================

describe("Version 8 migration: unappliedUserInputs string[] → PendingUserInput[]", () => {
  function createDbWithOldData(): DatabaseSync {
    const db = createTestDb();

    // 只应用到 version 7（跳过 version 8）
    for (const migration of migrations) {
      if (migration.version === 8) break;
      // version 1 由 schemaDDL 处理，其他逐个执行
      if (migration.version > 1) {
        db.exec("BEGIN");
        try {
          migration.up(db);
          db.prepare("INSERT INTO schema_version (version, applied_at) VALUES (?, ?)")
            .run(migration.version, new Date().toISOString());
          db.exec("COMMIT");
        } catch {
          db.exec("ROLLBACK");
          throw new Error(`migration ${migration.version} failed`);
        }
      } else {
        // version 1 已由 schemaDDL 插入
        db.prepare("INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (?, ?)")
          .run(1, new Date().toISOString());
      }
    }

    return db;
  }

  it("migrates old string[] unappliedUserInputs to PendingUserInput[] with revision", () => {
    const db = createDbWithOldData();

    // 写入旧格式的 session insight（字符串数组）
    db.prepare(`
      INSERT INTO session_insights (
        session_id, objective, current_project_understanding, project_summary,
        user_intent_summary, latest_user_input, latest_report_summary,
        recent_user_inputs_json, unapplied_user_inputs_json, user_preferences_json,
        acceptance_criteria_json, constraints_json, completed_items_json,
        pending_items_json, blockers_json, assumptions_json,
        latest_user_directive_revision, applied_user_directive_revision,
        current_plan_revision, active_plan_summary, last_dispatch_worker_name,
        last_dispatch_agent_id, last_dispatch_message_id, last_dispatch_correlation_id,
        last_dispatch_task_focus, review_status, review_reason, ready_for_review,
        last_updated_by_agent_id, updated_at
      ) VALUES (
        'test-session-1', NULL, NULL, NULL, NULL, NULL, NULL,
        '[]', '["user input A", "user input B"]', '[]',
        '[]', '[]', '[]', '[]', '[]', '[]',
        7, 3, 0, NULL, NULL, NULL, NULL, NULL, NULL,
        'in_progress', NULL, 0, 'agent-1', '2024-01-01T00:00:00Z'
      )
    `).run();

    // 执行迁移（version 8 + version 9）
    const count = runMigrations(db);
    expect(count).toBe(2);

    // 用真实 SessionInsightRepository 读取
    const repo = new SessionInsightRepository(db);
    const insight = repo.findBySessionId("test-session-1");

    expect(insight).not.toBeNull();
    const unapplied = insight!.unappliedUserInputs as PendingUserInput[];
    expect(unapplied).toHaveLength(2);
    expect(unapplied[0]).toEqual({ revision: 7, content: "user input A" });
    expect(unapplied[1]).toEqual({ revision: 7, content: "user input B" });

    db.close();
  });

  it("preserves already-structured entries in mixed-format arrays", () => {
    const db = createDbWithOldData();

    // 写入混合格式：一个已结构化 + 一个旧字符串
    db.prepare(`
      INSERT INTO session_insights (
        session_id, objective, current_project_understanding, project_summary,
        user_intent_summary, latest_user_input, latest_report_summary,
        recent_user_inputs_json, unapplied_user_inputs_json, user_preferences_json,
        acceptance_criteria_json, constraints_json, completed_items_json,
        pending_items_json, blockers_json, assumptions_json,
        latest_user_directive_revision, applied_user_directive_revision,
        current_plan_revision, active_plan_summary, last_dispatch_worker_name,
        last_dispatch_agent_id, last_dispatch_message_id, last_dispatch_correlation_id,
        last_dispatch_task_focus, review_status, review_reason, ready_for_review,
        last_updated_by_agent_id, updated_at
      ) VALUES (
        'test-session-mixed', NULL, NULL, NULL, NULL, NULL, NULL,
        '[]', '[{"revision": 4, "content": "already migrated"}, "legacy input"]', '[]',
        '[]', '[]', '[]', '[]', '[]', '[]',
        7, 3, 0, NULL, NULL, NULL, NULL, NULL, NULL,
        'in_progress', NULL, 0, 'agent-1', '2024-01-01T00:00:00Z'
      )
    `).run();

    runMigrations(db);

    const repo = new SessionInsightRepository(db);
    const insight = repo.findBySessionId("test-session-mixed");

    expect(insight).not.toBeNull();
    const unapplied = insight!.unappliedUserInputs as PendingUserInput[];
    // Both entries should be preserved: the structured one + the converted string
    expect(unapplied).toHaveLength(2);
    expect(unapplied[0]).toEqual({ revision: 4, content: "already migrated" });
    expect(unapplied[1]).toEqual({ revision: 7, content: "legacy input" });

    db.close();
  });

  it("is idempotent — second run does not alter already-migrated data", () => {
    const db = createDbWithOldData();

    db.prepare(`
      INSERT INTO session_insights (
        session_id, objective, current_project_understanding, project_summary,
        user_intent_summary, latest_user_input, latest_report_summary,
        recent_user_inputs_json, unapplied_user_inputs_json, user_preferences_json,
        acceptance_criteria_json, constraints_json, completed_items_json,
        pending_items_json, blockers_json, assumptions_json,
        latest_user_directive_revision, applied_user_directive_revision,
        current_plan_revision, active_plan_summary, last_dispatch_worker_name,
        last_dispatch_agent_id, last_dispatch_message_id, last_dispatch_correlation_id,
        last_dispatch_task_focus, review_status, review_reason, ready_for_review,
        last_updated_by_agent_id, updated_at
      ) VALUES (
        'test-session-idemp', NULL, NULL, NULL, NULL, NULL, NULL,
        '[]', '["original input"]', '[]',
        '[]', '[]', '[]', '[]', '[]', '[]',
        5, 2, 0, NULL, NULL, NULL, NULL, NULL, NULL,
        'in_progress', NULL, 0, 'agent-1', '2024-01-01T00:00:00Z'
      )
    `).run();

    // First migration
    runMigrations(db);
    const repo = new SessionInsightRepository(db);
    const afterFirst = repo.findBySessionId("test-session-idemp");
    expect(afterFirst!.unappliedUserInputs).toEqual([{ revision: 5, content: "original input" }]);

    // Second migration run — should be no-op
    const secondCount = runMigrations(db);
    expect(secondCount).toBe(0);
    const afterSecond = repo.findBySessionId("test-session-idemp");
    expect(afterSecond!.unappliedUserInputs).toEqual([{ revision: 5, content: "original input" }]);

    db.close();
  });
});
