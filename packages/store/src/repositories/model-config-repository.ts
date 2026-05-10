import type { DatabaseSync } from "node:sqlite";
import type { SQLInputValue } from "node:sqlite";
import type { ModelConfig } from "@ai-collab/protocol";

export class ModelConfigRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public insert(config: ModelConfig & { apiKeyEncrypted?: string | null }): void {
    const statement = this.database.prepare(`
      INSERT INTO model_configs (id, name, provider, base_url, api_key_encrypted, api_key_hint, model_name, temperature, max_tokens, top_p, timeout_seconds, enabled, created_at, updated_at)
      VALUES (@id, @name, @provider, @baseUrl, @apiKeyEncrypted, @apiKeyHint, @modelName, @temperature, @maxTokens, @topP, @timeoutSeconds, @enabled, @createdAt, @updatedAt)
    `);
    statement.run({
      ...config,
      enabled: config.enabled ? 1 : 0
    });
  }

  public findById(id: string): (ModelConfig & { apiKeyEncrypted?: string | null }) | null {
    const statement = this.database.prepare(`
      SELECT
        id, name, provider, base_url AS baseUrl,
        api_key_encrypted AS apiKeyEncrypted, api_key_hint AS apiKeyHint,
        model_name AS modelName, temperature, max_tokens AS maxTokens,
        top_p AS topP, timeout_seconds AS timeoutSeconds,
        enabled, created_at AS createdAt, updated_at AS updatedAt
      FROM model_configs WHERE id = ?
    `);
    const row = statement.get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return { ...row, enabled: Boolean(row.enabled) } as ModelConfig & { apiKeyEncrypted?: string | null };
  }

  public findByName(name: string): (ModelConfig & { apiKeyEncrypted?: string | null }) | null {
    const statement = this.database.prepare(`
      SELECT
        id, name, provider, base_url AS baseUrl,
        api_key_encrypted AS apiKeyEncrypted, api_key_hint AS apiKeyHint,
        model_name AS modelName, temperature, max_tokens AS maxTokens,
        top_p AS topP, timeout_seconds AS timeoutSeconds,
        enabled, created_at AS createdAt, updated_at AS updatedAt
      FROM model_configs WHERE name = ?
    `);
    const row = statement.get(name) as Record<string, unknown> | undefined;
    if (!row) return null;
    return { ...row, enabled: Boolean(row.enabled) } as ModelConfig & { apiKeyEncrypted?: string | null };
  }

  public listAll(): ModelConfig[] {
    const statement = this.database.prepare(`
      SELECT
        id, name, provider, base_url AS baseUrl,
        api_key_hint AS apiKeyHint,
        model_name AS modelName, temperature, max_tokens AS maxTokens,
        top_p AS topP, timeout_seconds AS timeoutSeconds,
        enabled, created_at AS createdAt, updated_at AS updatedAt
      FROM model_configs ORDER BY updated_at DESC
    `);
    const rows = statement.all() as Record<string, unknown>[];
    return rows.map((row) => ({ ...row, enabled: Boolean(row.enabled) })) as ModelConfig[];
  }

  public update(id: string, updates: Record<string, SQLInputValue>): void {
    const fields: string[] = [];
    const values: Record<string, SQLInputValue> = { id };

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        const column = key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
        fields.push(`${column} = @${key}`);
        values[key] = key === "enabled" ? (value ? 1 : 0) : value;
      }
    }

    if (fields.length === 0) return;

    fields.push("updated_at = @updatedAt");
    values.updatedAt = new Date().toISOString();

    this.database.prepare(`UPDATE model_configs SET ${fields.join(", ")} WHERE id = @id`).run(values);
  }

  public deleteById(id: string): void {
    this.database.prepare("DELETE FROM model_configs WHERE id = ?").run(id);
  }
}
