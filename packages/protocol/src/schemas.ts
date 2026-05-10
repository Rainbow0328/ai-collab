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
import { z } from "zod";

import {
  agentPlatforms,
  agentRoles,
  agentStatuses,
  connectionModes,
  messageDeliveryStatuses,
  messageProcessingStatuses,
  messageTypes,
  PROTOCOL_VERSION,
  sessionStatuses,
  reviewStatuses
} from "./types.js";
import { progressStatuses } from "./progress.js";
import { modelProviders } from "./model.js";
import { skillSources } from "./skill.js";

export const protocolVersionSchema = z.literal(PROTOCOL_VERSION);

export const sessionStatusSchema = z.enum(sessionStatuses);
export const agentPlatformSchema = z.enum(agentPlatforms);
export const agentRoleSchema = z.enum(agentRoles);
export const connectionModeSchema = z.enum(connectionModes);
export const agentStatusSchema = z.enum(agentStatuses);
export const messageTypeSchema = z.enum(messageTypes);
export const messageDeliveryStatusSchema = z.enum(messageDeliveryStatuses);
export const messageProcessingStatusSchema = z.enum(messageProcessingStatuses);
export const reviewStatusSchema = z.enum(reviewStatuses);
export const progressStatusSchema = z.enum(progressStatuses);

export const sessionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  hostAgentId: z.string().min(1),
  status: sessionStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const agentSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  agentName: z.string().min(1),
  displayName: z.string().min(1),
  platform: agentPlatformSchema,
  role: agentRoleSchema,
  roleDescription: z.string().min(1).nullable(),
  capabilities: z.array(z.string()),
  connectionMode: connectionModeSchema,
  status: agentStatusSchema,
  lastHeartbeatAt: z.string().datetime(),
  createdAt: z.string().datetime()
});

export const windowBindingDefaultsSchema = z.object({
  intervalSeconds: z.number().int().positive(),
  maxRounds: z.number().int().positive()
});

export const windowRuntimeMessageKindSchema = z.enum(["task", "report"]);

export const windowRuntimeStateSchema = z.object({
  activeFlow: z.string().nullable(),
  currentMessageId: z.string().nullable(),
  currentCorrelationId: z.string().nullable(),
  currentMessageKind: windowRuntimeMessageKindSchema.nullable(),
  waitChainId: z.string().nullable(),
  waitChainStatus: z.string().nullable(),
  lastPollAt: z.string().datetime().nullable(),
  lastClaimAt: z.string().datetime().nullable(),
  lastSubmitAt: z.string().datetime().nullable(),
  pendingInboxCount: z.number().int().nonnegative().nullable(),
  claimedInboxCount: z.number().int().nonnegative().nullable(),
  lastCommand: z.string().nullable(),
  lastStatus: z.string().nullable(),
  lastWorkflowStep: z.string().nullable(),
  lastAutomationState: z.string().nullable(),
  lastTurnDisposition: z.string().nullable(),
  updatedAt: z.string().datetime().nullable()
});

export const windowBindingSchema = z.object({
  windowKey: z.string().min(1),
  identity: z.string().min(1),
  sessionId: z.string().min(1),
  sessionName: z.string().min(1),
  agentId: z.string().min(1),
  agentName: z.string().min(1),
  windowName: z.string().min(1),
  displayName: z.string().min(1),
  platform: agentPlatformSchema,
  role: agentRoleSchema,
  roleDescription: z.string().min(1).nullable(),
  capabilities: z.array(z.string()),
  connectionMode: connectionModeSchema,
  defaults: windowBindingDefaultsSchema,
  runtimeState: windowRuntimeStateSchema,
  createdAt: z.string().datetime(),
  lastHeartbeatAt: z.string().datetime()
});

export const messageEnvelopeSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  fromAgentId: z.string().min(1),
  toAgentId: z.string().min(1).optional(),
  type: messageTypeSchema,
  idempotencyKey: z.string().min(1).optional(),
  correlationId: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  payload: z.unknown()
});

export const ackPayloadSchema = z.object({
  messageId: z.string().min(1),
  processed: z.boolean()
});

export const messageClaimInputSchema = z.object({
  agentId: z.string().min(1),
  types: z.array(messageTypeSchema).min(1).optional(),
  fromAgentId: z.string().min(1).optional(),
  correlationId: z.string().min(1).optional(),
  identity: z.string().min(1).optional(),
  flow: z.enum(["host", "worker"]).optional(),
  ownerToken: z.string().min(1).optional()
});

export const messageClaimManyInputSchema = messageClaimInputSchema.extend({
  maxMessages: z.number().int().min(1).max(50).optional()
});

