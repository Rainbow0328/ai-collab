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
export const PROTOCOL_VERSION = "0.1.0";

export const sessionStatuses = ["active", "paused", "closed"] as const;
export type SessionStatus = (typeof sessionStatuses)[number];

export const agentPlatforms = ["generic"] as const;
export type AgentPlatform = string;

export const agentRoles = ["host", "worker", "observer"] as const;
export type AgentRole = (typeof agentRoles)[number];

export const connectionModes = [
  "plugin",
  "extension",
  "skill-bridge"
] as const;
export type ConnectionMode = (typeof connectionModes)[number];

export const agentStatuses = [
  "online",
  "idle",
  "busy",
  "paused",
  "offline"
] as const;
export type AgentStatus = (typeof agentStatuses)[number];

export const messageTypes = [
  "system",
  "instruction",
  "task",
  "progress",
  "result",
  "heartbeat",
  "ack",
  "error"
] as const;
export type MessageType = (typeof messageTypes)[number];

export const messageDeliveryStatuses = [
  "sent",
  "delivered",
  "acknowledged",
  "processed",
  "delivery_failed"
] as const;
export type MessageDeliveryStatus = (typeof messageDeliveryStatuses)[number];

export const messageProcessingStatuses = [
  "pending",
  "claimed",
  "processed",
  "failed"
] as const;
export type MessageProcessingStatus =
  (typeof messageProcessingStatuses)[number];

export const taskStatuses = [
  "created",
  "assigned",
  "accepted",
  "in_progress",
  "completed",
  "failed",
  "cancelled",
  "awaiting_reassign"
] as const;
export type TaskStatus = (typeof taskStatuses)[number];

export const taskPriorities = ["low", "normal", "high"] as const;
export type TaskPriority = (typeof taskPriorities)[number];

export const reviewStatuses = [
  "in_progress",
  "blocked",
  "needs_user_input",
  "ready_for_review"
] as const;
export type ReviewStatus = (typeof reviewStatuses)[number];

export type Session = {
  id: string;
  name: string;
  hostAgentId: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
};

export type Agent = {
  id: string;
  sessionId: string;
  agentName: string;
  displayName: string;
  platform: AgentPlatform;
  role: AgentRole;
  roleDescription: string | null;
  capabilities: string[];
  connectionMode: ConnectionMode;
  status: AgentStatus;
  lastHeartbeatAt: string;
  createdAt: string;
};

export type WindowBindingDefaults = {
  intervalSeconds: number;
  maxRounds: number;
};

export type WindowRuntimeMessageKind = "task" | "report";

export type WindowRuntimeState = {
  activeFlow: string | null;
  currentMessageId: string | null;
  currentCorrelationId: string | null;
  currentMessageKind: WindowRuntimeMessageKind | null;
  waitChainId: string | null;
  waitChainStatus: string | null;
  lastPollAt: string | null;
  lastClaimAt: string | null;
  lastSubmitAt: string | null;
  pendingInboxCount: number | null;
  claimedInboxCount: number | null;
  lastCommand: string | null;
  lastStatus: string | null;
  lastWorkflowStep: string | null;
  lastAutomationState: string | null;
  lastTurnDisposition: string | null;
  updatedAt: string | null;
};

export type WindowBinding = {
  windowKey: string;
  identity: string;
  sessionId: string;
  sessionName: string;
  agentId: string;
  agentName: string;
  windowName: string;
  displayName: string;
  platform: AgentPlatform;
  role: AgentRole;
  roleDescription: string | null;
  capabilities: string[];
  connectionMode: ConnectionMode;
  defaults: WindowBindingDefaults;
  runtimeState: WindowRuntimeState;
  createdAt: string;
  lastHeartbeatAt: string;
};

export type MessageEnvelope = {
  id: string;
  sessionId: string;
  fromAgentId: string;
  toAgentId?: string | undefined;
  type: MessageType;
  idempotencyKey?: string | undefined;
  correlationId?: string | undefined;
  createdAt: string;
  payload: unknown;
};

