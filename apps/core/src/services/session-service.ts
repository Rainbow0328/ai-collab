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
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type {
  Agent,
  AgentHeartbeat,
  AttachSessionInput,
  CreateSessionInput,
  LeaveAgentResult,
  JoinSessionInput,
  JoinSessionByNameInput,
  RemoveSessionMemberInput,
  Session,
  SessionJoinResult,
  SessionSummary
} from "@ai-collab/protocol";
import {
  AgentRepository,
  IdentityLeaseRepository,
  MessageRepository,
  SessionInsightRepository,
  SessionRepository,
  TaskEventRepository,
  TaskRepository
} from "@ai-collab/store";

import { coreErrors } from "../errors.js";

const now = (): string => {
  return new Date().toISOString();
};

const defaultAgentDisplayName = (agentName: string): string => {
  return agentName;
};

const defaultAgentPlatform = "generic";
const defaultAgentCapabilities: string[] = [];
const defaultAgentConnectionMode = "skill-bridge" as const;

const normalizeRoleDescription = (
  role: Agent["role"],
  roleDescription?: string
): string | null => {
  const normalized = roleDescription?.trim() ?? "";
  if (role === "worker") {
    if (!normalized) {
      throw coreErrors.invalidInput(
        "当前 worker 加入必须提供角色说明。请明确说明这个 worker 是干什么用的。"
      );
    }

    return normalized;
  }

  return normalized || null;
};

const isDuplicateAgentNameViolation = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("unique constraint failed") &&
    message.includes("agents.session_id") &&
    message.includes("agents.agent_name")
  );
};

export class SessionService {
  public constructor(
    private readonly database: DatabaseSync,
    private readonly sessions: SessionRepository,
    private readonly agents: AgentRepository,
    private readonly messages: MessageRepository,
    private readonly tasks: TaskRepository,
    private readonly taskEvents: TaskEventRepository,
    private readonly sessionInsights: SessionInsightRepository,
    private readonly identityLeases: IdentityLeaseRepository
  ) {}

  public listSessions(): SessionSummary[] {
    return this.sessions.listAllSummaries();
  }

  public listMemberHeartbeats(sessionId: string): AgentHeartbeat[] {
    const session = this.sessions.findById(sessionId);
    if (!session) {
      throw coreErrors.sessionNotFound(sessionId);
    }

    const heartbeats = this.agents.listHeartbeatsBySessionId(sessionId);
    const now = Date.now();

    return heartbeats.map((h) => ({
      agentId: h.id,
      agentName: h.agentName,
      displayName: h.displayName,
      role: h.role as import("@ai-collab/protocol").AgentRole,
      status: h.status as import("@ai-collab/protocol").AgentStatus,
      lastHeartbeatAt: h.lastHeartbeatAt,
      online: h.status !== "offline" && now - new Date(h.lastHeartbeatAt).getTime() < 300000
    }));
  }

  public createSession(input: CreateSessionInput): SessionJoinResult {
    const existing = this.sessions.findOpenByName(input.sessionName);
    if (existing) {
      throw coreErrors.duplicateSessionName(input.sessionName);
    }

    const createdAt = now();
    const hostAgentId = randomUUID();
    const session: Session = {
      id: randomUUID(),
      name: input.sessionName,
      hostAgentId,
      status: "active",
      createdAt,
      updatedAt: createdAt
    };

    const agent: Agent = {
      id: hostAgentId,
      sessionId: session.id,
      agentName: input.agentName,
      displayName: input.displayName,
      platform: input.platform,
      role: "host",
      roleDescription: normalizeRoleDescription("host", input.roleDescription),
      capabilities: input.capabilities,
      connectionMode: input.connectionMode,
      status: "online",
      lastHeartbeatAt: createdAt,
      createdAt
    };

    this.sessions.insert(session);
    try {
      this.agents.insert(agent);
    } catch (error: unknown) {
      if (isDuplicateAgentNameViolation(error)) {
        throw coreErrors.duplicateAgentName(session.id, input.agentName);
      }

      throw error;
    }

    return { session, agent };
  }

