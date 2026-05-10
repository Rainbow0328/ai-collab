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


import type {
  AckPayload,
  AttachSessionInput,
  AcquireIdentityLeaseInput,
  Agent,
  AgentHeartbeat,
  AgentQueueStats,
  CreateSessionInput,
  IdentityLease,
  JoinSessionByNameInput,
  JoinSessionInput,
  LeaveAgentResult,
  MessageRecord,
  MessageProcessCompleteInput,
  MessageProcessFailInput,
  RemoveSessionMemberInput,
  ReleaseIdentityLeaseInput,
  SendMessageInput,
  SessionInsight,
  SessionConsole,
  Session,
  SessionJoinResult,
  SessionSummary,
  UpdateSessionInsightInput,
  UpdateWindowBindingDefaultsInput,
  UpdateWindowRuntimeStateInput,
  WindowBinding
} from "@ai-collab/protocol";
import { errorCodes } from "@ai-collab/protocol";

export class AiCollabSdkError extends Error {
  public readonly statusCode: number;
  public readonly code: string | undefined;

  public constructor(
    message: string,
    options: {
      statusCode: number;
      code?: string;
    }
  ) {
    super(message);
    this.statusCode = options.statusCode;
    this.code = options.code;
  }
}

export type AiCollabClientOptions = {
  baseUrl?: string;
  headers?: Record<string, string> | (() => Record<string, string>);
};

export type EnsureHostedSessionResult = SessionJoinResult & {
  reusedExistingSession: boolean;
};

export type AttachSessionResult = SessionJoinResult & {
  reusedExistingSession: boolean;
};

export class AiCollabClient {
  private readonly baseUrl: string;
  private readonly headerProvider: () => Record<string, string>;

  public constructor(options: AiCollabClientOptions = {}) {
    this.baseUrl =
      options.baseUrl ??
      (typeof process !== "undefined" ? process.env.AI_COLLAB_BASE_URL : undefined) ??
      "http://127.0.0.1:42688";
    this.headerProvider =
      typeof options.headers === "function"
        ? options.headers
        : () => ({ ...(options.headers ?? {}) });
  }

  public async getStatus(): Promise<{
    status: string;
    message: string;
  }> {
    return this.request("/api/status");
  }

  public async createSession(
    input: CreateSessionInput
  ): Promise<SessionJoinResult> {
    return this.request("/api/sessions", {
      method: "POST",
      body: input
    });
  }

  public async joinSession(
    sessionId: string,
    input: Omit<JoinSessionInput, "sessionId">
  ): Promise<SessionJoinResult> {
    return this.request(`/api/sessions/${sessionId}/join`, {
      method: "POST",
      body: {
        agentName: input.agentName,
        displayName: input.displayName,
        platform: input.platform,
        role: input.role,
        ...(input.roleDescription
          ? { roleDescription: input.roleDescription }
          : {}),
        capabilities: input.capabilities,
        connectionMode: input.connectionMode
      }
    });
  }

  public async listSessions(): Promise<SessionSummary[]> {
    const response = await this.request<{ sessions: SessionSummary[] }>(
      "/api/sessions"
    );
    return response.sessions;
  }

  public async listMemberHeartbeats(sessionId: string): Promise<AgentHeartbeat[]> {
    const response = await this.request<{ heartbeats: AgentHeartbeat[] }>(
      `/api/sessions/${encodeURIComponent(sessionId)}/heartbeats`
    );
    return response.heartbeats;
  }

  public async getSession(sessionId: string): Promise<Session> {
    return this.request(`/api/sessions/${sessionId}`);
  }

  public async getSessionConsole(sessionId: string): Promise<SessionConsole> {
    const response = await this.request<{ console: SessionConsole }>(
      `/api/sessions/${encodeURIComponent(sessionId)}/console`
    );
    return response.console;
  }

  public async getSessionByName(sessionName: string): Promise<Session> {
    return this.request(
      `/api/sessions/by-name/${encodeURIComponent(sessionName)}`
    );
  }

  public async deleteSession(
    sessionId: string,
    options: {
      requesterAgentId?: string;
    } = {}
  ): Promise<{ sessionId: string; sessionName: string; deleted: true }> {
    return this.request(`/api/sessions/${sessionId}`, {
      method: "DELETE",
      ...(options.requesterAgentId
        ? {
            body: {
              requesterAgentId: options.requesterAgentId
            }
          }
        : {})
    });
  }

