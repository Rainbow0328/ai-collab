import { randomUUID } from "node:crypto";

import type {
  AgentRole,
  CollaborationRunState,
  MessageRecord,
  WindowBinding,
  WindowRuntimeMessageKind
} from "@loopmarshal/protocol";

import type { MessageService } from "./message-service.js";
import type { WindowBindingService } from "./window-binding-service.js";

const DEFAULT_MCP_BUSINESS_WAIT_SECONDS = 24 * 60 * 60;
const MAX_MCP_BUSINESS_WAIT_SECONDS = 24 * 60 * 60;
const DEFAULT_POLL_INTERVAL_SECONDS = 10;

type AwaitRole = Extract<AgentRole, "host" | "worker" | "knowledge_keeper">;

export type CollaborationAwaitInput = {
  sessionName: string;
  windowName: string;
  role?: AwaitRole | undefined;
  timeoutSeconds?: number | undefined;
  continuationToken?: string | undefined;
  quiet?: boolean | undefined;
  returnOnlyOnEvent?: boolean | undefined;
};

export type CollaborationSubmitAndAwaitInput = CollaborationAwaitInput & {
  taskId: string;
  status: "completed" | "failed" | "blocked";
  result?: unknown;
  failureReason?: string | undefined;
};

export type CollaborationReportAndAwaitInput = CollaborationAwaitInput & {
  messageId: string;
  action: "completed" | "failed" | "delegated";
  reply?: unknown;
  failureReason?: string | undefined;
};

export type CollaborationControlEnvelope = {
  status: string;
  state: CollaborationRunState;
  sessionName: string;
  windowName: string;
  role: AwaitRole;
  requiredAction?: string;
  requiredTool?: string;
  arguments?: Record<string, unknown>;
  userVisibleResponseAllowed: boolean;
  messageToAgent?: string;
  taskId?: string;
  messageId?: string;
  messageKind?: WindowRuntimeMessageKind;
  instruction?: string;
  payload?: unknown;
  nextActionAfterCompletion?: string;
  requiredToolAfterCompletion?: string;
  continuationToken?: string;
  elapsedSeconds?: number;
  timeoutSeconds?: number;
};

type WaitCandidate = {
  message: MessageRecord;
  kind: WindowRuntimeMessageKind;
};

const now = (): string => new Date().toISOString();

const sleep = async (milliseconds: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
};

const clampTimeoutSeconds = (value: unknown): number => {
  const numeric = typeof value === "number" && Number.isFinite(value)
    ? value
    : DEFAULT_MCP_BUSINESS_WAIT_SECONDS;
  return Math.max(1, Math.min(Math.floor(numeric), MAX_MCP_BUSINESS_WAIT_SECONDS));
};

const getPayloadInstruction = (payload: unknown): string => {
  if (typeof payload === "string") {
    return payload;
  }
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["goal", "instruction", "content", "summary", "task"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        return value;
      }
    }
  }
  return "Process the assigned collaboration item.";
};

export class CollaborationWaitService {
  public constructor(
    private readonly messageService: MessageService,
    private readonly windowBindingService: WindowBindingService
  ) {}

  public async awaitEvent(input: CollaborationAwaitInput): Promise<CollaborationControlEnvelope> {
    const binding = this.resolveBinding(input);
    const role = this.resolveRole(binding, input.role);
    const timeoutSeconds = clampTimeoutSeconds(input.timeoutSeconds);
    const startedAt = Date.now();
    const continuationToken = input.continuationToken ?? `mcp-wait:${randomUUID()}`;

    await this.writeRuntime(binding, {
      state: "waiting",
      status: "mcp_waiting",
      workflowStep: "waiting",
      automationState: "mcp_wait_loop_active",
      turnDisposition: "silent_hold",
      requiredAction: "await_event",
      requiredTool: "ai_collab_await_event",
      continuationToken,
      userVisibleResponseAllowed: false,
      leaseExpiresAt: new Date(Date.now() + (timeoutSeconds + 60) * 1000).toISOString()
    });

    while (Date.now() - startedAt < timeoutSeconds * 1000) {
      const candidate = this.claimNextCandidate(binding, role);
      if (candidate) {
        return this.buildAssignedEnvelope(binding, role, candidate, continuationToken);
      }

      await this.writeRuntime(binding, {
        state: "waiting",
        status: "mcp_wait_polling",
        workflowStep: "waiting",
        automationState: "mcp_wait_loop_active",
        turnDisposition: "silent_hold",
        requiredAction: "await_event",
        requiredTool: "ai_collab_await_event",
        continuationToken,
        userVisibleResponseAllowed: false
      });

      const remainingMs = timeoutSeconds * 1000 - (Date.now() - startedAt);
      await sleep(Math.min(DEFAULT_POLL_INTERVAL_SECONDS * 1000, Math.max(0, remainingMs)));
    }

    const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
    const nextToken = `mcp-wait:${randomUUID()}`;
    const nextArguments = {
      sessionName: binding.sessionName,
      windowName: binding.windowName,
      role,
      continuationToken: nextToken,
      timeoutSeconds,
      quiet: true,
      returnOnlyOnEvent: true
    };

    await this.writeRuntime(binding, {
      state: "waiting_continue_required",
      status: "wait_timeout_continue",
      workflowStep: "waiting_handoff",
      automationState: "mcp_wait_loop_continue",
      turnDisposition: "silent_continue",
      requiredAction: "call_tool",
      requiredTool: "ai_collab_await_event",
      continuationToken: nextToken,
      userVisibleResponseAllowed: false
    });

    return {
      status: "wait_timeout_continue",
      state: "waiting_continue_required",
      sessionName: binding.sessionName,
      windowName: binding.windowName,
      role,
      requiredAction: "call_tool",
      requiredTool: "ai_collab_await_event",
      arguments: nextArguments,
      userVisibleResponseAllowed: false,
      messageToAgent: "Do not summarize. Call requiredTool with arguments exactly.",
      continuationToken: nextToken,
      elapsedSeconds,
      timeoutSeconds
    };
  }

