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

import type {
  AckPayload,
  AgentQueueStats,
  MessageRecord,
  MessageType,
  SendMessageInput,
  WsInboxMessageNotification
} from "@loopmarshal/protocol";
import {
  AgentRepository,
  IdentityLeaseRepository,
  MessageRepository,
  SessionRepository
} from "@loopmarshal/store";

import { coreErrors } from "../errors.js";

const now = (): string => {
  return new Date().toISOString();
};

export class MessageService {
  private websocketService: {
    sendToAgent: (agentId: string, message: WsInboxMessageNotification) => void;
  } | null = null;

  public constructor(
    private readonly sessions: SessionRepository,
    private readonly agents: AgentRepository,
    private readonly messages: MessageRepository,
    private readonly identityLeases: IdentityLeaseRepository
  ) {}

  public setWebSocketService(service: {
    sendToAgent: (agentId: string, message: WsInboxMessageNotification) => void;
  }): void {
    this.websocketService = service;
  }

  public sendMessage(input: SendMessageInput): MessageRecord {
    const session = this.sessions.findById(input.sessionId);
    if (!session) {
      throw coreErrors.sessionNotFound(input.sessionId);
    }

    const fromAgent = this.agents.findById(input.fromAgentId);
    if (!fromAgent) {
      throw coreErrors.agentNotFound(input.fromAgentId);
    }
    if (fromAgent.sessionId !== input.sessionId) {
      throw coreErrors.crossSessionAgent(input.fromAgentId, input.sessionId);
    }

    if (input.toAgentId) {
      const toAgent = this.agents.findById(input.toAgentId);
      if (!toAgent) {
        throw coreErrors.agentNotFound(input.toAgentId);
      }
      if (toAgent.sessionId !== input.sessionId) {
        throw coreErrors.crossSessionAgent(input.toAgentId, input.sessionId);
      }
    }

    const message: MessageRecord = {
      id: randomUUID(),
      sessionId: input.sessionId,
      fromAgentId: input.fromAgentId,
      type: input.type,
      payload: input.payload,
      deliveryStatus: "sent",
      processingStatus: "pending",
      createdAt: now(),
      ...(input.toAgentId ? { toAgentId: input.toAgentId } : {}),
      ...(input.idempotencyKey
        ? { idempotencyKey: input.idempotencyKey }
        : {}),
      ...(input.correlationId ? { correlationId: input.correlationId } : {})
    };

    const inserted = this.messages.insertAtomically({
      message,
      supersedeMessageIds: input.supersedeMessageIds ?? [],
      processedAt: now()
    });
    if (!inserted) {
      throw coreErrors.messageDispatchConflict(input.supersedeMessageIds ?? []);
    }

    if (this.websocketService && inserted.message.toAgentId) {
      const notification: WsInboxMessageNotification = {
        type: "inbox:new-message",
        messageId: inserted.message.id,
        fromAgentId: inserted.message.fromAgentId,
        toAgentId: inserted.message.toAgentId,
        messageType: inserted.message.type,
        createdAt: inserted.message.createdAt
      };
      this.websocketService.sendToAgent(inserted.message.toAgentId, notification);
    }

    return inserted.message;
  }

  public getInbox(
    agentId: string,
    options: {
      pendingOnly?: boolean;
      claimedOnly?: boolean;
    } = {}
  ): MessageRecord[] {
    const agent = this.agents.findById(agentId);
    if (!agent) {
      throw coreErrors.agentNotFound(agentId);
    }

    return this.messages.listInboxForAgent(agentId, options);
  }

  public getMessage(messageId: string): MessageRecord {
    const message = this.messages.findById(messageId);
    if (!message) {
      throw coreErrors.messageNotFound(messageId);
    }

    return message;
  }

  public listMessagesBySession(sessionId: string): MessageRecord[] {
    const session = this.sessions.findById(sessionId);
    if (!session) {
      throw coreErrors.sessionNotFound(sessionId);
    }

    return this.messages.listBySessionId(sessionId);
  }

  public getSessionQueueStats(sessionId: string): AgentQueueStats[] {
    const session = this.sessions.findById(sessionId);
    if (!session) {
      throw coreErrors.sessionNotFound(sessionId);
    }

    return this.messages.listQueueStatsForSession(sessionId);
  }

  public claimNext(
    agentId: string,
    options: {
      types?: MessageType[];
      fromAgentId?: string;
      correlationId?: string;
      identity?: string;
      flow?: "host" | "worker";
      ownerToken?: string;
    } = {}
  ): MessageRecord | null {
    const agent = this.agents.findById(agentId);
    if (!agent) {
      throw coreErrors.agentNotFound(agentId);
    }

    this.assertCurrentWaitChain(options);

    return this.messages.claimNextForAgent(agentId, now(), options);
  }

  public completeMessage(
    messageId: string,
    agentId: string,
    options: {
      identity?: string;
      flow?: "host" | "worker";
      ownerToken?: string;
    } = {}
  ): MessageRecord {
    const agent = this.agents.findById(agentId);
    if (!agent) {
      throw coreErrors.agentNotFound(agentId);
    }

    this.assertCurrentWaitChain(options);

    const completed = this.messages.markProcessed(messageId, agentId, now());
    if (completed) {
      return completed;
    }

    this.throwMessageTransitionError(messageId, agentId);
  }

  public failMessage(
    messageId: string,
    agentId: string,
    reason?: string,
    options: {
      identity?: string;
      flow?: "host" | "worker";
      ownerToken?: string;
    } = {}
  ): MessageRecord {
    const agent = this.agents.findById(agentId);
    if (!agent) {
      throw coreErrors.agentNotFound(agentId);
    }

    this.assertCurrentWaitChain(options);

    const failed = this.messages.markFailed(messageId, agentId, now(), reason);
    if (failed) {
      return failed;
    }

    this.throwMessageTransitionError(messageId, agentId);
  }

  public acknowledge(messageId: string, processed: boolean): AckPayload {
    const message = this.messages.findById(messageId);
    if (!message) {
      throw coreErrors.messageNotFound(messageId);
    }

    this.messages.acknowledge(messageId, processed, now());
    return {
      messageId,
      processed
    };
  }

  private throwMessageTransitionError(
    messageId: string,
    agentId: string
  ): never {
    const message = this.messages.findById(messageId);
    if (!message) {
      throw coreErrors.messageNotFound(messageId);
    }

    if (
      message.processingStatus === "processed" ||
      message.processingStatus === "failed"
    ) {
      throw coreErrors.messageAlreadyFinished(messageId);
    }

    if (
      message.processingStatus === "claimed" &&
      message.claimedByAgentId !== agentId
    ) {
      throw coreErrors.messageAlreadyClaimed(messageId);
    }

    throw coreErrors.messageNotClaimedByAgent(messageId, agentId);
  }

  private assertCurrentWaitChain(input: {
    identity?: string;
    flow?: "host" | "worker";
    ownerToken?: string;
  }): void {
    if (!input.identity || !input.flow || !input.ownerToken) {
      return;
    }

    const identityKey = `${input.flow}:${input.identity}`;
    const existing = this.identityLeases.findByIdentityKey(identityKey);
    if (!existing || existing.ownerToken !== input.ownerToken) {
      throw coreErrors.waitChainSuperseded(input.identity, input.flow);
    }
  }
}
