/**
 * Agent 工作流注册表。
 *
 * 使用 langgraph StateGraph 在代码层强制角色职责流程。
 * 默认工作流替代了 Skill 提示词——行为约束从"建议"变为"代码强制"。
 *
 * 用户创建 Agent 时不需要挂默认 Skill——工作流本身就是默认 Skill 的代码化。
 * 用户只需添加额外的自定义 Skill（工具、节点、领域知识）来扩展能力。
 */
import { randomUUID } from "node:crypto";
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import type { WebAgentRuntime, McpToolDefinition, McpToolResult, KnowledgeLevel, AgentContextEnvelope } from "@loopmarshal/protocol";
import type { ServerServices } from "../server/create-server.js";
import { createLlmRequest, type LlmChatMessage } from "./llm-provider-client.js";
import { buildContextEnvelope, renderContextEnvelope } from "./agent-context-builder.js";

// ============================================
// 共享状态类型
// ============================================

const WorkflowState = Annotation.Root({
  runtime: Annotation<WebAgentRuntime>,
  services: Annotation<ServerServices>,
  taskContent: Annotation<string>,
  tools: Annotation<McpToolDefinition[]>,
  messages: Annotation<LlmChatMessage[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  // 角色间传递的中间结果
  architecture: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  knowledgeRefs: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  reviewNotes: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  hasKeeper: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),
  architectureConfirmed: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),
  messageType: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "task",
  }),
  messagePayloadKind: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  correlationId: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  isSelfMaintenance: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),
  // 自主维护触发时的目标 revision（防止并发丢失后续新增输入）
  targetRevision: Annotation<number | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  // knowledge_update 是否成功（全部计划更新成功且工具返回有效结果）
  knowledgeUpdateSucceeded: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),
  // 自检是否通过
  selfCheckPassed: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),
  // 计划更新文档的 refs 列表（来自 understand_task）
  plannedRefs: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  // 真实记录 report_to_host 是否发送了定向 result
  sentDirectedResult: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),
  result: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
  continueAwaiting: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),
  // 四层上下文信封——每次 LLM 调用前由 AgentContextBuilder 组装
  contextEnvelope: Annotation<AgentContextEnvelope | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
});

type WorkflowStateType = typeof WorkflowState.State;

// ============================================
// LLM 辅助
// ============================================

const llmComplete = async (
  services: ServerServices,
  modelConfigId: string,
  systemPrompt: string,
  userContent: string,
  tools?: McpToolDefinition[]
): Promise<{ content: string; toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> }> => {
  // 测试注入：如果 services 上有 llmOverride，直接使用它，跳过 HTTP 调用
  if (services.llmOverride) {
    return services.llmOverride(systemPrompt, userContent, tools);
  }
  const model = services.modelConfigService.getFull(modelConfigId);
  const messages: LlmChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];

  const { response, parse } = await createLlmRequest(model, {
    messages,
    ...(tools && tools.length > 0
      ? {
          tools: tools.map((tool) => ({
            type: "function" as const,
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            },
          })),
        }
      : {}),
  });

  if (!response.ok) {
    throw new Error(`LLM HTTP ${response.status}: ${await response.text()}`);
  }

  const output = await parse();
  const toolCalls = normalizeToolCalls(output.tool_calls);
  return { content: output.content ?? "", toolCalls };
};

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

const executeTool = async (
  services: ServerServices,
  runtime: WebAgentRuntime,
  toolName: string,
  args: Record<string, unknown>
): Promise<McpToolResult> => {
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
};

// ============================================
// 辅助：为工作流节点构建上下文信封并追加交互记录
// ============================================

/**
 * 为工作流节点构建四层上下文信封。
 * 所有 Host 和 Keeper 节点统一使用此函数。
 */
async function buildNodeContext(
  state: WorkflowStateType,
  currentEvent: string,
  stepPrompt: string,
): Promise<{ systemPrompt: string; userContent: string }> {
  const { runtime, services } = state;

  let insight = null;
  try {
    insight = services.sessionInsightService?.getSessionInsight(runtime.sessionId) ?? null;
  } catch { /* skip */ }

  let contextSnapshot = null;
  try {
    contextSnapshot = services.agentContextService?.load(runtime.id) ?? null;
  } catch { /* skip */ }

  const tools = state.tools ?? [];
  const envelope = buildContextEnvelope({
    runtime,
    services,
    currentEvent,
    tools,
    insight,
    contextSnapshot,
  });

  const { systemPrompt, userContent } = renderContextEnvelope(envelope);
  return {
    systemPrompt: systemPrompt + "\n\n---\n\n" + stepPrompt,
    userContent,
  };
}

/**
 * 追加交互记录到上下文快照。
 * 所有节点执行后调用此函数（Fix 7）。
 */
