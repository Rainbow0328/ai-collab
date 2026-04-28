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
export const errorCodes = {
  sessionNotFound: "SESSION_NOT_FOUND",
  sessionClosed: "SESSION_CLOSED",
  sessionNotEmpty: "SESSION_NOT_EMPTY",
  sessionInsightConflict: "SESSION_INSIGHT_CONFLICT",
  invalidInput: "INVALID_INPUT",
  duplicateSessionName: "DUPLICATE_SESSION_NAME",
  duplicateAgentName: "DUPLICATE_AGENT_NAME",
  agentNotFound: "AGENT_NOT_FOUND",
  messageNotFound: "MESSAGE_NOT_FOUND",
  messageDispatchConflict: "MESSAGE_DISPATCH_CONFLICT",
  messageAlreadyClaimed: "MESSAGE_ALREADY_CLAIMED",
  messageNotClaimedByAgent: "MESSAGE_NOT_CLAIMED_BY_AGENT",
  messageAlreadyFinished: "MESSAGE_ALREADY_FINISHED",
  identityBusy: "IDENTITY_BUSY",
  waitChainSuperseded: "WAIT_CHAIN_SUPERSEDED",
  taskNotFound: "TASK_NOT_FOUND",
  crossSessionAgent: "CROSS_SESSION_AGENT",
  invalidTaskAssignee: "INVALID_TASK_ASSIGNEE",
  permissionDenied: "PERMISSION_DENIED",
  invalidAgentRemoval: "INVALID_AGENT_REMOVAL"
} as const;

export type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes];