  public async deleteSessionByName(
    sessionName: string,
    options: {
      requesterAgentId?: string;
    } = {}
  ): Promise<{ sessionId: string; sessionName: string; deleted: true }> {
    return this.request(`/api/sessions/by-name/${encodeURIComponent(sessionName)}`, {
      method: "DELETE",
      ...(options.requesterAgentId
        ? {
            body: {
              requesterAgentId: options.requesterAgentId
            }
          }
        : {})
    });
  }

  public async joinSessionByName(
    input: JoinSessionByNameInput
  ): Promise<SessionJoinResult> {
    return this.request("/api/sessions/join-by-name", {
      method: "POST",
      body: input
    });
  }

  public async attachSession(
    input: AttachSessionInput
  ): Promise<AttachSessionResult> {
    return this.request("/api/sessions/attach", {
      method: "POST",
      body: input
    });
  }

  public async getMembers(sessionId: string): Promise<Agent[]> {
    const response = await this.request<{ members: Agent[] }>(
      `/api/sessions/${sessionId}/members`
    );
    return response.members;
  }

  public async listHeartbeats(
    sessionId: string
  ): Promise<import("@ai-collab/protocol").AgentHeartbeat[]> {
    const response = await this.request<{
      heartbeats: import("@ai-collab/protocol").AgentHeartbeat[];
    }>(`/api/sessions/${sessionId}/heartbeats`);
    return response.heartbeats;
  }

  public async getSessionQueueStats(
    sessionId: string
  ): Promise<AgentQueueStats[]> {
    const response = await this.request<{ agents: AgentQueueStats[] }>(
      `/api/sessions/${sessionId}/queue-stats`
    );
    return response.agents;
  }

  public async getSessionInsight(sessionId: string): Promise<SessionInsight> {
    const response = await this.request<{ insight: SessionInsight }>(
      `/api/sessions/${sessionId}/insight`
    );
    return response.insight;
  }

  public async updateSessionInsight(
    input: UpdateSessionInsightInput
  ): Promise<SessionInsight> {
    const response = await this.request<{ insight: SessionInsight }>(
      `/api/sessions/${input.sessionId}/insight`,
      {
        method: "PUT",
        body: input
      }
    );
    return response.insight;
  }

  public async heartbeat(
    agentId: string
  ): Promise<{ agentId: string; heartbeatAt: string }> {
    return this.request(`/api/agents/${agentId}/heartbeat`, {
      method: "POST",
      body: {}
    });
  }

  public async leaveAgent(
    agentId: string
  ): Promise<LeaveAgentResult> {
    return this.request(`/api/agents/${agentId}/leave`, {
      method: "POST",
      body: {}
    });
  }

  public async removeSessionMember(
    input: RemoveSessionMemberInput
  ): Promise<LeaveAgentResult> {
    return this.request(
      `/api/sessions/${input.sessionId}/members/${input.targetAgentId}/remove`,
      {
        method: "POST",
        body: {
          requesterAgentId: input.requesterAgentId
        }
      }
    );
  }

  public async sendMessage(input: SendMessageInput): Promise<MessageRecord> {
    return this.request("/api/messages/send", {
      method: "POST",
      body: input
    });
  }

  public async acquireIdentityLease(
    input: AcquireIdentityLeaseInput
  ): Promise<IdentityLease> {
    const response = await this.request<{ lease: IdentityLease }>(
      "/api/identity-leases/acquire",
      {
        method: "POST",
        body: input
      }
    );
    return response.lease;
  }

  public async releaseIdentityLease(
    input: ReleaseIdentityLeaseInput
  ): Promise<{ released: boolean; identityKey: string }> {
    return this.request("/api/identity-leases/release", {
      method: "POST",
      body: input
    });
  }

  public async listWindowBindings(sessionName?: string): Promise<WindowBinding[]> {
    const search = new URLSearchParams();
    if (sessionName) {
      search.set("sessionName", sessionName);
    }
    const response = await this.request<{ bindings: WindowBinding[] }>(
      `/api/window-bindings${search.size > 0 ? `?${search.toString()}` : ""}`
    );
    return response.bindings;
  }

  public async getWindowBinding(
    sessionName: string,
    windowName: string
  ): Promise<WindowBinding> {
    const response = await this.request<{ binding: WindowBinding }>(
      `/api/window-bindings/${encodeURIComponent(sessionName)}/${encodeURIComponent(
        windowName
      )}`
    );
    return response.binding;
  }

  public async updateWindowBindingDefaults(
    sessionName: string,
    windowName: string,
    input: UpdateWindowBindingDefaultsInput
  ): Promise<WindowBinding> {
    const response = await this.request<{ binding: WindowBinding }>(
      `/api/window-bindings/${encodeURIComponent(sessionName)}/${encodeURIComponent(
        windowName
      )}/defaults`,
      {
        method: "PUT",
        body: input
      }
    );
    return response.binding;
  }

