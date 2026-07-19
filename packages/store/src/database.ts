import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { schemaDDL } from "./schema.js";
import { runMigrations } from "./migrations.js";

export class DatabaseManager {
  private readonly database: DatabaseSync;

  public constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
  }

  public get connection(): DatabaseSync {
    return this.database;
  }

  /**
   * 执行数据库迁移。
   *
   * 1. 先执行 schemaDDL 创建表结构（CREATE TABLE IF NOT EXISTS）
   * 2. 然后按版本号顺序执行迁移脚本
   *
   * 迁移脚本在 migrations.ts 中定义，每个迁移有版本号和描述。
   * schema_version 表记录已应用的版本，跳过已执行的迁移。
   */
  public migrate(): void {
    this.database.exec(schemaDDL);
    runMigrations(this.database);
  }

  public close(): void {
    this.database.close();
  }
}
