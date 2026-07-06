/*
 * Copyright 2024 Cloud Skill Team
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import websocket from "@fastify/websocket";
import { createLogTimestampFragment, resolveUserTimeZone, getLogger } from "@ai-collab/shared";
import {
  acquireIdentityLeaseInputSchema,
  attachSessionInputSchema,
  knowledgeLevels,
  knowledgePatchStatuses,
  knowledgeSourceKinds,
  type DeleteKnowledgeInput,
  type KnowledgeLevel,
  type KnowledgePatchStatus,
  type KnowledgeSourceKind,
  type UpsertKnowledgeInput,
  type WsConsoleUpdateReason,
  type SendMessageInput,
  completeTaskInputSchema,
  createTaskInputSchema,
  createSessionInputSchema,
  joinSessionByNameInputSchema,
  joinSessionInputSchema,
  listProgressFilterSchema,
  messageClaimInputSchema,
  messageProcessCompleteInputSchema,
  messageProcessFailInputSchema,
  removeSessionMemberInputSchema,
  releaseIdentityLeaseInputSchema,
  sendMessageInputSchema,
  updateSessionInsightInputSchema,
  updateWindowBindingDefaultsInputSchema,
  updateWindowRuntimeStateInputSchema,
  upsertProgressInputSchema
} from "@ai-collab/protocol";
import type {
  CreateMcpServerInput,
  CreateWebAgentRuntimeInput,
  CreateWorkflowDefinitionInput,
  McpToolsetId,
  UpdateMcpServerInput,
  UpdateWebAgentRuntimeInput,
  UpdateWorkflowDefinitionInput
} from "@ai-collab/protocol";

import type { CoreConfig } from "../config.js";
import { CoreError } from "../errors.js";
import { logApiAudit } from "./request-audit.js";
import { successResponse, errorResponse } from "./response.js";
import type {
  AgentService,
  CollaborationWaitService,
  ExtractionService,
  GuardService,
  IdentityLeaseService,
  KnowledgeService,
  MessageService,
  ProgressService,
  SessionConsoleService,
  SessionService,
  SessionInsightService,
  TaskService,
  UserPreferencesService,
  WebAgentRuntimeExecutorService,
  WebAgentRuntimeService,
  WebSocketService,
  ExternalMcpService,
  McpToolService,
  WorkflowDefinitionService
} from "../services/index.js";
import type { ModelConfigRepository } from "@ai-collab/store";
import { createLlmRequest } from "../services/llm-provider-client.js";

export type ServerServices = {
  sessionService: SessionService;
  agentService: AgentService;
  identityLeaseService: IdentityLeaseService;
  messageService: MessageService;
  taskService: TaskService;
  sessionInsightService: SessionInsightService;
  windowBindingService: import("../services/index.js").WindowBindingService;
  websocketService: WebSocketService;
  progressService: ProgressService;
  sessionConsoleService: SessionConsoleService;
  knowledgeService: KnowledgeService;
  userPreferencesService: UserPreferencesService;
  extractionService: ExtractionService;
  guardService: GuardService;
  modelConfigService: ModelConfigRepository;
  externalMcpService: ExternalMcpService;
  mcpToolService: McpToolService;
  collaborationWaitService: CollaborationWaitService;
  webAgentRuntimeService: WebAgentRuntimeService;
  webAgentRuntimeExecutorService: WebAgentRuntimeExecutorService;
  workflowDefinitionService: WorkflowDefinitionService;
};

export const createServer = async (
  config: CoreConfig,
  services: ServerServices
) => {
  const logTimeZone = resolveUserTimeZone();
  const logger = getLogger();
  const server = Fastify({
    disableRequestLogging: false,
    loggerInstance: logger
  });

  await server.register(websocket);

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof CoreError) {
      void reply.status(error.statusCode).send(
        errorResponse(error.code, error.message)
      );
      return;
    }

    server.log.error(error);

    const statusCode =
      typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? ((error as { statusCode: number }).statusCode ?? 500)
        : 500;

    void reply.status(statusCode).send(
      errorResponse(
        "INTERNAL_SERVER_ERROR",
        error instanceof Error ? error.message : "Unexpected core error."
      )
    );
  });

  server.addHook("onSend", async (request, reply, payload) => {
    logApiAudit(request, reply, payload);
    return payload;
  });

  const broadcastConsoleUpdate = (
    sessionId: string,
    reason: WsConsoleUpdateReason
  ) => {
    services.websocketService.broadcastConsoleUpdate(sessionId, reason);
  };

  server.get("/health", async () => {
    return successResponse({
      status: "ok",
      service: "ai-collab-core",
      host: config.host,
      port: config.port
    });
  });

  server.get("/api/status", async () => {
    return successResponse({
      status: "running",
      message: "Core scaffold is initialized."
    });
  });

  server.get("/api/knowledge", async (request) => {
    const query = request.query as {
      level?: string;
      tag?: string;
      query?: string;
    };
    const level = isKnowledgeLevel(query.level) ? query.level : undefined;
    return successResponse({
      manifest: services.knowledgeService.getManifest(),
      items: services.knowledgeService.list({
        ...(level ? { level } : {}),
        ...(query.tag ? { tag: query.tag } : {}),
        ...(query.query ? { query: query.query } : {})
      })
    });
  });

  server.get("/api/knowledge/changes", async (request) => {
    const query = request.query as {
      level?: string;
      slug?: string;
      limit?: string;
    };
    const level = isKnowledgeLevel(query.level) ? query.level : undefined;
    return successResponse({
      changes: services.knowledgeService.listChanges({
        ...(level ? { level } : {}),
        ...(query.slug ? { slug: query.slug } : {}),
        ...(query.limit ? { limit: Number(query.limit) } : {})
      })
    });
  });

  server.get("/api/knowledge/:level/:slug", async (request) => {
    const params = request.params as { level: string; slug: string };
    if (!isKnowledgeLevel(params.level)) {
      throw new CoreError("INVALID_INPUT", `Unknown knowledge level "${params.level}".`);
    }
    return successResponse({
      document: services.knowledgeService.get(params.level, params.slug)
    });
  });

  server.put("/api/knowledge/:level/:slug", async (request) => {
    const params = request.params as { level: string; slug: string };
    if (!isKnowledgeLevel(params.level)) {
      throw new CoreError("INVALID_INPUT", `Unknown knowledge level "${params.level}".`);
    }
    const body: Partial<Omit<UpsertKnowledgeInput, "level" | "slug">> =
      typeof request.body === "object" && request.body !== null
        ? (request.body as Partial<Omit<UpsertKnowledgeInput, "level" | "slug">>)
        : {};
    if (body.sourceKind && !isKnowledgeSourceKind(body.sourceKind)) {
      throw new CoreError(
        "INVALID_INPUT",
        `Unknown knowledge source kind "${body.sourceKind}".`
      );
    }
    const guard = services.guardService.check({
      level: params.level,
      slug: params.slug,
      content: body.content ?? ""
    });
    if (!guard.ok) {
      throw new CoreError(
        "INVALID_INPUT",
        guard.violations.map((entry) => entry.message).join("; ")
      );
    }
    const document = services.knowledgeService.upsert({
        level: params.level,
        slug: params.slug,
        title: body.title ?? params.slug,
        content: body.content ?? "",
        ...(body.summary !== undefined ? { summary: body.summary } : {}),
        ...(body.tags ? { tags: body.tags } : {}),
        ...(body.ownerAgentId !== undefined
          ? { ownerAgentId: body.ownerAgentId }
          : {}),
        ...(body.sourceKind ? { sourceKind: body.sourceKind } : {}),
        ...(body.sourceAgentId !== undefined
          ? { sourceAgentId: body.sourceAgentId }
          : {}),
        ...(body.changeSummary !== undefined
          ? { changeSummary: body.changeSummary }
          : {})
      });
    services.websocketService.broadcastConsoleUpdateToAll("knowledge_updated");
    return successResponse({
      document
    });
  });

  server.delete("/api/knowledge/:level/:slug", async (request) => {
    const params = request.params as { level: string; slug: string };
    if (!isKnowledgeLevel(params.level)) {
      throw new CoreError("INVALID_INPUT", `Unknown knowledge level "${params.level}".`);
    }
    const body: Partial<Omit<DeleteKnowledgeInput, "level" | "slug">> =
      typeof request.body === "object" && request.body !== null
        ? (request.body as Partial<Omit<DeleteKnowledgeInput, "level" | "slug">>)
        : {};
    if (body.sourceKind && !isKnowledgeSourceKind(body.sourceKind)) {
      throw new CoreError(
        "INVALID_INPUT",
        `Unknown knowledge source kind "${body.sourceKind}".`
      );
    }
    const result = services.knowledgeService.delete({
        level: params.level,
        slug: params.slug,
        ...(body.sourceKind ? { sourceKind: body.sourceKind } : {}),
        ...(body.sourceAgentId !== undefined
          ? { sourceAgentId: body.sourceAgentId }
          : {}),
        ...(body.changeSummary !== undefined
          ? { changeSummary: body.changeSummary }
          : {})
      });
    services.websocketService.broadcastConsoleUpdateToAll("knowledge_updated");
    return successResponse(result);
  });

  server.get("/api/knowledge/patches/pending", async () => {
    return successResponse({
      patches: services.knowledgeService.listPendingPatchRecords()
    });
  });

  server.get("/api/user-preferences", async (request) => {
    const query = request.query as {
      category?: string;
      query?: string;
    };
    return successResponse({
      manifest: services.userPreferencesService.getManifest(),
      preferences: services.userPreferencesService.list({
        ...(query.category ? { category: query.category } : {}),
        ...(query.query ? { query: query.query } : {})
      })
    });
  });

  server.put("/api/user-preferences/:key", async (request) => {
    const params = request.params as { key: string };
    const body =
      typeof request.body === "object" && request.body !== null
        ? (request.body as {
            value?: string;
            category?: string | null;
            source?: "manual" | "agent" | "system";
          })
        : {};
    const preference = services.userPreferencesService.upsert({
      key: params.key,
      value: body.value ?? "",
      ...(body.category !== undefined ? { category: body.category } : {}),
      ...(body.source ? { source: body.source } : {})
    });
    return successResponse({ preference });
  });

  server.delete("/api/user-preferences/:key", async (request) => {
    const params = request.params as { key: string };
    return successResponse(services.userPreferencesService.delete(params.key));
  });

  server.get("/api/knowledge/patches/:patchId", async (request) => {
    const params = request.params as { patchId: string };
    const patchRecord = services.knowledgeService.getPatchRecord(params.patchId);
    if (!patchRecord) {
      throw new CoreError("KNOWLEDGE_DOCUMENT_NOT_FOUND", `Knowledge patch "${params.patchId}" not found.`);
    }
    const reviewRecord = services.knowledgeService.getPatchReviewRecord(params.patchId);
    const persistenceRecord = services.knowledgeService.getPersistenceRecord(params.patchId);
    return successResponse({
      patch: patchRecord,
      review: reviewRecord,
      persistence: persistenceRecord
    });
  });

  server.get("/api/knowledge/patches", async (request) => {
    const query = request.query as {
      status?: string;
    };
    const status = query.status && knowledgePatchStatuses.includes(query.status as KnowledgePatchStatus)
      ? query.status as KnowledgePatchStatus
      : undefined;
    return successResponse({
      patches: services.knowledgeService.listPatchRecords({
        ...(status ? { status } : {})
      })
    });
  });

  server.post("/api/knowledge/patches/:patchId/adjudicate", async (request) => {
    const params = request.params as { patchId: string };
    const body: Partial<Omit<import("@ai-collab/protocol").AdjudicateKnowledgePatchInput, "patchId">> =
      typeof request.body === "object" && request.body !== null
        ? (request.body as Partial<Omit<import("@ai-collab/protocol").AdjudicateKnowledgePatchInput, "patchId">>)
        : {};
    if (!body.decision) {
      throw new CoreError("INVALID_INPUT", "Adjudication decision is required.");
    }
    const result = services.knowledgeService.adjudicatePatch({
      patchId: params.patchId,
      decision: body.decision,
      reviewedBy: body.reviewedBy ?? "system",
      ...(body.reviewComment !== undefined ? { reviewComment: body.reviewComment } : {}),
      ...(body.reviewedAt ? { reviewedAt: body.reviewedAt } : {})
    });
    services.websocketService.broadcastConsoleUpdateToAll("knowledge_updated");
    return successResponse(result);
  });

  server.post("/api/knowledge/patches/:patchId/execute", async (request) => {
    const params = request.params as { patchId: string };
    const result = services.knowledgeService.executeApprovedPatchPersistence(params.patchId);
    services.websocketService.broadcastConsoleUpdateToAll("knowledge_updated");
    return successResponse(result);
  });

  server.post("/api/sessions", async (request) => {
    const input = createSessionInputSchema.parse(request.body);
    const result = services.sessionService.createSession(input);
    broadcastConsoleUpdate(result.session.id, "member_changed");
    return successResponse(result);
  });

  server.post("/api/sessions/attach", async (request) => {
    const input = attachSessionInputSchema.parse(request.body);
    const result = services.sessionService.attachSessionByName(input);
    broadcastConsoleUpdate(result.session.id, "member_changed");
    return successResponse(result);
  });

  server.get("/api/sessions", async () => {
    return successResponse({
      sessions: services.sessionService.listSessions()
    });
  });

  server.get("/api/sessions/:sessionId", async (request) => {
    const params = request.params as { sessionId: string };
    return successResponse(services.sessionService.getSession(params.sessionId));
  });

  server.get("/api/sessions/by-name/:sessionName", async (request) => {
    const params = request.params as { sessionName: string };
    return successResponse(services.sessionService.getSessionByName(params.sessionName));
  });

  server.delete("/api/sessions/:sessionId", async (request) => {
    const params = request.params as { sessionId: string };
    const body =
      typeof request.body === "object" && request.body !== null
        ? (request.body as { requesterAgentId?: string })
        : {};
    const result = body.requesterAgentId
      ? services.sessionService.deleteSession(
          params.sessionId,
          body.requesterAgentId
        )
      : services.sessionService.deleteSession(params.sessionId);
    broadcastConsoleUpdate(params.sessionId, "member_changed");
    return successResponse(result);
  });

  server.delete("/api/sessions/by-name/:sessionName", async (request) => {
    const params = request.params as { sessionName: string };
    const body =
      typeof request.body === "object" && request.body !== null
        ? (request.body as { requesterAgentId?: string })
        : {};
    const targetSession = services.sessionService.getSessionByName(params.sessionName);
    const result = body.requesterAgentId
      ? services.sessionService.deleteSessionByName(
          params.sessionName,
          body.requesterAgentId
        )
      : services.sessionService.deleteSessionByName(params.sessionName);
    broadcastConsoleUpdate(targetSession.id, "member_changed");
    return successResponse(result);
  });

  server.post("/api/sessions/:sessionId/join", async (request) => {
    const params = request.params as { sessionId: string };
    const input = joinSessionInputSchema.parse({
      ...(request.body as Record<string, unknown>),
      sessionId: params.sessionId
    });

    const result = services.sessionService.joinSession(input);
    broadcastConsoleUpdate(result.session.id, "member_changed");
    return successResponse(result);
  });

  server.post("/api/sessions/join-by-name", async (request) => {
    const input = joinSessionByNameInputSchema.parse(request.body);
    const result = services.sessionService.joinSessionByName(input);
    broadcastConsoleUpdate(result.session.id, "member_changed");
    return successResponse(result);
  });

  server.get("/api/sessions/:sessionId/members", async (request) => {
    const params = request.params as { sessionId: string };
    return successResponse({
      members: services.sessionService.listMembers(params.sessionId)
    });
  });

  server.get("/api/sessions/:sessionId/heartbeats", async (request) => {
    const params = request.params as { sessionId: string };
    return successResponse({
      heartbeats: services.sessionService.listMemberHeartbeats(params.sessionId)
    });
  });

  server.get("/api/sessions/:sessionId/insight", async (request) => {
    const params = request.params as { sessionId: string };
    return successResponse({
      insight: services.sessionInsightService.getSessionInsight(params.sessionId)
    });
  });

  server.get("/api/sessions/:sessionId/console", async (request) => {
    const params = request.params as { sessionId: string };
    return successResponse({
      console: services.sessionConsoleService.getSessionConsole(params.sessionId)
    });
  });

  server.put("/api/sessions/:sessionId/insight", async (request) => {
    const params = request.params as { sessionId: string };
    const input = updateSessionInsightInputSchema.parse({
      ...(request.body as Record<string, unknown>),
      sessionId: params.sessionId
    });

    return successResponse({
      insight: services.sessionInsightService.updateSessionInsight(input)
    });
  });

  server.post("/api/agents/:agentId/heartbeat", async (request) => {
    const params = request.params as { agentId: string };
    const members = services.sessionService.listSessions()
      .flatMap((session) => services.sessionService.listMembers(session.id));
    const member = members.find((agent) => agent.id === params.agentId);
    const result = services.agentService.heartbeat(params.agentId);
    if (member) {
      broadcastConsoleUpdate(member.sessionId, "member_changed");
    }
    return successResponse(result);
  });

  server.post("/api/agents/:agentId/leave", async (request) => {
    const params = request.params as { agentId: string };
    const result = services.agentService.leave(params.agentId);
    broadcastConsoleUpdate(result.sessionId, "member_changed");
    return successResponse(result);
  });

  server.post("/api/sessions/:sessionId/members/:agentId/remove", async (request) => {
    const params = request.params as {
      sessionId: string;
      agentId: string;
    };
    const input = removeSessionMemberInputSchema.parse({
      ...(request.body as Record<string, unknown>),
      sessionId: params.sessionId,
      targetAgentId: params.agentId
    });

    const result = services.sessionService.removeSessionMember(input);
    broadcastConsoleUpdate(params.sessionId, "member_changed");
    return successResponse(result);
  });

  server.post("/api/messages/send", async (request) => {
    const parsed = sendMessageInputSchema.parse(request.body);
    const input: SendMessageInput = {
      sessionId: parsed.sessionId,
      fromAgentId: parsed.fromAgentId,
      type: parsed.type,
      payload: parsed.payload,
      ...(parsed.toAgentId ? { toAgentId: parsed.toAgentId } : {}),
        ...(parsed.idempotencyKey
          ? { idempotencyKey: parsed.idempotencyKey }
          : {}),
        ...(parsed.correlationId ? { correlationId: parsed.correlationId } : {}),
        ...(parsed.supersedeMessageIds
          ? { supersedeMessageIds: parsed.supersedeMessageIds }
          : {})
      };
      const message = services.messageService.sendMessage(input);
      broadcastConsoleUpdate(message.sessionId, "message_sent");
      return successResponse(message);
    });

  server.post("/api/identity-leases/acquire", async (request) => {
    const input = acquireIdentityLeaseInputSchema.parse(request.body);
    return successResponse({
      lease: services.identityLeaseService.acquire(input)
    });
  });

  server.post("/api/identity-leases/release", async (request) => {
    const input = releaseIdentityLeaseInputSchema.parse(request.body);
    return successResponse(services.identityLeaseService.release(input));
  });

  server.get("/api/window-bindings", async (request) => {
    const query = request.query as {
      sessionName?: string;
    };
    return successResponse({
      bindings: services.windowBindingService.list(query.sessionName)
    });
  });

  server.get("/api/window-bindings/:sessionName/:windowName", async (request) => {
    const params = request.params as {
      sessionName: string;
      windowName: string;
    };
    return successResponse({
      binding: services.windowBindingService.get(
        params.sessionName,
        params.windowName
      )
    });
  });

  server.put(
    "/api/window-bindings/:sessionName/:windowName/defaults",
    async (request) => {
      const params = request.params as {
        sessionName: string;
        windowName: string;
      };
      const input = updateWindowBindingDefaultsInputSchema.parse(request.body);
      return successResponse({
        binding: services.windowBindingService.updateDefaults(
          params.sessionName,
          params.windowName,
          input
        )
      });
    }
  );

  server.put(
    "/api/window-bindings/:sessionName/:windowName/runtime",
    async (request) => {
      const params = request.params as {
        sessionName: string;
        windowName: string;
      };
      const input = updateWindowRuntimeStateInputSchema.parse(request.body);
      return successResponse({
        binding: services.windowBindingService.updateRuntimeState(
          params.sessionName,
          params.windowName,
          input
        )
      });
    }
  );

  server.delete(
    "/api/window-bindings/:sessionName/:windowName/runtime",
    async (request) => {
      const params = request.params as {
        sessionName: string;
        windowName: string;
      };
      return successResponse({
        binding: services.windowBindingService.clearRuntimeState(
          params.sessionName,
          params.windowName
        )
      });
    }
  );

  server.get("/api/messages/:messageId", async (request) => {
    const params = request.params as { messageId: string };
    return successResponse({
      message: services.messageService.getMessage(params.messageId)
    });
  });

  server.get("/api/agents/:agentId/inbox", async (request) => {
    const params = request.params as { agentId: string };
    const query = request.query as {
      pendingOnly?: string;
      claimedOnly?: string;
    };
    return successResponse({
      messages: services.messageService.getInbox(params.agentId, {
        pendingOnly: query.pendingOnly === "true",
        claimedOnly: query.claimedOnly === "true"
      })
    });
  });

  server.get("/api/sessions/:sessionId/messages", async (request) => {
    const params = request.params as { sessionId: string };
    return successResponse({
      messages: services.messageService.listMessagesBySession(params.sessionId)
    });
  });

  server.get("/api/sessions/:sessionId/queue-stats", async (request) => {
    const params = request.params as { sessionId: string };
    return successResponse({
      agents: services.messageService.getSessionQueueStats(params.sessionId)
    });
  });

  server.post("/api/messages/claim-next", async (request) => {
    const input = messageClaimInputSchema.parse(request.body);
    const message = services.messageService.claimNext(input.agentId, {
      ...(input.types ? { types: input.types } : {}),
      ...(input.fromAgentId ? { fromAgentId: input.fromAgentId } : {}),
      ...(input.correlationId
        ? { correlationId: input.correlationId }
        : {}),
      ...(input.identity ? { identity: input.identity } : {}),
      ...(input.flow ? { flow: input.flow } : {}),
      ...(input.ownerToken ? { ownerToken: input.ownerToken } : {})
    });
    if (message) {
      broadcastConsoleUpdate(message.sessionId, "message_claimed");
    }
    return successResponse({
      message
    });
  });

  server.post("/api/messages/:messageId/ack", async (request) => {
    const params = request.params as { messageId: string };
    const body =
      typeof request.body === "object" && request.body !== null
        ? (request.body as { processed?: boolean })
        : {};

    return successResponse(services.messageService.acknowledge(
      params.messageId,
      body.processed ?? false
    ));
  });

  server.post("/api/messages/:messageId/process-complete", async (request) => {
    const params = request.params as { messageId: string };
    const input = messageProcessCompleteInputSchema.parse(request.body);
    const message = services.messageService.completeMessage(
      params.messageId,
      input.agentId,
      {
        ...(input.identity ? { identity: input.identity } : {}),
        ...(input.flow ? { flow: input.flow } : {}),
        ...(input.ownerToken ? { ownerToken: input.ownerToken } : {})
      }
    );
    broadcastConsoleUpdate(message.sessionId, "message_completed");
    return successResponse({
      message
    });
  });

  server.post("/api/messages/:messageId/process-fail", async (request) => {
    const params = request.params as { messageId: string };
    const input = messageProcessFailInputSchema.parse(request.body);
    const message = services.messageService.failMessage(
      params.messageId,
      input.agentId,
      input.reason,
      {
        ...(input.identity ? { identity: input.identity } : {}),
        ...(input.flow ? { flow: input.flow } : {}),
        ...(input.ownerToken ? { ownerToken: input.ownerToken } : {})
      }
    );
    broadcastConsoleUpdate(message.sessionId, "message_completed");
    return successResponse({
      message
    });
  });

  server.post("/api/tasks", async (request) => {
    const input = createTaskInputSchema.parse(request.body);
    return successResponse(services.taskService.createTask(input));
  });

  server.get("/api/sessions/:sessionId/tasks", async (request) => {
    const params = request.params as { sessionId: string };
    return successResponse({
      tasks: services.taskService.listTasks(params.sessionId)
    });
  });

  server.post("/api/tasks/:taskId/complete", async (request) => {
    const params = request.params as { taskId: string };
    const input = completeTaskInputSchema.parse(request.body);
    return successResponse(services.taskService.completeTask(params.taskId, input));
  });

  server.put("/api/progress", async (request) => {
    const input = upsertProgressInputSchema.parse(request.body);
    const progress = services.progressService.upsert(input);

    services.websocketService.broadcastProgress({
      type: "progress:update",
      sessionId: progress.sessionId,
      agentId: progress.agentId,
      agentName: progress.agentName,
      status: progress.status,
      percentage: progress.percentage,
      currentStep: progress.currentStep,
      message: progress.message,
      details: progress.details,
      updatedAt: progress.updatedAt
    });
    broadcastConsoleUpdate(progress.sessionId, "progress_updated");

    return successResponse({ progress });
  });

  server.get("/api/progress/:sessionId/:agentId", async (request) => {
    const params = request.params as { sessionId: string; agentId: string };
    return successResponse({
      progress: services.progressService.get(params.sessionId, params.agentId)
    });
  });

  server.get("/api/progress", async (request) => {
    const query = request.query as {
      sessionId?: string;
      agentId?: string;
      status?: string;
    };
    const filter = listProgressFilterSchema.parse(query);
    return successResponse({
      progressList: services.progressService.list(filter)
    });
  });

  server.delete("/api/progress/:sessionId", async (request) => {
    const params = request.params as { sessionId: string };
    const cleared = services.progressService.clear(params.sessionId);
    return successResponse({ cleared });
  });

  server.post("/api/sessions/join-with-agent", async (request) => {
    const body = request.body as {
      sessionId: string;
      role: "worker" | "observer" | "knowledge_keeper";
      agentName: string;
      displayName?: string;
      roleDescription?: string | null;
    };
    const result = services.sessionService.joinSession({
      sessionId: body.sessionId,
      agentName: body.agentName,
      displayName: body.displayName ?? body.agentName,
      platform: "generic",
      role: body.role,
      roleDescription: body.roleDescription ?? undefined,
      capabilities: [],
      connectionMode: "skill-bridge"
    });
    broadcastConsoleUpdate(result.session.id, "member_changed");
    return successResponse({ agent: result.agent, session: result.session });
  });

  server.post("/api/sessions/create-with-agent", async (request) => {
    const body = request.body as {
      sessionName: string;
      agentName: string;
      displayName?: string;
      roleDescription?: string | null;
    };
    const result = services.sessionService.createSession({
      sessionName: body.sessionName,
      agentName: body.agentName,
      displayName: body.displayName ?? body.agentName,
      platform: "generic",
      roleDescription: body.roleDescription ?? undefined,
      capabilities: [],
      connectionMode: "skill-bridge"
    });
    broadcastConsoleUpdate(result.session.id, "member_changed");
    return successResponse({ agent: result.agent, session: result.session });
  });

  server.get("/api/models", async () => {
    return successResponse(services.modelConfigService.list());
  });

  server.post("/api/llm/chat", async (request) => {
    const body = request.body as {
      modelConfigId?: string;
      messages?: Array<{ role: string; content: string }>;
      tools?: unknown[];
      tool_choice?: unknown;
      temperature?: number;
      stream?: boolean;
    };
    const modelId = body.modelConfigId ?? "default-model";
    const model = services.modelConfigService.getFull(modelId);
    const { response, parse } = await createLlmRequest(model, {
      messages: body.messages ?? [],
      ...(body.tools ? { tools: body.tools } : {}),
      ...(body.tool_choice ? { tool_choice: body.tool_choice } : {}),
      ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
      ...(body.stream !== undefined ? { stream: body.stream } : {})
    });
    if (!response.ok) {
      throw new CoreError(
        "INVALID_INPUT",
        `LLM HTTP ${response.status}: ${await response.text()}`,
        response.status
      );
    }
    return successResponse(await parse());
  });

  server.get("/api/workflows", async () => {
    return successResponse(services.workflowDefinitionService.list());
  });

  server.get("/api/workflows/:workflowId", async (request) => {
    const params = request.params as { workflowId: string };
    return successResponse(services.workflowDefinitionService.get(params.workflowId));
  });

  server.post("/api/workflows", async (request) => {
    return successResponse(
      services.workflowDefinitionService.create(
        request.body as CreateWorkflowDefinitionInput
      )
    );
  });

  server.put("/api/workflows/:workflowId", async (request) => {
    const params = request.params as { workflowId: string };
    return successResponse(
      services.workflowDefinitionService.update(
        params.workflowId,
        request.body as UpdateWorkflowDefinitionInput
      )
    );
  });

  server.delete("/api/workflows/:workflowId", async (request) => {
    const params = request.params as { workflowId: string };
    return successResponse(services.workflowDefinitionService.delete(params.workflowId));
  });

  server.get("/api/web-agent-runtimes", async (request) => {
    const query = request.query as { sessionId?: string };
    if (!query.sessionId) {
      return successResponse([]);
    }
    return successResponse(services.webAgentRuntimeService.list(query.sessionId));
  });

  server.post("/api/web-agent-runtimes", async (request) => {
    const body = request.body as Partial<CreateWebAgentRuntimeInput>;
    const runtime = services.webAgentRuntimeService.createOrUpdate({
      sessionId: String(body.sessionId),
      agentId: String(body.agentId),
      role: body.role === "host" ? "host" : "knowledge_keeper",
      modelConfigId: body.modelConfigId ?? "default-model",
      agentProfileId: body.agentProfileId ?? null,
      toolsetId: body.toolsetId ?? (body.role === "host" ? "host" : "knowledge_keeper")
    });
    broadcastConsoleUpdate(runtime.sessionId, "member_changed");
    return successResponse(runtime);
  });

  server.get("/api/web-agent-runtimes/:runtimeId", async (request) => {
    const params = request.params as { runtimeId: string };
    return successResponse(services.webAgentRuntimeService.get(params.runtimeId));
  });

  server.patch("/api/web-agent-runtimes/:runtimeId", async (request) => {
    const params = request.params as { runtimeId: string };
    return successResponse(
      services.webAgentRuntimeService.update(
        params.runtimeId,
        request.body as UpdateWebAgentRuntimeInput
      )
    );
  });

  server.delete("/api/web-agent-runtimes/:runtimeId", async (request) => {
    const params = request.params as { runtimeId: string };
    services.webAgentRuntimeExecutorService.stop(params.runtimeId);
    return successResponse(services.webAgentRuntimeService.delete(params.runtimeId));
  });

  server.post("/api/web-agent-runtimes/:runtimeId/start", async (request) => {
    const params = request.params as { runtimeId: string };
    const runtime = services.webAgentRuntimeService.setStatus(params.runtimeId, "running");
    services.webAgentRuntimeExecutorService.start(runtime);
    return successResponse(runtime);
  });

  server.post("/api/web-agent-runtimes/:runtimeId/pause", async (request) => {
    const params = request.params as { runtimeId: string };
    services.webAgentRuntimeExecutorService.stop(params.runtimeId);
    return successResponse(services.webAgentRuntimeService.setStatus(params.runtimeId, "paused"));
  });

  server.post("/api/web-agent-runtimes/:runtimeId/stop", async (request) => {
    const params = request.params as { runtimeId: string };
    services.webAgentRuntimeExecutorService.stop(params.runtimeId);
    return successResponse(services.webAgentRuntimeService.setStatus(params.runtimeId, "stopped"));
  });

  server.get("/api/mcp/tools", async (request) => {
    const query = request.query as { toolsetId?: string; extraToolNames?: string };
    const toolsetId = (query.toolsetId ?? "worker") as McpToolsetId;
    const extraToolNames = query.extraToolNames
      ? query.extraToolNames.split(",").map((item) => item.trim()).filter(Boolean)
      : [];
    return successResponse({
      tools: [
        ...services.mcpToolService.getToolsetDefinitions(toolsetId),
        ...services.mcpToolService.getToolDefinitionsByNames(extraToolNames)
      ]
    });
  });

  server.post("/api/mcp/call", async (request) => {
    const body = request.body as {
      agentId: string;
      sessionId: string;
      toolName: string;
      arguments?: Record<string, unknown>;
    };
    const result = await services.mcpToolService.executeTool(
      body.toolName,
      body.arguments ?? {},
      body.agentId,
      body.sessionId,
      services
    );
    return successResponse(result);
  });

  server.get("/api/mcp-servers", async () => {
    const servers = await Promise.all(
      services.externalMcpService.list().map(async (serverConfig) => ({
        ...serverConfig,
        toolCount: (await services.externalMcpService.listTools(serverConfig.id)).length
      }))
    );
    return successResponse(servers);
  });

  server.post("/api/mcp-servers", async (request) => {
    const body = request.body as CreateMcpServerInput & { enabled?: boolean };
    const created = services.externalMcpService.create({
      ...body,
      transport: body.transport ?? "sse"
    });
    if (body.enabled === false) {
      return successResponse(
        services.externalMcpService.update(created.id, { enabled: false })
      );
    }
    return successResponse(created);
  });

  server.put("/api/mcp-servers/:serverId", async (request) => {
    const params = request.params as { serverId: string };
    return successResponse(
      services.externalMcpService.update(
        params.serverId,
        request.body as UpdateMcpServerInput
      )
    );
  });

  server.delete("/api/mcp-servers/:serverId", async (request) => {
    const params = request.params as { serverId: string };
    return successResponse(services.externalMcpService.delete(params.serverId));
  });

  server.get("/api/mcp-servers/:serverId/tools", async (request) => {
    const params = request.params as { serverId: string };
    return successResponse(await services.externalMcpService.listTools(params.serverId));
  });

  server.get("/api/agent-profiles", async () => {
    return successResponse([]);
  });

  server.get("/api/agent-profiles/:profileId", async (request) => {
    const params = request.params as { profileId: string };
    throw new CoreError("INVALID_INPUT", `Agent profile "${params.profileId}" is disabled in this build.`, 404);
  });

  server.get("/api/skills", async () => {
    return successResponse([]);
  });

  server.get("/api/skills/:skillId", async (request) => {
    const params = request.params as { skillId: string };
    throw new CoreError("INVALID_INPUT", `Skill "${params.skillId}" is disabled in this build.`, 404);
  });

  server.get("/api/metrics", async (request) => {
    const params = request.query as { sessionId?: string };
    const metrics: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      websocketConnections: services.websocketService.getConnectionCount(),
      websocketStats: services.websocketService.getConnectionStats()
    };

    if (params.sessionId) {
      metrics.sessionId = params.sessionId;
      metrics.sessionWebsocketConnections =
        services.websocketService.getSessionConnectionCount(params.sessionId);
    }

    return successResponse(metrics);
  });

  services.websocketService.register(server);
  registerWebFrontend(server);

  return server;
};

const isKnowledgeLevel = (value: string | undefined): value is KnowledgeLevel => {
  return typeof value === "string" &&
    (knowledgeLevels as readonly string[]).includes(value);
};

const isKnowledgeSourceKind = (
  value: string | undefined
): value is KnowledgeSourceKind => {
  return typeof value === "string" &&
    (knowledgeSourceKinds as readonly string[]).includes(value);
};

const webMimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf"
};

const findWebDistPath = (): string | null => {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.AI_COLLAB_WEB_DIST_PATH,
    resolve(process.cwd(), "..", "web", "dist"),
    resolve(process.cwd(), "..", "..", "apps", "web", "dist"),
    resolve(process.cwd(), "apps", "web", "dist"),
    resolve(moduleDir, "..", "..", "..", "..", "..", "web"),
    resolve(moduleDir, "..", "..", "..", "..", "..", "..", "..", "apps", "web", "dist"),
    resolve(moduleDir, "..", "..", "..", "..", "web"),
    resolve(moduleDir, "web")
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    const indexPath = resolve(candidate, "index.html");
    if (existsSync(indexPath)) {
      return resolve(candidate);
    }
  }

  return null;
};

const isPathInside = (parent: string, child: string): boolean => {
  const normalizedParent = resolve(parent);
  const normalizedChild = resolve(child);
  return normalizedChild === normalizedParent ||
    normalizedChild.startsWith(`${normalizedParent}${sep}`);
};

const registerWebFrontend = (server: Awaited<ReturnType<typeof Fastify>>) => {
  const webDistPath = findWebDistPath();

  server.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    const method = request.method.toUpperCase();
    const rawUrl = request.raw.url ?? "/";
    const pathname = rawUrl.split("?", 1)[0] ?? "/";

    if (
      method !== "GET" ||
      pathname.startsWith("/api") ||
      pathname.startsWith("/ws") ||
      pathname === "/health"
    ) {
      void reply.status(404).send(errorResponse("INVALID_INPUT", "Route not found."));
      return;
    }

    if (!webDistPath) {
      void reply
        .status(404)
        .type("text/plain; charset=utf-8")
        .send("ai-collab web assets were not found. Run npm run build or set AI_COLLAB_WEB_DIST_PATH.");
      return;
    }

    const decodedPath = decodeURIComponent(pathname);
    const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
    const requestedPath = resolve(webDistPath, relativePath);
    const safeRequestedPath = isPathInside(webDistPath, requestedPath)
      ? requestedPath
      : resolve(webDistPath, "index.html");
    const filePath =
      existsSync(safeRequestedPath) && statSync(safeRequestedPath).isFile()
        ? safeRequestedPath
        : resolve(webDistPath, "index.html");
    const contentType = webMimeTypes[extname(filePath).toLowerCase()] ??
      "application/octet-stream";

    void reply.type(contentType).send(createReadStream(filePath));
  });
};