  public async updateWindowRuntimeState(
    sessionName: string,
    windowName: string,
    input: UpdateWindowRuntimeStateInput
  ): Promise<WindowBinding> {
    const response = await this.request<{ binding: WindowBinding }>(
      `/api/window-bindings/${encodeURIComponent(sessionName)}/${encodeURIComponent(
        windowName
      )}/runtime`,
      {
        method: "PUT",
        body: input
      }
    );
    return response.binding;
  }

  public async clearWindowRuntimeState(
    sessionName: string,
    windowName: string
  ): Promise<WindowBinding> {
    const response = await this.request<{ binding: WindowBinding }>(
      `/api/window-bindings/${encodeURIComponent(sessionName)}/${encodeURIComponent(
        windowName
      )}/runtime`,
      {
        method: "DELETE"
      }
    );
    return response.binding;
  }

  public async getMessageById(messageId: string): Promise<MessageRecord> {
    const response = await this.request<{ message: MessageRecord }>(
      `/api/messages/${messageId}`
    );
    return response.message;
  }

  public async listMessages(sessionId: string): Promise<MessageRecord[]> {
    const response = await this.request<{ messages: MessageRecord[] }>(
      `/api/sessions/${encodeURIComponent(sessionId)}/messages`
    );
    return response.messages;
  }

  public async getInbox(agentId: string): Promise<MessageRecord[]> {
    return this.getInboxWithOptions(agentId);
  }

  public async getInboxWithOptions(
    agentId: string,
    options: {
      pendingOnly?: boolean;
      claimedOnly?: boolean;
    } = {}
  ): Promise<MessageRecord[]> {
    const search = new URLSearchParams();
    if (options.pendingOnly) {
      search.set("pendingOnly", "true");
    }
    if (options.claimedOnly) {
      search.set("claimedOnly", "true");
    }

    const response = await this.request<{ messages: MessageRecord[] }>(
      `/api/agents/${agentId}/inbox${
        search.size > 0 ? `?${search.toString()}` : ""
      }`
    );
    return response.messages;
  }

  public async claimNext(
    agentId: string,
    options: {
      types?: MessageRecord["type"][];
      fromAgentId?: string;
      correlationId?: string;
      identity?: string;
      flow?: "host" | "worker";
      ownerToken?: string;
    } = {}
  ): Promise<MessageRecord | null> {
    const response = await this.request<{ message: MessageRecord | null }>(
      "/api/messages/claim-next",
      {
        method: "POST",
        body: {
          agentId,
          ...(options.types ? { types: options.types } : {}),
          ...(options.fromAgentId ? { fromAgentId: options.fromAgentId } : {}),
          ...(options.correlationId
            ? { correlationId: options.correlationId }
            : {}),
          ...(options.identity ? { identity: options.identity } : {}),
          ...(options.flow ? { flow: options.flow } : {}),
          ...(options.ownerToken ? { ownerToken: options.ownerToken } : {})
        }
      }
    );
    return response.message;
  }

  public async claimMany(
    agentId: string,
    options: {
      types?: MessageRecord["type"][];
      fromAgentId?: string;
      correlationId?: string;
      maxMessages?: number;
      identity?: string;
      flow?: "host" | "worker";
      ownerToken?: string;
    } = {}
  ): Promise<MessageRecord[]> {
    const response = await this.request<{ messages: MessageRecord[] }>(
      "/api/messages/claim-many",
      {
        method: "POST",
        body: {
          agentId,
          ...(options.types ? { types: options.types } : {}),
          ...(options.fromAgentId ? { fromAgentId: options.fromAgentId } : {}),
          ...(options.correlationId
            ? { correlationId: options.correlationId }
            : {}),
          ...(options.maxMessages ? { maxMessages: options.maxMessages } : {}),
          ...(options.identity ? { identity: options.identity } : {}),
          ...(options.flow ? { flow: options.flow } : {}),
          ...(options.ownerToken ? { ownerToken: options.ownerToken } : {})
        }
      }
    );
    return response.messages;
  }

  public async completeMessage(
    messageId: string,
    input: MessageProcessCompleteInput
  ): Promise<MessageRecord> {
    const response = await this.request<{ message: MessageRecord }>(
      `/api/messages/${messageId}/process-complete`,
      {
        method: "POST",
        body: input
      }
    );
    return response.message;
  }

  public async failMessage(
    messageId: string,
    input: MessageProcessFailInput
  ): Promise<MessageRecord> {
    const response = await this.request<{ message: MessageRecord }>(
      `/api/messages/${messageId}/process-fail`,
      {
        method: "POST",
        body: input
      }
    );
    return response.message;
  }