export const messageProcessCompleteInputSchema = z.object({
  agentId: z.string().min(1),
  identity: z.string().min(1).optional(),
  flow: z.enum(["host", "worker"]).optional(),
  ownerToken: z.string().min(1).optional()
});

export const messageProcessFailInputSchema = z.object({
  agentId: z.string().min(1),
  reason: z.string().min(1).optional(),
  identity: z.string().min(1).optional(),
  flow: z.enum(["host", "worker"]).optional(),
  ownerToken: z.string().min(1).optional()
});

export const errorPayloadSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.unknown().optional()
});

export const createSessionInputSchema = z.object({
  sessionName: z.string().min(1),
  agentName: z.string().min(1),
  displayName: z.string().min(1),
  platform: agentPlatformSchema,
  roleDescription: z.string().min(1).optional(),
  capabilities: z.array(z.string()),
  connectionMode: connectionModeSchema
});

export const joinSessionInputSchema = z.object({
  sessionId: z.string().min(1),
  agentName: z.string().min(1),
  displayName: z.string().min(1),
  platform: agentPlatformSchema,
  role: z.enum(["worker", "knowledge_keeper"]),
  roleDescription: z.string().min(1).optional(),
  capabilities: z.array(z.string()),
  connectionMode: connectionModeSchema
});

export const joinSessionByNameInputSchema = z.object({
  sessionName: z.string().min(1),
  agentName: z.string().min(1),
  displayName: z.string().min(1),
  platform: agentPlatformSchema,
  role: z.enum(["worker", "knowledge_keeper"]),
  roleDescription: z.string().min(1).optional(),
  capabilities: z.array(z.string()),
  connectionMode: connectionModeSchema
});

export const attachSessionInputSchema = z.object({
  sessionName: z.string().min(1),
  agentName: z.string().min(1),
  role: z.enum(["host", "worker", "knowledge_keeper"]),
  roleDescription: z.string().min(1)
});

export const removeSessionMemberInputSchema = z.object({
  sessionId: z.string().min(1),
  requesterAgentId: z.string().min(1),
  targetAgentId: z.string().min(1)
});

export const sendMessageInputSchema = z.object({
  sessionId: z.string().min(1),
  fromAgentId: z.string().min(1),
  toAgentId: z.string().min(1).optional(),
  type: messageTypeSchema,
  payload: z.unknown(),
  idempotencyKey: z.string().min(1).optional(),
  correlationId: z.string().min(1).optional(),
  supersedeMessageIds: z.array(z.string().min(1)).optional()
});

export const messageRecordSchema = messageEnvelopeSchema.extend({
  deliveryStatus: messageDeliveryStatusSchema,
  processingStatus: messageProcessingStatusSchema,
  claimedByAgentId: z.string().min(1).optional(),
  claimedAt: z.string().datetime().optional(),
  processedAt: z.string().datetime().optional(),
  failedAt: z.string().datetime().optional(),
  failureReason: z.string().min(1).optional()
});

export const sessionInsightSchema = z.object({
  sessionId: z.string().min(1),
  objective: z.string().nullable(),
  currentProjectUnderstanding: z.string().nullable(),
  projectSummary: z.string().nullable(),
  userIntentSummary: z.string().nullable(),
  latestUserInput: z.string().nullable(),
  latestReportSummary: z.string().nullable(),
  recentUserInputs: z.array(z.string()),
  unappliedUserInputs: z.array(z.string()),
  userPreferences: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()),
  constraints: z.array(z.string()),
  completedItems: z.array(z.string()),
  pendingItems: z.array(z.string()),
  blockers: z.array(z.string()),
  assumptions: z.array(z.string()),
  latestUserDirectiveRevision: z.number().int().nonnegative(),
  appliedUserDirectiveRevision: z.number().int().nonnegative(),
  currentPlanRevision: z.number().int().nonnegative(),
  activePlanSummary: z.string().nullable(),
  lastDispatchWorkerName: z.string().nullable(),
  lastDispatchAgentId: z.string().nullable(),
  lastDispatchMessageId: z.string().nullable(),
  lastDispatchCorrelationId: z.string().nullable(),
  lastDispatchTaskFocus: z.string().nullable(),
  reviewStatus: reviewStatusSchema,
  reviewReason: z.string().nullable(),
  readyForReview: z.boolean(),
  lastUpdatedByAgentId: z.string().min(1).optional(),
  updatedAt: z.string().datetime()
});

