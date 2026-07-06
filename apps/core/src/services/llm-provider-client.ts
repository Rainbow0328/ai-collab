type ModelConfigWithSecret = {
  provider: string;
  modelId?: string;
  modelName?: string;
  baseUrl: string;
  apiKeyEncrypted?: string | null;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  timeoutSeconds?: number;
};

export type LlmChatMessage = {
  role: string;
  content: string;
  tool_call_id?: string;
};

export type LlmChatInput = {
  messages: LlmChatMessage[];
  prompt?: string;
  tools?: unknown[];
  tool_choice?: unknown;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stream?: boolean;
};

export type LlmChatOutput = {
  content: string;
  role: string;
  tool_calls: unknown[] | null;
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
};

export type LlmProviderResponse = {
  response: Response;
  parse: () => Promise<LlmChatOutput>;
};

export const createLlmRequest = async (
  config: ModelConfigWithSecret,
  input: LlmChatInput
): Promise<LlmProviderResponse> => {
  if (config.provider === "anthropic") {
    return createAnthropicRequest(config, input);
  }

  return createOpenAiCompatibleRequest(config, input);
};

export const buildLlmTestMessages = (prompt?: string): LlmChatMessage[] => [
  { role: "user", content: prompt ?? "Hello, respond with 'ok'." }
];

const createOpenAiCompatibleRequest = async (
  config: ModelConfigWithSecret,
  input: LlmChatInput
): Promise<LlmProviderResponse> => {
  const body: Record<string, unknown> = {
    model: config.modelName ?? config.modelId,
    messages: input.messages,
    max_tokens: input.maxTokens ?? config.maxTokens ?? 4096,
    temperature: input.temperature ?? config.temperature ?? 0.7,
    top_p: input.topP ?? config.topP ?? 1.0
  };

  if (input.stream) body.stream = true;
  if (input.tools) body.tools = input.tools;
  if (input.tool_choice) body.tool_choice = input.tool_choice;

  const response = await fetch(appendEndpoint(config.baseUrl, "/chat/completions"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKeyEncrypted}`
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout((config.timeoutSeconds ?? 60) * 1000)
  });

  return {
    response,
    parse: async () => {
      const data = await response.json() as {
        choices?: { message?: { content?: string; role?: string; tool_calls?: unknown[] } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
      const message = data.choices?.[0]?.message;
      return {
        content: message?.content ?? "",
        role: message?.role ?? "assistant",
        tool_calls: message?.tool_calls ?? null,
        usage: data.usage ?? null
      };
    }
  };
};

const createAnthropicRequest = async (
  config: ModelConfigWithSecret,
  input: LlmChatInput
): Promise<LlmProviderResponse> => {
  const { system, messages } = toAnthropicMessages(input.messages);
  const body: Record<string, unknown> = {
    model: config.modelName ?? config.modelId,
    messages,
    max_tokens: input.maxTokens ?? config.maxTokens ?? 4096,
    temperature: input.temperature ?? config.temperature ?? 0.7,
    top_p: input.topP ?? config.topP ?? 1.0
  };

  if (system) body.system = system;
  if (input.stream) body.stream = true;

  const response = await fetch(appendEndpoint(config.baseUrl, "/v1/messages"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKeyEncrypted ?? "",
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout((config.timeoutSeconds ?? 60) * 1000)
  });

  return {
    response,
    parse: async () => {
      const data = await response.json() as {
        content?: { type?: string; text?: string }[];
        role?: string;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const promptTokens = data.usage?.input_tokens;
      const completionTokens = data.usage?.output_tokens;
      const usage: LlmChatOutput["usage"] = data.usage ? {} : null;
      if (usage && promptTokens !== undefined) usage.prompt_tokens = promptTokens;
      if (usage && completionTokens !== undefined) usage.completion_tokens = completionTokens;
      if (usage && promptTokens !== undefined && completionTokens !== undefined) {
        usage.total_tokens = promptTokens + completionTokens;
      }
      return {
        content: data.content?.map((part) => part.text ?? "").join("") ?? "",
        role: data.role ?? "assistant",
        tool_calls: null,
        usage
      };
    }
  };
};

const toAnthropicMessages = (
  messages: LlmChatMessage[]
): { system: string | undefined; messages: { role: "user" | "assistant"; content: string }[] } => {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n") || undefined;

  const converted = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" as const : "user" as const,
      content: message.content
    }));

  return {
    system,
    messages: converted.length > 0 ? converted : [{ role: "user", content: "Hello, respond with 'ok'." }]
  };
};

const appendEndpoint = (baseUrl: string, endpoint: string): string => {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  if (normalizedBase.endsWith(normalizedEndpoint)) {
    return normalizedBase;
  }
  return `${normalizedBase}${normalizedEndpoint}`;
};
