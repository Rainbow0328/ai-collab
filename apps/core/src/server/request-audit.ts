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
import type { FastifyReply, FastifyRequest } from "fastify";
import { appendProjectLogEntry } from "@loopmarshal/shared";

type JsonRecord = Record<string, unknown>;

type AuditSummary = {
  operation: string;
  route: string;
  method: string;
  client: string;
  tool?: string | undefined;
  toolCallId?: string | undefined;
  phase?: string | undefined;
  process: string | null;
  remotePort: number | null;
  statusCode: number;
  identity?: string | undefined;
  flow?: string | undefined;
  round?: number | undefined;
  sessionId?: string | undefined;
  sessionName?: string | undefined;
  agentId?: string | undefined;
  agentName?: string | undefined;
  targetAgentId?: string | undefined;
  messageId?: string | undefined;
  messageType?: string | undefined;
  correlationId?: string | undefined;
  idempotencyKey?: string | undefined;
  ownerToken?: string | undefined;
  result?: string | undefined;
  errorCode?: string | undefined;
};

const asRecord = (value: unknown): JsonRecord => {
  return value && typeof value === "object" ? (value as JsonRecord) : {};
};

const asString = (value: unknown): string | undefined => {
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const asOptionalInt = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const parsePayload = (payload: unknown): JsonRecord => {
  if (typeof payload === "string") {
    try {
      return asRecord(JSON.parse(payload));
    } catch {
      return {};
    }
  }

  return asRecord(payload);
};

const shouldAuditRoute = (route: string, method: string) => {
  if (method === "GET") {
    return false;
  }

  return [
    "/api/sessions",
    "/api/sessions/join-by-name",
    "/api/sessions/:sessionId",
    "/api/sessions/by-name/:sessionName",
    "/api/agents/:agentId/leave",
    "/api/sessions/:sessionId/members/:agentId/remove",
    "/api/messages/send",
    "/api/messages/claim-next",
    "/api/messages/:messageId/process-complete",
    "/api/messages/:messageId/process-fail",
    "/api/identity-leases/acquire",
    "/api/identity-leases/release"
  ].includes(route);
};

const summarizeAudit = (
  request: FastifyRequest,
  reply: FastifyReply,
  payload: unknown
): AuditSummary | null => {
  const route = request.routeOptions.url ?? request.url;
  if (!shouldAuditRoute(route, request.method)) {
    return null;
  }

  const body = asRecord(request.body);
  const params = asRecord(request.params);
  const responseBody = parsePayload(payload);
  const client = asString(request.headers["x-loopmarshal-client"]) ?? "unknown";
  const tool = asString(request.headers["x-loopmarshal-tool"]);
  const toolCallId = asString(request.headers["x-loopmarshal-tool-call-id"]);
  const phase = asString(request.headers["x-loopmarshal-phase"]);
  const processHeader = asString(request.headers["x-loopmarshal-process"]) ?? null;
  const identityHeader = asString(request.headers["x-loopmarshal-identity"]);
  const flowHeader = asString(request.headers["x-loopmarshal-flow"]);
  const roundHeader = asString(request.headers["x-loopmarshal-round"]);
  const remotePort =
    typeof request.ip === "string" &&
    typeof request.socket.remotePort === "number"
      ? request.socket.remotePort
      : null;

  const base = {
    route,
    method: request.method,
    client,
    ...(tool ? { tool } : {}),
    ...(toolCallId ? { toolCallId } : {}),
    ...(phase ? { phase } : {}),
    process: processHeader,
    remotePort,
    statusCode: reply.statusCode
  };

  switch (route) {
    case "/api/sessions":
      return {
        operation: "session.create",
        sessionId: asString(asRecord(responseBody.session).id),
        sessionName:
          asString(body.sessionName) ??
          asString(asRecord(responseBody.session).name),
        agentId: asString(asRecord(responseBody.agent).id),
        agentName:
          asString(body.agentName) ??
          asString(asRecord(responseBody.agent).agentName),
        ...base
      };
    case "/api/sessions/join-by-name":
      return {
        operation: "session.join_by_name",
        sessionId: asString(asRecord(responseBody.session).id),
        sessionName:
          asString(body.sessionName) ??
          asString(asRecord(responseBody.session).name),
        agentId: asString(asRecord(responseBody.agent).id),
        agentName:
          asString(body.agentName) ??
          asString(asRecord(responseBody.agent).agentName),
        ...base
      };
    case "/api/sessions/:sessionId":
      return {
        operation: "session.delete",
        sessionId: asString(params.sessionId),
        sessionName: asString(responseBody.sessionName),
        agentId: asString(body.requesterAgentId),
        result: reply.statusCode < 400 ? "deleted" : "rejected",
        errorCode: asString(responseBody.code),
        ...base
      };
    case "/api/sessions/by-name/:sessionName":
      return {
        operation: "session.delete_by_name",
        sessionId: asString(responseBody.sessionId),
        sessionName:
          asString(params.sessionName) ?? asString(responseBody.sessionName),
        agentId: asString(body.requesterAgentId),
        result: reply.statusCode < 400 ? "deleted" : "rejected",
        errorCode: asString(responseBody.code),
        ...base
      };
    case "/api/agents/:agentId/leave":
      return {
        operation: "agent.leave",
        agentId: asString(params.agentId),
        sessionId: asString(responseBody.sessionId),
        sessionName: asString(responseBody.sessionName),
        result: reply.statusCode < 400 ? "left" : "rejected",
        errorCode: asString(responseBody.code),
        ...base
      };
    case "/api/sessions/:sessionId/members/:agentId/remove":
      return {
        operation: "session.member_remove",
        sessionId: asString(params.sessionId),
        agentId: asString(body.requesterAgentId),
        targetAgentId: asString(params.agentId),
        result: reply.statusCode < 400 ? "removed" : "rejected",
        errorCode: asString(responseBody.code),
        ...base
      };
    case "/api/messages/send":
      return {
        operation: "message.send",
        sessionId: asString(body.sessionId),
        agentId: asString(body.fromAgentId),
        targetAgentId: asString(body.toAgentId),
        messageId: asString(asRecord(responseBody.message).id),
        messageType:
          asString(body.type) ?? asString(asRecord(responseBody.message).type),
        correlationId:
          asString(body.correlationId) ??
          asString(asRecord(responseBody.message).correlationId),
        idempotencyKey: asString(body.idempotencyKey),
        result: reply.statusCode < 400 ? "sent" : "rejected",
        errorCode: asString(responseBody.code),
        ...base
      };
    case "/api/messages/claim-next":
      return {
        operation: "message.claim_next",
        agentId: asString(body.agentId),
        targetAgentId: asString(body.fromAgentId),
        messageId: asString(asRecord(responseBody.message).id),
        messageType: asString(asRecord(responseBody.message).type),
        correlationId:
          asString(body.correlationId) ??
          asString(asRecord(responseBody.message).correlationId),
        result: asRecord(responseBody.message).id ? "claimed" : "empty",
        errorCode: asString(responseBody.code),
        ...base
      };
    case "/api/messages/:messageId/process-complete":
      return {
        operation: "message.process_complete",
        messageId:
          asString(params.messageId) ??
          asString(asRecord(responseBody.message).id),
        agentId: asString(body.agentId),
        result: reply.statusCode < 400 ? "completed" : "rejected",
        errorCode: asString(responseBody.code),
        ...base
      };
    case "/api/messages/:messageId/process-fail":
      return {
        operation: "message.process_fail",
        messageId:
          asString(params.messageId) ??
          asString(asRecord(responseBody.message).id),
        agentId: asString(body.agentId),
        result: reply.statusCode < 400 ? "failed" : "rejected",
        errorCode: asString(responseBody.code),
        ...base
      };
    case "/api/identity-leases/acquire":
      return {
        operation: "identity_lease.acquire",
        identity: asString(body.identity) ?? identityHeader,
        flow: asString(body.flow) ?? flowHeader,
        ...(asOptionalInt(roundHeader) !== undefined
          ? { round: asOptionalInt(roundHeader) }
          : {}),
        ownerToken: asString(body.ownerToken),
        result: reply.statusCode < 400 ? "acquired" : "busy",
        errorCode: asString(responseBody.code),
        ...base
      };
    case "/api/identity-leases/release":
      return {
        operation: "identity_lease.release",
        identity: asString(body.identity) ?? identityHeader,
        flow: asString(body.flow) ?? flowHeader,
        ...(asOptionalInt(roundHeader) !== undefined
          ? { round: asOptionalInt(roundHeader) }
          : {}),
        ownerToken: asString(body.ownerToken),
        result: reply.statusCode < 400 ? "released" : "rejected",
        errorCode: asString(responseBody.code),
        ...base
      };
    default:
      return null;
  }
};

const shouldEmitAudit = (summary: AuditSummary) => {
  if (summary.operation === "identity_lease.release") {
    return summary.client === "cli";
  }

  if (summary.operation === "identity_lease.acquire") {
    return summary.client === "cli" || summary.result === "busy";
  }

  if (summary.operation === "message.claim_next") {
    return summary.result === "claimed";
  }

  return true;
};

export const logApiAudit = (
  request: FastifyRequest,
  reply: FastifyReply,
  payload: unknown
): void => {
  const summary = summarizeAudit(request, reply, payload);
  if (!summary || !shouldEmitAudit(summary)) {
    return;
  }

  const logger =
    reply.statusCode >= 400
      ? request.log.warn.bind(request.log)
      : request.log.info.bind(request.log);
  logger(summary, "api.audit");
  appendProjectLogEntry(
    {
      source: "core.api_audit",
      ...summary
    },
    process.cwd()
  );
};
