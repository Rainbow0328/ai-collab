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
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export const knowledgeLevels = ["l1", "l2", "l3"] as const;
export type KnowledgeLevel = (typeof knowledgeLevels)[number];

export const knowledgeSourceKinds = [
  "manual",
  "worker_report",
  "host_update",
  "system",
  "user_feedback"
] as const;
export type KnowledgeSourceKind = (typeof knowledgeSourceKinds)[number];

export const knowledgeChangeKinds = [
  "created",
  "updated",
  "deleted"
] as const;
export type KnowledgeChangeKind = (typeof knowledgeChangeKinds)[number];

export type KnowledgeDocumentFrontmatter = {
  title: string;
  summary: string | null;
  tags: string[];
  ownerAgentId: string | null;
};

export type KnowledgeDocument = {
  id: string;
  level: KnowledgeLevel;
  slug: string;
  title: string;
  summary: string | null;
  tags: string[];
  path: string;
  content: string;
  ownerAgentId: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type KnowledgeManifestCounts = Record<KnowledgeLevel, number>;

export type KnowledgeManifest = {
  rootPath: string;
  counts: KnowledgeManifestCounts;
  updatedAt: string;
};

export type KnowledgeChangeRecord = {
  id: string;
  documentId: string;
  level: KnowledgeLevel;
  slug: string;
  kind: KnowledgeChangeKind;
  sourceKind: KnowledgeSourceKind;
  sourceAgentId: string | null;
  summary: string | null;
  createdAt: string;
  version: number;
};

export type KnowledgeListItem = Omit<KnowledgeDocument, "content">;

export type ListKnowledgeInput = {
  level?: KnowledgeLevel | undefined;
  tag?: string | undefined;
  query?: string | undefined;
};

export type UpsertKnowledgeInput = {
  level: KnowledgeLevel;
  slug: string;
  title: string;
  content: string;
  summary?: string | null | undefined;
  tags?: string[] | undefined;
  ownerAgentId?: string | null | undefined;
  sourceKind?: KnowledgeSourceKind | undefined;
  sourceAgentId?: string | null | undefined;
  changeSummary?: string | null | undefined;
};

export type DeleteKnowledgeInput = {
  level: KnowledgeLevel;
  slug: string;
  sourceKind?: KnowledgeSourceKind | undefined;
  sourceAgentId?: string | null | undefined;
  changeSummary?: string | null | undefined;
};

export type ListKnowledgeChangesInput = {
  level?: KnowledgeLevel | undefined;
  slug?: string | undefined;
  limit?: number | undefined;
};

export type KnowledgeExtractionCandidate = {
  sessionId: string;
  messageId: string;
  correlationId?: string | undefined;
  sourceAgentId: string;
  content: string;
  createdAt: string;
};

export const knowledgePatchActions = [
  "create",
  "update",
  "conflict_marked",
  "skip"
] as const;
export type KnowledgePatchAction = (typeof knowledgePatchActions)[number];

export type KnowledgePatchSource = {
  type: KnowledgeSourceKind;
  sourceAgentId: string | null;
  messageId?: string | undefined;
  correlationId?: string | undefined;
  codePaths?: string[] | undefined;
  note?: string | undefined;
};

export type KnowledgePatch = {
  id: string;
  targetLevel: KnowledgeLevel;
  targetSlug: string;
  action: KnowledgePatchAction;
  title: string;
  content: string;
  summary: string | null;
  tags: string[];
  confidence: number;
  requiresReview: boolean;
  source: KnowledgePatchSource;
};

export const knowledgePatchStatuses = [
  "extracted",
  "validated",
  "pending_adjudication",
  "approved_for_persistence",
  "persisted",
  "validation_failed",
  "conflict_marked",
  "rejected",
  "persistence_failed"
] as const;
export type KnowledgePatchStatus = (typeof knowledgePatchStatuses)[number];

export const knowledgePatchValidationStatuses = [
  "pending",
  "passed",
  "failed"
] as const;
export type KnowledgePatchValidationStatus =
  (typeof knowledgePatchValidationStatuses)[number];

export const knowledgePatchReviewDecisions = [
  "pending",
  "approved",
  "rejected",
  "conflict_marked"
] as const;
export type KnowledgePatchReviewDecision =
  (typeof knowledgePatchReviewDecisions)[number];

export const knowledgePersistenceResults = [
  "pending",
  "succeeded",
  "failed"
] as const;
export type KnowledgePersistenceResult =
  (typeof knowledgePersistenceResults)[number];

export type KnowledgePatchConflict = {
  code: string;
  message: string;
  targetLevel: KnowledgeLevel;
  targetSlug: string;
  existingVersion?: number | undefined;
  requiresReview: boolean;
};

export type KnowledgePatchRecord = {
  patchId: string;
  targetLayer: KnowledgeLevel;
  targetName: string;
  status: KnowledgePatchStatus;
  source: KnowledgePatchSource;
  payload: KnowledgePatch;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgePatchReviewRecord = {
  patchId: string;
  validationResult: KnowledgePatchValidationStatus;
  violations: KnowledgeGuardViolation[];
  warnings: KnowledgeGuardViolation[];
  reviewDecision: KnowledgePatchReviewDecision;
  reviewedBy: string | null;
  reviewComment: string | null;
  reviewedAt: string | null;
};

export type KnowledgePersistenceRecord = {
  patchId: string;
  targetPath: string | null;
  persistedVersion: number | null;
  persistResult: KnowledgePersistenceResult;
  errorMessage: string | null;
  persistedAt: string | null;
};

export type KnowledgePatchLifecycleRecord = {
  patchRecord: KnowledgePatchRecord;
  reviewRecord: KnowledgePatchReviewRecord | null;
  persistenceRecord: KnowledgePersistenceRecord | null;
};

export type CreateKnowledgePatchRecordInput = {
  patch: KnowledgePatch;
  status?: KnowledgePatchStatus | undefined;
};

export type UpdateKnowledgePatchRecordInput = {
  patchId: string;
  status: KnowledgePatchStatus;
};

export type UpsertKnowledgePatchReviewRecordInput = {
  patchId: string;
  validationResult?: KnowledgePatchValidationStatus | undefined;
  violations?: KnowledgeGuardViolation[] | undefined;
  warnings?: KnowledgeGuardViolation[] | undefined;
  reviewDecision?: KnowledgePatchReviewDecision | undefined;
  reviewedBy?: string | null | undefined;
  reviewComment?: string | null | undefined;
  reviewedAt?: string | null | undefined;
};

export type UpsertKnowledgePersistenceRecordInput = {
  patchId: string;
  targetPath?: string | null | undefined;
  persistedVersion?: number | null | undefined;
  persistResult?: KnowledgePersistenceResult | undefined;
  errorMessage?: string | null | undefined;
  persistedAt?: string | null | undefined;
};

export type ListKnowledgePatchRecordsInput = {
  status?: KnowledgePatchStatus | undefined;
};

export type ListKnowledgePatchLifecycleInput = {
  status?: KnowledgePatchStatus | undefined;
};

export type AdjudicateKnowledgePatchInput = {
  patchId: string;
  decision: Extract<
    KnowledgePatchReviewDecision,
    "approved" | "rejected" | "conflict_marked"
  >;
  reviewedBy: string;
  reviewComment?: string | null | undefined;
  reviewedAt?: string | null | undefined;
};

export type ExecuteKnowledgePatchPersistenceResult = {
  ok: boolean;
  patchId: string;
  status: "persisted" | "persistence_failed" | "skipped";
  reason: string;
  targetPath: string | null;
  persistedVersion: number | null;
};

export type ExtractFromWorkerReportInput = {
  sessionId: string;
  messageId: string;
  correlationId?: string | undefined;
  sourceAgentId: string;
  reportContent: string;
  targetHint?: {
    level?: KnowledgeLevel | undefined;
    slug?: string | undefined;
    title?: string | undefined;
  } | undefined;
};

export type ExtractFromCodePathsInput = {
  codePaths: string[];
  moduleName?: string | undefined;
  sourceAgentId?: string | undefined;
  note?: string | undefined;
};

export type BuildKnowledgePatchInput = {
  level: KnowledgeLevel;
  slug: string;
  title: string;
  content: string;
  summary?: string | null | undefined;
  tags?: string[] | undefined;
  action?: Extract<KnowledgePatchAction, "create" | "update" | "skip"> | undefined;
  confidence?: number | undefined;
  requiresReview?: boolean | undefined;
  source: KnowledgePatchSource;
};

export type KnowledgeExtractionResult = {
  accepted: boolean;
  reason: string;
  patches: KnowledgePatch[];
  conflicts: KnowledgePatchConflict[];
  warnings: string[];
  candidates: UpsertKnowledgeInput[];
};

export type KnowledgeGuardCheckInput = {
  level: KnowledgeLevel;
  slug: string;
  content: string;
};

export type KnowledgeGuardViolation = {
  code: string;
  message: string;
};

export type KnowledgeGuardResult = {
  ok: boolean;
  violations: KnowledgeGuardViolation[];
};

export type KnowledgeGuardSuggestion = {
  code: string;
  message: string;
};

export type ValidateKnowledgePatchInput = {
  patch: KnowledgePatch;
  stableDocument?: KnowledgeListItem | null | undefined;
};

export type ValidateTaskPlanInput = {
  title: string;
  summary: string;
  targetModules: string[];
  proposedChanges: string[];
};

export type ValidateModuleContractInput = {
  moduleName: string;
  dependencies: string[];
  publicApi: string[];
};

export type AuditSessionInput = {
  sessionId: string;
  pendingPatchCount: number;
  recentViolationCount: number;
};

export type ArchitectureGuardDecision = {
  ok: boolean;
  violations: KnowledgeGuardViolation[];
  warnings: KnowledgeGuardViolation[];
  suggestions: KnowledgeGuardSuggestion[];
  requiresKnowledgeKeeperReview: boolean;
};