  public async acknowledgeMessage(
    messageId: string,
    processed = false
  ): Promise<AckPayload> {
    return this.request(`/api/messages/${messageId}/ack`, {
      method: "POST",
      body: {
        processed
      }
    });
  }

  public async upsertProgress(
    input: import("@ai-collab/protocol").UpsertProgressInput
  ): Promise<import("@ai-collab/protocol").Progress> {
    const response = await this.request<{
      progress: import("@ai-collab/protocol").Progress;
    }>("/api/progress", {
      method: "PUT",
      body: input
    });
    return response.progress;
  }

  public async getProgress(
    sessionId: string,
    agentId: string
  ): Promise<import("@ai-collab/protocol").Progress | undefined> {
    const response = await this.request<{
      progress: import("@ai-collab/protocol").Progress | undefined;
    }>(`/api/progress/${encodeURIComponent(sessionId)}/${encodeURIComponent(agentId)}`);
    return response.progress;
  }

  public async listProgress(
    filter: import("@ai-collab/protocol").ListProgressFilter = {}
  ): Promise<import("@ai-collab/protocol").Progress[]> {
    const searchParams = new URLSearchParams();
    if (filter.sessionId) searchParams.set("sessionId", filter.sessionId);
    if (filter.agentId) searchParams.set("agentId", filter.agentId);
    if (filter.status) searchParams.set("status", filter.status);

    const response = await this.request<{
      progressList: import("@ai-collab/protocol").Progress[];
    }>(
      `/api/progress${searchParams.size > 0 ? `?${searchParams.toString()}` : ""}`
    );
    return response.progressList;
  }

  public async clearProgress(
    sessionId: string
  ): Promise<{ cleared: number }> {
    return this.request(`/api/progress/${encodeURIComponent(sessionId)}`, {
      method: "DELETE"
    });
  }

  public async getKnowledgeManifest(
    sessionId?: string
  ): Promise<
    import("@ai-collab/protocol").KnowledgeManifest
  > {
    const searchParams = new URLSearchParams();
    if (sessionId) searchParams.set("sessionId", sessionId);
    const qs = searchParams.size > 0 ? `?${searchParams.toString()}` : "";
    const response = await this.request<{
      manifest: import("@ai-collab/protocol").KnowledgeManifest;
      items: import("@ai-collab/protocol").KnowledgeListItem[];
    }>(`/api/knowledge${qs}`);
    return response.manifest;
  }

  public async listKnowledge(
    input: import("@ai-collab/protocol").ListKnowledgeInput = {}
  ): Promise<import("@ai-collab/protocol").KnowledgeListItem[]> {
    const searchParams = new URLSearchParams();
    if (input.sessionId) searchParams.set("sessionId", input.sessionId);
    if (input.level) searchParams.set("level", input.level);
    if (input.tag) searchParams.set("tag", input.tag);
    if (input.query) searchParams.set("query", input.query);

    const response = await this.request<{
      manifest: import("@ai-collab/protocol").KnowledgeManifest;
      items: import("@ai-collab/protocol").KnowledgeListItem[];
    }>(
      `/api/knowledge${searchParams.size > 0 ? `?${searchParams.toString()}` : ""}`
    );
    return response.items;
  }

  public async getKnowledge(
    level: import("@ai-collab/protocol").KnowledgeLevel,
    slug: string,
    sessionId?: string
  ): Promise<import("@ai-collab/protocol").KnowledgeDocument | undefined> {
    const searchParams = new URLSearchParams();
    if (sessionId) searchParams.set("sessionId", sessionId);
    const qs = searchParams.size > 0 ? `?${searchParams.toString()}` : "";
    const response = await this.request<{
      document: import("@ai-collab/protocol").KnowledgeDocument | undefined;
    }>(`/api/knowledge/${level}/${encodeURIComponent(slug)}${qs}`);
    return response.document;
  }

  public async getKnowledgeByRef(
    ref: string,
    sessionId?: string
  ): Promise<import("@ai-collab/protocol").KnowledgeDocument | undefined> {
    const parsed = this.parseKnowledgeRef(ref);
    return this.getKnowledge(parsed.level, parsed.slug, sessionId);
  }

