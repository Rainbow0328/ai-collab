import { randomUUID } from "node:crypto";
import type { SQLInputValue } from "node:sqlite";
import type { ModelConfig, CreateModelConfigInput, UpdateModelConfigInput, TestModelConfigInput, TestModelConfigResult } from "@ai-collab/protocol";
import { coreErrors } from "../errors.js";
import type { ModelConfigRepository } from "@ai-collab/store";

export class ModelConfigService {
  public constructor(private readonly repository: ModelConfigRepository) {}

  public create(input: CreateModelConfigInput): ModelConfig {
    const existing = this.repository.findByName(input.name);
    if (existing) {
      throw coreErrors.duplicateSessionName(input.name);
    }

    const now = new Date().toISOString();
    const config: ModelConfig & { apiKeyEncrypted?: string | null } = {
      id: randomUUID(),
      name: input.name,
      provider: input.provider,
      baseUrl: input.baseUrl,
      apiKeyHint: input.apiKey ? `${input.apiKey.slice(0, 4)}...${input.apiKey.slice(-4)}` : null,
      apiKeyEncrypted: input.apiKey ?? null,
      modelName: input.modelName,
      temperature: input.temperature ?? 0.7,
      maxTokens: input.maxTokens ?? 4096,
      topP: input.topP ?? 1.0,
      timeoutSeconds: input.timeoutSeconds ?? 60,
      enabled: true,
      createdAt: now,
      updatedAt: now
    };

    this.repository.insert(config);
    return this.toPublic(config);
  }

  public get(id: string): ModelConfig {
    const config = this.repository.findById(id);
    if (!config) {
      throw coreErrors.agentNotFound(id);
    }
    return this.toPublic(config);
  }

  public list(): ModelConfig[] {
    return this.repository.listAll();
  }

  public update(id: string, input: UpdateModelConfigInput): ModelConfig {
    const existing = this.repository.findById(id);
    if (!existing) {
      throw coreErrors.agentNotFound(id);
    }

    if (input.name && input.name !== existing.name) {
      const nameConflict = this.repository.findByName(input.name);
      if (nameConflict && nameConflict.id !== id) {
        throw coreErrors.duplicateSessionName(input.name);
      }
    }

    const updates: Record<string, SQLInputValue> = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.provider !== undefined) updates.provider = input.provider;
    if (input.baseUrl !== undefined) updates.baseUrl = input.baseUrl;
    if (input.apiKey !== undefined && input.apiKey !== "") {
      updates.apiKeyEncrypted = input.apiKey;
      updates.apiKeyHint = `${input.apiKey.slice(0, 4)}...${input.apiKey.slice(-4)}`;
    }
    if (input.modelName !== undefined) updates.modelName = input.modelName;
    if (input.temperature !== undefined) updates.temperature = input.temperature;
    if (input.maxTokens !== undefined) updates.maxTokens = input.maxTokens;
    if (input.topP !== undefined) updates.topP = input.topP;
    if (input.timeoutSeconds !== undefined) updates.timeoutSeconds = input.timeoutSeconds;
    if (input.enabled !== undefined) updates.enabled = input.enabled ? 1 : 0;

    this.repository.update(id, updates);
    return this.get(id);
  }

  public delete(id: string): { deleted: boolean } {
    const existing = this.repository.findById(id);
    if (!existing) {
      throw coreErrors.agentNotFound(id);
    }
    this.repository.deleteById(id);
    return { deleted: true };
  }

  public async test(input: TestModelConfigInput): Promise<TestModelConfigResult> {
    const config = this.repository.findById(input.modelConfigId);
    if (!config) {
      return { ok: false, latencyMs: 0, error: "Model config not found" };
    }

    const start = Date.now();
    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.apiKeyEncrypted}`
        },
        body: JSON.stringify({
          model: config.modelName,
          messages: [{ role: "user", content: input.prompt ?? "Hello, respond with 'ok'." }],
          max_tokens: 50,
          temperature: 0
        }),
        signal: AbortSignal.timeout(config.timeoutSeconds * 1000)
      });

      if (!response.ok) {
        const text = await response.text();
        return { ok: false, latencyMs: Date.now() - start, error: `HTTP ${response.status}: ${text}` };
      }

      const data = await response.json() as { choices?: { message?: { content?: string } }[] };
      return {
        ok: true,
        latencyMs: Date.now() - start,
        response: data.choices?.[0]?.message?.content ?? "No response content"
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { ok: false, latencyMs: Date.now() - start, error: message };
    }
  }

  private toPublic(config: ModelConfig & { apiKeyEncrypted?: string | null }): ModelConfig {
    const { apiKeyEncrypted, ...publicConfig } = config;
    return publicConfig;
  }
}