export type Task = {
  id: string;
  sessionId: string;
  title: string;
  description: string;
  createdByAgentId: string;
  assignedToAgentId?: string | undefined;
  status: TaskStatus;
  priority: TaskPriority;
  capabilityHint?: string | undefined;
  parentTaskId?: string | undefined;
  createdAt: string;
  updatedAt: string;
};

export type TaskEvent = {
  id: string;
  taskId: string;
  eventType: string;
  actorAgentId: string;
  payload: unknown;
  createdAt: string;
};

export type AckPayload = {
  messageId: string;
  processed: boolean;
};

export type MessageClaimInput = {
  agentId: string;
  types?: MessageType[] | undefined;
  fromAgentId?: string | undefined;
  correlationId?: string | undefined;
  identity?: string | undefined;
  flow?: "host" | "worker" | undefined;
  ownerToken?: string | undefined;
};

export type MessageProcessCompleteInput = {
  agentId: string;
  identity?: string | undefined;
  flow?: "host" | "worker" | undefined;
  ownerToken?: string | undefined;
};

export type MessageProcessFailInput = {
  agentId: string;
  reason?: string | undefined;
  identity?: string | undefined;
  flow?: "host" | "worker" | undefined;
  ownerToken?: string | undefined;
};

export type ErrorPayload = {
  code: string;
  message: string;
  details?: unknown;
};

export type CreateSessionInput = {
  sessionName: string;
  agentName: string;
  displayName: string;
  platform: AgentPlatform;
  roleDescription?: string | undefined;
  capabilities: string[];
  connectionMode: ConnectionMode;
};

export type JoinSessionInput = {
  sessionId: string;
  agentName: string;
  displayName: string;
  platform: AgentPlatform;
  role: Exclude<AgentRole, "host">;
  roleDescription?: string | undefined;
  capabilities: string[];
  connectionMode: ConnectionMode;
};

export type SessionJoinResult = {
  session: Session;
  agent: Agent;
};

export type JoinSessionByNameInput = {
  sessionName: string;
  agentName: string;
  displayName: string;
  platform: AgentPlatform;
  role: Exclude<AgentRole, "host">;
  roleDescription?: string | undefined;
  capabilities: string[];
  connectionMode: ConnectionMode;
};

export type AttachSessionInput = {
  sessionName: string;
  agentName: string;
  role: "host" | "worker";
  roleDescription: string;
};

export type RemoveSessionMemberInput = {
  sessionId: string;
  requesterAgentId: string;
  targetAgentId: string;
};

export type LeaveAgentResult = {
  agentId: string;
  agentName: string;
  sessionId: string;
  sessionName: string;
  sessionDeleted: boolean;
  sessionClosed: boolean;
  removedByAgentId?: string | undefined;
};

export type SendMessageInput = {
  sessionId: string;
  fromAgentId: string;
  toAgentId?: string | undefined;
  type: MessageType;
  payload: unknown;
  idempotencyKey?: string | undefined;
  correlationId?: string | undefined;
  supersedeMessageIds?: string[] | undefined;
};

export type MessageRecord = MessageEnvelope & {
  deliveryStatus: MessageDeliveryStatus;
  processingStatus: MessageProcessingStatus;
  claimedByAgentId?: string | undefined;
  claimedAt?: string | undefined;
  processedAt?: string | undefined;
  failedAt?: string | undefined;
  failureReason?: string | undefined;
};

export type AgentQueueStats = {
  agentId: string;
  pending: number;
  claimed: number;
  total: number;
};

export type CreateTaskInput = {
  sessionId: string;
  title: string;
  description: string;
  createdByAgentId: string;
  assignedToAgentId?: string | undefined;
  priority: TaskPriority;
  capabilityHint?: string | undefined;
  parentTaskId?: string | undefined;
};

export type CompleteTaskInput = {
  completedByAgentId: string;
  summary?: string | undefined;
};

