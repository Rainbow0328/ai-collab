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
import { errorCodes, type ErrorCode } from "@ai-collab/protocol";

export class CoreError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;

  public constructor(code: ErrorCode, message: string, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export const coreErrors = {
  sessionNotFound(sessionId: string) {
    return new CoreError(
      errorCodes.sessionNotFound,
      `Session "${sessionId}" was not found.`,
      404
    );
  },
  sessionClosed(sessionId: string) {
    return new CoreError(
      errorCodes.sessionClosed,
      `Session "${sessionId}" is not active.`,
      409
    );
  },
  sessionNotEmpty(sessionId: string, memberCount: number) {
    return new CoreError(
      errorCodes.sessionNotEmpty,
      `会话 "${sessionId}" 当前仍有 ${memberCount} 个成员，必须先让所有成员退出后才能删除该会话。`,
      409
    );
  },
  sessionInsightConflict(sessionId: string) {
    return new CoreError(
      errorCodes.sessionInsightConflict,
      `Session insight for "${sessionId}" was updated by another flow. Retry with the latest snapshot.`,
      409
    );
  },
  invalidInput(message: string) {
    return new CoreError(errorCodes.invalidInput, message, 400);
  },
  duplicateSessionName(sessionName: string) {
    return new CoreError(
      errorCodes.duplicateSessionName,
      `Session "${sessionName}" already exists.`,
      409
    );
  },
  duplicateAgentName(sessionId: string, agentName: string) {
    return new CoreError(
      errorCodes.duplicateAgentName,
      `Agent "${agentName}" already exists in session "${sessionId}".`,
      409
    );
  },
  agentNotFound(agentId: string) {
    return new CoreError(
      errorCodes.agentNotFound,
      `Agent "${agentId}" was not found.`,
      404
    );
  },
  messageNotFound(messageId: string) {
    return new CoreError(
      errorCodes.messageNotFound,
      `Message "${messageId}" was not found.`,
      404
    );
  },
  messageDispatchConflict(messageIds: string[]) {
    return new CoreError(
      errorCodes.messageDispatchConflict,
      `One or more superseded messages are no longer pending: ${messageIds.join(", ")}.`,
      409
    );
  },
  messageAlreadyClaimed(messageId: string) {
    return new CoreError(
      errorCodes.messageAlreadyClaimed,
      `Message "${messageId}" has already been claimed.`,
      409
    );
  },
  messageNotClaimedByAgent(messageId: string, agentId: string) {
    return new CoreError(
      errorCodes.messageNotClaimedByAgent,
      `Message "${messageId}" is not claimed by agent "${agentId}".`,
      409
    );
  },
  messageAlreadyFinished(messageId: string) {
    return new CoreError(
      errorCodes.messageAlreadyFinished,
      `Message "${messageId}" has already been finished.`,
      409
    );
  },
  identityBusy(
    identity: string,
    flow: "host" | "worker",
    details?: {
      ownerToken: string;
      leaseUntil: string;
    }
  ) {
    return new CoreError(
      errorCodes.identityBusy,
      details
        ? `Identity "${identity}" is already executing a ${flow} flow in another client. owner=${details.ownerToken}, leaseUntil=${details.leaseUntil}.`
        : `Identity "${identity}" is already executing a ${flow} flow in another client.`,
      409
    );
  },
  waitChainSuperseded(identity: string, flow: "host" | "worker") {
    return new CoreError(
      errorCodes.waitChainSuperseded,
      `The latest ${flow} wait chain for identity "${identity}" has superseded this command. Retry the current window flow with a fresh await.`,
      409
    );
  },
  taskNotFound(taskId: string) {
    return new CoreError(
      errorCodes.taskNotFound,
      `Task "${taskId}" was not found.`,
      404
    );
  },
  crossSessionAgent(agentId: string, sessionId: string) {
    return new CoreError(
      errorCodes.crossSessionAgent,
      `Agent "${agentId}" does not belong to session "${sessionId}".`,
      409
    );
  },
  invalidTaskAssignee(agentId: string, taskId: string) {
    return new CoreError(
      errorCodes.invalidTaskAssignee,
      `Agent "${agentId}" cannot complete task "${taskId}".`,
      409
    );
  },
  permissionDenied(message: string) {
    return new CoreError(errorCodes.permissionDenied, message, 403);
  },
  invalidAgentRemoval(message: string) {
    return new CoreError(errorCodes.invalidAgentRemoval, message, 409);
  }
};