export const updateSessionInsightInputSchema = z.object({
  sessionId: z.string().min(1),
  updatedByAgentId: z.string().min(1),
  objective: z.string().nullable().optional(),
  currentProjectUnderstanding: z.string().nullable().optional(),
  projectSummary: z.string().nullable().optional(),
  userIntentSummary: z.string().nullable().optional(),
  latestUserInput: z.string().nullable().optional(),
  latestReportSummary: z.string().nullable().optional(),
  recentUserInputs: z.array(z.string()).optional(),
  unappliedUserInputs: z.array(z.string()).optional(),
  userPreferences: z.array(z.string()).optional(),
  acceptanceCriteria: z.array(z.string()).optional(),
  constraints: z.array(z.string()).optional(),
  completedItems: z.array(z.string()).optional(),
  pendingItems: z.array(z.string()).optional(),
  blockers: z.array(z.string()).optional(),
  assumptions: z.array(z.string()).optional(),
  latestUserDirectiveRevision: z.number().int().nonnegative().optional(),
  appliedUserDirectiveRevision: z.number().int().nonnegative().optional(),
  currentPlanRevision: z.number().int().nonnegative().optional(),
  activePlanSummary: z.string().nullable().optional(),
  lastDispatchWorkerName: z.string().nullable().optional(),
  lastDispatchAgentId: z.string().nullable().optional(),
  lastDispatchMessageId: z.string().nullable().optional(),
  lastDispatchCorrelationId: z.string().nullable().optional(),
  lastDispatchTaskFocus: z.string().nullable().optional(),
  reviewStatus: reviewStatusSchema.optional(),
  reviewReason: z.string().nullable().optional(),
  readyForReview: z.boolean().optional(),
  mergeMode: z.enum(["replace", "append"]).optional(),
  expectedUpdatedAt: z.string().datetime().optional()
});

export const acquireIdentityLeaseInputSchema = z.object({
  identity: z.string().min(1),
  flow: z.enum(["host", "worker"]),
  ownerToken: z.string().min(1),
  leaseSeconds: z.number().int().positive().max(7200),
  takeover: z.boolean().optional()
});

export const releaseIdentityLeaseInputSchema = z.object({
  identity: z.string().min(1),
  flow: z.enum(["host", "worker"]),
  ownerToken: z.string().min(1)
});

export const updateWindowBindingDefaultsInputSchema = z.object({
  intervalSeconds: z.number().int().positive().max(3600),
  maxRounds: z.number().int().positive().max(86400)
});

export const updateWindowRuntimeStateInputSchema = z.object({
  activeFlow: z.string().nullable().optional(),
  currentMessageId: z.string().nullable().optional(),
  currentCorrelationId: z.string().nullable().optional(),
  currentMessageKind: windowRuntimeMessageKindSchema.nullable().optional(),
  waitChainId: z.string().nullable().optional(),
  waitChainStatus: z.string().nullable().optional(),
  lastPollAt: z.string().datetime().nullable().optional(),
  lastClaimAt: z.string().datetime().nullable().optional(),
  lastSubmitAt: z.string().datetime().nullable().optional(),
  pendingInboxCount: z.number().int().nonnegative().nullable().optional(),
  claimedInboxCount: z.number().int().nonnegative().nullable().optional(),
  lastCommand: z.string().nullable().optional(),
  lastStatus: z.string().nullable().optional(),
  lastWorkflowStep: z.string().nullable().optional(),
  lastAutomationState: z.string().nullable().optional(),
  lastTurnDisposition: z.string().nullable().optional()
});

export const upsertProgressInputSchema = z.object({
  sessionId: z.string().min(1),
  agentId: z.string().min(1),
  agentName: z.string().min(1),
  status: progressStatusSchema.optional(),
  percentage: z.number().int().min(0).max(100).optional(),
  currentStep: z.string().optional(),
  message: z.string().nullable().optional(),
  details: z.record(z.unknown()).optional(),
  ttlSeconds: z.number().int().positive().max(86400).optional()
});

export const listProgressFilterSchema = z.object({
  sessionId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  status: progressStatusSchema.optional()
});

export const modelProviderSchema = z.enum(modelProviders);

export const createModelConfigInputSchema = z.object({
  name: z.string().min(1).max(128),
  provider: modelProviderSchema,
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  modelName: z.string().min(1).max(128),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(200000).optional(),
  topP: z.number().min(0).max(1).optional(),
  timeoutSeconds: z.number().int().min(1).max(600).optional()
});