  public async submitAndAwaitNext(
    input: CollaborationSubmitAndAwaitInput
  ): Promise<CollaborationControlEnvelope> {
    const binding = this.resolveBinding(input);
    const completed = input.status === "failed" || input.status === "blocked"
      ? this.messageService.failMessage(
          input.taskId,
          binding.agentId,
          input.failureReason ?? input.status,
          {}
        )
      : this.messageService.completeMessage(input.taskId, binding.agentId, {});

    if (input.status === "completed") {
      this.messageService.sendMessage({
        sessionId: binding.sessionId,
        fromAgentId: binding.agentId,
        type: "result",
        payload: input.result ?? { status: input.status },
        ...(completed.correlationId ? { correlationId: completed.correlationId } : {})
      });
    }

    await this.writeRuntime(binding, {
      state: "submit_pending_continue",
      status: "submitted",
      workflowStep: "submitted",
      automationState: "mcp_submit_handoff",
      turnDisposition: "silent_continue",
      requiredAction: "call_tool",
      requiredTool: "ai_collab_await_event",
      userVisibleResponseAllowed: false
    });

    return this.awaitEvent({
      ...input,
      role: this.resolveRole(binding, input.role)
    });
  }

  public async reportAndAwaitNext(
    input: CollaborationReportAndAwaitInput
  ): Promise<CollaborationControlEnvelope> {
    const binding = this.resolveBinding(input);
    if (input.action === "failed") {
      this.messageService.failMessage(
        input.messageId,
        binding.agentId,
        input.failureReason ?? "failed",
        {}
      );
    } else {
      const resolved = this.messageService.completeMessage(
        input.messageId,
        binding.agentId,
        {}
      );
      if (input.reply !== undefined) {
        this.messageService.sendMessage({
          sessionId: binding.sessionId,
          fromAgentId: binding.agentId,
          type: "result",
          payload: input.reply,
          ...(resolved.correlationId ? { correlationId: resolved.correlationId } : {})
        });
      }
    }

    await this.writeRuntime(binding, {
      state: "resolve_pending_continue",
      status: "resolved",
      workflowStep: "resolved",
      automationState: "mcp_resolve_handoff",
      turnDisposition: "silent_continue",
      requiredAction: "call_tool",
      requiredTool: "ai_collab_await_event",
      userVisibleResponseAllowed: false
    });

    return this.awaitEvent({
      ...input,
      role: this.resolveRole(binding, input.role)
    });
  }

  public getRuntimeState(input: {
    sessionName: string;
    windowName: string;
  }): CollaborationControlEnvelope {
    const binding = this.resolveBinding(input);
    const role = this.resolveRole(binding, undefined);
    const runtime = binding.runtimeState;
    const envelope: CollaborationControlEnvelope = {
      status: runtime.lastStatus ?? runtime.state ?? "runtime_state",
      state: runtime.state ?? "idle",
      sessionName: binding.sessionName,
      windowName: binding.windowName,
      role,
      ...(runtime.requiredAction ? { requiredAction: runtime.requiredAction } : {}),
      ...(runtime.requiredTool ? { requiredTool: runtime.requiredTool } : {}),
      userVisibleResponseAllowed: runtime.userVisibleResponseAllowed ?? false,
      ...(runtime.continuationToken
        ? { continuationToken: runtime.continuationToken }
        : {})
    };
    if (runtime.requiredTool) {
      envelope.arguments = {
        sessionName: binding.sessionName,
        windowName: binding.windowName,
        role,
        ...(runtime.continuationToken
          ? { continuationToken: runtime.continuationToken }
          : {})
      };
    }
    return envelope;
  }