export type SessionInsight = {
  sessionId: string;
  objective: string | null;
  currentProjectUnderstanding: string | null;
  projectSummary: string | null;
  userIntentSummary: string | null;
  latestUserInput: string | null;
  latestReportSummary: string | null;
  recentUserInputs: string[];
  unappliedUserInputs: string[];
  userPreferences: string[];
  acceptanceCriteria: string[];
  constraints: string[];
  completedItems: string[];
  pendingItems: string[];
  blockers: string[];
  assumptions: string[];
  latestUserDirectiveRevision: number;
  appliedUserDirectiveRevision: number;
  currentPlanRevision: number;
  activePlanSummary: string | null;
  lastDispatchWorkerName: string | null;
  lastDispatchAgentId: string | null;
  lastDispatchMessageId: string | null;
  lastDispatchCorrelationId: string | null;
  lastDispatchTaskFocus: string | null;
  reviewStatus: ReviewStatus;
  reviewReason: string | null;
  readyForReview: boolean;
  lastUpdatedByAgentId?: string | undefined;
  updatedAt: string;
};

export type UpdateSessionInsightInput = {
  sessionId: string;
  updatedByAgentId: string;
  objective?: string | null | undefined;
  currentProjectUnderstanding?: string | null | undefined;
  projectSummary?: string | null | undefined;
  userIntentSummary?: string | null | undefined;
  latestUserInput?: string | null | undefined;
  latestReportSummary?: string | null | undefined;
  recentUserInputs?: string[] | undefined;
  unappliedUserInputs?: string[] | undefined;
  userPreferences?: string[] | undefined;
  acceptanceCriteria?: string[] | undefined;
  constraints?: string[] | undefined;
  completedItems?: string[] | undefined;
  pendingItems?: string[] | undefined;
  blockers?: string[] | undefined;
  assumptions?: string[] | undefined;
  latestUserDirectiveRevision?: number | undefined;
  appliedUserDirectiveRevision?: number | undefined;
  currentPlanRevision?: number | undefined;
  activePlanSummary?: string | null | undefined;
  lastDispatchWorkerName?: string | null | undefined;
  lastDispatchAgentId?: string | null | undefined;
  lastDispatchMessageId?: string | null | undefined;
  lastDispatchCorrelationId?: string | null | undefined;
  lastDispatchTaskFocus?: string | null | undefined;
  reviewStatus?: ReviewStatus | undefined;
  reviewReason?: string | null | undefined;
  readyForReview?: boolean | undefined;
  mergeMode?: "replace" | "append" | undefined;
  expectedUpdatedAt?: string | undefined;
};

export type AcquireIdentityLeaseInput = {
  identity: string;
  flow: "host" | "worker";
  ownerToken: string;
  leaseSeconds: number;
  takeover?: boolean | undefined;
};

export type ReleaseIdentityLeaseInput = {
  identity: string;
  flow: "host" | "worker";
  ownerToken: string;
};

export type IdentityLease = {
  identityKey: string;
  ownerToken: string;
  leaseUntil: string;
  createdAt: string;
  updatedAt: string;
};

export type UpdateWindowBindingDefaultsInput = {
  intervalSeconds: number;
  maxRounds: number;
};

export type UpdateWindowRuntimeStateInput = {
  activeFlow?: string | null | undefined;
  currentMessageId?: string | null | undefined;
  currentCorrelationId?: string | null | undefined;
  currentMessageKind?: WindowRuntimeMessageKind | null | undefined;
  waitChainId?: string | null | undefined;
  waitChainStatus?: string | null | undefined;
  lastPollAt?: string | null | undefined;
  lastClaimAt?: string | null | undefined;
  lastSubmitAt?: string | null | undefined;
  pendingInboxCount?: number | null | undefined;
  claimedInboxCount?: number | null | undefined;
  lastCommand?: string | null | undefined;
  lastStatus?: string | null | undefined;
  lastWorkflowStep?: string | null | undefined;
  lastAutomationState?: string | null | undefined;
  lastTurnDisposition?: string | null | undefined;
};
