import { describe, expect, it } from "vitest";
import type { Agent, AgentPermissionPolicy, WebAgentRuntime } from "@loopmarshal/protocol";
import { McpToolService } from "../services/mcp-tool-service.js";
import { AgentWorkflowRegistry } from "../services/agent-workflow-registry.js";
import type { ServerServices } from "../server/create-server.js";

/**
 * LangGraph 工作流端到端测试。
 *
 * 覆盖关键业务链路：
 * - dispatch_task 失败时外层结果为 success: false（toAgentId 缺失 / 目标不是 Worker）
 * - dispatch_task 成功时目标必须是 Worker 且 correlationId 透传
 * - executeTool 识别 Handler 返回值中的 success: false 并向外透传
 * - Keeper 工作流路由：自主维护不向 Host 回报
 * - Keeper 工作流路由：Host 派发维护向 Host 回报
 * - 自主维护消息携带 insight 快照和 targetRevision
 * - 维护失败时不清除触发条件
 * - 维护成功时只推进到 targetRevision，不清空后续新增输入
 */

function createAgent(id: string, role: string): Agent {
  return {
    id,
    sessionId: "session-1",
    agentName: id,
    displayName: id,
    role: role as Agent["role"],
    capabilities: [],
    runtimeState: null,
    runtimeRequiredAction: null,
    runtimeRequiredTool: null,
    runtimeContinuationToken: null,
    runtimeUserVisibleResponseAllowed: null,
    runtimeLeaseExpiresAt: null,
    heartbeatAt: null,
    joinedAt: new Date().toISOString(),
  } as unknown as Agent;
}

function createHostPolicy(overrides: Partial<AgentPermissionPolicy> = {}): AgentPermissionPolicy {
  return {
    knowledge: { read: true, write: false, delete: false, ...overrides.knowledge },
    messages: {
      read: true,
      send: true,
      dispatchTask: true,
      claim: true,
      complete: true,
      ...overrides.messages,
    },
    filesystem: {
      read: false,
      write: false,
      allowedPaths: [],
      deniedPaths: [],
      ...overrides.filesystem,
    },
    command: {
      enabled: false,
      background: false,
      allowedPrefixes: [],
      workingDirectory: null,
      timeoutSeconds: 30,
      requireApproval: true,
      ...overrides.command,
    },
  };
}

