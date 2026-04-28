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
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { createLogTimestampFragment, resolveUserTimeZone } from "@ai-collab/shared";
import {
  acquireIdentityLeaseInputSchema,
  attachSessionInputSchema,
  type SendMessageInput,
  completeTaskInputSchema,
  createTaskInputSchema,
  createSessionInputSchema,
  joinSessionByNameInputSchema,
  joinSessionInputSchema,
  messageClaimInputSchema,
  messageProcessCompleteInputSchema,
  messageProcessFailInputSchema,
  removeSessionMemberInputSchema,
  releaseIdentityLeaseInputSchema,
  sendMessageInputSchema,
  updateSessionInsightInputSchema,
  updateWindowBindingDefaultsInputSchema,
  updateWindowRuntimeStateInputSchema
} from "@ai-collab/protocol";

import type { CoreConfig } from "../config.js";
import { CoreError } from "../errors.js";
import { logApiAudit } from "./request-audit.js";
import type {
  AgentService,
  IdentityLeaseService,
  MessageService,
  SessionService,
  SessionInsightService,
  TaskService
} from "../services/index.js";

type ServerServices = {
  sessionService: SessionService;
  agentService: AgentService;
  identityLeaseService: IdentityLeaseService;
  messageService: MessageService;
  taskService: TaskService;
  sessionInsightService: SessionInsightService;
  windowBindingService: import("../services/index.js").WindowBindingService;
};

