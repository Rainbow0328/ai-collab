import type { DatabaseSync } from "node:sqlite";

import type { McpServerConfig } from "@loopmarshal/protocol";

type McpServerRow = {
  id: string;
  name: string;
  description: string | null;
  transport: string;
  url: string;
  headersJson: string | null;
  enabled: number;
  createdAt: string;
  updatedAt: string;
};

export class ExternalMcpServerRepository {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public list(): McpServerConfig[] {
    const rows = this.db
      .prepare(
        "SELECT id, name, description, transport, url, headers_json AS headersJson, enabled, created_at AS createdAt, updated_at AS updatedAt FROM mcp_servers ORDER BY name"
      )
      .all() as McpServerRow[];
    return rows.map((row) => this.toConfig(row));
  }

  public findById(id: string): McpServerConfig | null {
    const row = this.db
      .prepare(
        "SELECT id, name, description, transport, url, headers_json AS headersJson, enabled, created_at AS createdAt, updated_at AS updatedAt FROM mcp_servers WHERE id = ?"
      )
      .get(id) as McpServerRow | undefined;
    return row ? this.toConfig(row) : null;
  }

  public insert(config: McpServerConfig): void {
    this.db
      .prepare(
        `INSERT INTO mcp_servers (id, name, description, transport, url, headers_json, enabled, created_at, updated_at)
         VALUES (@id, @name, @description, @transport, @url, @headersJson, @enabled, @createdAt, @updatedAt)`
      )
      .run({
        id: config.id,
        name: config.name,
        description: config.description,
        transport: config.transport,
        url: config.url,
        headersJson: config.headers ? JSON.stringify(config.headers) : null,
        enabled: config.enabled ? 1 : 0,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      });
  }

  public update(config: McpServerConfig): void {
    this.db
      .prepare(
        `UPDATE mcp_servers
         SET name = @name, description = @description, transport = @transport, url = @url, headers_json = @headersJson, enabled = @enabled, updated_at = @updatedAt
         WHERE id = @id`
      )
      .run({
        id: config.id,
        name: config.name,
        description: config.description,
        transport: config.transport,
        url: config.url,
        headersJson: config.headers ? JSON.stringify(config.headers) : null,
        enabled: config.enabled ? 1 : 0,
        updatedAt: config.updatedAt,
      });
  }

  public delete(id: string): boolean {
    const result = this.db.prepare("DELETE FROM mcp_servers WHERE id = ?").run(id);
    return result.changes > 0;
  }

  private toConfig(row: McpServerRow): McpServerConfig {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      transport: row.transport as "sse",
      url: row.url,
      headers: row.headersJson ? (JSON.parse(row.headersJson) as Record<string, string>) : null,
      enabled: row.enabled === 1,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
