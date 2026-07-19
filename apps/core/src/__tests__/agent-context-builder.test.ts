import { describe, expect, it } from "vitest";
import {
  buildContextEnvelope,
  renderContextEnvelope,
  estimateTokens,
  computeLayerBudgets,
} from "../services/agent-context-builder.js";
import type { WebAgentRuntime, AgentContextSnapshot, SessionInsight } from "@loopmarshal/protocol";
import type { ServerServices } from "../server/create-server.js";

function createRuntime(role: "host" | "knowledge_keeper" = "host"): WebAgentRuntime {
  return {
    id: "rt-1",
    sessionId: "session-1",
    agentId: "agent-1",
    role,
    modelConfigId: "model-1",
    agentProfileId: null,
    toolsetId: role,
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
  } as unknown as WebAgentRuntime;
}

function createFakeServices(): ServerServices {
  return {
    userPreferencesService: {
      list: () => [],
    },
  } as unknown as ServerServices;
}

describe("AgentContextBuilder", () => {
  describe("estimateTokens", () => {
    it("estimates roughly 1 token per 4 characters for ASCII", () => {
      expect(estimateTokens("hello world!")).toBe(3); // 12 chars / 4 = 3
      expect(estimateTokens("")).toBe(0);
      expect(estimateTokens("a")).toBe(1); // rounds up
    });

    it("estimates more conservatively for Chinese text (Fix 9)", () => {
      // 10 Chinese characters should estimate ~10 tokens, not 3
      const chinese = "你好世界你好世界你好";
      const estimate = estimateTokens(chinese);
      expect(estimate).toBeGreaterThanOrEqual(10); // 1 token per Chinese char
      expect(estimate).toBeLessThan(15); // not overly inflated
    });

    it("handles mixed ASCII and non-ASCII correctly", () => {
      const mixed = "Hello 你好 World 世界";
      const estimate = estimateTokens(mixed);
      // ASCII: 13 chars / 4 ≈ 4, non-ASCII: 4 chars = 4, total ≈ 8
      expect(estimate).toBeGreaterThanOrEqual(7);
      expect(estimate).toBeLessThanOrEqual(10);
    });
  });

  describe("computeLayerBudgets", () => {
    it("allocates budget according to ratios", () => {
      const budgets = computeLayerBudgets(100000);
      expect(budgets.systemRoleTools).toBe(15000); // 15%
      expect(budgets.sessionSnapshotAndSummary).toBe(25000); // 25%
      expect(budgets.relevantKnowledge).toBe(25000); // 25%
      expect(budgets.recentTurns).toBe(15000); // 15%
      expect(budgets.currentEvent).toBe(20000); // 20%
      // Total should not exceed input budget
      const total = budgets.systemRoleTools + budgets.sessionSnapshotAndSummary +
        budgets.relevantKnowledge + budgets.recentTurns + budgets.currentEvent;
      expect(total).toBeLessThanOrEqual(100000);
    });
  });

  describe("buildContextEnvelope", () => {
    it("includes current event in the envelope", () => {
      const runtime = createRuntime("host");
      const services = createFakeServices();
      const envelope = buildContextEnvelope({
        runtime,
        services,
        currentEvent: "User says: build a chat app",
        tools: [],
        insight: null,
        contextSnapshot: null,
      });
      expect(envelope.currentEvent).toBe("User says: build a chat app");
    });

    it("includes role configuration with customDuty", () => {
      const runtime = createRuntime("host");
      runtime.customDuty = "Focus on real-time applications";
      const services = createFakeServices();
      const envelope = buildContextEnvelope({
        runtime,
        services,
        currentEvent: "test",
        tools: [{ name: "send_message", description: "Send a message" }],
        insight: null,
        contextSnapshot: null,
      });
      expect(envelope.roleConfiguration).toContain("Focus on real-time applications");
      expect(envelope.roleConfiguration).toContain("send_message");
      expect(envelope.roleConfiguration).toContain("session Host");
    });

    it("includes session snapshot fields from insight", () => {
      const runtime = createRuntime("host");
      const services = createFakeServices();
      const insight: SessionInsight = {
        sessionId: "session-1",
        objective: "Build a chat application",
        currentProjectUnderstanding: "React frontend with Node backend",
        projectSummary: "Real-time chat application",
        activePlanSummary: "L1: chat, L2: messaging, L3: websocket",
        userIntentSummary: "Real-time chat with WebSocket",
        acceptanceCriteria: ["Messages appear within 100ms"],
        constraints: ["Must work offline"],
        completedItems: ["L1 direction"],
        pendingItems: ["L2 modules", "L3 contracts"],
        blockers: [],
        assumptions: [],
        recentUserInputs: [],
        unappliedUserInputs: [],
        userPreferences: [],
        latestUserInput: null,
        latestReportSummary: null,
        latestUserDirectiveRevision: 1,
        appliedUserDirectiveRevision: 1,
        currentPlanRevision: 0,
        lastDispatchWorkerName: null,
        lastDispatchAgentId: null,
        lastDispatchMessageId: null,
        lastDispatchCorrelationId: null,
        lastDispatchTaskFocus: null,
        reviewStatus: "in_progress",
        reviewReason: null,
        readyForReview: false,
        lastUpdatedByAgentId: undefined,
        updatedAt: new Date().toISOString(),
      };
      const envelope = buildContextEnvelope({
        runtime,
        services,
        currentEvent: "test",
        tools: [],
        insight,
        contextSnapshot: null,
      });
      expect(envelope.sessionSnapshot.objective).toBe("Build a chat application");
      expect(envelope.sessionSnapshot.activePlanSummary).toContain("L1: chat");
      expect(envelope.sessionSnapshot.acceptanceCriteria).toEqual(["Messages appear within 100ms"]);
      expect(envelope.sessionSnapshot.constraints).toEqual(["Must work offline"]);
    });

    it("includes confirmed decisions from context snapshot", () => {
      const runtime = createRuntime("host");
      const services = createFakeServices();
      const snapshot: AgentContextSnapshot = {
        runtimeId: "rt-1",
        sessionId: "session-1",
        agentId: "agent-1",
        role: "host",
        conversationSummary: "User confirmed React + SQLite",
        recentTurns: [
          { role: "user", content: "Use SQLite instead of Postgres" },
          { role: "assistant", content: "Got it, using SQLite." },
        ],
        confirmedDecisions: ["Use React for frontend", "Use SQLite for database"],
        unresolvedQuestions: ["WebSocket or SSE?"],
        pendingActions: ["Design L2 modules"],
        lastProcessedMessageId: "msg-5",
        summaryRevision: 2,
        updatedAt: new Date().toISOString(),
      };
      const envelope = buildContextEnvelope({
        runtime,
        services,
        currentEvent: "Just start already",
        tools: [],
        insight: null,
        contextSnapshot: snapshot,
      });
      expect(envelope.sessionSnapshot.confirmedDecisions).toEqual([
        "Use React for frontend",
        "Use SQLite for database",
      ]);
      expect(envelope.sessionSnapshot.unresolvedQuestions).toEqual(["WebSocket or SSE?"]);
      expect(envelope.sessionSnapshot.conversationSummary).toBe("User confirmed React + SQLite");
      expect(envelope.recentTurns).toHaveLength(2);
    });

    it("includes token budget info", () => {
      const runtime = createRuntime("host");
      const services = createFakeServices();
      const envelope = buildContextEnvelope({
        runtime,
        services,
        currentEvent: "test",
        tools: [],
        insight: null,
        contextSnapshot: null,
        tokenBudgetConfig: {
          contextWindowTokens: 200000,
          maxOutputTokens: 8192,
          contextReserveTokens: 2000,
        },
      });
      // inputBudget = 200000 - 8192 - 2000 = 189808
      expect(envelope.tokenBudget.inputBudget).toBe(189808);
      expect(envelope.tokenBudget.contextWindowTokens).toBe(200000);
    });
  });

  describe("Budget trimming (Fix 3)", () => {
    it("trims recentTurns to fit budget and writes trimmed data to envelope", () => {
      const runtime = createRuntime("host");
      const services = createFakeServices();
      // Create 20 turns with long content
      const manyTurns = Array.from({ length: 20 }, (_, i) => ({
        role: "user" as const,
        content: `This is a long user message number ${i + 1} with lots of content to consume tokens. `.repeat(5),
      }));
      const envelope = buildContextEnvelope({
        runtime,
        services,
        currentEvent: "test",
        tools: [],
        insight: null,
        contextSnapshot: {
          runtimeId: "rt-1",
          sessionId: "session-1",
          agentId: "agent-1",
          role: "host",
          conversationSummary: null,
          recentTurns: manyTurns,
          confirmedDecisions: [],
          unresolvedQuestions: [],
          pendingActions: [],
          lastProcessedMessageId: null,
          summaryRevision: 0,
          updatedAt: new Date().toISOString(),
        },
        // Very small budget to force trimming
        tokenBudgetConfig: {
          contextWindowTokens: 1000,
          maxOutputTokens: 200,
          contextReserveTokens: 100,
        },
      });
      // inputBudget = 1000 - 200 - 100 = 700
      // recentTurns budget = 700 * 0.15 = 105 tokens
      // With 20 long turns, most should be trimmed
      expect(envelope.recentTurns.length).toBeLessThan(20);
    });

    it("writes trimmed knowledge snippets to envelope (Fix 3)", () => {
      const runtime = createRuntime("host");
      const services = createFakeServices();
      // Create many knowledge snippets with long content
      const manySnippets = Array.from({ length: 20 }, (_, i) => ({
        ref: `l1/doc-${i}`,
        title: `Document ${i}`,
        summary: null,
        content: "A".repeat(500), // 500 chars each
      }));
      const envelope = buildContextEnvelope({
        runtime,
        services,
        currentEvent: "test",
        tools: [],
        insight: null,
        contextSnapshot: null,
        relevantKnowledge: manySnippets,
        tokenBudgetConfig: {
          contextWindowTokens: 1000,
          maxOutputTokens: 200,
          contextReserveTokens: 100,
        },
      });
      // inputBudget = 700, knowledge budget = 700 * 0.25 = 175 tokens
      // Each snippet ~125 tokens, so only 1 should fit
      expect(envelope.relevantKnowledge.length).toBeLessThan(20);
    });
  });

  describe("renderContextEnvelope", () => {
    it("produces system prompt with all sections in correct order", () => {
      const runtime = createRuntime("host");
      const services = createFakeServices();
      const envelope = buildContextEnvelope({
        runtime,
        services,
        currentEvent: "User says: start building",
        tools: [{ name: "dispatch_task", description: "Dispatch task to worker" }],
        insight: null,
        contextSnapshot: {
          runtimeId: "rt-1",
          sessionId: "session-1",
          agentId: "agent-1",
          role: "host",
          conversationSummary: "User confirmed the plan",
          recentTurns: [
            { role: "user", content: "Use SQLite" },
            { role: "assistant", content: "OK" },
          ],
          confirmedDecisions: ["Use SQLite"],
          unresolvedQuestions: [],
          pendingActions: [],
          lastProcessedMessageId: null,
          summaryRevision: 1,
          updatedAt: new Date().toISOString(),
        },
      });

      const { systemPrompt, userContent } = renderContextEnvelope(envelope);

      // System prompt should contain role config, session snapshot, recent turns
      expect(systemPrompt).toContain("session Host");
      expect(systemPrompt).toContain("dispatch_task");
      expect(systemPrompt).toContain("Confirmed Decisions");
      expect(systemPrompt).toContain("Use SQLite");
      expect(systemPrompt).toContain("Conversation Summary");
      expect(systemPrompt).toContain("Recent Turns");

      // User content should contain the current event
      expect(userContent).toContain("start building");

      // Order: role config should come before session snapshot, which comes before recent turns
      const roleIdx = systemPrompt.indexOf("session Host");
      const snapIdx = systemPrompt.indexOf("Session Snapshot");
      const turnsIdx = systemPrompt.indexOf("Recent Turns");
      expect(roleIdx).toBeLessThan(snapIdx);
      expect(snapIdx).toBeLessThan(turnsIdx);
    });

    it("handles empty context gracefully", () => {
      const runtime = createRuntime("knowledge_keeper");
      const services = createFakeServices();
      const envelope = buildContextEnvelope({
        runtime,
        services,
        currentEvent: "Self-maintenance task",
        tools: [],
        insight: null,
        contextSnapshot: null,
      });
      const { systemPrompt, userContent } = renderContextEnvelope(envelope);
      expect(systemPrompt).toContain("Knowledge Keeper");
      expect(userContent).toContain("Self-maintenance task");
    });
  });

  describe("Multi-turn continuity simulation", () => {
    it("30 turns: context envelope accumulates decisions and preserves them", () => {
      const runtime = createRuntime("host");
      const services = createFakeServices();

      // Simulate 30 turns, accumulating decisions
      let snapshot: AgentContextSnapshot | null = null;
      const confirmedDecisions: string[] = [];

      for (let i = 1; i <= 30; i++) {
        if (i === 3) confirmedDecisions.push("Use React");
        if (i === 7) confirmedDecisions.push("Use SQLite");
        if (i === 15) confirmedDecisions.push("Use WebSocket");

        snapshot = {
          runtimeId: "rt-30",
          sessionId: "session-30",
          agentId: "agent-30",
          role: "host",
          conversationSummary: `Turn ${i}: progressing`,
          recentTurns: [
            { role: "user", content: `User message at turn ${i}` },
            { role: "assistant", content: `Assistant response at turn ${i}` },
          ],
          confirmedDecisions: [...confirmedDecisions],
          unresolvedQuestions: i > 20 ? ["Should we add pagination?"] : [],
          pendingActions: [],
          lastProcessedMessageId: `msg-${i}`,
          summaryRevision: Math.floor(i / 8),
          updatedAt: new Date().toISOString(),
        };

        // Build envelope each turn
        const envelope = buildContextEnvelope({
          runtime,
          services,
          currentEvent: `Turn ${i}: continue`,
          tools: [],
          insight: null,
          contextSnapshot: snapshot,
        });

        // Verify decisions are always present (never trimmed)
        expect(envelope.sessionSnapshot.confirmedDecisions).toEqual(confirmedDecisions);
      }

      // After 30 turns, all decisions should still be there
      expect(confirmedDecisions).toEqual(["Use React", "Use SQLite", "Use WebSocket"]);
    });
  });
});
