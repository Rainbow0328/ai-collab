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
  errorCodes,
  type DeleteKnowledgeInput,
  type KnowledgeLevel,
  type KnowledgePatchStatus,
  type KnowledgeSourceKind,
  type UpsertKnowledgeInput,
  type WsConsoleUpdateReason,
  type SendMessageInput,
  createSessionInputSchema,
  joinSessionByNameInputSchema,
  joinSessionInputSchema,
  listProgressFilterSchema,
  messageClaimInputSchema,
  messageClaimManyInputSchema,
  messageProcessCompleteInputSchema,
  messageProcessFailInputSchema,
  removeSessionMemberInputSchema,
  releaseIdentityLeaseInputSchema,
  sendMessageInputSchema,
  updateSessionInsightInputSchema,
  updateWindowBindingDefaultsInputSchema,
  updateWindowRuntimeStateInputSchema,
  upsertProgressInputSchema,
  createModelConfigInputSchema,
  updateModelConfigInputSchema,
  testModelConfigInputSchema,
  createAgentProfileInputSchema,
  updateAgentProfileInputSchema,
  updateAgentProfileSkillsInputSchema,
  createSessionWithAgentInputSchema,
  joinSessionWithAgentInputSchema,
  setSessionSkillsInputSchema,
  createSkillInputSchema,
  updateSkillInputSchema,
  knowledgeFeedbackInputSchema,
  createKnowledgeBuildJudgementInputSchema,
  fulfillKnowledgeBuildJudgementInputSchema
} from "@ai-collab/protocol";

import type { CoreConfig } from "../config.js";
import { CoreError } from "../errors.js";
import { logApiAudit } from "./request-audit.js";
import { successResponse, errorResponse } from "./response.js";
import type {
  AgentService,
  GuardService,
  IdentityLeaseService,
  KnowledgeService,
  MessageService,
  ProgressService,
  SessionConsoleService,
  SessionService,
  SessionInsightService,
  WebSocketService,
  UserProfileService
} from "../services/index.js";