  public async upsertKnowledge(
    input: import("@ai-collab/protocol").UpsertKnowledgeInput
  ): Promise<import("@ai-collab/protocol").KnowledgeDocument> {
    const response = await this.request<{
      document: import("@ai-collab/protocol").KnowledgeDocument;
    }>(
      `/api/knowledge/${input.level}/${encodeURIComponent(input.slug)}`,
      {
        method: "PUT",
        body: {
          title: input.title,
          content: input.content,
          ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
          ...(input.summary !== undefined ? { summary: input.summary } : {}),
          ...(input.tags ? { tags: input.tags } : {}),
          ...(input.ownerAgentId !== undefined
            ? { ownerAgentId: input.ownerAgentId }
            : {}),
          ...(input.sourceKind ? { sourceKind: input.sourceKind } : {}),
          ...(input.sourceAgentId !== undefined
            ? { sourceAgentId: input.sourceAgentId }
            : {}),
          ...(input.changeSummary !== undefined
            ? { changeSummary: input.changeSummary }
            : {})
        }
      }
    );
    return response.document;
  }

  public async deleteKnowledge(
    input: import("@ai-collab/protocol").DeleteKnowledgeInput
  ): Promise<{ deleted: boolean }> {
    return this.request(
      `/api/knowledge/${input.level}/${encodeURIComponent(input.slug)}`,
      {
        method: "DELETE",
        body: {
          ...(input.sessionId ? { sessionId: input.sessionId } : {}),
          ...(input.sourceKind ? { sourceKind: input.sourceKind } : {}),
          ...(input.sourceAgentId !== undefined
            ? { sourceAgentId: input.sourceAgentId }
            : {}),
          ...(input.changeSummary !== undefined
            ? { changeSummary: input.changeSummary }
            : {})
        }
      }
    );
  }

  public async listKnowledgeChanges(
    input: import("@ai-collab/protocol").ListKnowledgeChangesInput = {}
  ): Promise<import("@ai-collab/protocol").KnowledgeChangeRecord[]> {
    const searchParams = new URLSearchParams();
    if (input.sessionId) searchParams.set("sessionId", input.sessionId);
    if (input.level) searchParams.set("level", input.level);
    if (input.slug) searchParams.set("slug", input.slug);
    if (input.limit !== undefined) searchParams.set("limit", String(input.limit));

    const response = await this.request<{
      changes: import("@ai-collab/protocol").KnowledgeChangeRecord[];
    }>(
      `/api/knowledge/changes${
        searchParams.size > 0 ? `?${searchParams.toString()}` : ""
      }`
    );
    return response.changes;
  }

  public async submitKnowledgeFeedback(
    input: import("@ai-collab/protocol").KnowledgeFeedbackInput
  ): Promise<{ ok: boolean; message: string }> {
    return this.request("/api/knowledge/feedback", {
      method: "POST",
      body: input
    });
  }

  public async createKnowledgeBuildJudgement(
    input: import("@ai-collab/protocol").CreateKnowledgeBuildJudgementInput
  ): Promise<import("@ai-collab/protocol").KnowledgeBuildJudgement> {
    const response = await this.request<{
      judgement: import("@ai-collab/protocol").KnowledgeBuildJudgement;
    }>("/api/knowledge/judgements", {
      method: "POST",
      body: input
    });
    return response.judgement;
  }

  public async listKnowledgeBuildJudgements(
    sessionId: string
  ): Promise<import("@ai-collab/protocol").KnowledgeBuildJudgement[]> {
    const response = await this.request<{
      judgements: import("@ai-collab/protocol").KnowledgeBuildJudgement[];
    }>(`/api/knowledge/judgements?sessionId=${encodeURIComponent(sessionId)}`);
    return response.judgements;
  }

  public async getKnowledgeBuildJudgementBySourceMessage(
    sessionId: string,
    messageId: string
  ): Promise<import("@ai-collab/protocol").KnowledgeBuildJudgement | null> {
    const response = await this.request<{
      judgement: import("@ai-collab/protocol").KnowledgeBuildJudgement | null;
    }>(
      `/api/knowledge/judgements/by-message/${encodeURIComponent(messageId)}?sessionId=${encodeURIComponent(sessionId)}`
    );
    return response.judgement;
  }

  public async fulfilKnowledgeBuildJudgement(
    input: import("@ai-collab/protocol").FulfillKnowledgeBuildJudgementInput
  ): Promise<import("@ai-collab/protocol").KnowledgeBuildJudgement> {
    const response = await this.request<{
      judgement: import("@ai-collab/protocol").KnowledgeBuildJudgement;
    }>("/api/knowledge/judgements/fulfil", {
      method: "POST",
      body: input
    });
    return response.judgement;
  }

  public async listPendingKnowledgePatches(): Promise<
    import("@ai-collab/protocol").KnowledgePatchRecord[]
  > {
    const response = await this.request<{
      patches: import("@ai-collab/protocol").KnowledgePatchRecord[];
    }>("/api/knowledge/patches/pending");
    return response.patches;
  }

