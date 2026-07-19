import { describe, expect, it } from "vitest";
import type { MessageRecord, WebAgentRuntime } from "@loopmarshal/protocol";
import { WebAgentRuntimeExecutorService } from "../services/web-agent-runtime-executor-service.js";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("WebAgentRuntimeExecutorService", () => {
  it("marks a claimed message as failed when processing throws", async () => {
    const runtime: WebAgentRuntime = {
      id: "runtime-1",
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
    const message: MessageRecord = {
      id: "message-1",
      sessionId: "session-1",
      fromAgentId: "host-1",
      toAgentId: "keeper-1",
      type: "task",
      payload: "update knowledge",
      deliveryStatus: "sent",
      processingStatus: "claimed",
      claimedByAgentId: "keeper-1",
      claimedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    const failed: Array<{ messageId: string; agentId: string; reason?: string }> = [];
    const runtimeUpdates: Record<string, unknown>[] = [];
    const sentMessages: unknown[] = [];
    const services = {
      webAgentRuntimeService: {
        get: () => runtime,
        update: (_id: string, update: Record<string, unknown>) => {
          runtimeUpdates.push(update);
          if (typeof update.status === "string") {
            runtime.status = update.status as WebAgentRuntime["status"];
          }
          return runtime;
        },
      },
      agentProfileService: {
        get: () => null,
      },
      messageService: {
        claimNext: () => message,
        failMessage: (messageId: string, agentId: string, reason?: string) => {
          failed.push({
            messageId,
            agentId,
            ...(reason !== undefined ? { reason } : {})
          });
          return { ...message, processingStatus: "failed" };
        },
        sendMessage: (input: unknown) => {
          sentMessages.push(input);
          return input;
        },
      },
      modelConfigService: {
        findById: () => ({ id: "model-1", provider: "openai" }),
        getFull: () => ({ id: "model-1", provider: "openai", baseUrl: "http://127.0.0.1:1", modelName: "x" }),
      },
      mcpToolService: {
        getToolsetDefinitions: () => [],
      },
      externalMcpService: {
        listAllTools: async () => [],
      },
    };
    const executor = new WebAgentRuntimeExecutorService(() => services as never);

    executor.start(runtime);
    await flush();

    expect(failed).toHaveLength(1);
    expect(failed[0]?.messageId).toBe("message-1");
    expect(failed[0]?.agentId).toBe("keeper-1");
    expect(sentMessages).toHaveLength(1);
    expect(runtimeUpdates.at(-1)).toMatchObject({ status: "error" });
  });
});