function appendTurnToContext(
  state: WorkflowStateType,
  role: "user" | "assistant" | "tool" | "system",
  content: string,
): void {
  try {
    state.services.agentContextService?.appendTurn(state.runtime, {
      role,
      content,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // agentContextService 不存在时跳过
  }
}

// ============================================
// 辅助：规范化知识 ref（统一小写 level + slug）
// ============================================

const VALID_KNOWLEDGE_LEVELS = ["l1", "l2", "l3"] as const;

function normalizeKnowledgeRef(level: unknown, slug: unknown): string | null {
  if (level === undefined || slug === undefined) return null;
  const normalizedLevel = String(level).trim().toLowerCase();
  const normalizedSlug = String(slug).trim().toLowerCase();
  if (!VALID_KNOWLEDGE_LEVELS.includes(normalizedLevel as typeof VALID_KNOWLEDGE_LEVELS[number])) {
    return null;
  }
  if (normalizedSlug.length === 0) return null;
  return `${normalizedLevel}/${normalizedSlug}`;
}

function normalizeKnowledgeLevel(level: unknown): KnowledgeLevel | null {
  if (level === undefined) return null;
  const normalized = String(level).trim().toLowerCase();
  if (!VALID_KNOWLEDGE_LEVELS.includes(normalized as typeof VALID_KNOWLEDGE_LEVELS[number])) {
    return null;
  }
  return normalized as KnowledgeLevel;
}

// ============================================
// 辅助：从 payload 提取 kind
// ============================================

const extractPayloadKind = (taskContent: string): string | null => {
  try {
    const parsed = JSON.parse(taskContent);
    if (parsed && typeof parsed === "object" && "kind" in parsed) {
      return String(parsed.kind);
    }
  } catch {
    // 不是 JSON
  }
  return null;
};

// ============================================
// Host 工作流
// ============================================

const HOST_SYSTEM_PROMPT = `You are the session Host running on the core server. Continue working even if the browser is closed.

Your workflow is enforced by code — you cannot skip steps:
1. Receive user input. Determine whether the user has confirmed the architecture and is ready to start work.
2. If not confirmed: communicate with the user to refine requirements and architecture. End this turn and wait for the next user message.
3. If confirmed: design the architecture plan (L1 direction, L2 modules, L3 contracts).
4. Check if a Knowledge Keeper exists in the session.
5. If Keeper exists: dispatch knowledge maintenance task to Keeper. After Keeper reports back, review the knowledge base.
6. If Keeper does NOT exist: maintain knowledge base yourself. You do NOT need to review your own output — skip the review step.
7. Dispatch implementation tasks to workers.

You are the architect and final arbiter.`;

const buildHostWorkflow = () => {
  const graph = new StateGraph(WorkflowState)
    // 节点0：路由——根据消息类型和 payload kind 选择路径
    .addNode("route_message", async (state: WorkflowStateType) => {
      const payloadKind = state.messagePayloadKind ?? extractPayloadKind(state.taskContent);
      return { messagePayloadKind: payloadKind };
    })
    // 节点1：接收用户输入，判断架构是否已确认
    // 使用四层上下文信封注入多轮连续性（C0-C3）
    .addNode("receive_user_input", async (state: WorkflowStateType) => {
      const { runtime, services, taskContent } = state;

      // 构建四层上下文信封
      let insight = null;
      try {
        insight = services.sessionInsightService?.getSessionInsight(runtime.sessionId) ?? null;
      } catch {
        // sessionInsightService 不存在时跳过
      }

      let contextSnapshot = null;
      try {
        contextSnapshot = services.agentContextService?.load(runtime.id) ?? null;
      } catch {
        // agentContextService 不存在时跳过
      }

      const tools = state.tools ?? [];
      const envelope = buildContextEnvelope({
        runtime,
        services,
        currentEvent: `# User Message
${taskContent}`,
        tools,
        insight,
        contextSnapshot,
      });

      const { systemPrompt, userContent } = renderContextEnvelope(envelope);

      const { content } = await llmComplete(
        services,
        runtime.modelConfigId,
        systemPrompt + "\n\n---\n\n# Step 1: Receive User Input\nAnalyze the user's message. Determine: has the user confirmed the architecture and is ready to start implementation work?\n\nReply with:\n- CONFIRMED: if the user has confirmed and wants to start work\n- NOT_CONFIRMED: if the user is still discussing requirements, refining ideas, or hasn't given a clear go-ahead\n- Then provide your response to the user.",
        userContent
      );
      const confirmed = content.toUpperCase().includes("CONFIRMED") && !content.toUpperCase().includes("NOT_CONFIRMED");

      // 追加本轮交互到上下文快照
      try {
        services.agentContextService?.appendTurn(runtime, {
          role: "user",
          content: taskContent,
          timestamp: new Date().toISOString(),
        });
        services.agentContextService?.appendTurn(runtime, {
          role: "assistant",
          content,
          timestamp: new Date().toISOString(),
        });
      } catch {
        // agentContextService 不存在时跳过
      }

      return {
        architectureConfirmed: confirmed,
        result: content,
        contextEnvelope: envelope,
        messages: [{ role: "assistant", content }]
      };
    })
    // 节点2a：未确认——和用户沟通，结束本轮
    .addNode("communicate_with_user", async () => {
      // result 已经在 receive_user_input 中设置，直接结束本轮
      // 下一轮 tick 会 claim 到用户的新消息
      return {};
    })
    // 节点2b：已确认——设计架构
    // 使用 Context Builder 注入多轮上下文（Fix 1）
    .addNode("design_architecture", async (state: WorkflowStateType) => {
      const { runtime, services, taskContent } = state;
      const { systemPrompt, userContent } = await buildNodeContext(
        state,
        `# User's Confirmed Goal\n${taskContent}`,
        "# Step 2: Design Architecture\nThe user has confirmed. Now design the architecture plan.\nOutput:\n- L1 direction: system goals, core users, scope, acceptance criteria\n- L2 modules: feature modules, boundaries\n- L3 contracts: data models, interfaces, routes, error codes",
      );
      const { content } = await llmComplete(services, runtime.modelConfigId, systemPrompt, userContent);
      // 将 architecture 和原始用户 goal 持久化到 session insight
      try {
        services.sessionInsightService?.updateSessionInsight({
          sessionId: runtime.sessionId,
          updatedByAgentId: runtime.agentId,
          activePlanSummary: content,
          objective: taskContent,
        });
      } catch {
        // sessionInsightService 不存在或更新失败不影响流程
      }
      appendTurnToContext(state, "assistant", content);
      return { architecture: content, messages: [{ role: "assistant", content }] };
    })
    // 节点3：检查是否存在 Knowledge Keeper
    .addNode("check_keeper", async (state: WorkflowStateType) => {
      const { services, runtime } = state;
      const members = services.sessionService.listMembers(runtime.sessionId);
      const hasKeeper = members.some((m: { role: string }) => m.role === "knowledge_keeper");
      return { hasKeeper };
    })
    // 节点4a：有 Keeper——通过 send_message 工具派发知识库维护任务
    .addNode("dispatch_to_keeper", async (state: WorkflowStateType) => {
      const { runtime, services, architecture } = state;
      const keeper = services.sessionService.listMembers(runtime.sessionId)
        .find((m: { role: string; id: string }) => m.role === "knowledge_keeper");
      if (keeper) {
        // 生成 correlationId 用于关联 Keeper 回报
        const correlationId = `keeper-maintain:${randomUUID()}`;
      // 统一通过 send_message 工具派发，保持 MCP 工具边界
      const result = await executeTool(services, runtime, "send_message", {
        type: "task",
        content: JSON.stringify({
          kind: "knowledge_maintenance",
          content: `Maintain knowledge base according to this architecture plan:\n\n${architecture}`,
          requirements: ["refs", "summaries", "uncertainties", "conflicts"],
        }),
        toAgentId: keeper.id,
        correlationId,
      });
      if (result.success) {
        return {
          continueAwaiting: true,
          correlationId,
          messages: [{ role: "system", content: "Dispatched knowledge maintenance task to Knowledge Keeper." }],
        };
      }
      return { result: `Failed to dispatch to Keeper: ${result.error ?? "unknown error"}` };
      }
      return { hasKeeper: false };
    })
    // 节点4b：无 Keeper——自己维护知识库
    // 使用 Context Builder（Fix 1）
    .addNode("self_maintain_knowledge", async (state: WorkflowStateType) => {
      const { runtime, services, architecture } = state;
      const { systemPrompt, userContent } = await buildNodeContext(
        state,
        `# Architecture Plan\n${architecture}`,
        "# Step 3 (self-maintain): Maintain Knowledge Base\nNo Knowledge Keeper exists. You are maintaining the knowledge base yourself.\nOutput a JSON array of documents to create or update. Each document needs: level (L1/L2/L3), slug, title, and content.\n\nExample:\n[{\"level\":\"L1\",\"slug\":\"direction\",\"title\":\"Project Direction\",\"content\":\"...\"}]",
      );
      const { content } = await llmComplete(services, runtime.modelConfigId, systemPrompt, userContent);
      // 解析 LLM 输出的文档列表，直接调用 knowledgeService 写入
      const updatedRefs: string[] = [];
      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const docs = JSON.parse(jsonMatch[0]) as Array<{ level: string; slug: string; title: string; content: string }>;
          for (const doc of docs) {
            const ref = normalizeKnowledgeRef(doc.level, doc.slug);
            const normalizedLevel = normalizeKnowledgeLevel(doc.level);
            if (ref && normalizedLevel && doc.title && doc.content) {
              services.knowledgeService.upsert({
                level: normalizedLevel,
                slug: String(doc.slug).trim().toLowerCase(),
                title: doc.title,
                content: doc.content,
                sourceKind: "host_update",
                sourceAgentId: runtime.agentId
              });
              updatedRefs.push(ref);
            }
          }
        }
      } catch {
        // 解析失败时跳过
      }
      appendTurnToContext(state, "assistant", content);
      return { knowledgeRefs: updatedRefs, messages: [{ role: "assistant", content }] };
    })
    // 节点5：复审知识库（仅当收到 Keeper result 时执行）
    // 使用 Context Builder（Fix 1）
    .addNode("review_knowledge", async (state: WorkflowStateType) => {
      const { runtime, services } = state;
      // 从 session insight 恢复 architecture（跨轮次持久化）
      let architecture = state.architecture;
      if (!architecture) {
        try {
          const insight = services.sessionInsightService?.getSessionInsight(runtime.sessionId);
          architecture = insight?.activePlanSummary ?? null;
        } catch {
          // sessionInsightService 不存在时跳过
        }
      }
      const manifest = services.knowledgeService.getManifest();
      const manifestText = JSON.stringify(manifest, null, 2);
      const { systemPrompt, userContent } = await buildNodeContext(
        state,
        `# Architecture Plan\n${architecture}\n\n# Current Knowledge Base Manifest\n${manifestText}`,
        "# Step 4: Review Knowledge Base\nThe Knowledge Keeper has maintained the knowledge base. Review it against your architecture intent.\nCheck:\n- Faithful reflection of your architecture\n- No missing modules/interfaces/fields\n- No over-engineering\n- Sufficient for worker implementation\nOutput a JSON object with: verdict (string: \"pass\" or \"fail\"), reasons (array of strings), missingRefs (array of strings), conflicts (array of strings).",
      );
      const { content } = await llmComplete(services, runtime.modelConfigId, systemPrompt, userContent);
      appendTurnToContext(state, "assistant", content);
      return { architecture, reviewNotes: content, messages: [{ role: "assistant", content }] };
    })
    // 节点6：派发实现任务——真正向 Worker 发送 task 消息
    // 使用 Context Builder（Fix 1）
    .addNode("dispatch_implementation", async (state: WorkflowStateType) => {
      const { runtime, services, taskContent, architecture, reviewNotes } = state;
      // 从 session insight 恢复原始用户 goal（跨轮次持久化）
      let originalGoal = taskContent;
      try {
        const insight = services.sessionInsightService?.getSessionInsight(runtime.sessionId);
        if (state.messagePayloadKind === "knowledge_maintenance_report" && insight?.objective) {
          originalGoal = insight.objective;
        }
      } catch {
        // sessionInsightService 不存在时跳过
      }
      const workers = services.sessionService.listMembers(runtime.sessionId)
        .filter((m: { role: string; id: string; agentName?: string; displayName?: string }) => m.role === "worker");
      const workerList = workers.length > 0
        ? workers.map((w: { id: string; agentName?: string; displayName?: string }) => `- agentId: ${w.id}, name: ${w.displayName ?? w.agentName ?? "unknown"}`).join("\n")
        : "(no workers available)";
      const eventParts = [
        `# User Goal\n${originalGoal}`,
        `# Architecture\n${architecture}`,
        `# Available Workers\n${workerList}`,
      ];
      if (reviewNotes) {
        eventParts.push(`# Knowledge Base Review\n${reviewNotes}`);
      }
      const { systemPrompt, userContent } = await buildNodeContext(
        state,
        eventParts.join("\n\n"),
        "# Final Step: Dispatch Implementation\nKnowledge base is ready. Now dispatch implementation tasks to workers.\nCall the dispatch_task tool for each worker task you want to create.\nIMPORTANT: You MUST provide toAgentId with a valid worker agentId from the Available workers list. Tasks without toAgentId will be rejected.",
      );
      const { content, toolCalls } = await llmComplete(services, runtime.modelConfigId, systemPrompt, userContent, state.tools);
      // 执行 dispatch_task 工具调用，真正向 Worker 发送任务
      const dispatchedTasks: string[] = [];
      for (const call of toolCalls) {
        if (call.name === "dispatch_task") {
          const result = await executeTool(services, runtime, call.name, call.arguments);
          if (result.success) {
            dispatchedTasks.push(call.id);
          }
        }
      }
      // 如果 LLM 没有调用 dispatch_task 工具，解析文本输出并通过 executeTool 派发
      if (dispatchedTasks.length === 0 && workers.length > 0) {
        // 将 LLM 输出按分隔符拆成多个任务，通过 dispatch_task 工具派发
        const taskDescriptions = content.split(/\n(?=\d+\.|##|Task)/).filter((s: string) => s.trim().length > 0);
        for (let i = 0; i < taskDescriptions.length && i < workers.length; i++) {
          const worker = workers[i]!;
          const dispatchCorrelationId = `impl:${randomUUID()}`;
          const result = await executeTool(services, runtime, "dispatch_task", {
            content: taskDescriptions[i],
            toAgentId: worker.id,
            correlationId: dispatchCorrelationId,
          });
          if (result.success) {
            dispatchedTasks.push(worker.id);
          }
        }
      }
      const summary = dispatchedTasks.length > 0
        ? `Dispatched ${dispatchedTasks.length} implementation task(s) to workers.`
        : content;
      appendTurnToContext(state, "assistant", summary);
      return { result: summary, continueAwaiting: dispatchedTasks.length > 0, messages: [{ role: "assistant", content: summary }] };
    })
    // 节点7：处理 Worker 回报（非知识库维护的 result）
    // 使用 Context Builder（Fix 1）
    .addNode("handle_worker_report", async (state: WorkflowStateType) => {
      const { runtime, services, taskContent } = state;
      const { systemPrompt, userContent } = await buildNodeContext(
        state,
        `# Worker Report\n${taskContent}`,
        "# Worker Report Handling\nA worker has reported back. Review the result and decide next steps.\nOptions:\n- Accept: the work is done satisfactorily\n- Rework: the worker needs to redo or fix issues\n- Knowledge update: the knowledge base needs updating based on the worker's findings\nReply with your decision and reasoning.",
      );
      const { content } = await llmComplete(services, runtime.modelConfigId, systemPrompt, userContent);
      appendTurnToContext(state, "tool", taskContent);
      appendTurnToContext(state, "assistant", content);
      return { result: content, messages: [{ role: "assistant", content }] };
    });

  // 边：强制流程
  graph.addEdge(START, "route_message");
  // 条件分支：根据消息类型和 payload kind 选择路径
  // result + kind=knowledge_maintenance_report → 走复审路径
  // result + 其他 kind → 走 worker 回报处理
  // task/instruction → 走标准用户输入路径
  graph.addConditionalEdges("route_message", (state: WorkflowStateType) => {
    if (state.messageType === "result") {
      return state.messagePayloadKind === "knowledge_maintenance_report"
        ? "review_knowledge"
        : "handle_worker_report";
    }
    return "receive_user_input";
  });
  // 条件分支：架构是否已确认
  graph.addConditionalEdges("receive_user_input", (state: WorkflowStateType) => {
    return state.architectureConfirmed ? "design_architecture" : "communicate_with_user";
  });
  graph.addEdge("communicate_with_user", END);
  graph.addEdge("design_architecture", "check_keeper");
  // 条件分支：是否有 Keeper
  graph.addConditionalEdges("check_keeper", (state: WorkflowStateType) => {
    return state.hasKeeper ? "dispatch_to_keeper" : "self_maintain_knowledge";
  });
  // 有 Keeper：派发 → END（等待 Keeper 回报，Keeper 的 result 消息会触发 review_knowledge 路径）
  graph.addEdge("dispatch_to_keeper", END);
  // 复审路径：Keeper result 消息触发 → 复审 →（明确 pass）派发实现
  // fail-closed：解析失败、字段缺失或未知 verdict 都不进入实现阶段
  graph.addConditionalEdges("review_knowledge", (state: WorkflowStateType) => {
    const reviewText = state.reviewNotes ?? "";
    let verdict: string | null = null;
    try {
      const jsonMatch = reviewText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { verdict?: string };
        if (parsed && typeof parsed.verdict === "string") {
          verdict = parsed.verdict.toLowerCase();
        }
      }
    } catch {
      // 解析失败 → verdict 保持 null
    }
    // 只有明确的 verdict === "pass" 才进入实现阶段
    if (verdict === "pass") {
      return "dispatch_implementation";
    }
    // 其他所有情况（fail、解析失败、空、未知 verdict）都重新派发 Keeper
    return "dispatch_to_keeper";
  });
  // 无 Keeper：自己维护 → 直接派发实现（跳过复审）
  graph.addEdge("self_maintain_knowledge", "dispatch_implementation");
  graph.addEdge("dispatch_implementation", END);
  // Worker 回报处理 → END
  graph.addEdge("handle_worker_report", END);

  return graph.compile();
};

// ============================================
// Knowledge Keeper 工作流
// ============================================

const KEEPER_SYSTEM_PROMPT = `You are the Knowledge Keeper running on the core server. Continue working even if the browser is closed.

Your workflow is enforced by code — you cannot skip steps:
1. Understand the Host's architecture intent from the received task
2. Plan which L1/L2/L3 knowledge documents to create or update
3. Execute knowledge_update for each planned document
4. Self-check: verify the written knowledge matches the architecture intent
5. Report back to Host: refs, summaries, uncertainties, conflicts

You do NOT make architecture decisions. You only sediment the Host's architecture intent into the knowledge base.
You do NOT dispatch implementation tasks. That is the Host's responsibility.`;

const buildKeeperWorkflow = () => {
  const graph = new StateGraph(WorkflowState)
    // 节点0：路由——区分 Host 派发的 knowledge_maintenance task 和自主触发 self_maintenance instruction
    .addNode("route_keeper_message", async (state: WorkflowStateType) => {
      const payloadKind = state.messagePayloadKind ?? extractPayloadKind(state.taskContent);
      // self_maintenance = Keeper 自主触发，不向 Host 发 knowledge_maintenance_report，
      // 不触发 Host 同步复审和实现派发
      const isSelfMaintenance = payloadKind === "self_maintenance";
      // 自主维护消息携带了触发时的 targetRevision，提取用于完成时精确推进
      let targetRevision: number | null = null;
      if (isSelfMaintenance) {
        try {
          const parsed = JSON.parse(state.taskContent);
          if (parsed && typeof parsed === "object" && "targetRevision" in parsed) {
            targetRevision = Number(parsed.targetRevision);
          }
        } catch {
          // payload 不是 JSON
        }
      }
      return { messagePayloadKind: payloadKind, isSelfMaintenance, targetRevision };
    })
    // 节点1：理解维护意图
    // Host 派发的 knowledge_maintenance task 直接读取 taskContent
    // 自主维护的 self_maintenance instruction 从 payload 中提取 insight 快照
    // 使用 Context Builder（Fix 2）
    .addNode("understand_task", async (state: WorkflowStateType) => {
      const { runtime, services, taskContent, messagePayloadKind } = state;
      let userContent = taskContent;
      // 自主维护消息携带了 insight 快照，提取给 LLM
      if (messagePayloadKind === "self_maintenance") {
        try {
          const parsed = JSON.parse(taskContent);
          if (parsed && typeof parsed === "object" && "insightSnapshot" in parsed) {
            const snap = parsed.insightSnapshot as Record<string, unknown>;
            userContent = [
              `Reason: ${String(parsed.reason ?? "self_maintenance")}`,
              `Target Revision: ${String(parsed.targetRevision ?? "unknown")}`,
              `Unapplied User Inputs: ${JSON.stringify(snap.unappliedUserInputs ?? [], null, 2)}`,
              `Latest User Directive Revision: ${String(snap.latestUserDirectiveRevision ?? "unknown")}`,
              `Applied User Directive Revision: ${String(snap.appliedUserDirectiveRevision ?? "unknown")}`,
              `Objective: ${String(snap.objective ?? "not set")}`,
              `Active Plan Summary: ${String(snap.activePlanSummary ?? "not set")}`,
              `Current Project Understanding: ${String(snap.currentProjectUnderstanding ?? "not set")}`,
              `Project Summary: ${String(snap.projectSummary ?? "not set")}`,
            ].join("\n\n");
          }
        } catch {
          // payload 不是 JSON，直接用原始 taskContent
        }
      }
      const { systemPrompt, userContent: renderedUserContent } = await buildNodeContext(
        state,
        userContent,
        "# Step 1: Understand Maintenance Intent\nAnalyze the provided insight snapshot or architecture plan. Extract which L1/L2/L3 knowledge documents need to be created or updated. Output a JSON list of planned refs with level, slug, title, and content outline.",
      );
      const { content } = await llmComplete(services, runtime.modelConfigId, systemPrompt, renderedUserContent);
      // 解析 LLM 输出的 plannedRefs，用于 execute_update 的完整验证
      const plannedRefs: string[] = [];
      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const planned = JSON.parse(jsonMatch[0]) as Array<{ level?: string; slug?: string }>;
          for (const item of planned) {
            const ref = normalizeKnowledgeRef(item.level, item.slug);
            if (ref) {
              plannedRefs.push(ref);
            }
          }
        }
      } catch {
        // 解析失败时 plannedRefs 为空，execute_update 会据此判断
      }
      appendTurnToContext(state, "assistant", content);
      return { architecture: content, plannedRefs, messages: [{ role: "assistant", content }] };
    })
    // 节点2：执行知识库写入
    // 使用 Context Builder（Fix 2）
    .addNode("execute_update", async (state: WorkflowStateType) => {
      const { runtime, services, architecture } = state;
      const tools = services.mcpToolService.getToolsetDefinitions(runtime.toolsetId);
      const { systemPrompt, userContent } = await buildNodeContext(
        state,
        `# Architecture Plan to Sediment\n${architecture}\n\n# Available Tools\n${tools.map((t) => `- ${t.name}: ${t.description}`).join("\n")}`,
        "# Step 2: Execute Knowledge Update\nUse the knowledge_update tool to create or update each planned document. Call knowledge_update for each document.",
      );
      const { content, toolCalls } = await llmComplete(services, runtime.modelConfigId, systemPrompt, userContent, tools);
      const updatedRefs: string[] = [];
      let failedCount = 0;
      const failures: Array<{ ref: string; error: string }> = [];
      for (const call of toolCalls) {
        if (call.name === "knowledge_update") {
          const result = await executeTool(services, runtime, call.name, call.arguments);
          if (result.success && result.result) {
            const doc = result.result as { level?: string; slug?: string };
            const ref = normalizeKnowledgeRef(doc?.level, doc?.slug);
            if (ref) {
              updatedRefs.push(ref);
            } else {
              // 工具返回 success: true 但缺少有效 level/slug
              failedCount++;
              const refStr = normalizeKnowledgeRef(call.arguments.level, call.arguments.slug) ?? "?/?";
              failures.push({ ref: refStr, error: "Tool returned success but missing valid level/slug in result" });
            }
          } else {
            failedCount++;
            const refStr = normalizeKnowledgeRef(call.arguments.level, call.arguments.slug) ?? "?/?";
            failures.push({ ref: refStr, error: result.error ?? "unknown error" });
          }
        }
      }
      // 成功条件：plannedRefs 为空时不能确认（understand_task 没产出结构化计划）
      // plannedRefs 非空时，去重后比较集合（不仅是数量），且 failedCount === 0
      // plannedRefs 为空时，即使工具调用成功也不确认——必须先产出计划
      const plannedRefs = state.plannedRefs ?? [];
      const plannedSet = new Set(plannedRefs);
      const updatedSet = new Set(updatedRefs);
      const plannedSubsetOfUpdated = [...plannedSet].every(ref => updatedSet.has(ref));
      const knowledgeUpdateSucceeded =
        plannedSet.size > 0 &&
        plannedSet.size === updatedSet.size &&
        plannedSubsetOfUpdated &&
        failedCount === 0;
      const summaryDetail = JSON.stringify({ plannedCount: plannedRefs.length, successCount: updatedRefs.length, failedCount, failures, plannedRefs, updatedRefs: [...updatedSet] });
      appendTurnToContext(state, "assistant", content + "\n\n" + summaryDetail);
      return { knowledgeRefs: updatedRefs, knowledgeUpdateSucceeded, messages: [{ role: "assistant", content: content + "\n\n" + summaryDetail }] };
    })
    // 节点3：自检
    // 解析 LLM 输出的结构化结果 { passed: boolean, uncertainties, conflicts }
    // 只有自检通过才能在完成节点确认 revision
    // 使用 Context Builder（Fix 2）
    .addNode("self_check", async (state: WorkflowStateType) => {
      const { runtime, services, architecture, knowledgeRefs } = state;
      const { systemPrompt, userContent } = await buildNodeContext(
        state,
        `# Architecture Plan\n${architecture}\n\n# Written Refs\n${knowledgeRefs.join(", ")}`,
        "# Step 3: Self-Check\nVerify the written knowledge matches the architecture intent. Output a JSON object with: passed (boolean), uncertainties (array of strings), conflicts (array of strings).",
      );
      const { content } = await llmComplete(services, runtime.modelConfigId, systemPrompt, userContent);
      // 解析 LLM 输出的结构化自检结果
      // passed === true 且 conflicts 为空数组才认为自检通过
      let selfCheckPassed = false;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const check = JSON.parse(jsonMatch[0]) as { passed?: boolean; conflicts?: unknown };
          selfCheckPassed =
            check.passed === true &&
            Array.isArray(check.conflicts) &&
            check.conflicts.length === 0;
        }
      } catch {
        // 解析失败时默认未通过
      }
      appendTurnToContext(state, "assistant", content);
      return { reviewNotes: content, selfCheckPassed, messages: [{ role: "assistant", content }] };
    })
    // 节点4a：回报 Host——仅当 Host 显式要求时发送 knowledge_maintenance_report
    // 统一通过 send_message 工具发送，保持 MCP 工具边界
    .addNode("report_to_host", async (state: WorkflowStateType) => {
      const { runtime, services, knowledgeRefs, reviewNotes, correlationId } = state;
      // 找到 Host agent，将 result 消息定向给它
      const host = services.sessionService.listMembers(runtime.sessionId)
        .find((m: { role: string; id: string }) => m.role === "host");
      if (!host) {
        // 找不到 Host 是异常状态——显式失败，不发送不可领取的未定向消息
        throw new Error(`Knowledge Keeper cannot report back: no Host agent found in session ${runtime.sessionId}.`);
      }
      const report = JSON.stringify({
        kind: "knowledge_maintenance_report",
        refs: knowledgeRefs,
        summaries: "See knowledge documents for details.",
        uncertainties: reviewNotes,
        conflicts: null,
      });
      // 统一通过 send_message 工具发送定向 result
      const result = await executeTool(services, runtime, "send_message", {
        type: "result",
        content: report,
        toAgentId: host.id,
        ...(correlationId ? { correlationId } : {}),
      });
      // 只有 send_message 成功时才设置 sentDirectedResult = true
      return { result: report, sentDirectedResult: result.success };
    })
    // 节点4b：自主维护完成——不向 Host 发 knowledge_maintenance_report
    // 只有 knowledge_update 全部成功且自检通过才清除触发条件，部分失败或自检不通过时保留待处理状态
    // 完成时只推进到 targetRevision（防止并发丢失后续新增输入）
    .addNode("complete_self_maintenance", async (state: WorkflowStateType) => {
      const { runtime, services, knowledgeRefs, reviewNotes, targetRevision, knowledgeUpdateSucceeded, selfCheckPassed } = state;
      let revisionApplied = false;
      // 只有成功更新了知识库且自检通过才清除触发条件
      if (knowledgeUpdateSucceeded && selfCheckPassed) {
        try {
          const insight = services.sessionInsightService?.getSessionInsight(runtime.sessionId);
          if (insight) {
            // 严格校验 targetRevision：必须是正整数且不超过最新 revision
            const validTargetRevision =
              typeof targetRevision === "number" &&
              Number.isInteger(targetRevision) &&
              targetRevision >= 0 &&
              targetRevision <= insight.latestUserDirectiveRevision;
            // 无效 targetRevision 时保留待处理状态，不清除触发条件
            if (!validTargetRevision) {
              const summary = JSON.stringify({
                kind: "self_maintenance_complete",
                refs: knowledgeRefs,
                notes: reviewNotes,
                knowledgeUpdateSucceeded,
                selfCheckPassed,
                revisionApplied: false,
                error: `Invalid targetRevision: ${targetRevision}. Conditions preserved.`,
              });
              return { result: summary };
            }
            // 只推进到触发时的 targetRevision，不清空后来新增的输入
            const revisionToApply = targetRevision;
            // 只移除属于 targetRevision 快照的输入（revision <= targetRevision），保留之后新增的
            const remainingUnapplied = (insight.unappliedUserInputs ?? []).filter(
              (input) => input.revision > revisionToApply
            );
            services.sessionInsightService?.updateSessionInsight({
              sessionId: runtime.sessionId,
              updatedByAgentId: runtime.agentId,
              unappliedUserInputs: remainingUnapplied,
              appliedUserDirectiveRevision: revisionToApply,
            });
            // 只有 updateSessionInsight 成功执行后才标记为已应用
            revisionApplied = true;
          }
        } catch {
          // sessionInsightService 不存在或更新失败不影响流程，但 revisionApplied 保持 false
        }
      }
      const summary = JSON.stringify({
        kind: "self_maintenance_complete",
        refs: knowledgeRefs,
        notes: reviewNotes,
        knowledgeUpdateSucceeded,
        selfCheckPassed,
        revisionApplied,
        ...(revisionApplied && targetRevision !== null ? { appliedRevision: targetRevision } : {}),
      });
      return { result: summary };
    });

  // 边：强制流程顺序，不可跳过
  graph.addEdge(START, "route_keeper_message");
  // 自主维护和 Host 派发都走完整的 understand → execute → self_check 路径
  // 区别只在 self_check 之后：自主维护 → complete_self_maintenance，Host 派发 → report_to_host
  graph.addEdge("route_keeper_message", "understand_task");
  graph.addEdge("understand_task", "execute_update");
  graph.addEdge("execute_update", "self_check");
  // 条件分支：Host 显式要求的 → report_to_host；自主维护 → complete_self_maintenance
  graph.addConditionalEdges("self_check", (state: WorkflowStateType) => {
    if (state.messagePayloadKind === "self_maintenance") {
      return "complete_self_maintenance";
    }
    return "report_to_host";
  });
  graph.addEdge("report_to_host", END);
  graph.addEdge("complete_self_maintenance", END);

  return graph.compile();
};