  public async listKnowledgePatches(
    input: import("@ai-collab/protocol").ListKnowledgePatchRecordsInput = {}
  ): Promise<import("@ai-collab/protocol").KnowledgePatchRecord[]> {
    const searchParams = new URLSearchParams();
    if (input.status) searchParams.set("status", input.status);

    const response = await this.request<{
      patches: import("@ai-collab/protocol").KnowledgePatchRecord[];
    }>(
      `/api/knowledge/patches${
        searchParams.size > 0 ? `?${searchParams.toString()}` : ""
      }`
    );
    return response.patches;
  }

  public async getKnowledgePatch(
    patchId: string
  ): Promise<{
    patch: import("@ai-collab/protocol").KnowledgePatchRecord;
    review: import("@ai-collab/protocol").KnowledgePatchReviewRecord | null;
    persistence: import("@ai-collab/protocol").KnowledgePersistenceRecord | null;
  }> {
    const response = await this.request<{
      patch: import("@ai-collab/protocol").KnowledgePatchRecord;
      review: import("@ai-collab/protocol").KnowledgePatchReviewRecord | null;
      persistence: import("@ai-collab/protocol").KnowledgePersistenceRecord | null;
    }>(`/api/knowledge/patches/${encodeURIComponent(patchId)}`);
    return response;
  }

  public async adjudicateKnowledgePatch(
    patchId: string,
    input: Omit<
      import("@ai-collab/protocol").AdjudicateKnowledgePatchInput,
      "patchId"
    >
  ): Promise<{
    patchRecord: import("@ai-collab/protocol").KnowledgePatchRecord | null;
    reviewRecord: import("@ai-collab/protocol").KnowledgePatchReviewRecord;
    persistenceRecord: import("@ai-collab/protocol").KnowledgePersistenceRecord;
  }> {
    const response = await this.request<{
      patchRecord: import("@ai-collab/protocol").KnowledgePatchRecord | null;
      reviewRecord: import("@ai-collab/protocol").KnowledgePatchReviewRecord;
      persistenceRecord: import("@ai-collab/protocol").KnowledgePersistenceRecord;
    }>(`/api/knowledge/patches/${encodeURIComponent(patchId)}/adjudicate`, {
      method: "POST",
      body: input
    });
    return response;
  }

  public async executeKnowledgePatchPersistence(
    patchId: string
  ): Promise<import("@ai-collab/protocol").ExecuteKnowledgePatchPersistenceResult> {
    const response = await this.request<
      import("@ai-collab/protocol").ExecuteKnowledgePatchPersistenceResult
    >(`/api/knowledge/patches/${encodeURIComponent(patchId)}/execute`, {
      method: "POST",
      body: {}
    });
    return response;
  }

  private parseKnowledgeRef(ref: string): {
    level: import("@ai-collab/protocol").KnowledgeLevel;
    slug: string;
  } {
    const withoutHash = ref.split("#", 1)[0] ?? "";
    const normalized = withoutHash.replace(/^knowledge:/i, "").replace(/^\/+/, "");
    const [level, ...slugParts] = normalized.split("/");
    if ((level !== "l1" && level !== "l2" && level !== "l3") || slugParts.length === 0) {
      throw new AiCollabSdkError(`Invalid knowledge ref "${ref}".`, {
        statusCode: 400,
        code: errorCodes.invalidInput
      });
    }
    return {
      level,
      slug: slugParts.join("/")
    };
  }

  public async hostSessionByName(
    sessionName: string,
    options: Omit<CreateSessionInput, "sessionName">
  ): Promise<SessionJoinResult> {
    return this.createSession({
      sessionName,
      ...options
    });
  }

  public async joinNamedSession(
    sessionName: string,
    options: Omit<JoinSessionByNameInput, "sessionName">
  ): Promise<SessionJoinResult> {
    return this.joinSessionByName({
      sessionName,
      ...options
    });
  }

  public async ensureHostedSessionByName(
    sessionName: string,
    options: Omit<CreateSessionInput, "sessionName">
  ): Promise<EnsureHostedSessionResult> {
    try {
      const created = await this.hostSessionByName(sessionName, options);
      return {
        ...created,
        reusedExistingSession: false
      };
    } catch (error: unknown) {
      if (
        !(error instanceof AiCollabSdkError) ||
        error.code !== errorCodes.duplicateSessionName
      ) {
        throw error;
      }

      const session = await this.getSessionByName(sessionName);
      const members = await this.getMembers(session.id);
      const hostAgent = members.find((member) => member.id === session.hostAgentId);

      if (!hostAgent || hostAgent.agentName !== options.agentName) {
        throw error;
      }

      return {
        session,
        agent: hostAgent,
        reusedExistingSession: true
      };
    }
  }