export const createServer = async (
  config: CoreConfig,
  services: ServerServices
) => {
  const logTimeZone = resolveUserTimeZone();
  const server = Fastify({
    disableRequestLogging: true,
    logger: {
      timestamp: () => createLogTimestampFragment(logTimeZone)
    }
  });

  await server.register(websocket);

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof CoreError) {
      void reply.status(error.statusCode).send({
        code: error.code,
        message: error.message
      });
      return;
    }

    server.log.error(error);

    const statusCode =
      typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? ((error as { statusCode: number }).statusCode ?? 500)
        : 500;

    void reply.status(statusCode).send({
      code: "INTERNAL_SERVER_ERROR",
      message: error instanceof Error ? error.message : "Unexpected core error."
    });
  });

  server.addHook("onSend", async (request, reply, payload) => {
    logApiAudit(request, reply, payload);
    return payload;
  });

  server.get("/health", async () => {
    return {
      status: "ok",
      service: "ai-collab-core",
      host: config.host,
      port: config.port
    };
  });

  server.get("/api/status", async () => {
    return {
      status: "running",
      message: "Core scaffold is initialized."
    };
  });

  server.post("/api/sessions", async (request) => {
    const input = createSessionInputSchema.parse(request.body);
    return services.sessionService.createSession(input);
  });

  server.post("/api/sessions/attach", async (request) => {
    const input = attachSessionInputSchema.parse(request.body);
    return services.sessionService.attachSessionByName(input);
  });

  server.get("/api/sessions/:sessionId", async (request) => {
    const params = request.params as { sessionId: string };
    return services.sessionService.getSession(params.sessionId);
  });

  server.get("/api/sessions/by-name/:sessionName", async (request) => {
    const params = request.params as { sessionName: string };
    return services.sessionService.getSessionByName(params.sessionName);
  });

  server.delete("/api/sessions/:sessionId", async (request) => {
    const params = request.params as { sessionId: string };
    const body =
      typeof request.body === "object" && request.body !== null
        ? (request.body as { requesterAgentId?: string })
        : {};
    return body.requesterAgentId
      ? services.sessionService.deleteSession(
          params.sessionId,
          body.requesterAgentId
        )
      : services.sessionService.deleteSession(params.sessionId);
  });

  server.delete("/api/sessions/by-name/:sessionName", async (request) => {
    const params = request.params as { sessionName: string };
    const body =
      typeof request.body === "object" && request.body !== null
        ? (request.body as { requesterAgentId?: string })
        : {};
    return body.requesterAgentId
      ? services.sessionService.deleteSessionByName(
          params.sessionName,
          body.requesterAgentId
        )
      : services.sessionService.deleteSessionByName(params.sessionName);
  });

  server.post("/api/sessions/:sessionId/join", async (request) => {
    const params = request.params as { sessionId: string };
    const input = joinSessionInputSchema.parse({
      ...(request.body as Record<string, unknown>),
      sessionId: params.sessionId
    });

    return services.sessionService.joinSession(input);
  });

  server.post("/api/sessions/join-by-name", async (request) => {
    const input = joinSessionByNameInputSchema.parse(request.body);
    return services.sessionService.joinSessionByName(input);
  });

  server.get("/api/sessions/:sessionId/members", async (request) => {
    const params = request.params as { sessionId: string };
    return {
      members: services.sessionService.listMembers(params.sessionId)
    };
  });

  server.get("/api/sessions/:sessionId/insight", async (request) => {
    const params = request.params as { sessionId: string };
    return {
      insight: services.sessionInsightService.getSessionInsight(params.sessionId)
    };
  });

  server.put("/api/sessions/:sessionId/insight", async (request) => {
    const params = request.params as { sessionId: string };
    const input = updateSessionInsightInputSchema.parse({
      ...(request.body as Record<string, unknown>),
      sessionId: params.sessionId
    });

    return {
      insight: services.sessionInsightService.updateSessionInsight(input)
    };
  });

  server.post("/api/agents/:agentId/heartbeat", async (request) => {
    const params = request.params as { agentId: string };
    return services.agentService.heartbeat(params.agentId);
  });

  server.post("/api/agents/:agentId/leave", async (request) => {
    const params = request.params as { agentId: string };
    return services.agentService.leave(params.agentId);
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

    return services.sessionService.removeSessionMember(input);
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
      return services.messageService.sendMessage(input);
    });

  server.post("/api/identity-leases/acquire", async (request) => {
    const input = acquireIdentityLeaseInputSchema.parse(request.body);
    return {
      lease: services.identityLeaseService.acquire(input)
    };
  });

  server.post("/api/identity-leases/release", async (request) => {
    const input = releaseIdentityLeaseInputSchema.parse(request.body);
    return services.identityLeaseService.release(input);
  });

  server.get("/api/window-bindings", async (request) => {
    const query = request.query as {
      sessionName?: string;
    };
    return {
      bindings: services.windowBindingService.list(query.sessionName)
    };
  });

  server.get("/api/window-bindings/:sessionName/:windowName", async (request) => {
    const params = request.params as {
      sessionName: string;
      windowName: string;
    };
    return {
      binding: services.windowBindingService.get(
        params.sessionName,
        params.windowName
      )
    };
  });

  server.put(
    "/api/window-bindings/:sessionName/:windowName/defaults",
    async (request) => {
      const params = request.params as {
        sessionName: string;
        windowName: string;
      };
      const input = updateWindowBindingDefaultsInputSchema.parse(request.body);
      return {
        binding: services.windowBindingService.updateDefaults(
          params.sessionName,
          params.windowName,
          input
        )
      };
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
      return {
        binding: services.windowBindingService.updateRuntimeState(
          params.sessionName,
          params.windowName,
          input
        )
      };
    }
  );

  server.delete(
    "/api/window-bindings/:sessionName/:windowName/runtime",
    async (request) => {
      const params = request.params as {
        sessionName: string;
        windowName: string;
      };
      return {
        binding: services.windowBindingService.clearRuntimeState(
          params.sessionName,
          params.windowName
        )
      };
    }
  );

  server.get("/api/messages/:messageId", async (request) => {
    const params = request.params as { messageId: string };
    return {
      message: services.messageService.getMessage(params.messageId)
    };
  });

  server.get("/api/agents/:agentId/inbox", async (request) => {
    const params = request.params as { agentId: string };
    const query = request.query as {
      pendingOnly?: string;
      claimedOnly?: string;
    };
    return {
      messages: services.messageService.getInbox(params.agentId, {
        pendingOnly: query.pendingOnly === "true",
        claimedOnly: query.claimedOnly === "true"
      })
    };
  });

  server.get("/api/sessions/:sessionId/queue-stats", async (request) => {
    const params = request.params as { sessionId: string };
    return {
      agents: services.messageService.getSessionQueueStats(params.sessionId)
    };
  });

  server.post("/api/messages/claim-next", async (request) => {
    const input = messageClaimInputSchema.parse(request.body);
    return {
      message: services.messageService.claimNext(input.agentId, {
        ...(input.types ? { types: input.types } : {}),
        ...(input.fromAgentId ? { fromAgentId: input.fromAgentId } : {}),
        ...(input.correlationId
          ? { correlationId: input.correlationId }
          : {}),
        ...(input.identity ? { identity: input.identity } : {}),
        ...(input.flow ? { flow: input.flow } : {}),
        ...(input.ownerToken ? { ownerToken: input.ownerToken } : {})
      })
    };
  });

  server.post("/api/messages/:messageId/ack", async (request) => {
    const params = request.params as { messageId: string };
    const body =
      typeof request.body === "object" && request.body !== null
        ? (request.body as { processed?: boolean })
        : {};

    return services.messageService.acknowledge(
      params.messageId,
      body.processed ?? false
    );
  });

  server.post("/api/messages/:messageId/process-complete", async (request) => {
    const params = request.params as { messageId: string };
    const input = messageProcessCompleteInputSchema.parse(request.body);
    return {
      message: services.messageService.completeMessage(
        params.messageId,
        input.agentId,
        {
          ...(input.identity ? { identity: input.identity } : {}),
          ...(input.flow ? { flow: input.flow } : {}),
          ...(input.ownerToken ? { ownerToken: input.ownerToken } : {})
        }
      )
    };
  });

  server.post("/api/messages/:messageId/process-fail", async (request) => {
    const params = request.params as { messageId: string };
    const input = messageProcessFailInputSchema.parse(request.body);
    return {
      message: services.messageService.failMessage(
        params.messageId,
        input.agentId,
        input.reason,
        {
          ...(input.identity ? { identity: input.identity } : {}),
          ...(input.flow ? { flow: input.flow } : {}),
          ...(input.ownerToken ? { ownerToken: input.ownerToken } : {})
        }
      )
    };
  });

  server.post("/api/tasks", async (request) => {
    const input = createTaskInputSchema.parse(request.body);
    return services.taskService.createTask(input);
  });

  server.get("/api/sessions/:sessionId/tasks", async (request) => {
    const params = request.params as { sessionId: string };
    return {
      tasks: services.taskService.listTasks(params.sessionId)
    };
  });

  server.post("/api/tasks/:taskId/complete", async (request) => {
    const params = request.params as { taskId: string };
    const input = completeTaskInputSchema.parse(request.body);
    return services.taskService.completeTask(params.taskId, input);
  });

  server.get("/ws", { websocket: true }, (socket) => {
    socket.send(
      JSON.stringify({
        type: "system",
        message: "ai-collab websocket endpoint is not implemented yet."
      })
    );
    socket.close();
  });

  return server;
};
