import type {
  McpToolDefinition,
  McpToolResult,
  WebAgentRuntime,
  MessageType,
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

      const claimTypes: MessageType[] = runtime.role === "host"
        ? ["task", "instruction", "result"]
        : ["task", "instruction"];
      const message = services.messageService.claimNext(runtime.agentId, {
        types: claimTypes,
      });

      if (!message) {
        if (runtime.role === "knowledge_keeper") {
          await this.checkSelfTrigger(runtime, services);
        }
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

      const { result, sentDirectedResult, continueAwaiting } = await services.agentWorkflowRegistry.runWorkflow(
        runtime,
        services,
        payload,
        await this.getTools(runtime),
        message.type,
        message.correlationId ?? null
      );

      services.messageService.completeMessage(message.id, runtime.agentId, {});
      // 只有当 workflow 没有自己发送定向 result 时，executor 才发广播 result
      //（Keeper 的 report_to_host 已发定向 result，不需要再广播）
      if (!sentDirectedResult && !continueAwaiting) {
        services.messageService.sendMessage({
          sessionId: runtime.sessionId,
          fromAgentId: runtime.agentId,
          type: "result",
          payload: result || "completed",
          ...(message.correlationId ? { correlationId: message.correlationId } : {}),
        });
      }

      services.webAgentRuntimeService.update(runtimeId, {
        currentStep: "Waiting...",
        lastError: null,
        lastTickAt: new Date().toISOString(),
      });
      this.schedule(runtimeId, continueAwaiting ? 0 : pollMs);
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
    if (runtime.externalMcpServerIds && runtime.externalMcpServerIds.length > 0) {
      return services.mcpToolService.getMergedToolDefinitions(
        runtime.toolsetId,
        runtime.externalMcpServerIds,
        services
      );
    }
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
    if (runtime.customDuty) {
      parts.push(`# Custom Duty\n${runtime.customDuty}`);
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

  /**
   * 知识库维护者自主触发机制。
   * 当 tick 中没有待处理消息时，检查是否有需要自主维护的条件：
   * - session insight 有更新（用户偏好变更、Host 更新了 insight 等）
   * - 距离上次知识库更新超过冷却时间
   * 如果触发条件满足，给自己发一条 self_maintenance instruction 消息，下一轮 tick 会 claim 到。
   */
  private async checkSelfTrigger(
    runtime: WebAgentRuntime,
    services: ServerServices
  ): Promise<void> {
    try {
      const insight = services.sessionInsightService?.getSessionInsight(runtime.sessionId);
      if (!insight) return;

      // 条件1：用户输入有变更但知识库未同步
      const hasUnappliedUserInputs =
        insight.unappliedUserInputs && insight.unappliedUserInputs.length > 0;

      // 条件2：session insight 的 directive revision 与已应用的 revision 不同步
      const directiveOutOfSync =
        insight.latestUserDirectiveRevision > insight.appliedUserDirectiveRevision;

      // 冷却：距离上次自主维护不足 60 秒时不触发
      // 使用独立的 lastSelfMaintenanceAt 字段，不用 lastTickAt（后者每次 tick 都更新）
      if (runtime.lastSelfMaintenanceAt) {
        const elapsed = Date.now() - new Date(runtime.lastSelfMaintenanceAt).getTime();
        if (elapsed < 60_000) return;
      }

      if (hasUnappliedUserInputs || directiveOutOfSync) {
        // 更新 lastSelfMaintenanceAt，标记本次自主维护触发时间
        services.webAgentRuntimeService.update(runtime.id, {
          lastSelfMaintenanceAt: new Date().toISOString(),
        });
        // 构造 insight 快照，携带 Keeper 需要的实际维护内容
        const targetRevision = insight.latestUserDirectiveRevision;
        const insightSnapshot = {
          unappliedUserInputs: insight.unappliedUserInputs ?? [],
          latestUserDirectiveRevision: insight.latestUserDirectiveRevision,
          appliedUserDirectiveRevision: insight.appliedUserDirectiveRevision,
          objective: insight.objective ?? null,
          activePlanSummary: insight.activePlanSummary ?? null,
          currentProjectUnderstanding: insight.currentProjectUnderstanding ?? null,
          projectSummary: insight.projectSummary ?? null,
        };
        services.messageService.sendMessage({
          sessionId: runtime.sessionId,
          fromAgentId: runtime.agentId,
          toAgentId: runtime.agentId,
          type: "instruction",
          payload: {
            kind: "self_maintenance",
            reason: hasUnappliedUserInputs
              ? "unapplied_user_inputs"
              : "directive_out_of_sync",
            targetRevision,
            insightSnapshot,
            content: "Session insight has changed. Review the insight snapshot and update knowledge base accordingly.",
            source: "self_trigger",
          },
        });
      }
    } catch {
      // 自主触发失败不应影响 tick 循环
    }
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