  public async attachNamedSession(
    sessionName: string,
    options: Omit<AttachSessionInput, "sessionName">
  ): Promise<AttachSessionResult> {
    return this.attachSession({
      sessionName,
      ...options
    });
  }

  private async request<T>(
    path: string,
    options: {
      method?: "GET" | "POST" | "PUT" | "DELETE";
      body?: unknown;
    } = {}
  ): Promise<T> {
    const resolvedHeaders = this.headerProvider();
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...resolvedHeaders,
        ...(options.body ? { "Content-Type": "application/json" } : {})
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {})
    });

    const result = (await response.json()) as {
      success: boolean;
      data?: T;
      error?: {
        code?: string;
        message?: string;
        details?: unknown;
      };
      timestamp: string;
    };

    if (!result.success || !result.data) {
      throw new AiCollabSdkError(
        result.error?.message ?? `Request failed for ${path}.`,
        {
          statusCode: response.status,
          ...(result.error?.code ? { code: result.error.code } : {})
        }
      );
    }

    return result.data;
  }

  // ============================================
  // Model Config API
  // ============================================
  public async createModelConfig(
    input: import("@ai-collab/protocol").CreateModelConfigInput
  ): Promise<import("@ai-collab/protocol").ModelConfig> {
    return this.request("/api/models", {
      method: "POST",
      body: input
    });
  }

  public async listModelConfigs(): Promise<import("@ai-collab/protocol").ModelConfig[]> {
    const response = await this.request<{ models: import("@ai-collab/protocol").ModelConfig[] }>("/api/models");
    return response.models;
  }

  public async getModelConfig(id: string): Promise<import("@ai-collab/protocol").ModelConfig> {
    return this.request(`/api/models/${id}`);
  }

  public async updateModelConfig(
    id: string,
    input: import("@ai-collab/protocol").UpdateModelConfigInput
  ): Promise<import("@ai-collab/protocol").ModelConfig> {
    return this.request(`/api/models/${id}`, {
      method: "PUT",
      body: input
    });
  }

  public async deleteModelConfig(id: string): Promise<{ deleted: boolean }> {
    return this.request(`/api/models/${id}`, {
      method: "DELETE"
    });
  }

  public async testModelConfig(
    id: string,
    input?: { prompt?: string }
  ): Promise<import("@ai-collab/protocol").TestModelConfigResult> {
    return this.request(`/api/models/${id}/test`, {
      method: "POST",
      body: input ?? {}
    });
  }

  // ============================================
  // Agent Profile API
  // ============================================
  public async createAgentProfile(
    input: import("@ai-collab/protocol").CreateAgentProfileInput
  ): Promise<import("@ai-collab/protocol").AgentProfile> {
    return this.request("/api/agent-profiles", {
      method: "POST",
      body: input
    });
  }

  public async listAgentProfiles(): Promise<import("@ai-collab/protocol").AgentProfileWithSkills[]> {
    const response = await this.request<{ profiles: import("@ai-collab/protocol").AgentProfileWithSkills[] }>("/api/agent-profiles");
    return response.profiles;
  }

  public async getAgentProfile(id: string): Promise<import("@ai-collab/protocol").AgentProfileWithSkills> {
    return this.request(`/api/agent-profiles/${id}`);
  }

  public async updateAgentProfile(
    id: string,
    input: import("@ai-collab/protocol").UpdateAgentProfileInput
  ): Promise<import("@ai-collab/protocol").AgentProfile> {
    return this.request(`/api/agent-profiles/${id}`, {
      method: "PUT",
      body: input
    });
  }

  public async deleteAgentProfile(id: string): Promise<{ deleted: boolean }> {
    return this.request(`/api/agent-profiles/${id}`, {
      method: "DELETE"
    });
  }

  public async updateAgentProfileSkills(
    id: string,
    skillIds: string[]
  ): Promise<import("@ai-collab/protocol").AgentProfileWithSkills> {
    return this.request(`/api/agent-profiles/${id}/skills`, {
      method: "PUT",
      body: { skillIds }
    });
  }

  // ============================================
  // Skill API
  // ============================================
  public async createSkill(
    input: { name: string; description?: string | null; path: string; roleScope?: string | null }
  ): Promise<import("@ai-collab/protocol").SkillDefinition> {
    return this.request("/api/skills", {
      method: "POST",
      body: input
    });
  }

  public async listSkills(): Promise<import("@ai-collab/protocol").SkillDefinition[]> {
    const response = await this.request<{ skills: import("@ai-collab/protocol").SkillDefinition[] }>("/api/skills");
    return response.skills;
  }

  public async getSkill(id: string): Promise<import("@ai-collab/protocol").SkillDefinition> {
    return this.request(`/api/skills/${id}`);
  }

  public async updateSkill(
    id: string,
    input: { name?: string; description?: string | null; roleScope?: string | null; enabled?: boolean }
  ): Promise<import("@ai-collab/protocol").SkillDefinition> {
    return this.request(`/api/skills/${id}`, {
      method: "PUT",
      body: input
    });
  }

  public async deleteSkill(id: string): Promise<{ deleted: boolean }> {
    return this.request(`/api/skills/${id}`, {
      method: "DELETE"
    });
  }

  public async scanSkills(directoryPath: string): Promise<import("@ai-collab/protocol").ScanSkillsResult> {
    return this.request("/api/skills/scan", {
      method: "POST",
      body: { directoryPath }
    });
  }

  // ============================================
  // Session Skills API
  // ============================================
  public async getSessionSkills(sessionId: string): Promise<import("@ai-collab/protocol").SessionSkillScope[]> {
    const response = await this.request<{ skills: import("@ai-collab/protocol").SessionSkillScope[] }>(`/api/sessions/${sessionId}/skills`);
    return response.skills;
  }

  public async getAvailableSessionSkills(sessionId: string): Promise<import("@ai-collab/protocol").SkillDefinition[]> {
    const response = await this.request<{ skills: import("@ai-collab/protocol").SkillDefinition[] }>(`/api/sessions/${sessionId}/available-skills`);
    return response.skills;
  }

  public async setSessionSkills(sessionId: string, skillIds: string[]): Promise<import("@ai-collab/protocol").SessionSkillScope[]> {
    const response = await this.request<{ skills: import("@ai-collab/protocol").SessionSkillScope[] }>(`/api/sessions/${sessionId}/skills`, {
      method: "PUT",
      body: { skillIds }
    });
    return response.skills;
  }

  // ============================================
  // Session Creation with Agent API
  // ============================================
  public async createSessionWithAgent(
    input: import("@ai-collab/protocol").CreateSessionWithAgentInput
  ): Promise<SessionJoinResult> {
    return this.request("/api/sessions/create-with-agent", {
      method: "POST",
      body: input
    });
  }

  public async joinSessionWithAgent(
    input: import("@ai-collab/protocol").JoinSessionWithAgentInput
  ): Promise<SessionJoinResult> {
    return this.request("/api/sessions/join-with-agent", {
      method: "POST",
      body: input
    });
  }

  public async getSessionTimeline(
    sessionId: string
  ): Promise<import("@ai-collab/protocol").SessionTimeline> {
    return this.request(`/api/sessions/${sessionId}/timeline`);
  }

  public async getSessionTraces(
    sessionId: string
  ): Promise<import("@ai-collab/protocol").MessageTrace[]> {
    const response = await this.request<{
      traces: import("@ai-collab/protocol").MessageTrace[];
    }>(`/api/sessions/${sessionId}/traces`);
    return response.traces;
  }

  public async getProfile(
    key?: string,
    agentId?: string
  ): Promise<import("@ai-collab/protocol").UserProfileSnapshot> {
    const searchParams = new URLSearchParams();
    if (key) searchParams.set("key", key);
    if (agentId) searchParams.set("agentId", agentId);
    return this.request(
      `/api/profile${searchParams.size > 0 ? `?${searchParams.toString()}` : ""}`
    );
  }

  public async setProfile(
    key: string,
    value: string,
    agentId?: string
  ): Promise<{ entry: import("@ai-collab/protocol").UserProfileEntry }> {
    return this.request("/api/profile", {
      method: "PUT",
      body: { key, value, ...(agentId ? { agentId } : {}) }
    });
  }

  public async deleteProfile(
    key: string,
    agentId?: string
  ): Promise<{ deleted: boolean }> {
    const searchParams = new URLSearchParams();
    if (agentId) searchParams.set("agentId", agentId);
    return this.request(
      `/api/profile/${encodeURIComponent(key)}${searchParams.size > 0 ? `?${searchParams.toString()}` : ""}`,
      { method: "DELETE" }
    );
  }
}

export const createAiCollabClient = (
  options?: AiCollabClientOptions
): AiCollabClient => {
  return new AiCollabClient(options);
};

export {
  AiCollabWebSocketClient,
  type AiCollabWebSocketClientOptions
} from "./websocket-client.js";