  public joinSession(input: JoinSessionInput): SessionJoinResult {
    const session = this.sessions.findById(input.sessionId);
    if (!session) {
      throw coreErrors.sessionNotFound(input.sessionId);
    }
    if (session.status !== "active") {
      throw coreErrors.sessionClosed(input.sessionId);
    }
    const roleDescription = normalizeRoleDescription(
      input.role,
      input.roleDescription
    );
    const existing = this.agents.findBySessionIdAndAgentName(
      input.sessionId,
      input.agentName
    );
    if (existing) {
      if (existing.role !== input.role) {
        throw coreErrors.duplicateAgentName(input.sessionId, input.agentName);
      }

      const refreshed = this.agents.refreshExistingAgent({
        agentId: existing.id,
        displayName: input.displayName,
        platform: input.platform,
        roleDescription,
        capabilities: input.capabilities,
        connectionMode: input.connectionMode,
        lastHeartbeatAt: now()
      });
      return {
        session,
        agent: refreshed
      };
    }

    const createdAt = now();
    const agent: Agent = {
      id: randomUUID(),
      sessionId: input.sessionId,
      agentName: input.agentName,
      displayName: input.displayName,
      platform: input.platform,
      role: input.role,
      roleDescription,
      capabilities: input.capabilities,
      connectionMode: input.connectionMode,
      status: "idle",
      lastHeartbeatAt: createdAt,
      createdAt
    };

    try {
      this.agents.insert(agent);
    } catch (error: unknown) {
      if (isDuplicateAgentNameViolation(error)) {
        throw coreErrors.duplicateAgentName(input.sessionId, input.agentName);
      }

      throw error;
    }

    return { session, agent };
  }

  public joinSessionByName(input: JoinSessionByNameInput): SessionJoinResult {
    const session = this.sessions.findOpenByName(input.sessionName);
    if (!session) {
      throw coreErrors.sessionNotFound(input.sessionName);
    }

    return this.joinSession({
      sessionId: session.id,
      agentName: input.agentName,
      displayName: input.displayName,
      platform: input.platform,
      role: input.role,
      roleDescription: input.roleDescription,
      capabilities: input.capabilities,
      connectionMode: input.connectionMode
    });
  }

  public attachSessionByName(
    input: AttachSessionInput
  ): SessionJoinResult & { reusedExistingSession: boolean } {
    if (input.role === "host") {
      const existingSession = this.sessions.findOpenByName(input.sessionName);
      if (!existingSession) {
        const created = this.createSession({
          sessionName: input.sessionName,
          agentName: input.agentName,
          displayName: defaultAgentDisplayName(input.agentName),
          platform: defaultAgentPlatform,
          roleDescription: input.roleDescription,
          capabilities: defaultAgentCapabilities,
          connectionMode: defaultAgentConnectionMode
        });

        return {
          ...created,
          reusedExistingSession: false
        };
      }

      const existingHost = this.agents.findById(existingSession.hostAgentId);
      if (!existingHost || existingHost.agentName !== input.agentName) {
        throw coreErrors.duplicateSessionName(input.sessionName);
      }

      const refreshed = this.agents.refreshExistingAgent({
        agentId: existingHost.id,
        displayName: defaultAgentDisplayName(input.agentName),
        platform: defaultAgentPlatform,
        roleDescription: normalizeRoleDescription("host", input.roleDescription),
        capabilities: defaultAgentCapabilities,
        connectionMode: defaultAgentConnectionMode,
        lastHeartbeatAt: now()
      });

      return {
        session: existingSession,
        agent: refreshed,
        reusedExistingSession: true
      };
    }

    const joined = this.joinSessionByName({
      sessionName: input.sessionName,
      agentName: input.agentName,
      displayName: defaultAgentDisplayName(input.agentName),
      platform: defaultAgentPlatform,
      role: "worker",
      roleDescription: input.roleDescription,
      capabilities: defaultAgentCapabilities,
      connectionMode: defaultAgentConnectionMode
    });

    return {
      ...joined,
      reusedExistingSession: false
    };
  }

  public getSession(sessionId: string): Session {
    const session = this.sessions.findById(sessionId);
    if (!session) {
      throw coreErrors.sessionNotFound(sessionId);
    }

    return session;
  }

  public listMembers(sessionId: string): Agent[] {
    const session = this.sessions.findById(sessionId);
    if (!session) {
      throw coreErrors.sessionNotFound(sessionId);
    }

    return this.agents.listBySessionId(sessionId);
  }

  public getSessionByName(sessionName: string): Session {
    const session = this.sessions.findOpenByName(sessionName);
    if (!session) {
      throw coreErrors.sessionNotFound(sessionName);
    }

    return session;
  }

  public leaveSession(agentId: string): LeaveAgentResult {
    return this.removeAgent(agentId);
  }

  public removeAgent(agentId: string): LeaveAgentResult {
    const agent = this.agents.findById(agentId);
    if (!agent) {
      throw coreErrors.agentNotFound(agentId);
    }

    return this.runInTransaction(() => this.removeAgentRecord(agent));
  }