type ServerServices = {
  sessionService: SessionService;
  agentService: AgentService;
  identityLeaseService: IdentityLeaseService;
  messageService: MessageService;
  sessionInsightService: SessionInsightService;
  windowBindingService: import("../services/index.js").WindowBindingService;
  websocketService: WebSocketService;
  progressService: ProgressService;
  sessionConsoleService: SessionConsoleService;
  knowledgeService: KnowledgeService;
  guardService: GuardService;
  modelConfigService: import("../services/index.js").ModelConfigService;
  agentProfileService: import("../services/index.js").AgentProfileService;
  skillService: import("../services/index.js").SkillService;
  hostKnowledgeBuildService: import("../services/index.js").HostKnowledgeBuildService;
  traceService: import("../services/index.js").TraceService;
  analyticsService: import("../services/index.js").AnalyticsService;
  userProfileService: UserProfileService;
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
      sessionId?: string;
      level?: string;
      tag?: string;
      query?: string;
    };
    const level = isKnowledgeLevel(query.level) ? query.level : undefined;
    return successResponse({
      manifest: services.knowledgeService.getManifest(query.sessionId),
      items: services.knowledgeService.list({
        ...(query.sessionId ? { sessionId: query.sessionId } : {}),
        ...(level ? { level } : {}),
        ...(query.tag ? { tag: query.tag } : {}),
        ...(query.query ? { query: query.query } : {})
      })
    });
  });

  server.get("/api/knowledge/changes", async (request) => {
    const query = request.query as {
      sessionId?: string;
      level?: string;
      slug?: string;
      limit?: string;
    };
    const level = isKnowledgeLevel(query.level) ? query.level : undefined;
    return successResponse({
      changes: services.knowledgeService.listChanges({
        ...(query.sessionId ? { sessionId: query.sessionId } : {}),
        ...(level ? { level } : {}),
        ...(query.slug ? { slug: query.slug } : {}),
        ...(query.limit ? { limit: Number(query.limit) } : {})
      })
    });
  });

  server.get("/api/knowledge/:level/:slug", async (request) => {
    const params = request.params as { level: string; slug: string };
    const query = request.query as { sessionId?: string };
    if (!isKnowledgeLevel(params.level)) {
      throw new CoreError("INVALID_INPUT", `Unknown knowledge level "${params.level}".`);
    }
    return successResponse({
      document: services.knowledgeService.get(params.level, params.slug, query.sessionId)
    });
  });

  server.put("/api/knowledge/:level/:slug", async (request) => {
    const params = request.params as { level: string; slug: string };
    if (!isKnowledgeLevel(params.level)) {
      throw new CoreError("INVALID_INPUT", `Unknown knowledge level "${params.level}".`);
    }
    if (params.slug !== "current") {
      throw new CoreError(
        "INVALID_INPUT",
        `Only slug "current" is allowed for knowledge documents. Received "${params.slug}". Use read-current/update-current commands.`,
        400
      );
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
    await validateAgentRole(services, body.sourceAgentId || body.ownerAgentId, ["host", "knowledge_keeper"], "upsert knowledge");
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
        ...(body.sessionId !== undefined ? { sessionId: body.sessionId } : {}),
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
    if (params.slug !== "current") {
      throw new CoreError(
        "INVALID_INPUT",
        `Only slug "current" is allowed for knowledge documents. Received "${params.slug}".`,
        400
      );
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
    await validateAgentRole(services, body.sourceAgentId, ["host", "knowledge_keeper"], "delete knowledge");
    const result = services.knowledgeService.delete({
        level: params.level,
        slug: params.slug,
        ...(body.sessionId !== undefined ? { sessionId: body.sessionId } : {}),
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

  server.post("/api/knowledge/feedback", async (request) => {
    const input = knowledgeFeedbackInputSchema.parse(request.body);
    const session = services.sessionService.listSessions().find(s => s.id === input.sessionId);
    if (!session) {
      throw new CoreError("SESSION_NOT_FOUND", `Session "${input.sessionId}" not found.`, 404);
    }
    const members = services.sessionService.listMembers(input.sessionId);
    const hostAgent = members.find(m => m.id === session.hostAgentId);
    if (!hostAgent) {
      throw new CoreError(errorCodes.agentNotFound, `Host agent for session "${input.sessionId}" not found.`, 404);
    }
    services.messageService.sendMessage({
      sessionId: input.sessionId,
      fromAgentId: hostAgent.id,
      toAgentId: hostAgent.id,
      type: "instruction",
      payload: {
        kind: "knowledge_feedback",
        source: "user",
        level: input.level,
        slug: input.slug,
        feedback: input.feedback,
        ...(input.userIntent ? { userIntent: input.userIntent } : {})
      }
    });
    broadcastConsoleUpdate(input.sessionId, "message_sent");
    return successResponse({ ok: true, message: "Feedback sent to host" });
  });

  server.post("/api/knowledge/judgements", async (request) => {
    const input = createKnowledgeBuildJudgementInputSchema.parse(request.body);
    const session = services.sessionService.listSessions().find(s => s.id === input.sessionId);
    if (!session) {
      throw new CoreError("SESSION_NOT_FOUND", `Session "${input.sessionId}" not found.`, 404);
    }
    const members = services.sessionService.listMembers(input.sessionId);
    const hostAgent = members.find(m => m.id === input.hostAgentId);
    if (!hostAgent) {
      throw new CoreError(errorCodes.agentNotFound, `Host agent "${input.hostAgentId}" not found in session "${input.sessionId}".`, 404);
    }
    if (hostAgent.role !== "host") {
      throw new CoreError("INVALID_INPUT", `Agent "${input.hostAgentId}" is not a host.`);
    }
    const judgement = services.hostKnowledgeBuildService.createJudgement(input);
    broadcastConsoleUpdate(input.sessionId, "knowledge_updated");
    return successResponse({ judgement });
  });

  server.get("/api/knowledge/judgements", async (request) => {
    const query = request.query as { sessionId?: string };
    if (!query.sessionId) {
      throw new CoreError("INVALID_INPUT", "sessionId query parameter is required.");
    }
    return successResponse({
      judgements: services.hostKnowledgeBuildService.listJudgements(query.sessionId)
    });
  });

  server.get("/api/knowledge/judgements/by-message/:messageId", async (request) => {
    const params = request.params as { messageId: string };
    const query = request.query as { sessionId?: string };
    if (!query.sessionId) {
      throw new CoreError("INVALID_INPUT", "sessionId query parameter is required.");
    }
    const judgement = services.hostKnowledgeBuildService.getJudgementBySourceMessage(
      query.sessionId,
      params.messageId
    );
    return successResponse({ judgement });
  });

  server.post("/api/knowledge/judgements/fulfil", async (request) => {
    const input = fulfillKnowledgeBuildJudgementInputSchema.parse(request.body);
    const judgement = services.hostKnowledgeBuildService.getJudgementById(input.judgementId);
    if (!judgement) {
      throw new CoreError(errorCodes.invalidInput, `Judgement "${input.judgementId}" not found.`, 404);
    }
    const session = services.sessionService.listSessions().find(s => s.id === judgement.sessionId);
    if (!session) {
      throw new CoreError("SESSION_NOT_FOUND", `Session "${judgement.sessionId}" not found.`, 404);
    }
    const members = services.sessionService.listMembers(judgement.sessionId);
    const hostAgent = members.find(m => m.id === input.hostAgentId);
    if (!hostAgent) {
      throw new CoreError(errorCodes.agentNotFound, `Host agent "${input.hostAgentId}" not found.`, 404);
    }
    if (hostAgent.role !== "host") {
      throw new CoreError("INVALID_INPUT", `Agent "${input.hostAgentId}" is not a host.`);
    }
    const result = services.hostKnowledgeBuildService.fulfilJudgement(input);
    broadcastConsoleUpdate(judgement.sessionId, "knowledge_updated");
    return successResponse({ judgement: result });
  });

  server.get("/api/knowledge/patches/pending", async (request) => {
    const query = request.query as { sessionId?: string };
    return successResponse({
      patches: services.knowledgeService.listPendingPatchRecords(query.sessionId)
    });
  });

  server.get("/api/knowledge/patches/:patchId", async (request) => {
    const params = request.params as { patchId: string };
    const query = request.query as { sessionId?: string };
    const patchRecord = services.knowledgeService.getPatchRecord(params.patchId, query.sessionId);
    if (!patchRecord) {
      throw new CoreError("KNOWLEDGE_DOCUMENT_NOT_FOUND", `Knowledge patch "${params.patchId}" not found.`);
    }
    const reviewRecord = services.knowledgeService.getPatchReviewRecord(params.patchId, query.sessionId);
    const persistenceRecord = services.knowledgeService.getPersistenceRecord(params.patchId, query.sessionId);
    return successResponse({
      patch: patchRecord,
      review: reviewRecord,
      persistence: persistenceRecord
    });
  });

  server.get("/api/knowledge/patches", async (request) => {
    const query = request.query as {
      status?: string;
      sessionId?: string;
    };
    const status = query.status && knowledgePatchStatuses.includes(query.status as KnowledgePatchStatus)
      ? query.status as KnowledgePatchStatus
      : undefined;
    return successResponse({
      patches: services.knowledgeService.listPatchRecords({
        ...(status ? { status } : {}),
        ...(query.sessionId ? { sessionId: query.sessionId } : {})
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
      ...(body.reviewedAt ? { reviewedAt: body.reviewedAt } : {}),
      ...(body.sessionId ? { sessionId: body.sessionId } : {})
    });
    services.websocketService.broadcastConsoleUpdateToAll("knowledge_updated");
    return successResponse(result);
  });

  server.post("/api/knowledge/patches/:patchId/execute", async (request) => {
    const params = request.params as { patchId: string };
    const body = typeof request.body === "object" && request.body !== null
      ? (request.body as { sessionId?: string })
      : {};
    const result = services.knowledgeService.executeApprovedPatchPersistence(params.patchId, body.sessionId);
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

  server.get("/api/sessions/:sessionId/timeline", async (request) => {
    const params = request.params as { sessionId: string };
    const session = services.sessionService.getSession(params.sessionId);
    if (!session) {
      throw new CoreError(
        errorCodes.sessionNotFound,
        "Session not found.",
        404
      );
    }
    const timeline = services.analyticsService.buildSessionTimeline(
      params.sessionId,
      session.name
    );
    return successResponse(timeline);
  });

  server.get("/api/sessions/:sessionId/traces", async (request) => {
    const params = request.params as { sessionId: string };
    const traces = services.traceService.getSessionTraces(params.sessionId);
    return successResponse({ traces });
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

      const dispatchTypes = new Set(["task", "instruction"]);
      if (dispatchTypes.has(parsed.type)) {
        const members = services.sessionService.listMembers(parsed.sessionId);
        const fromMember = members.find(m => m.id === parsed.fromAgentId);
        if (fromMember && fromMember.role === "host") {
          const gateResult = services.hostKnowledgeBuildService.checkDispatchGate(
            parsed.sessionId,
            parsed.fromAgentId
          );
          if (!gateResult.allowed) {
            throw new CoreError(
              errorCodes.invalidInput,
              gateResult.reason ?? "Knowledge build gate check failed.",
              409
            );
          }
        }
      }

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
    await validateAgentRole(services, input.agentId, ["host", "worker", "knowledge_keeper"], "claim messages");
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

  server.post("/api/messages/claim-many", async (request) => {
    const input = messageClaimManyInputSchema.parse(request.body);
    await validateAgentRole(services, input.agentId, ["host", "worker", "knowledge_keeper"], "claim messages");
    const messages = services.messageService.claimMany(input.agentId, {
      ...(input.types ? { types: input.types } : {}),
      ...(input.fromAgentId ? { fromAgentId: input.fromAgentId } : {}),
      ...(input.correlationId
        ? { correlationId: input.correlationId }
        : {}),
      ...(input.maxMessages ? { maxMessages: input.maxMessages } : {}),
      ...(input.identity ? { identity: input.identity } : {}),
      ...(input.flow ? { flow: input.flow } : {}),
      ...(input.ownerToken ? { ownerToken: input.ownerToken } : {})
    });
    for (const message of messages) {
      broadcastConsoleUpdate(message.sessionId, "message_claimed");
    }
    return successResponse({
      messages
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
    await validateAgentRole(services, input.agentId, ["host", "worker", "knowledge_keeper"], "complete message");
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
    await validateAgentRole(services, input.agentId, ["host", "worker", "knowledge_keeper"], "fail message");
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

  // ============================================
  // Model Config API
  // ============================================
  server.post("/api/models", async (request) => {
    const input = createModelConfigInputSchema.parse(request.body) as import("@ai-collab/protocol").CreateModelConfigInput;
    return successResponse(services.modelConfigService.create(input));
  });

  server.get("/api/models", async () => {
    return successResponse({ models: services.modelConfigService.list() });
  });

  server.get("/api/models/:id", async (request) => {
    const params = request.params as { id: string };
    return successResponse(services.modelConfigService.get(params.id));
  });

  server.put("/api/models/:id", async (request) => {
    const params = request.params as { id: string };
    const input = updateModelConfigInputSchema.parse(request.body) as import("@ai-collab/protocol").UpdateModelConfigInput;
    return successResponse(services.modelConfigService.update(params.id, input));
  });

  server.delete("/api/models/:id", async (request) => {
    const params = request.params as { id: string };
    return successResponse(services.modelConfigService.delete(params.id));
  });

  server.post("/api/models/:id/test", async (request) => {
    const params = request.params as { id: string };
    const input = testModelConfigInputSchema.parse(request.body) as import("@ai-collab/protocol").TestModelConfigInput;
    return successResponse(await services.modelConfigService.test({ ...input, modelConfigId: params.id }));
  });

  // ============================================
  // Agent Profile API
  // ============================================
  server.post("/api/agent-profiles", async (request) => {
    const input = createAgentProfileInputSchema.parse(request.body) as import("@ai-collab/protocol").CreateAgentProfileInput;
    return successResponse(services.agentProfileService.create(input));
  });

  server.get("/api/agent-profiles", async () => {
    return successResponse({ profiles: services.agentProfileService.list() });
  });

  server.get("/api/agent-profiles/:id", async (request) => {
    const params = request.params as { id: string };
    return successResponse(services.agentProfileService.get(params.id));
  });

  server.put("/api/agent-profiles/:id", async (request) => {
    const params = request.params as { id: string };
    const input = updateAgentProfileInputSchema.parse(request.body) as import("@ai-collab/protocol").UpdateAgentProfileInput;
    return successResponse(services.agentProfileService.update(params.id, input));
  });

  server.delete("/api/agent-profiles/:id", async (request) => {
    const params = request.params as { id: string };
    return successResponse(services.agentProfileService.delete(params.id));
  });

  server.put("/api/agent-profiles/:id/skills", async (request) => {
    const params = request.params as { id: string };
    const input = updateAgentProfileSkillsInputSchema.parse(request.body);
    return successResponse(services.agentProfileService.updateSkills(params.id, input));
  });

  // ============================================
  // Skill API
  // ============================================
  server.post("/api/skills", async (request) => {
    const input = createSkillInputSchema.parse(request.body) as { name: string; description?: string | null; path: string; roleScope?: string | null };
    return successResponse(services.skillService.create(input));
  });

  server.get("/api/skills", async () => {
    return successResponse({ skills: services.skillService.list() });
  });

  server.get("/api/skills/:id", async (request) => {
    const params = request.params as { id: string };
    return successResponse(services.skillService.get(params.id));
  });

  server.put("/api/skills/:id", async (request) => {
    const params = request.params as { id: string };
    const input = updateSkillInputSchema.parse(request.body) as { name?: string; description?: string | null; roleScope?: string | null; enabled?: boolean };
    return successResponse(services.skillService.update(params.id, input));
  });

  server.delete("/api/skills/:id", async (request) => {
    const params = request.params as { id: string };
    return successResponse(services.skillService.delete(params.id));
  });

  server.post("/api/skills/scan", async (request) => {
    const input = request.body as { directoryPath: string };
    return successResponse(services.skillService.scanDirectory(input.directoryPath));
  });

  // ============================================
  // Session Skills API
  // ============================================
  server.get("/api/sessions/:sessionId/skills", async (request) => {
    const params = request.params as { sessionId: string };
    return successResponse({ skills: services.skillService.getSessionSkills(params.sessionId) });
  });

  server.get("/api/sessions/:sessionId/available-skills", async (request) => {
    const params = request.params as { sessionId: string };
    return successResponse({ skills: services.skillService.listAvailableSessionSkills(params.sessionId) });
  });

  server.put("/api/sessions/:sessionId/skills", async (request) => {
    const params = request.params as { sessionId: string };
    const input = setSessionSkillsInputSchema.parse(request.body);
    return successResponse({ skills: services.skillService.setSessionSkills(params.sessionId, input.skillIds) });
  });

  // ============================================
  // Session Creation with Agent API
  // ============================================
  server.post("/api/sessions/create-with-agent", async (request) => {
    const input = createSessionWithAgentInputSchema.parse(request.body) as import("@ai-collab/protocol").CreateSessionWithAgentInput;
    return successResponse(services.sessionService.createSessionWithAgent(input));
  });

  server.post("/api/sessions/join-with-agent", async (request) => {
    const input = joinSessionWithAgentInputSchema.parse(request.body) as import("@ai-collab/protocol").JoinSessionWithAgentInput;
    return successResponse(services.sessionService.joinSessionWithAgent(input));
  });

  services.websocketService.register(server);
  registerWebFrontend(server);

  server.get("/api/profile", async (request) => {
    const query = request.query as { key?: string; agentId?: string };
    if (!query.agentId) {
      throw new CoreError("INVALID_INPUT", "agentId is required for profile access.");
    }
    await validateAgentRole(services, query.agentId, ["host", "knowledge_keeper"], "read profile");
    return successResponse(services.userProfileService.get(query.key ? { key: query.key } : {}));
  });

  server.put("/api/profile", async (request) => {
    const body = request.body as { key: string; value: string; agentId?: string } | null;
    if (!body || typeof body.key !== "string" || typeof body.value !== "string") {
      throw new CoreError("INVALID_INPUT", "key and value are required.");
    }
    if (!body.agentId) {
      throw new CoreError("INVALID_INPUT", "agentId is required for profile access.");
    }
    await validateAgentRole(services, body.agentId, ["host", "knowledge_keeper"], "write profile");
    return successResponse({ entry: services.userProfileService.set({ key: body.key, value: body.value }) });
  });

  server.delete("/api/profile/:key", async (request) => {
    const params = request.params as { key: string };
    const query = request.query as { agentId?: string };
    if (!query.agentId) {
      throw new CoreError("INVALID_INPUT", "agentId is required for profile access.");
    }
    await validateAgentRole(services, query.agentId, ["host", "knowledge_keeper"], "delete profile");
    return successResponse({ deleted: services.userProfileService.delete(params.key) });
  });

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

const validateAgentRole = async (
  services: ServerServices,
  agentId: string | undefined | null,
  allowedRoles: string[],
  operation: string
) => {
  if (!agentId) {
    throw new CoreError(
      errorCodes.permissionDenied,
      `Agent identity is required for ${operation}.`,
      403
    );
  }
  const agent = services.sessionService
    .listSessions()
    .flatMap((session) => services.sessionService.listMembers(session.id))
    .find((a) => a.id === agentId);

  if (!agent) {
    throw new CoreError(
      errorCodes.permissionDenied,
      `Agent not found for ${operation}.`,
      403
    );
  }

  if (!allowedRoles.includes(agent.role)) {
    throw new CoreError(
      errorCodes.permissionDenied,
      `Agent role "${agent.role}" is not allowed for ${operation}. Allowed roles: ${allowedRoles.join(", ")}.`,
      403
    );
  }
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
    resolve(process.cwd(), "apps", "web", "dist"),
    resolve(moduleDir, "..", "..", "..", "..", "..", "web"),
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
