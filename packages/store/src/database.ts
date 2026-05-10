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
    this.applyIncrementalMigrations();
  }

  private applyIncrementalMigrations(): void {
    const migrations: string[] = [
      `ALTER TABLE knowledge_build_judgements ADD COLUMN fulfilled_at TEXT`,
      `ALTER TABLE knowledge_build_judgements ADD COLUMN fulfilled_by_change_ids_json TEXT NOT NULL DEFAULT '[]'`,
      `ALTER TABLE knowledge_build_judgements ADD COLUMN fulfilled_knowledge_refs_json TEXT NOT NULL DEFAULT '[]'`
    ];

    for (const sql of migrations) {
      try {
        this.database.exec(sql);
      } catch {
        // Column already exists, skip
      }
    }
  }

  public close(): void {
    this.database.close();
  }
}