  public removeSessionMember(input: RemoveSessionMemberInput): LeaveAgentResult {
    const requester = this.agents.findById(input.requesterAgentId);
    if (!requester) {
      throw coreErrors.agentNotFound(input.requesterAgentId);
    }

    const target = this.agents.findById(input.targetAgentId);
    if (!target) {
      throw coreErrors.agentNotFound(input.targetAgentId);
    }

    if (requester.sessionId !== input.sessionId) {
      throw coreErrors.crossSessionAgent(input.requesterAgentId, input.sessionId);
    }
    if (target.sessionId !== input.sessionId) {
      throw coreErrors.crossSessionAgent(input.targetAgentId, input.sessionId);
    }
    if (requester.role !== "host") {
      throw coreErrors.permissionDenied("只有 host 可以强制移除会话成员。");
    }
    if (target.role === "host") {
      throw coreErrors.invalidAgentRemoval("不能通过成员移除接口强制移除 host。");
    }
    if (requester.id === target.id) {
      throw coreErrors.invalidAgentRemoval("host 不能通过成员移除接口移除自己。");
    }

    return this.runInTransaction(() =>
      this.removeAgentRecord(target, requester.id)
    );
  }

  public deleteSession(sessionId: string): {
    sessionId: string;
    sessionName: string;
    deleted: true;
  };
  public deleteSession(
    sessionId: string,
    requesterAgentId: string
  ): {
    sessionId: string;
    sessionName: string;
    deleted: true;
  };
  public deleteSession(
    sessionId: string,
    requesterAgentId?: string
  ): {
    sessionId: string;
    sessionName: string;
    deleted: true;
  } {
    const session = this.sessions.findById(sessionId);
    if (!session) {
      throw coreErrors.sessionNotFound(sessionId);
    }

    const memberCount = this.agents.countBySessionId(sessionId);
    if (memberCount > 0 && !requesterAgentId) {
      throw coreErrors.sessionNotEmpty(sessionId, memberCount);
    }
    if (requesterAgentId) {
      const requester = this.agents.findById(requesterAgentId);
      if (!requester) {
        throw coreErrors.agentNotFound(requesterAgentId);
      }
      if (requester.sessionId !== sessionId) {
        throw coreErrors.crossSessionAgent(requesterAgentId, sessionId);
      }
      if (requester.role !== "host") {
        throw coreErrors.permissionDenied("只有 host 可以主动删除仍在运行中的会话。");
      }
    }

    this.runInTransaction(() => {
      this.deleteSessionData(session);
    });

    return {
      sessionId,
      sessionName: session.name,
      deleted: true
    };
  }

  public deleteSessionByName(sessionName: string): {
    sessionId: string;
    sessionName: string;
    deleted: true;
  };
  public deleteSessionByName(
    sessionName: string,
    requesterAgentId: string
  ): {
    sessionId: string;
    sessionName: string;
    deleted: true;
  };
  public deleteSessionByName(
    sessionName: string,
    requesterAgentId?: string
  ): {
    sessionId: string;
    sessionName: string;
    deleted: true;
  } {
    const session =
      this.sessions.findOpenByName(sessionName) ?? this.sessions.findByName(sessionName);
    if (!session) {
      throw coreErrors.sessionNotFound(sessionName);
    }

    return requesterAgentId
      ? this.deleteSession(session.id, requesterAgentId)
      : this.deleteSession(session.id);
  }

  private removeAgentRecord(
    agent: Agent,
    removedByAgentId?: string
  ): LeaveAgentResult {
    const session = this.sessions.findById(agent.sessionId);
    if (!session) {
      throw coreErrors.sessionNotFound(agent.sessionId);
    }

    const timestamp = now();
    const agentIdentity = `${session.name}::${agent.agentName}`;

    this.messages.deleteByAgentId(agent.id);
    this.tasks.clearAssignmentsForAgent(agent.id, timestamp);
    this.sessionInsights.clearDispatchForAgent(session.id, agent.id, timestamp);
    this.agents.deleteById(agent.id);
    this.identityLeases.deleteByIdentity(agentIdentity);

    const shouldDeleteSession =
      agent.role === "host" || this.agents.countBySessionId(session.id) === 0;

    if (shouldDeleteSession) {
      this.deleteSessionData(session);
    }

    return {
      agentId: agent.id,
      agentName: agent.agentName,
      sessionId: session.id,
      sessionName: session.name,
      sessionDeleted: shouldDeleteSession,
      sessionClosed: shouldDeleteSession,
      ...(removedByAgentId ? { removedByAgentId } : {})
    };
  }

  private deleteSessionData(session: Session): void {
    this.taskEvents.deleteBySessionId(session.id);
    this.tasks.deleteBySessionId(session.id);
    this.messages.deleteBySessionId(session.id);
    this.sessionInsights.deleteBySessionId(session.id);
    this.agents.deleteBySessionId(session.id);
    this.identityLeases.deleteBySessionName(session.name);
    this.sessions.deleteById(session.id);
  }

  private runInTransaction<T>(task: () => T): T {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = task();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.safeRollback();
      throw error;
    }
  }

  private safeRollback(): void {
    try {
      this.database.exec("ROLLBACK");
    } catch {
      // Ignore rollback errors when the transaction has already been closed.
    }
  }
}
