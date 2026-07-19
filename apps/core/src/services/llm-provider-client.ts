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
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  contextReserveTokens?: number;
};

export type LlmChatMessage = {
  role: string;
  content: string;
  tool_call_id?: string;
  tool_calls?: unknown[];
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
    max_tokens: input.maxTokens ?? config.maxOutputTokens ?? config.maxTokens ?? 4096,
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

// ============================================
// Anthropic tool call 格式转换
// ============================================

/**
 * OpenAI tool 定义转 Anthropic tool 定义。
 * OpenAI: { type: "function", function: { name, description, parameters } }
 * Anthropic: { name, description, input_schema }
 */
const toAnthropicTools = (tools: unknown[]): unknown[] | undefined => {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((tool) => {
    const openaiTool = tool as {
      type?: string;
      function?: { name?: string; description?: string; parameters?: unknown };
    };
    if (openaiTool.function) {
      return {
        name: openaiTool.function.name,
        description: openaiTool.function.description,
        input_schema: openaiTool.function.parameters
      };
    }
    return tool;
  });
};

/**
 * Anthropic 响应中的 tool_use content block 转换为 OpenAI tool_calls 格式。
 * Anthropic: { type: "tool_use", id, name, input }
 * OpenAI: { id, type: "function", function: { name, arguments: "JSON string" } }
 */
const parseAnthropicToolCalls = (
  contentBlocks: Array<{ type?: string; text?: string; id?: string; name?: string; input?: unknown }>
): unknown[] | null => {
  const toolUseBlocks = contentBlocks.filter((block) => block.type === "tool_use");
  if (toolUseBlocks.length === 0) return null;
  return toolUseBlocks.map((block) => ({
    id: block.id ?? "",
    type: "function",
    function: {
      name: block.name ?? "",
      arguments: JSON.stringify(block.input ?? {})
    }
  }));
};

/**
 * 将 Anthropic 消息历史转换为 Anthropic Messages API 格式。
 * 处理 system prompt 提取、tool_call_id → tool_result 消息转换。
 */
const toAnthropicMessages = (
  messages: LlmChatMessage[]
): { system: string | undefined; messages: AnthropicMessage[] } => {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n") || undefined;

  const converted: AnthropicMessage[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;

    // OpenAI 格式的 tool 角色消息（tool 执行结果）需要转换为 Anthropic 的 tool_result
    if (message.role === "tool" && message.tool_call_id) {
      converted.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: message.tool_call_id,
            content: message.content
          }
        ]
      });
      continue;
    }

    // assistant 消息可能携带 tool_calls（上一轮 LLM 调用了工具）
    if (message.role === "assistant" && message.tool_calls && Array.isArray(message.tool_calls)) {
      const content: AnthropicContentBlock[] = [];
      if (message.content) {
        content.push({ type: "text", text: message.content });
      }
      for (const call of message.tool_calls as Array<{ id?: string; function?: { name?: string; arguments?: string } }>) {
        if (call.function?.name) {
          let input: unknown = {};
          try {
            input = call.function.arguments ? JSON.parse(call.function.arguments) : {};
          } catch {
            input = {};
          }
          content.push({
            type: "tool_use",
            id: call.id ?? "",
            name: call.function.name,
            input
          });
        }
      }
      converted.push({ role: "assistant", content });
      continue;
    }

    // 普通消息
    const role = message.role === "assistant" ? "assistant" as const : "user" as const;
    converted.push({ role, content: message.content });
  }

  return {
    system,
    messages: converted.length > 0 ? converted : [{ role: "user", content: "Hello, respond with 'ok'." }]
  };
};

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
};

const createAnthropicRequest = async (
  config: ModelConfigWithSecret,
  input: LlmChatInput
): Promise<LlmProviderResponse> => {
  const { system, messages } = toAnthropicMessages(input.messages);
  const body: Record<string, unknown> = {
    model: config.modelName ?? config.modelId,
    messages,
    max_tokens: input.maxTokens ?? config.maxOutputTokens ?? config.maxTokens ?? 4096,
    temperature: input.temperature ?? config.temperature ?? 0.7,
    top_p: input.topP ?? config.topP ?? 1.0
  };

  if (system) body.system = system;
  if (input.stream) body.stream = true;

  // Anthropic tool call 支持
  const anthropicTools = toAnthropicTools(input.tools ?? []);
  if (anthropicTools) body.tools = anthropicTools;
  if (input.tool_choice) {
    // OpenAI tool_choice 格式转换
    const choice = input.tool_choice as { type?: string; function?: { name?: string } };
    if (choice?.type === "auto") {
      body.tool_choice = { type: "auto" };
    } else if (choice?.type === "none") {
      // Anthropic 不支持 "none"，通过不传 tools 实现
    } else if (choice?.type === "function" && choice.function?.name) {
      body.tool_choice = { type: "tool", name: choice.function.name };
    }
  }

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
        content?: Array<{ type?: string; text?: string; id?: string; name?: string; input?: unknown }>;
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
      // 提取文本 content 和 tool_use blocks
      const contentBlocks = data.content ?? [];
      const textContent = contentBlocks
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("");
      const toolCalls = parseAnthropicToolCalls(contentBlocks);
      return {
        content: textContent,
        role: data.role ?? "assistant",
        tool_calls: toolCalls,
        usage
      };
    }
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
