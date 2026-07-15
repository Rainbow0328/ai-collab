import type {
  McpToolDefinition,
  McpToolResult,
  WebAgentRuntime,
} from "@loopmarshal/protocol";
import type { ServerServices } from "../server/create-server.js";
import { createLlmRequest, type LlmChatMessage } from "./llm-provider-client.js";

type RunningLoop = {
  timer: ReturnType<typeof setTimeout> | null;
  stopped: boolean;
};

const DEFAULT_MAX_TOOL_ROUNDS = 15;

export class WebAgentRuntimeExecutorService {
  private loops = new Map<string, RunningLoop>();

  public constructor(private readonly getServices: () => ServerServices) {}

  public start(runtime: WebAgentRuntime): void {
    this.stop(runtime.id);
    const loop: RunningLoop = { timer: null, stopped: false };
    this.loops.set(runtime.id, loop);
    void this.tick(runtime.id);
  }

  public stop(runtimeId: string): void {
    const loop = this.loops.get(runtimeId);
    if (!loop) return;
    loop.stopped = true;
    if (loop.timer) clearTimeout(loop.timer);
    this.loops.delete(runtimeId);
  }

  public stopAll(): void {
    for (const id of [...this.loops.keys()]) {
      this.stop(id);
    }
  }

  private async tick(runtimeId: string): Promise<void> {
    const loop = this.loops.get(runtimeId);
    if (!loop || loop.stopped) return;
    const services = this.getServices();
    const runtime = services.webAgentRuntimeService.get(runtimeId);
    if (!runtime.enabled || runtime.status !== "running") {
      this.stop(runtimeId);
      return;
    }

    const pollMs = 5 * 1000;
    let claimedMessageId: string | null = null;
    let claimedCorrelationId: string | null = null;

    try {
      services.webAgentRuntimeService.update(runtimeId, {
        currentStep: "Claiming message...",
        lastError: null,
        lastTickAt: new Date().toISOString(),
      });

      const message = services.messageService.claimNext(runtime.agentId, {
        types: ["task", "instruction"],
      });

      if (!message) {
        this.schedule(runtimeId, pollMs);
        return;
      }
      claimedMessageId = message.id;
      claimedCorrelationId = message.correlationId ?? null;

      const payload = typeof message.payload === "string"
        ? message.payload
        : JSON.stringify(message.payload ?? "");
      services.webAgentRuntimeService.update(runtimeId, {
        currentStep: `Processing ${message.type}...`,
        lastTickAt: new Date().toISOString(),
      });

      const result = await this.runToolLoop(runtime, [
        { role: "user", content: payload },
      ]);

      services.messageService.completeMessage(message.id, runtime.agentId, {});
      services.messageService.sendMessage({
        sessionId: runtime.sessionId,
        fromAgentId: runtime.agentId,
        type: "result",
        payload: result || "completed",
        ...(message.correlationId ? { correlationId: message.correlationId } : {}),
      });

      services.webAgentRuntimeService.update(runtimeId, {
        currentStep: "Waiting...",
        lastError: null,
        lastTickAt: new Date().toISOString(),
      });
      this.schedule(runtimeId, pollMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown runtime error";
      if (claimedMessageId) {
        try {
          services.messageService.failMessage(claimedMessageId, runtime.agentId, message, {});
          services.messageService.sendMessage({
            sessionId: runtime.sessionId,
            fromAgentId: runtime.agentId,
            type: "error",
            payload: { content: message, source: "web_agent_runtime" },
            ...(claimedCorrelationId ? { correlationId: claimedCorrelationId } : {}),
          });
        } catch {
          // Keep the runtime error visible even if message failure reporting itself fails.
        }
      }
      services.webAgentRuntimeService.update(runtimeId, {
        status: "error",
        currentStep: null,
        lastError: message,
        lastTickAt: new Date().toISOString(),
      });
      this.stop(runtimeId);
    }
  }

  private async runToolLoop(
    runtime: WebAgentRuntime,
    userMessages: LlmChatMessage[]
  ): Promise<string> {
    const services = this.getServices();
    const model = services.modelConfigService.getFull(runtime.modelConfigId);
    const tools = await this.getTools(runtime);
    const maxRounds = DEFAULT_MAX_TOOL_ROUNDS;
    const messages: LlmChatMessage[] = [
      { role: "system", content: this.buildSystemPrompt(runtime, tools) },
      ...userMessages,
    ];
    let lastContent = "";

    for (let round = 0; round < maxRounds; round++) {
      const { response, parse } = await createLlmRequest(model, {
        messages,
        tools: tools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        })),
        tool_choice: "auto",
      });

