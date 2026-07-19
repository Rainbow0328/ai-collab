import type { DatabaseSync } from "node:sqlite";

export interface ModelConfigRecord {
  id: string;
  name: string;
  provider: string;
  modelId: string;
  apiKey: string | null;
  baseUrl: string | null;
  contextWindowTokens: number;
  maxOutputTokens: number;
  contextReserveTokens: number;
  createdAt: string;
  updatedAt: string;
}

export interface ModelConfigWithSecret extends ModelConfigRecord {
  modelName: string;
  baseUrl: string;
  apiKeyEncrypted: string | null;
  timeoutSeconds: number;
  contextWindowTokens: number;
  maxOutputTokens: number;
  contextReserveTokens: number;
}

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS model_configs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    model_id TEXT NOT NULL,
    api_key TEXT,
    base_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

export class ModelConfigRepository {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
    this.db.exec(CREATE_TABLE);
  }

  public findById(id: string): ModelConfigRecord | null {
    const statement = this.db.prepare(
      "SELECT id, name, provider, model_id AS modelId, api_key AS apiKey, base_url AS baseUrl, context_window_tokens AS contextWindowTokens, max_output_tokens AS maxOutputTokens, context_reserve_tokens AS contextReserveTokens, created_at AS createdAt, updated_at AS updatedAt FROM model_configs WHERE id = ?"
    );
    const row = statement.get(id) as Record<string, string | null> | undefined;
    return row ? (row as unknown as ModelConfigRecord) : null;
  }

  public getFull(id: string): ModelConfigWithSecret {
    const record = this.findById(id);
    if (!record) {
      throw new Error(`Model config '${id}' not found.`);
    }
    return {
      ...record,
      modelName: record.modelId,
      baseUrl: record.baseUrl ?? resolveModelBaseUrl(record.provider),
      apiKeyEncrypted: record.apiKey ?? resolveModelApiKey(record.provider),
      timeoutSeconds: 60,
      contextWindowTokens: record.contextWindowTokens ?? 128000,
      maxOutputTokens: record.maxOutputTokens ?? 4096,
      contextReserveTokens: record.contextReserveTokens ?? 1000
    };
  }

  public list(): ModelConfigRecord[] {
    const statement = this.db.prepare(
      "SELECT id, name, provider, model_id AS modelId, api_key AS apiKey, base_url AS baseUrl, context_window_tokens AS contextWindowTokens, max_output_tokens AS maxOutputTokens, context_reserve_tokens AS contextReserveTokens, created_at AS createdAt, updated_at AS updatedAt FROM model_configs ORDER BY name"
    );
    const rows = statement.all() as Record<string, string | null>[];
    return rows as unknown as ModelConfigRecord[];
  }

  public upsert(record: ModelConfigRecord): void {
    const statement = this.db.prepare(`
      INSERT INTO model_configs (id, name, provider, model_id, api_key, base_url, context_window_tokens, max_output_tokens, context_reserve_tokens, created_at, updated_at)
      VALUES (@id, @name, @provider, @modelId, @apiKey, @baseUrl, @contextWindowTokens, @maxOutputTokens, @contextReserveTokens, @createdAt, @updatedAt)
      ON CONFLICT (id) DO UPDATE SET
        name = excluded.name,
        provider = excluded.provider,
        model_id = excluded.model_id,
        api_key = excluded.api_key,
        base_url = excluded.base_url,
        context_window_tokens = excluded.context_window_tokens,
        max_output_tokens = excluded.max_output_tokens,
        context_reserve_tokens = excluded.context_reserve_tokens,
        updated_at = excluded.updated_at
    `);
    statement.run({
      id: record.id,
      name: record.name,
      provider: record.provider,
      modelId: record.modelId,
      apiKey: record.apiKey,
      baseUrl: record.baseUrl,
      contextWindowTokens: record.contextWindowTokens,
      maxOutputTokens: record.maxOutputTokens,
      contextReserveTokens: record.contextReserveTokens,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  public delete(id: string): void {
    const statement = this.db.prepare("DELETE FROM model_configs WHERE id = ?");
    statement.run(id);
  }
}

const resolveModelBaseUrl = (provider: string): string => {
  if (provider === "anthropic") {
    return process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com";
  }
  return process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
};

const resolveModelApiKey = (provider: string): string | null => {
  if (provider === "anthropic") {
    return process.env.ANTHROPIC_API_KEY ?? null;
  }
  return process.env.OPENAI_API_KEY ?? null;
};