export const updateModelConfigInputSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  provider: modelProviderSchema.optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional().transform((v) => (v === "" ? undefined : v)),
  modelName: z.string().min(1).max(128).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(200000).optional(),
  topP: z.number().min(0).max(1).optional(),
  timeoutSeconds: z.number().int().min(1).max(600).optional(),
  enabled: z.boolean().optional()
});

export const testModelConfigInputSchema = z.object({
  modelConfigId: z.string().min(1),
  prompt: z.string().min(1).max(4096).optional()
});

export const createAgentProfileInputSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(1024).nullable().optional(),
  defaultModelConfigId: z.string().min(1).nullable().optional(),
  defaultRole: agentRoleSchema.nullable().optional(),
  roleDescription: z.string().max(1024).nullable().optional(),
  systemPrompt: z.string().max(32768).nullable().optional(),
  defaultParameters: z.record(z.unknown()).nullable().optional()
});

export const updateAgentProfileInputSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  description: z.string().max(1024).nullable().optional(),
  defaultModelConfigId: z.string().min(1).nullable().optional(),
  defaultRole: agentRoleSchema.nullable().optional(),
  roleDescription: z.string().max(1024).nullable().optional(),
  systemPrompt: z.string().max(32768).nullable().optional(),
  defaultParameters: z.record(z.unknown()).nullable().optional(),
  enabled: z.boolean().optional()
});

export const updateAgentProfileSkillsInputSchema = z.object({
  skillIds: z.array(z.string().min(1))
});

export const createSessionWithAgentInputSchema = z.object({
  sessionName: z.string().min(1).max(128),
  role: z.literal("host"),
  agentProfileId: z.string().min(1).nullable().optional(),
  modelConfigId: z.string().min(1).nullable().optional(),
  agentName: z.string().min(1).max(64),
  displayName: z.string().min(1).max(128),
  roleDescription: z.string().max(1024).nullable().optional(),
  skillIds: z.array(z.string().min(1)).optional(),
  runtimeParameters: z.record(z.unknown()).nullable().optional()
});

export const joinSessionWithAgentInputSchema = z.object({
  sessionId: z.string().min(1),
  role: z.enum(["worker", "knowledge_keeper"]),
  agentProfileId: z.string().min(1).nullable().optional(),
  modelConfigId: z.string().min(1).nullable().optional(),
  agentName: z.string().min(1).max(64),
  displayName: z.string().min(1).max(128),
  roleDescription: z.string().max(1024).nullable().optional(),
  runtimeParameters: z.record(z.unknown()).nullable().optional()
});

export const setSessionSkillsInputSchema = z.object({
  skillIds: z.array(z.string().min(1))
});

export const skillSourceSchema = z.enum(skillSources);

export const createSkillInputSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(1024).nullable().optional(),
  path: z.string().min(1).max(512),
  roleScope: agentRoleSchema.nullable().optional(),
  source: skillSourceSchema.optional()
});

export const updateSkillInputSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  description: z.string().max(1024).nullable().optional(),
  path: z.string().min(1).max(512).optional(),
  roleScope: agentRoleSchema.nullable().optional(),
  enabled: z.boolean().optional()
});

export const knowledgeFeedbackInputSchema = z.object({
  sessionId: z.string().min(1),
  level: z.enum(["l1", "l2", "l3"]),
  slug: z.string().min(1),
  feedback: z.string().min(1).max(8192),
  userIntent: z.string().max(8192).optional()
});

export const knowledgeBuildSourceSchema = z.enum([
  "user_message",
  "user_feedback",
  "host_planning",
  "worker_report",
  "system_idle"
]);

export const knowledgeBuildNextActionSchema = z.enum([
  "none",
  "knowledge_upsert",
  "knowledge_upsert_then_dispatch",
  "dispatch"
]);

export const createKnowledgeBuildJudgementInputSchema = z.object({
  sessionId: z.string().min(1),
  source: knowledgeBuildSourceSchema,
  sourceMessageId: z.string().min(1).optional(),
  hostAgentId: z.string().min(1),
  knowledgeBuildRequired: z.boolean(),
  targetLevels: z.array(z.enum(["l1", "l2", "l3"])),
  sourceKind: z.union([
    z.enum(["manual", "worker_report", "host_update", "system", "user_feedback"]),
    z.literal("none")
  ]),
  candidateRefs: z.array(z.string()).optional(),
  reason: z.string().min(1).max(4096),
  nextAction: knowledgeBuildNextActionSchema
});

export const fulfillKnowledgeBuildJudgementInputSchema = z.object({
  judgementId: z.string().min(1),
  hostAgentId: z.string().min(1),
  changeIds: z.array(z.string()),
  knowledgeRefs: z.array(z.string())
});