// ============================================
// 工作流注册表
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CompiledGraph = ReturnType<typeof buildHostWorkflow> | ReturnType<typeof buildKeeperWorkflow>;

export class AgentWorkflowRegistry {
  private readonly hostWorkflow: CompiledGraph;
  private readonly keeperWorkflow: CompiledGraph;

  public constructor() {
    this.hostWorkflow = buildHostWorkflow();
    this.keeperWorkflow = buildKeeperWorkflow();
  }

  /**
   * 根据角色获取对应的工作流。
   * 工作流在代码层强制角色职责——不需要默认 Skill 提示词。
   */
  public getWorkflow(role: WebAgentRuntime["role"]): CompiledGraph {
    if (role === "host") {
      return this.hostWorkflow;
    }
    if (role === "knowledge_keeper") {
      return this.keeperWorkflow;
    }
    throw new Error(`No workflow defined for role: ${role}`);
  }

  /**
   * 执行工作流。
   * 替代原来的 runToolLoop——不再是一个自由 for 循环，而是一个强制的 StateGraph。
   * 返回 { result, sentDirectedResult }：
   * - result: 工作流输出文本
   * - sentDirectedResult: 工作流内部是否已经发送了定向 result 消息（如 Keeper report_to_host）
   *   如果为 true，executor 不应再发送广播 result
   */
  public async runWorkflow(
    runtime: WebAgentRuntime,
    services: ServerServices,
    taskContent: string,
    tools: McpToolDefinition[],
    messageType: string = "task",
    correlationId: string | null = null
  ): Promise<{ result: string; sentDirectedResult: boolean; continueAwaiting: boolean }> {
    const workflow = this.getWorkflow(runtime.role);
    const result = await workflow.invoke({
      runtime,
      services,
      taskContent,
      tools,
      messageType,
      correlationId,
      messages: [],
    }, {
      configurable: { thread_id: `web-runtime:${runtime.id}:message:${Date.now()}` },
      recursionLimit: 25,
    });
    const output = result.result ?? "completed";
    // 从 Workflow State 读取真实的 sentDirectedResult，只由 report_to_host 节点设置
    const sentDirectedResult = result.sentDirectedResult ?? false;
    const continueAwaiting = result.continueAwaiting ?? false;
    return { result: output, sentDirectedResult, continueAwaiting };
  }
}
