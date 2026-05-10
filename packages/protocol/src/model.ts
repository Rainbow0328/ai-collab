export const modelProviders = ["openai", "anthropic", "deepseek", "google", "custom"] as const;
export type ModelProvider = (typeof modelProviders)[number];

export type ModelConfig = {
  id: string;
  name: string;
  provider: ModelProvider;
  baseUrl: string;
  apiKeyHint: string | null;
  modelName: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  timeoutSeconds: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateModelConfigInput = {
  name: string;
  provider: ModelProvider;
  baseUrl: string;
  apiKey: string;
  modelName: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  timeoutSeconds?: number;
};

export type UpdateModelConfigInput = {
  name?: string;
  provider?: ModelProvider;
  baseUrl?: string;
  apiKey?: string;
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  timeoutSeconds?: number;
  enabled?: boolean;
};

export type TestModelConfigInput = {
  modelConfigId: string;
  prompt?: string;
};

export type TestModelConfigResult = {
  ok: boolean;
  latencyMs: number;
  response?: string;
  error?: string;
};
