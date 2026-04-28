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
  AgentQueueStats,
  CompleteTaskInput,
  CreateSessionInput,
  CreateTaskInput,
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
  Session,
  SessionJoinResult,
  Task,
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
      process.env.AI_COLLAB_BASE_URL ??
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

  public async getSession(sessionId: string): Promise<Session> {
    return this.request(`/api/sessions/${sessionId}`);
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

  public async createTask(input: CreateTaskInput): Promise<Task> {
    return this.request("/api/tasks", {
      method: "POST",
      body: input
    });
  }

  public async listTasks(sessionId: string): Promise<Task[]> {
    const response = await this.request<{ tasks: Task[] }>(
      `/api/sessions/${sessionId}/tasks`
    );
    return response.tasks;
  }

  public async completeTask(
    taskId: string,
    input: CompleteTaskInput
  ): Promise<Task> {
    return this.request(`/api/tasks/${taskId}/complete`, {
      method: "POST",
      body: input
    });
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

    if (!response.ok) {
      let errorPayload: { code?: string; message?: string } | null = null;
      try {
        errorPayload = (await response.json()) as {
          code?: string;
          message?: string;
        };
      } catch {
        errorPayload = null;
      }

      throw new AiCollabSdkError(
        errorPayload?.message ?? `Request failed for ${path}.`,
        {
          statusCode: response.status,
          ...(errorPayload?.code ? { code: errorPayload.code } : {})
        }
      );
    }

    return (await response.json()) as T;
  }
}

export const createAiCollabClient = (
  options?: AiCollabClientOptions
): AiCollabClient => {
  return new AiCollabClient(options);
};