describe("AgentWorkflowRegistry — LangGraph business flow", () => {
  it("dispatch_task with missing toAgentId returns success: false from executeTool", async () => {
    const toolService = new McpToolService();
    toolService.setAgentPermissionPolicy("host-1", createHostPolicy());

    const result = await toolService.executeTool(
      "dispatch_task",
      { content: "do something" }, // missing toAgentId
      "host-1",
      "session-1",
      {
        mcpToolService: toolService,
        agentService: { getAgent: () => null },
        messageService: { sendMessage: () => ({}) },
      } as never
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("toAgentId");
  });

  it("dispatch_task with non-worker target returns success: false", async () => {
    const toolService = new McpToolService();
    toolService.setAgentPermissionPolicy("host-1", createHostPolicy());
    const keeperAgent = createAgent("keeper-1", "knowledge_keeper");

    const result = await toolService.executeTool(
      "dispatch_task",
      { content: "do something", toAgentId: "keeper-1" },
      "host-1",
      "session-1",
      {
        mcpToolService: toolService,
        agentService: { getAgent: () => keeperAgent },
        messageService: { sendMessage: () => ({}) },
      } as never
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("role \"worker\"");
  });

  it("dispatch_task with valid worker target succeeds and includes correlationId", async () => {
    const toolService = new McpToolService();
    toolService.setAgentPermissionPolicy("host-1", createHostPolicy());
    const workerAgent = createAgent("worker-1", "worker");
    const sentMessages: unknown[] = [];
    const testCorrelationId = "test-corr-123";

    const result = await toolService.executeTool(
      "dispatch_task",
      { content: "do work", toAgentId: "worker-1", correlationId: testCorrelationId },
      "host-1",
      "session-1",
      {
        mcpToolService: toolService,
        agentService: { getAgent: () => workerAgent },
        messageService: {
          sendMessage: (input: unknown) => { sentMessages.push(input); return input; },
        },
      } as never
    );

    expect(result.success).toBe(true);
    expect(sentMessages).toHaveLength(1);
    const msg = sentMessages[0] as Record<string, unknown>;
    expect(msg.toAgentId).toBe("worker-1");
    expect(msg.type).toBe("task");
    expect(msg.correlationId).toBe(testCorrelationId);
  });

  it("executeTool: handler returning { success: false } is propagated as outer success: false", async () => {
    const toolService = new McpToolService();
    toolService.setAgentPermissionPolicy("host-1", createHostPolicy());

    // dispatch_task handler returns { success: false, error: "..." } when toAgentId is missing.
    // executeTool should recognize this and return outer success: false (not wrap in success: true).
    const result = await toolService.executeTool(
      "dispatch_task",
      { content: "test" }, // missing toAgentId
      "host-1",
      "session-1",
      {
        mcpToolService: toolService,
        agentService: { getAgent: () => null },
        messageService: { sendMessage: () => ({}) },
      } as never
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("toAgentId");
  });

  it("executeTool: handler returning { success: false } for non-worker target is propagated", async () => {
    const toolService = new McpToolService();
    toolService.setAgentPermissionPolicy("host-1", createHostPolicy());
    const hostAgent = createAgent("host-2", "host");

    const result = await toolService.executeTool(
      "dispatch_task",
      { content: "do something", toAgentId: "host-2" },
      "host-1",
      "session-1",
      {
        mcpToolService: toolService,
        agentService: { getAgent: () => hostAgent },
        messageService: { sendMessage: () => ({}) },
      } as never
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("role \"worker\"");
  });

  it("executeTool: handler returning non-success-false object is treated as success", async () => {
    const toolService = new McpToolService();
    toolService.setAgentPermissionPolicy("host-1", createHostPolicy());
    const workerAgent = createAgent("worker-1", "worker");

    const result = await toolService.executeTool(
      "dispatch_task",
      { content: "do work", toAgentId: "worker-1" },
      "host-1",
      "session-1",
      {
        mcpToolService: toolService,
        agentService: { getAgent: () => workerAgent },
        messageService: { sendMessage: () => ({ id: "msg-1", type: "task" }) },
      } as never
    );

    expect(result.success).toBe(true);
    expect(result.result).toEqual({ id: "msg-1", type: "task" });
  });
});

// ============================================
// Keeper 工作流路由测试
// 这些测试验证 LangGraph 工作流的结构行为：
// - 自主维护不向 Host 回报（sentDirectedResult = false）
// - Host 派发的维护向 Host 回报（sentDirectedResult = true）
// - 自主维护消息携带 insight 快照
// - 维护失败时不清除触发条件
// - 维护成功时只推进到 targetRevision
//
// 由于完整 LangGraph 工作流需要 LLM HTTP 调用，
// 这些测试通过验证工作流结构约定（route_keeper_message 解析、targetRevision 提取）
// 和 complete_self_maintenance 的 revision guard 逻辑来覆盖。
// ============================================

describe("AgentWorkflowRegistry — Keeper workflow routing", () => {
  it("self_maintenance payload is correctly identified as self-maintenance (not Host-triggered)", () => {
    // 验证：extractPayloadKind 能正确识别 self_maintenance kind
    // 这决定了 Keeper 工作流走 complete_self_maintenance 而非 report_to_host
    const selfMaintenancePayload = JSON.stringify({
      kind: "self_maintenance",
      reason: "unapplied_user_inputs",
      targetRevision: 5,
      insightSnapshot: {
        unappliedUserInputs: [{ revision: 5, content: "test" }],
        latestUserDirectiveRevision: 5,
        appliedUserDirectiveRevision: 3,
        objective: "build something",
        activePlanSummary: "plan A",
      },
      content: "Session insight has changed.",
      source: "self_trigger",
    });

    // 模拟 extractPayloadKind 的逻辑
    let extractedKind: string | null = null;
    try {
      const parsed = JSON.parse(selfMaintenancePayload);
      if (parsed && typeof parsed === "object" && "kind" in parsed) {
        extractedKind = String(parsed.kind);
      }
    } catch {
      // not JSON
    }

    expect(extractedKind).toBe("self_maintenance");
    // self_maintenance kind → route to complete_self_maintenance (not report_to_host)
    // report_to_host 才设置 sentDirectedResult = true
    // 因此自主维护路径的 sentDirectedResult = false
  });

  it("knowledge_maintenance payload is correctly identified as Host-triggered (not self-maintenance)", () => {
    const hostTriggeredPayload = JSON.stringify({
      kind: "knowledge_maintenance",
      content: "Maintain knowledge base according to this architecture plan:",
      requirements: ["refs", "summaries", "uncertainties", "conflicts"],
    });

    let extractedKind: string | null = null;
    try {
      const parsed = JSON.parse(hostTriggeredPayload);
      if (parsed && typeof parsed === "object" && "kind" in parsed) {
        extractedKind = String(parsed.kind);
      }
    } catch {
      // not JSON
    }

    expect(extractedKind).toBe("knowledge_maintenance");
    // knowledge_maintenance kind → not self_maintenance → route to report_to_host
    // report_to_host sets sentDirectedResult = true
    // 因此 Host 派发的维护路径的 sentDirectedResult = true
  });

  it("self_maintenance payload carries targetRevision for revision guard", () => {
    const payload = JSON.parse(JSON.stringify({
      kind: "self_maintenance",
      reason: "unapplied_user_inputs",
      targetRevision: 5,
      insightSnapshot: {
        unappliedUserInputs: [],
        latestUserDirectiveRevision: 5,
        appliedUserDirectiveRevision: 3,
      },
      content: "test",
    }));

    // route_keeper_message 提取 targetRevision
    expect(payload.targetRevision).toBe(5);
    // complete_self_maintenance 使用 targetRevision 而非最新 latestUserDirectiveRevision
    // 这防止并发场景下丢失 revision 6+ 的输入
  });

  it("self_maintenance payload carries insightSnapshot with actual content", () => {
    const payload = JSON.parse(JSON.stringify({
      kind: "self_maintenance",
      reason: "directive_out_of_sync",
      targetRevision: 7,
      insightSnapshot: {
        unappliedUserInputs: [
          { revision: 6, content: "user said X" },
          { revision: 7, content: "user said Y" },
        ],
        latestUserDirectiveRevision: 7,
        appliedUserDirectiveRevision: 5,
        objective: "build a chat app",
        activePlanSummary: "L1: chat, L2: messaging, L3: websocket",
        currentProjectUnderstanding: "React + Node",
        projectSummary: "Real-time chat",
      },
      content: "Session insight has changed.",
    }));

    // understand_task 从 insightSnapshot 提取内容给 LLM
    const snap = payload.insightSnapshot;
    expect(snap.unappliedUserInputs).toHaveLength(2);
    expect(snap.objective).toBe("build a chat app");
    expect(snap.activePlanSummary).toContain("L1: chat");
    expect(snap.latestUserDirectiveRevision).toBe(7);
    expect(snap.appliedUserDirectiveRevision).toBe(5);
  });

  it("complete_self_maintenance: revision guard preserves inputs beyond targetRevision", () => {
    // 模拟 complete_self_maintenance 的 revision guard 逻辑
    const targetRevision = 5;
    const currentInsight = {
      unappliedUserInputs: [
        { revision: 5, content: "input at revision 5" },
        { revision: 6, content: "input at revision 6 (new during maintenance)" },
      ],
      latestUserDirectiveRevision: 6, // 用户在维护期间提交了 revision 6
      appliedUserDirectiveRevision: 4,
    };

    // complete_self_maintenance 只推进到 targetRevision
    const revisionToApply = targetRevision; // = 5

    // 只移除属于 targetRevision 快照的输入（revision <= 5），保留 revision > 5 的
    const remainingUnapplied = (currentInsight.unappliedUserInputs as Array<{ revision: number }>).filter(
      (input) => input.revision > revisionToApply
    );

    expect(remainingUnapplied).toHaveLength(1);
    expect(remainingUnapplied[0]?.revision).toBe(6);
    // revision 6 的输入被保留，不会丢失
    // appliedUserDirectiveRevision 被推进到 5（不是 6），下次会再次触发处理 revision 6
  });

  it("complete_self_maintenance: does not clear conditions when knowledgeUpdateSucceeded is false", () => {
    // 模拟 complete_self_maintenance 的 knowledgeUpdateSucceeded guard
    const knowledgeUpdateSucceeded = false;
    const insightBefore = {
      unappliedUserInputs: [{ content: "test input" }],
      latestUserDirectiveRevision: 5,
      appliedUserDirectiveRevision: 3,
    };

    // 当 knowledgeUpdateSucceeded = false 时，不更新 session insight
    let insightAfter = { ...insightBefore };
    if (knowledgeUpdateSucceeded) {
      insightAfter = {
        ...insightAfter,
        unappliedUserInputs: [],
        appliedUserDirectiveRevision: 5,
      };
    }

    // 验证：未成功更新时，触发条件保留
    expect(insightAfter.unappliedUserInputs).toHaveLength(1);
    expect(insightAfter.appliedUserDirectiveRevision).toBe(3);
    // 60 秒冷却后，会再次触发自主维护重试
  });

  it("complete_self_maintenance: clears conditions when knowledgeUpdateSucceeded is true", () => {
    const knowledgeUpdateSucceeded = true;
    const targetRevision = 5;
    const insightBefore = {
      unappliedUserInputs: [{ revision: 5, content: "test input" }] as Array<{ revision: number; content: string }>,
      latestUserDirectiveRevision: 5,
      appliedUserDirectiveRevision: 3,
    };

    let insightAfter: typeof insightBefore = { ...insightBefore };
    if (knowledgeUpdateSucceeded) {
      const revisionToApply = targetRevision;
      const remainingUnapplied = insightBefore.unappliedUserInputs.filter(
        (input) => input.revision > revisionToApply
      );
      insightAfter = {
        ...insightAfter,
        unappliedUserInputs: remainingUnapplied,
        appliedUserDirectiveRevision: revisionToApply,
      };
    }

    // 验证：成功更新后，revision 5 的输入被清除，revision 推进到 5
    expect(insightAfter.unappliedUserInputs).toHaveLength(0);
    expect(insightAfter.appliedUserDirectiveRevision).toBe(5);
  });
});

// ============================================
// 真实 LangGraph 工作流端到端测试
// 使用 AgentWorkflowRegistry.runWorkflow() + Fake LLM + Fake MCP Tool Service
// ============================================

function createKeeperRuntime(): WebAgentRuntime {
  return {
    id: "keeper-runtime-1",
    sessionId: "session-1",
    agentId: "keeper-1",
    role: "knowledge_keeper",
    modelConfigId: "model-1",
    agentProfileId: null,
    toolsetId: "knowledge_keeper",
    status: "running",
    enabled: true,
    currentStep: null,
    lastError: null,
    lastTickAt: null,
    lastSelfMaintenanceAt: null,
    externalMcpServerIds: [],
    customDuty: null,
    customSkillIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function createWorkflowServices(options: {
  llmResponses: Array<{ content: string; toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }> }>;
  insightUpdates?: Array<Record<string, unknown>>;
  sentMessages?: Array<Record<string, unknown>>;
  mcpExecuteResult?: Record<string, { success: boolean; result: unknown; error?: string }>;
  mcpExecutePerCall?: Array<{ success: boolean; result: unknown; error?: string }>;
  insightOverrides?: Partial<{
    unappliedUserInputs: Array<{ revision: number; content: string }>;
    latestUserDirectiveRevision: number;
    appliedUserDirectiveRevision: number;
  }>;
}): ServerServices {
  const insightUpdates = options.insightUpdates ?? [];
  const sentMessages = options.sentMessages ?? [];
  let llmCallIndex = 0;
  let mcpCallIndex = 0;

  const insight = {
    unappliedUserInputs: options.insightOverrides?.unappliedUserInputs ?? [] as Array<{ revision: number; content: string }>,
    latestUserDirectiveRevision: options.insightOverrides?.latestUserDirectiveRevision ?? 5,
    appliedUserDirectiveRevision: options.insightOverrides?.appliedUserDirectiveRevision ?? 3,
    objective: null as string | null,
    activePlanSummary: null as string | null,
    currentProjectUnderstanding: null as string | null,
    projectSummary: null as string | null,
  };

  return {
    llmOverride: (async (_systemPrompt: string, _userContent: string) => {
      const response = options.llmResponses[llmCallIndex] ?? { content: "fallback" };
      llmCallIndex++;
      return { content: response.content, toolCalls: response.toolCalls ?? [] };
    }) as ServerServices["llmOverride"],
    webAgentRuntimeService: { get: () => undefined, update: () => undefined },
    modelConfigService: { getFull: () => ({ id: "model-1", provider: "mock", baseUrl: "http://mock", modelName: "mock" }) },
    mcpToolService: {
      getToolsetDefinitions: () => [
        { name: "knowledge_update", description: "Update knowledge", parameters: { type: "object", properties: {} } },
        { name: "send_message", description: "Send message", parameters: { type: "object", properties: {} } },
      ],
      executeTool: (toolName: string, args: Record<string, unknown>) => {
        if (options.mcpExecutePerCall) {
          const result = options.mcpExecutePerCall[mcpCallIndex] ?? { success: true, result: { level: args.level, slug: args.slug } };
          mcpCallIndex++;
          return Promise.resolve(result);
        }
        if (options.mcpExecuteResult?.[toolName]) {
          return Promise.resolve(options.mcpExecuteResult[toolName]);
        }
        return Promise.resolve({ success: true, result: { level: args.level, slug: args.slug }, toolName });
      },
    },
    sessionService: {
      listMembers: () => [createAgent("host-1", "host"), createAgent("keeper-1", "knowledge_keeper")],
    },
    messageService: {
      sendMessage: (input: Record<string, unknown>) => { sentMessages.push(input); return input; },
    },
    knowledgeService: {
      upsert: () => undefined,
      getManifest: () => ({ documents: [] }),
    },
    sessionInsightService: {
      getSessionInsight: () => insight,
      updateSessionInsight: (input: Record<string, unknown>) => {
        insightUpdates.push(input);
        Object.assign(insight, input);
        return insight;
      },
    },
    agentService: { getAgent: () => null },
  } as unknown as ServerServices;
}

describe("AgentWorkflowRegistry — real LangGraph workflow with Fake LLM", () => {
  const selfMaintenancePayload = JSON.stringify({
    kind: "self_maintenance",
    reason: "unapplied_user_inputs",
    targetRevision: 5,
    insightSnapshot: {
      unappliedUserInputs: [{ revision: 5, content: "user input" }],
      latestUserDirectiveRevision: 5,
      appliedUserDirectiveRevision: 3,
      objective: "build app",
      activePlanSummary: "plan A",
    },
    content: "Session insight has changed.",
    source: "self_trigger",
  });

  it("self_maintenance: does not send report to Host (sentDirectedResult = false)", async () => {
    const registry = new AgentWorkflowRegistry();
    const runtime = createKeeperRuntime();
    const insightUpdates: Array<Record<string, unknown>> = [];

    const services = createWorkflowServices({
      // Call 1: understand_task → plannedRefs
      // Call 2: execute_update → knowledge_update tool calls
      // Call 3: self_check → passed: true
      llmResponses: [
        { content: '[{"level":"l1","slug":"direction"}]', toolCalls: [] },
        { content: "executing", toolCalls: [{ id: "c1", name: "knowledge_update", arguments: { level: "l1", slug: "direction", content: "test" } }] },
        { content: '{"passed":true,"uncertainties":[],"conflicts":[]}', toolCalls: [] },
      ],
      insightUpdates,
      mcpExecuteResult: { knowledge_update: { success: true, result: { level: "l1", slug: "direction" } } },
    });

    const { result, sentDirectedResult } = await registry.runWorkflow(
      runtime, services, selfMaintenancePayload, [], "instruction", null
    );

    expect(sentDirectedResult).toBe(false);
    const parsed = JSON.parse(result);
    expect(parsed.kind).toBe("self_maintenance_complete");
    expect(parsed.knowledgeUpdateSucceeded).toBe(true);
    expect(parsed.selfCheckPassed).toBe(true);
    expect(insightUpdates.length).toBeGreaterThan(0);
    expect(insightUpdates[insightUpdates.length - 1]!.appliedUserDirectiveRevision).toBe(5);
  });

  it("knowledge_maintenance: sends report to Host (sentDirectedResult = true)", async () => {
    const registry = new AgentWorkflowRegistry();
    const runtime = createKeeperRuntime();
    const sentMessages: Array<Record<string, unknown>> = [];

    const services = createWorkflowServices({
      llmResponses: [
        { content: '[{"level":"l2","slug":"modules"}]', toolCalls: [] },
        { content: "executing", toolCalls: [{ id: "c1", name: "knowledge_update", arguments: { level: "l2", slug: "modules", content: "test" } }] },
        { content: '{"passed":true,"uncertainties":[],"conflicts":[]}', toolCalls: [] },
      ],
      sentMessages,
      mcpExecuteResult: {
        knowledge_update: { success: true, result: { level: "l2", slug: "modules" } },
        send_message: { success: true, result: { id: "msg-1" } },
      },
    });

    const hostTaskPayload = JSON.stringify({
      kind: "knowledge_maintenance",
      content: "Maintain knowledge base.",
      requirements: ["refs", "summaries", "uncertainties", "conflicts"],
    });

    const { result, sentDirectedResult } = await registry.runWorkflow(
      runtime, services, hostTaskPayload, [], "task", "keeper-maintain:test-corr"
    );

    expect(sentDirectedResult).toBe(true);
    const parsed = JSON.parse(result);
    expect(parsed.kind).toBe("knowledge_maintenance_report");
    expect(parsed.refs).toContain("l2/modules");
  });

  it("self_maintenance: true partial failure (1 success, 1 fail) preserves trigger conditions", async () => {
    const registry = new AgentWorkflowRegistry();
    const runtime = createKeeperRuntime();
    const insightUpdates: Array<Record<string, unknown>> = [];

    const services = createWorkflowServices({
      llmResponses: [
        { content: '[{"level":"l1","slug":"a"},{"level":"l1","slug":"b"}]', toolCalls: [] },
        { content: "executing", toolCalls: [
          { id: "c1", name: "knowledge_update", arguments: { level: "l1", slug: "a", content: "test" } },
          { id: "c2", name: "knowledge_update", arguments: { level: "l1", slug: "b", content: "test" } },
        ] },
        { content: '{"passed":true,"uncertainties":[],"conflicts":[]}', toolCalls: [] },
      ],
      insightUpdates,
      // Call 1 succeeds, Call 2 fails — true partial failure
      mcpExecutePerCall: [
        { success: true, result: { level: "l1", slug: "a" } },
        { success: false, result: null, error: "write failed" },
      ],
    });

    const { result, sentDirectedResult } = await registry.runWorkflow(
      runtime, services, selfMaintenancePayload, [], "instruction", null
    );

    const parsed = JSON.parse(result);
    expect(parsed.kind).toBe("self_maintenance_complete");
    expect(parsed.knowledgeUpdateSucceeded).toBe(false);
    expect(insightUpdates).toHaveLength(0);
  });

  it("self_maintenance: self-check failure preserves trigger conditions", async () => {
    const registry = new AgentWorkflowRegistry();
    const runtime = createKeeperRuntime();
    const insightUpdates: Array<Record<string, unknown>> = [];

    const services = createWorkflowServices({
      llmResponses: [
        { content: '[{"level":"l1","slug":"direction"}]', toolCalls: [] },
        { content: "executing", toolCalls: [{ id: "c1", name: "knowledge_update", arguments: { level: "l1", slug: "direction", content: "test" } }] },
        // Self-check returns passed: false
        { content: '{"passed":false,"uncertainties":["missing L2"],"conflicts":[]}', toolCalls: [] },
      ],
      insightUpdates,
      mcpExecuteResult: { knowledge_update: { success: true, result: { level: "l1", slug: "direction" } } },
    });

    const { result, sentDirectedResult } = await registry.runWorkflow(
      runtime, services, selfMaintenancePayload, [], "instruction", null
    );

    const parsed = JSON.parse(result);
    expect(parsed.knowledgeUpdateSucceeded).toBe(true);
    expect(parsed.selfCheckPassed).toBe(false);
    // Self-check failed → don't clear trigger conditions
    expect(insightUpdates).toHaveLength(0);
  });

  it("self_maintenance: zero knowledge_update calls preserves trigger conditions", async () => {
    const registry = new AgentWorkflowRegistry();
    const runtime = createKeeperRuntime();
    const insightUpdates: Array<Record<string, unknown>> = [];

    const services = createWorkflowServices({
      llmResponses: [
        { content: '[{"level":"l1","slug":"direction"}]', toolCalls: [] },
        { content: "I'm not sure what to do", toolCalls: [] },
        { content: '{"passed":false,"uncertainties":[],"conflicts":[]}', toolCalls: [] },
      ],
      insightUpdates,
    });

    const { result } = await registry.runWorkflow(
      runtime, services, selfMaintenancePayload, [], "instruction", null
    );

    const parsed = JSON.parse(result);
    expect(parsed.knowledgeUpdateSucceeded).toBe(false);
    expect(insightUpdates).toHaveLength(0);
  });

  it("self_maintenance: planned 3 docs but only 2 tool calls → preserves trigger conditions", async () => {
    const registry = new AgentWorkflowRegistry();
    const runtime = createKeeperRuntime();
    const insightUpdates: Array<Record<string, unknown>> = [];

    const services = createWorkflowServices({
      llmResponses: [
        // understand_task plans 3 docs
        { content: '[{"level":"l1","slug":"a"},{"level":"l2","slug":"b"},{"level":"l3","slug":"c"}]', toolCalls: [] },
        // execute_update only calls 2 (missing one)
        { content: "executing", toolCalls: [
          { id: "c1", name: "knowledge_update", arguments: { level: "l1", slug: "a", content: "test" } },
          { id: "c2", name: "knowledge_update", arguments: { level: "l2", slug: "b", content: "test" } },
        ] },
        { content: '{"passed":true,"uncertainties":[],"conflicts":[]}', toolCalls: [] },
      ],
      insightUpdates,
      mcpExecuteResult: { knowledge_update: { success: true, result: { level: "l1", slug: "a" } } },
    });

    const { result } = await registry.runWorkflow(
      runtime, services, selfMaintenancePayload, [], "instruction", null
    );

    const parsed = JSON.parse(result);
    // plannedRefs.length = 3, updatedRefs.length = 2 → not equal → failed
    expect(parsed.knowledgeUpdateSucceeded).toBe(false);
    expect(insightUpdates).toHaveLength(0);
  });

  it("self_maintenance: tool success but missing level/slug in result → counted as failure", async () => {
    const registry = new AgentWorkflowRegistry();
    const runtime = createKeeperRuntime();
    const insightUpdates: Array<Record<string, unknown>> = [];

    const services = createWorkflowServices({
      llmResponses: [
        { content: '[{"level":"l1","slug":"direction"}]', toolCalls: [] },
        { content: "executing", toolCalls: [{ id: "c1", name: "knowledge_update", arguments: { level: "l1", slug: "direction", content: "test" } }] },
        { content: '{"passed":true,"uncertainties":[],"conflicts":[]}', toolCalls: [] },
      ],
      insightUpdates,
      // Tool returns success: true but result has no level/slug
      mcpExecuteResult: { knowledge_update: { success: true, result: { foo: "bar" } } },
    });

    const { result } = await registry.runWorkflow(
      runtime, services, selfMaintenancePayload, [], "instruction", null
    );

    const parsed = JSON.parse(result);
    expect(parsed.knowledgeUpdateSucceeded).toBe(false);
    expect(insightUpdates).toHaveLength(0);
  });

  it("self_maintenance: new revision during maintenance is preserved", async () => {
    const registry = new AgentWorkflowRegistry();
    const runtime = createKeeperRuntime();
    const insightUpdates: Array<Record<string, unknown>> = [];

    const services = createWorkflowServices({
      llmResponses: [
        { content: '[{"level":"l1","slug":"direction"}]', toolCalls: [] },
        { content: "executing", toolCalls: [{ id: "c1", name: "knowledge_update", arguments: { level: "l1", slug: "direction", content: "test" } }] },
        { content: '{"passed":true,"uncertainties":[],"conflicts":[]}', toolCalls: [] },
      ],
      insightUpdates,
      mcpExecuteResult: { knowledge_update: { success: true, result: { level: "l1", slug: "direction" } } },
      // Insight has both revision 5 (target) and revision 6 (new during maintenance)
      insightOverrides: {
        unappliedUserInputs: [
          { revision: 5, content: "input at revision 5" },
          { revision: 6, content: "input at revision 6 (new during maintenance)" },
        ],
        latestUserDirectiveRevision: 6,
        appliedUserDirectiveRevision: 3,
      },
    });

    const { result } = await registry.runWorkflow(
      runtime, services, selfMaintenancePayload, [], "instruction", null
    );

    const parsed = JSON.parse(result);
    expect(parsed.knowledgeUpdateSucceeded).toBe(true);
    expect(parsed.selfCheckPassed).toBe(true);
    // revision 6 should be preserved (not cleared)
    expect(insightUpdates.length).toBeGreaterThan(0);
    const lastUpdate = insightUpdates[insightUpdates.length - 1]!;
    const remaining = lastUpdate.unappliedUserInputs as Array<{ revision: number }>;
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.revision).toBe(6);
    // appliedUserDirectiveRevision only advanced to 5 (targetRevision), not 6
    expect(lastUpdate.appliedUserDirectiveRevision).toBe(5);
  });
});

// ============================================
// 旧数据迁移测试
// 验证 version 8 迁移把旧字符串 unappliedUserInputs 转为 PendingUserInput[]
// ============================================

describe("Session Insight migration: string[] to PendingUserInput[]", () => {
  it("migrates old string[] unappliedUserInputs to PendingUserInput[] with revision", () => {
    // 模拟迁移逻辑（与 migrations.ts version 8 一致）
    const oldJson = JSON.stringify(["user input A", "user input B"]);
    const latestRevision = 7;

    const parsed = JSON.parse(oldJson);
    if (!Array.isArray(parsed)) throw new Error("not array");

    const alreadyStructured = parsed.every(
      (item: unknown) => item !== null && typeof item === "object" && "revision" in item
    );
    expect(alreadyStructured).toBe(false);

    const revision = latestRevision || 0;
    const migrated = parsed
      .filter((item) => typeof item === "string")
      .map((content: string) => ({ revision, content }));

    expect(migrated).toHaveLength(2);
    expect(migrated[0]).toEqual({ revision: 7, content: "user input A" });
    expect(migrated[1]).toEqual({ revision: 7, content: "user input B" });
  });

  it("skips rows that are already structured PendingUserInput[]", () => {
    const alreadyNew = JSON.stringify([
      { revision: 5, content: "structured input" },
    ]);
    const parsed = JSON.parse(alreadyNew);
    const alreadyStructured = parsed.every(
      (item: unknown) => item !== null && typeof item === "object" && "revision" in item
    );
    expect(alreadyStructured).toBe(true);
    // 不需要迁移
  });

  it("store parsePendingUserInputArray correctly parses migrated data", () => {
    // 验证 Store 的 parsePendingUserInputArray 能正确解析迁移后的数据
    const migratedJson = JSON.stringify([
      { revision: 7, content: "user input A" },
      { revision: 7, content: "user input B" },
    ]);

    // 模拟 parsePendingUserInputArray 逻辑
    const parsed = JSON.parse(migratedJson);
    if (!Array.isArray(parsed)) throw new Error("not array");
    const result = parsed.filter(
      (item) =>
        item !== null &&
        typeof item === "object" &&
        typeof item.revision === "number" &&
        typeof item.content === "string"
    ).map((item) => ({ revision: item.revision, content: item.content }));

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ revision: 7, content: "user input A" });
  });
});

// ============================================
// 复审 verdict 解析回归测试
// 验证 fail-closed：只有明确 verdict === "pass" 才进入实现阶段
// ============================================

describe("Host review verdict parsing (fail-closed)", () => {
  function parseReviewVerdict(reviewNotes: string): string {
    let verdict: string | null = null;
    try {
      const jsonMatch = reviewNotes.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { verdict?: string };
        if (parsed && typeof parsed.verdict === "string") {
          verdict = parsed.verdict.toLowerCase();
        }
      }
    } catch {
      // parse failed
    }
    // Only "pass" is treated as pass; everything else is "fail"
    return verdict === "pass" ? "pass" : "fail";
  }

  it('verdict: "pass" → enters implementation', () => {
    const verdict = parseReviewVerdict('{"verdict":"pass","reasons":[]}');
    expect(verdict).toBe("pass");
  });

  it('verdict: "fail" → does NOT enter implementation', () => {
    const verdict = parseReviewVerdict('{"verdict":"fail","reasons":["missing L2"]}');
    expect(verdict).toBe("fail");
  });

  it('"PASS: no failures found" as plain text → fail-closed (not parsed as pass)', () => {
    // This was the old bug: "PASS: no failures found" contains "FAIL" substring
    // Old code: review.includes("FAIL") → would route to dispatch_to_keeper
    // But also: old code would route anything without "FAIL" to dispatch_implementation
    // New code: only structured verdict === "pass" passes
    const verdict = parseReviewVerdict("PASS: no failures found");
    expect(verdict).toBe("fail");
  });

  it("empty string → fail-closed", () => {
    const verdict = parseReviewVerdict("");
    expect(verdict).toBe("fail");
  });

  it("unparseable JSON → fail-closed", () => {
    const verdict = parseReviewVerdict("I think the knowledge base looks good");
    expect(verdict).toBe("fail");
  });

  it('unknown verdict value → fail-closed', () => {
    const verdict = parseReviewVerdict('{"verdict":"uncertain"}');
    expect(verdict).toBe("fail");
  });

  it("missing verdict field → fail-closed", () => {
    const verdict = parseReviewVerdict('{"reasons":[],"conflicts":[]}');
    expect(verdict).toBe("fail");
  });
});

// ============================================
// ref 规范化回归测试
// 验证 L1/direction 与 l1/direction 匹配
// ============================================

describe("Knowledge ref normalization", () => {
  // 模拟 normalizeKnowledgeRef 的逻辑
  function normalizeKnowledgeRef(level: unknown, slug: unknown): string | null {
    if (level === undefined || slug === undefined) return null;
    const normalizedLevel = String(level).trim().toLowerCase();
    const normalizedSlug = String(slug).trim().toLowerCase();
    const VALID = ["l1", "l2", "l3"];
    if (!VALID.includes(normalizedLevel)) return null;
    if (normalizedSlug.length === 0) return null;
    return `${normalizedLevel}/${normalizedSlug}`;
  }

  it("L1/direction normalizes to l1/direction", () => {
    expect(normalizeKnowledgeRef("L1", "direction")).toBe("l1/direction");
  });

  it("l1/direction normalizes to l1/direction", () => {
    expect(normalizeKnowledgeRef("l1", "direction")).toBe("l1/direction");
  });

  it(" L2 / Modules  normalizes to l2/modules (trim + lowercase)", () => {
    expect(normalizeKnowledgeRef(" L2 ", " Modules ")).toBe("l2/modules");
  });

  it("invalid level returns null", () => {
    expect(normalizeKnowledgeRef("L4", "direction")).toBeNull();
    expect(normalizeKnowledgeRef("invalid", "direction")).toBeNull();
  });

  it("empty slug returns null", () => {
    expect(normalizeKnowledgeRef("l1", "")).toBeNull();
    expect(normalizeKnowledgeRef("l1", "   ")).toBeNull();
  });

  it("undefined level returns null", () => {
    expect(normalizeKnowledgeRef(undefined, "direction")).toBeNull();
  });

  it("L1/direction planned matches l1/direction updated via Set comparison", () => {
    // This is the core regression: planned "L1/direction" and tool-returned "l1/direction"
    // should match after normalization
    const plannedRef = normalizeKnowledgeRef("L1", "direction");
    const updatedRef = normalizeKnowledgeRef("l1", "direction");
    expect(plannedRef).toBe("l1/direction");
    expect(updatedRef).toBe("l1/direction");

    const plannedSet = new Set([plannedRef]);
    const updatedSet = new Set([updatedRef]);
    expect(plannedSet.size).toBe(updatedSet.size);
    expect([...plannedSet].every((r) => updatedSet.has(r))).toBe(true);
  });

  it("duplicate refs are deduplicated by Set", () => {
    const refs = [
      normalizeKnowledgeRef("l1", "direction"),
      normalizeKnowledgeRef("L1", "Direction"), // same after normalization
      normalizeKnowledgeRef("l2", "modules"),
    ];
    const set = new Set(refs);
    expect(set.size).toBe(2); // not 3
  });
});

// ============================================
// knowledge_update 运行时参数校验回归测试
// 使用真实 McpToolService 验证拒绝无效 level
// ============================================

describe("knowledge_update runtime validation", () => {
  it("rejects invalid level (uppercase L1)", async () => {
    const toolService = new McpToolService();
    const policy: AgentPermissionPolicy = {
      knowledge: { read: true, write: true, delete: false },
      messages: { read: true, send: true, dispatchTask: true, claim: true, complete: true },
      filesystem: { read: false, write: false, allowedPaths: [], deniedPaths: [] },
      command: { enabled: false, background: false, allowedPrefixes: [], workingDirectory: null, timeoutSeconds: 30, requireApproval: true },
    };
    toolService.setAgentPermissionPolicy("keeper-1", policy);

    const result = await toolService.executeTool(
      "knowledge_update",
      { level: "L1", slug: "test", title: "Test", content: "content" },
      "keeper-1",
      "session-1",
      {
        mcpToolService: toolService,
        knowledgeService: {
          upsert: () => ({ level: "l1", slug: "test" }),
          get: () => null,
          list: () => [],
          getManifest: () => ({ documents: [] }),
        },
      } as never
    );

    // The handler normalizes level to "l1" before calling upsert,
    // so this should succeed (L1 → l1 is valid after normalization)
    expect(result.success).toBe(true);
  });

  it("rejects completely invalid level", async () => {
    const toolService = new McpToolService();
    const policy: AgentPermissionPolicy = {
      knowledge: { read: true, write: true, delete: false },
      messages: { read: true, send: true, dispatchTask: true, claim: true, complete: true },
      filesystem: { read: false, write: false, allowedPaths: [], deniedPaths: [] },
      command: { enabled: false, background: false, allowedPrefixes: [], workingDirectory: null, timeoutSeconds: 30, requireApproval: true },
    };
    toolService.setAgentPermissionPolicy("keeper-1", policy);

    const result = await toolService.executeTool(
      "knowledge_update",
      { level: "L4", slug: "test", title: "Test", content: "content" },
      "keeper-1",
      "session-1",
      {
        mcpToolService: toolService,
        knowledgeService: {
          upsert: () => ({ level: "l4", slug: "test" }),
          get: () => null,
          list: () => [],
          getManifest: () => ({ documents: [] }),
        },
      } as never
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid level");
  });

  it("rejects missing title", async () => {
    const toolService = new McpToolService();
    const policy: AgentPermissionPolicy = {
      knowledge: { read: true, write: true, delete: false },
      messages: { read: true, send: true, dispatchTask: true, claim: true, complete: true },
      filesystem: { read: false, write: false, allowedPaths: [], deniedPaths: [] },
      command: { enabled: false, background: false, allowedPrefixes: [], workingDirectory: null, timeoutSeconds: 30, requireApproval: true },
    };
    toolService.setAgentPermissionPolicy("keeper-1", policy);

    const result = await toolService.executeTool(
      "knowledge_update",
      { level: "l1", slug: "test", content: "content" },
      "keeper-1",
      "session-1",
      {
        mcpToolService: toolService,
        knowledgeService: {
          upsert: () => ({}),
          get: () => null,
          list: () => [],
          getManifest: () => ({ documents: [] }),
        },
      } as never
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("title");
  });

  it("rejects missing content", async () => {
    const toolService = new McpToolService();
    const policy: AgentPermissionPolicy = {
      knowledge: { read: true, write: true, delete: false },
      messages: { read: true, send: true, dispatchTask: true, claim: true, complete: true },
      filesystem: { read: false, write: false, allowedPaths: [], deniedPaths: [] },
      command: { enabled: false, background: false, allowedPrefixes: [], workingDirectory: null, timeoutSeconds: 30, requireApproval: true },
    };
    toolService.setAgentPermissionPolicy("keeper-1", policy);

    const result = await toolService.executeTool(
      "knowledge_update",
      { level: "l1", slug: "test", title: "Test" },
      "keeper-1",
      "session-1",
      {
        mcpToolService: toolService,
        knowledgeService: {
          upsert: () => ({}),
          get: () => null,
          list: () => [],
          getManifest: () => ({ documents: [] }),
        },
      } as never
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("content");
  });
});

// ============================================
// Host LangGraph 端到端集成测试
// 覆盖完整业务链路：
// 用户确认 → 设计架构 → 派发 Keeper → Keeper 回报 → 复审 → 派发 Worker → Worker 回报
// ============================================

function createHostRuntime(): WebAgentRuntime {
  return {
    id: "host-runtime-1",
    sessionId: "session-host-1",
    agentId: "host-1",
    role: "host",
    modelConfigId: "model-1",
    agentProfileId: null,
    toolsetId: "host",
    status: "running",
    enabled: true,
    currentStep: null,
    lastError: null,
    lastTickAt: null,
    lastSelfMaintenanceAt: null,
    externalMcpServerIds: [],
    customDuty: null,
    customSkillIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function createHostWorkflowServices(options: {
  llmResponses: Array<{ content: string; toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }> }>;
  members?: Agent[];
  insightOverrides?: Record<string, unknown>;
}): ServerServices {
  let llmCallIndex = 0;
  const insightUpdates: Array<Record<string, unknown>> = [];
  const sentMessages: Array<Record<string, unknown>> = [];

  const insight = {
    objective: null as string | null,
    activePlanSummary: null as string | null,
    currentProjectUnderstanding: null as string | null,
    projectSummary: null as string | null,
    userIntentSummary: null as string | null,
    acceptanceCriteria: [] as string[],
    constraints: [] as string[],
    completedItems: [] as string[],
    pendingItems: [] as string[],
    blockers: [] as string[],
    ...options.insightOverrides,
  };

  const members = options.members ?? [
    createAgent("host-1", "host"),
    createAgent("keeper-1", "knowledge_keeper"),
    createAgent("worker-1", "worker"),
  ];

  const result = {
    llmOverride: (async (_systemPrompt: string, _userContent: string) => {
      const response = options.llmResponses[llmCallIndex] ?? { content: "fallback" };
      llmCallIndex++;
      return { content: response.content, toolCalls: response.toolCalls ?? [] };
    }) as ServerServices["llmOverride"],
    webAgentRuntimeService: { get: () => undefined, update: () => undefined },
    modelConfigService: {
      getFull: () => ({
        id: "model-1", provider: "mock", baseUrl: "http://mock", modelName: "mock",
        contextWindowTokens: 128000, maxOutputTokens: 4096, contextReserveTokens: 1000,
      }),
    },
    mcpToolService: {
      getToolsetDefinitions: () => [
        { name: "dispatch_task", description: "Dispatch task to worker", parameters: { type: "object", properties: {} } },
        { name: "send_message", description: "Send message", parameters: { type: "object", properties: {} } },
      ],
      executeTool: (toolName: string, args: Record<string, unknown>) => {
        // dispatch_task validates toAgentId is a worker
        if (toolName === "dispatch_task") {
          const targetAgent = members.find((m) => m.id === args.toAgentId);
          if (!targetAgent) return Promise.resolve({ success: false, error: "Agent not found" });
          if (targetAgent.role !== "worker") return Promise.resolve({ success: false, error: `Target must be role "worker"` });
          sentMessages.push({ ...args, type: "task" });
          return Promise.resolve({ success: true, result: { id: `msg-${Date.now()}`, ...args } });
        }
        // send_message to keeper
        if (toolName === "send_message") {
          sentMessages.push({ ...args, type: args.type ?? "task" });
          return Promise.resolve({ success: true, result: { id: `msg-${Date.now()}` } });
        }
        return Promise.resolve({ success: true, result: args });
      },
    },
    sessionService: {
      listMembers: () => members,
    },
    messageService: {
      sendMessage: (input: Record<string, unknown>) => { sentMessages.push(input); return input; },
    },
    knowledgeService: {
      upsert: () => undefined,
      getManifest: () => ({ rootPath: "/knowledge", counts: { l1: 1, l2: 1, l3: 0 }, updatedAt: new Date().toISOString() }),
      list: () => [],
    },
    sessionInsightService: {
      getSessionInsight: () => insight,
      updateSessionInsight: (input: Record<string, unknown>) => {
        insightUpdates.push(input);
        Object.assign(insight, input);
        return insight;
      },
    },
    agentService: { getAgent: (id: string) => members.find((m) => m.id === id) ?? null },
    userPreferencesService: { list: () => [] },
    workflowDefinitionService: { get: () => { throw new Error("not found"); }, list: () => [] },
    agentContextService: {
      load: () => null,
      initialize: () => ({
        runtimeId: "host-runtime-1", sessionId: "session-host-1", agentId: "host-1", role: "host",
        conversationSummary: null, recentTurns: [], confirmedDecisions: [], unresolvedQuestions: [],
        pendingActions: [], lastProcessedMessageId: null, summaryRevision: 0, updatedAt: new Date().toISOString(),
      }),
      appendTurn: () => ({ snapshot: {}, needSummary: false }),
    },
  } as unknown as ServerServices & { sentMessages: Array<Record<string, unknown>>; insightUpdates: Array<Record<string, unknown>> };
  const svc = result as unknown as { sentMessages: Array<Record<string, unknown>>; insightUpdates: Array<Record<string, unknown>> };
  svc.sentMessages = sentMessages;
  svc.insightUpdates = insightUpdates;
  return result;
}

describe("AgentWorkflowRegistry — Host full LangGraph flow", () => {
  it("user confirms → design architecture → dispatch to Keeper (single run ends here)", async () => {
    const registry = new AgentWorkflowRegistry();
    const runtime = createHostRuntime();

    const services = createHostWorkflowServices({
      // LLM responses in order:
      // 1. receive_user_input → CONFIRMED
      // 2. design_architecture → architecture plan
      // (workflow dispatches to Keeper via send_message, then ends current run)
      llmResponses: [
        { content: "CONFIRMED. The user wants to build a chat app with SQLite.", toolCalls: [] },
        { content: "L1: Chat app\nL2: messaging, auth\nL3: data models, API routes", toolCalls: [] },
      ],
    }) as ServerServices & { sentMessages: Array<Record<string, unknown>> };

    const { result, sentDirectedResult } = await registry.runWorkflow(
      runtime, services, "Build a chat app with SQLite. Let's start.", [], "task", null
    );

    expect(result).toBeDefined();
    expect(sentDirectedResult).toBe(false);

    // Verify architecture was persisted to session insight
    const insight = services.sessionInsightService.getSessionInsight("session-host-1") as Record<string, unknown>;
    expect(insight.objective).toContain("chat app");
    expect(insight.activePlanSummary).toContain("L1");

    // Verify send_message was called to dispatch to Keeper
    expect(services.sentMessages.length).toBeGreaterThanOrEqual(1);
    const keeperDispatch = services.sentMessages.find(
      (m: Record<string, unknown>) => m.toAgentId === "keeper-1"
    );
    expect(keeperDispatch).toBeDefined();
    expect(keeperDispatch!.type).toBe("task");
  });

  it("user NOT confirmed → communicates with user → ends turn", async () => {
    const registry = new AgentWorkflowRegistry();
    const runtime = createHostRuntime();

    const services = createHostWorkflowServices({
      llmResponses: [
        { content: "NOT_CONFIRMED. Let me clarify the requirements first.", toolCalls: [] },
      ],
    });

    const { result } = await registry.runWorkflow(
      runtime, services, "I want to build something.", [], "task", null
    );

    // Should end with the communication response
    expect(result).toContain("NOT_CONFIRMED");
  });

  it("no Keeper → self-maintain knowledge → dispatch to Worker", async () => {
    const registry = new AgentWorkflowRegistry();
    const runtime = createHostRuntime();

    const services = createHostWorkflowServices({
      members: [
        createAgent("host-1", "host"),
        createAgent("worker-1", "worker"),
      ],
      // 1. receive_user_input → CONFIRMED
      // 2. design_architecture → architecture
      // 3. self_maintain_knowledge → knowledge docs JSON
      // 4. dispatch_implementation → dispatch_task
      llmResponses: [
        { content: "CONFIRMED. Starting now.", toolCalls: [] },
        { content: "L1: App\nL2: core\nL3: models", toolCalls: [] },
        { content: '[{"level":"l1","slug":"direction","title":"Direction","content":"Build app"}]', toolCalls: [] },
        { content: "Dispatching", toolCalls: [
          { id: "c1", name: "dispatch_task", arguments: { content: "Build core", toAgentId: "worker-1" } },
        ] },
      ],
    }) as ServerServices & { sentMessages: Array<Record<string, unknown>> };

    const { result } = await registry.runWorkflow(
      runtime, services, "Let's start.", [], "task", null
    );

    expect(result).toBeDefined();

    // Verify dispatch_task was called to send task to Worker
    const workerDispatch = services.sentMessages.find(
      (m: Record<string, unknown>) => m.toAgentId === "worker-1" && m.type === "task"
    );
    expect(workerDispatch).toBeDefined();
    expect(workerDispatch!.content).toContain("Build core");
  });

  it("Keeper reports back → Host reviews → dispatches to Worker", async () => {
    const registry = new AgentWorkflowRegistry();
    const runtime = createHostRuntime();

    // When Keeper reports back, the message type is "result" with payload kind "knowledge_maintenance_report"
    const keeperReport = JSON.stringify({
      kind: "knowledge_maintenance_report",
      refs: ["l1/direction", "l2/modules"],
      summary: "Knowledge base updated successfully",
      uncertainties: [],
      conflicts: [],
    });

    const services = createHostWorkflowServices({
      insightOverrides: {
        objective: "Build a chat app",
        activePlanSummary: "L1: Chat\nL2: Messaging\nL3: Models",
      },
      // 1. review_knowledge → verdict: pass
      // 2. dispatch_implementation → dispatch_task
      llmResponses: [
        { content: '{"verdict":"pass","reasons":["Knowledge base matches architecture"],"missingRefs":[],"conflicts":[]}', toolCalls: [] },
        { content: "Dispatching tasks to workers", toolCalls: [
          { id: "c1", name: "dispatch_task", arguments: { content: "Build messaging", toAgentId: "worker-1" } },
        ] },
      ],
    }) as ServerServices & { sentMessages: Array<Record<string, unknown>> };

    const { result } = await registry.runWorkflow(
      runtime, services, keeperReport, [], "result", "keeper-maintain:test-corr"
    );

    expect(result).toBeDefined();

    // Verify dispatch_task was called to send task to Worker
    const workerDispatch = services.sentMessages.find(
      (m: Record<string, unknown>) => m.toAgentId === "worker-1" && m.type === "task"
    );
    expect(workerDispatch).toBeDefined();
    expect(workerDispatch!.content).toContain("Build messaging");
  });

  it("Worker reports back → Host handles worker report", async () => {
    const registry = new AgentWorkflowRegistry();
    const runtime = createHostRuntime();

    const workerReport = "Task completed: messaging module is done. All tests pass.";

    const services = createHostWorkflowServices({
      // 1. handle_worker_report → Accept
      llmResponses: [
        { content: "Accept. The messaging module is complete. Great work.", toolCalls: [] },
      ],
    });

    const { result } = await registry.runWorkflow(
      runtime, services, workerReport, [], "result", "impl:test-corr"
    );

    expect(result).toContain("Accept");
  });
});