  private resolveBinding(input: {
    sessionName: string;
    windowName: string;
  }): WindowBinding {
    return this.windowBindingService.get(input.sessionName, input.windowName);
  }

  private resolveRole(binding: WindowBinding, role: AwaitRole | undefined): AwaitRole {
    const bindingRole = binding.role === "knowledge_keeper" ? "knowledge_keeper" : binding.role;
    if (bindingRole !== "host" && bindingRole !== "worker" && bindingRole !== "knowledge_keeper") {
      throw new Error(`Window role '${binding.role}' cannot await collaboration events.`);
    }
    if (role && role !== bindingRole) {
      throw new Error(`Requested role '${role}' does not match window role '${bindingRole}'.`);
    }
    return bindingRole;
  }

  private claimNextCandidate(binding: WindowBinding, role: AwaitRole): WaitCandidate | null {
    if (role === "worker" || role === "knowledge_keeper") {
      const message = this.messageService.claimNext(binding.agentId, {
        types: ["task"]
      });
      return message ? { message, kind: "task" } : null;
    }

    const report = this.messageService.claimNext(binding.agentId, {
      types: ["result", "error"]
    });
    if (report) {
      return { message: report, kind: "report" };
    }

    const task = this.messageService.claimNext(binding.agentId, {
      types: ["task"]
    });
    return task ? { message: task, kind: "task" } : null;
  }

  private async buildAssignedEnvelope(
    binding: WindowBinding,
    role: AwaitRole,
    candidate: WaitCandidate,
    continuationToken: string
  ): Promise<CollaborationControlEnvelope> {
    const { message, kind } = candidate;
    const isWorkerTask = role !== "host" || kind === "task";
    const requiredTool = isWorkerTask
      ? "ai_collab_submit_and_await_next"
      : "ai_collab_report_and_await_next";
    const nextAction = isWorkerTask
      ? "submit_and_await_next"
      : "report_and_await_next";

    await this.writeRuntime(binding, {
      state: "in_progress",
      status: kind === "task" ? "task_assigned" : "message_assigned",
      workflowStep: "message_received",
      automationState: kind === "task" ? "mcp_task_assigned" : "mcp_report_assigned",
      turnDisposition: "silent_handoff",
      message,
      messageKind: kind,
      requiredAction: nextAction,
      requiredTool,
      continuationToken,
      userVisibleResponseAllowed: false
    });

    const envelope: CollaborationControlEnvelope = {
      status: kind === "task" ? "task_assigned" : "message_assigned",
      state: "in_progress",
      sessionName: binding.sessionName,
      windowName: binding.windowName,
      role,
      messageId: message.id,
      messageKind: kind,
      instruction: getPayloadInstruction(message.payload),
      payload: message.payload,
      nextActionAfterCompletion: nextAction,
      requiredToolAfterCompletion: requiredTool,
      userVisibleResponseAllowed: false,
      continuationToken
    };
    if (kind === "task") {
      envelope.taskId = message.id;
    }
    return envelope;
  }

  private async writeRuntime(
    binding: WindowBinding,
    patch: {
      state: CollaborationRunState;
      status: string;
      workflowStep: string;
      automationState: string;
      turnDisposition: string;
      requiredAction?: string | null;
      requiredTool?: string | null;
      continuationToken?: string | null;
      userVisibleResponseAllowed?: boolean;
      leaseExpiresAt?: string | null;
      message?: MessageRecord | null;
      messageKind?: WindowRuntimeMessageKind | null;
    }
  ): Promise<void> {
    const timestamp = now();
    this.windowBindingService.updateRuntimeState(binding.sessionName, binding.windowName, {
      activeFlow: binding.role === "host" ? "host-cycle" : "worker-cycle",
      currentMessageId: patch.message?.id ?? null,
      currentCorrelationId: patch.message?.correlationId ?? null,
      currentMessageKind: patch.message ? patch.messageKind ?? null : null,
      waitChainId: `${binding.identity}:mcp`,
      waitChainStatus:
        patch.state === "in_progress" ? "claimed" : patch.state,
      lastPollAt: timestamp,
      lastClaimAt: patch.message ? timestamp : null,
      lastSubmitAt:
        patch.state === "submit_pending_continue" ||
        patch.state === "resolve_pending_continue"
          ? timestamp
          : null,
      pendingInboxCount: null,
      claimedInboxCount: null,
      lastCommand: "mcp",
      lastStatus: patch.status,
      lastWorkflowStep: patch.workflowStep,
      lastAutomationState: patch.automationState,
      lastTurnDisposition: patch.turnDisposition,
      state: patch.state,
      requiredAction: patch.requiredAction ?? null,
      requiredTool: patch.requiredTool ?? null,
      continuationToken: patch.continuationToken ?? null,
      userVisibleResponseAllowed: patch.userVisibleResponseAllowed ?? false,
      leaseExpiresAt: patch.leaseExpiresAt ?? null
    });
  }
}