      if (!response.ok) {
        throw new Error(`LLM HTTP ${response.status}: ${await response.text()}`);
      }

      const output = await parse();
      if (output.content) lastContent = output.content;

      const toolCalls = normalizeToolCalls(output.tool_calls);
      if (toolCalls.length === 0) break;

      messages.push({ role: "assistant", content: output.content ?? "" });
      for (const call of toolCalls) {
        const result = await this.executeTool(runtime, call.name, call.arguments);
        messages.push({
          role: "tool",
          content: result.success ? JSON.stringify(result.result ?? "") : `Error: ${result.error ?? "Unknown tool error"}`,
          tool_call_id: call.id,
        });
      }
    }

    return lastContent;
  }

  private async getTools(
    runtime: WebAgentRuntime
  ): Promise<McpToolDefinition[]> {
    const services = this.getServices();
    return services.mcpToolService.getToolsetDefinitions(runtime.toolsetId);
  }

  private buildSystemPrompt(
    runtime: WebAgentRuntime,
    tools: McpToolDefinition[]
  ): string {
    const parts = [
      getDefaultRolePrompt(runtime.role),
      `# Identity\nYour role is ${runtime.role}.`,
      "# Runtime\nYou are running on the core server. Continue working even if the browser is closed.",
    ];
    if (runtime.role === "host") {
      parts.push("You are the session Host. Coordinate tasks, dispatch work, read knowledge, and resolve reports through tools.");
    }
    if (runtime.role === "knowledge_keeper") {
      parts.push("You are the Knowledge Keeper. Maintain project knowledge through knowledge tools, and maintain cross-project user habits through user preference tools.");
    }
    const preferences = this.getGlobalUserPreferences(runtime);
    if (preferences) {
      parts.push(preferences);
    }
    parts.push(`# Tools\n${tools.map((tool) => `- ${tool.name}: ${tool.description}`).join("\n")}`);
    return parts.filter(Boolean).join("\n\n");
  }

  private getGlobalUserPreferences(_runtime: WebAgentRuntime): string {
    const preferences = this.getServices()
      .userPreferencesService
      .list()
      .slice(0, 50);
    if (preferences.length === 0) return "";

    const lines = preferences.map((preference) => {
      const category = preference.category ? `[${preference.category}] ` : "";
      return `- ${category}${preference.key}: ${truncatePreferenceValue(preference.value)}`;
    });
    return [
      "# Global User Preferences",
      "These preferences apply across projects. Read them as durable user habits. Do not update them unless the user clearly establishes a reusable preference.",
      ...lines
    ].join("\n");
  }

  private async executeTool(
    runtime: WebAgentRuntime,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const services = this.getServices();
    const result = await services.mcpToolService.executeTool(
      toolName,
      args,
      runtime.agentId,
      runtime.sessionId,
      services
    );
    return {
      toolCallId: "",
      toolName,
      success: result.success,
      result: result.result,
      ...(result.error !== undefined ? { error: result.error } : {}),
    };
  }

  private schedule(runtimeId: string, delayMs: number): void {
    const loop = this.loops.get(runtimeId);
    if (!loop || loop.stopped) return;
    loop.timer = setTimeout(() => void this.tick(runtimeId), delayMs);
  }
}

function truncatePreferenceValue(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 500 ? `${compact.slice(0, 497)}...` : compact;
}

function getDefaultRolePrompt(role: WebAgentRuntime["role"]): string {
  if (role === "host") {
    return "You are the default session Host. Coordinate work through messages and tools. Do not modify source files directly.";
  }
  return "You are the default Knowledge Keeper. Maintain project knowledge through knowledge tools, and maintain global user habits through user preference tools. Do not modify business source files.";
}

function normalizeToolCalls(toolCalls: unknown[] | null): Array<{
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}> {
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls.flatMap((item, index) => {
    const call = item as { id?: string; function?: { name?: string; arguments?: string } };
    const name = call.function?.name;
    if (!name) return [];
    let args: Record<string, unknown> = {};
    try {
      args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
    } catch {
      args = {};
    }
    return [{ id: call.id ?? `tool-${index}`, name, arguments: args }];
  });
}
