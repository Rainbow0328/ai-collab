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
import type {
  AdjudicateKnowledgePatchInput,
  ArchitectureGuardDecision,
  CreateKnowledgePatchRecordInput,
  DeleteKnowledgeInput,
  ExecuteKnowledgePatchPersistenceResult,
  KnowledgeChangeRecord,
  KnowledgeDocument,
  KnowledgeGuardCheckInput,
  KnowledgeGuardResult,
  KnowledgeLevel,
  KnowledgeListItem,
  KnowledgeManifest,
  KnowledgeExtractionCandidate,
  KnowledgeExtractionResult,
  KnowledgePatchLifecycleRecord,
  KnowledgePatchRecord,
  KnowledgePatchReviewRecord,
  KnowledgePersistenceRecord,
  KnowledgeGuardViolation,
  ListKnowledgePatchLifecycleInput,
  ListKnowledgePatchRecordsInput,
  ListKnowledgeChangesInput,
  ListKnowledgeInput,
  UpdateKnowledgePatchRecordInput,
  UpsertKnowledgePatchReviewRecordInput,
  UpsertKnowledgePersistenceRecordInput,
  UpsertKnowledgeInput
} from "@loopmarshal/protocol";

import { coreErrors } from "../errors.js";
import { KnowledgeFileStore } from "./knowledge-file-store.js";

const KNOWLEDGE_LEVEL_TITLES: Record<KnowledgeLevel, string> = {
  l1: "Constitution",
  l2: "Relations",
  l3: "Module detail"
};

export class KnowledgeService {
  public constructor(private readonly store: KnowledgeFileStore) {}

  public getManifest(): KnowledgeManifest {
    return this.store.getManifest();
  }

  public list(input: ListKnowledgeInput = {}): KnowledgeListItem[] {
    return this.store.list(input);
  }

  public get(level: KnowledgeLevel, slug: string): KnowledgeDocument {
    const document = this.store.get(level, slug);
    if (!document) {
      throw coreErrors.knowledgeDocumentNotFound(level, slug);
    }
    return document;
  }

  public upsert(input: UpsertKnowledgeInput): KnowledgeDocument {
    this.assertValidSlug(input.slug);
    if (!input.title.trim()) {
      throw coreErrors.invalidInput("Knowledge title must not be empty.");
    }
    if (!input.content.trim()) {
      throw coreErrors.invalidInput("Knowledge content must not be empty.");
    }
    return this.store.upsert({
      ...input,
      title: input.title.trim(),
      content: input.content
    });
  }

  public delete(input: DeleteKnowledgeInput): { deleted: boolean } {
    this.assertValidSlug(input.slug);
    return {
      deleted: this.store.delete(input)
    };
  }

  public listChanges(input: ListKnowledgeChangesInput = {}): KnowledgeChangeRecord[] {
    return this.store.listChanges(input);
  }

  public snapshot(): {
    manifest: KnowledgeManifest;
    items: KnowledgeListItem[];
  } {
    return this.store.snapshot();
  }

  public createPatchRecord(
    input: CreateKnowledgePatchRecordInput
  ): KnowledgePatchRecord {
    return this.store.createPatchRecord(input);
  }

  public getPatchRecord(patchId: string): KnowledgePatchRecord | null {
    return this.store.getPatchRecord(patchId);
  }

  public listPatchRecords(
    input: ListKnowledgePatchRecordsInput = {}
  ): KnowledgePatchRecord[] {
    return this.store.listPatchRecords(input);
  }

  public getPatchLifecycle(patchId: string): KnowledgePatchLifecycleRecord | null {
    const patchRecord = this.getPatchRecord(patchId);
    if (!patchRecord) {
      return null;
    }

    return {
      patchRecord,
      reviewRecord: this.getPatchReviewRecord(patchId),
      persistenceRecord: this.getPersistenceRecord(patchId)
    };
  }

  public listPatchLifecycles(
    input: ListKnowledgePatchLifecycleInput = {}
  ): KnowledgePatchLifecycleRecord[] {
    return this.listPatchRecords({
      ...(input.status ? { status: input.status } : {})
    }).map((patchRecord) => ({
      patchRecord,
      reviewRecord: this.getPatchReviewRecord(patchRecord.patchId),
      persistenceRecord: this.getPersistenceRecord(patchRecord.patchId)
    }));
  }

  public listPendingPatchRecords(): KnowledgePatchRecord[] {
    return this.store.listPatchRecords({
      status: "pending_adjudication"
    });
  }

  public listPendingPatchLifecycles(): KnowledgePatchLifecycleRecord[] {
    return this.listPatchLifecycles({
      status: "pending_adjudication"
    });
  }

  public listApprovedForPersistenceLifecycles(): KnowledgePatchLifecycleRecord[] {
    return this.listPatchLifecycles({
      status: "approved_for_persistence"
    });
  }

  public updatePatchRecord(
    input: UpdateKnowledgePatchRecordInput
  ): KnowledgePatchRecord | null {
    return this.store.updatePatchRecord(input);
  }

  public getPatchReviewRecord(patchId: string): KnowledgePatchReviewRecord | null {
    return this.store.getPatchReviewRecord(patchId);
  }

  public upsertPatchReviewRecord(
    input: UpsertKnowledgePatchReviewRecordInput
  ): KnowledgePatchReviewRecord {
    return this.store.upsertPatchReviewRecord(input);
  }

  public getPersistenceRecord(patchId: string): KnowledgePersistenceRecord | null {
    return this.store.getPersistenceRecord(patchId);
  }

  public upsertPersistenceRecord(
    input: UpsertKnowledgePersistenceRecordInput
  ): KnowledgePersistenceRecord {
    return this.store.upsertPersistenceRecord(input);
  }

  public createPendingRecordsFromExtraction(
    result: KnowledgeExtractionResult
  ): {
    patchRecords: KnowledgePatchRecord[];
    reviewRecords: KnowledgePatchReviewRecord[];
    persistenceRecords: KnowledgePersistenceRecord[];
  } {
    const patchRecords: KnowledgePatchRecord[] = [];
    const reviewRecords: KnowledgePatchReviewRecord[] = [];
    const persistenceRecords: KnowledgePersistenceRecord[] = [];

    for (const patch of result.patches) {
      const hasConflict = result.conflicts.some(
        (conflict) =>
          conflict.targetLevel === patch.targetLevel &&
          conflict.targetSlug === patch.targetSlug
      );

      const patchRecord = this.createPatchRecord({
        patch,
        status: hasConflict ? "conflict_marked" : "extracted"
      });
      const reviewRecord = this.upsertPatchReviewRecord({
        patchId: patch.id,
        validationResult: "pending",
        violations: [],
        warnings: hasConflict
          ? result.conflicts
              .filter(
                (conflict) =>
                  conflict.targetLevel === patch.targetLevel &&
                  conflict.targetSlug === patch.targetSlug
              )
              .map((conflict) => ({
                code: conflict.code,
                message: conflict.message
              }))
          : [],
        reviewDecision: hasConflict ? "conflict_marked" : "pending",
        reviewedBy: null,
        reviewComment: null,
        reviewedAt: null
      });
      const persistenceRecord = this.upsertPersistenceRecord({
        patchId: patch.id,
        persistResult: "pending",
        targetPath: null,
        persistedVersion: null,
        errorMessage: null,
        persistedAt: null
      });

      patchRecords.push(patchRecord);
      reviewRecords.push(reviewRecord);
      persistenceRecords.push(persistenceRecord);
    }

    return {
      patchRecords,
      reviewRecords,
      persistenceRecords
    };
  }

  public createPendingLifecyclesFromExtraction(
    result: KnowledgeExtractionResult
  ): KnowledgePatchLifecycleRecord[] {
    const created = this.createPendingRecordsFromExtraction(result);
    return created.patchRecords.map((patchRecord, index) => ({
      patchRecord,
      reviewRecord: created.reviewRecords[index] ?? null,
      persistenceRecord: created.persistenceRecords[index] ?? null
    }));
  }

  public applyGuardDecisionToPatch(
    patchId: string,
    decision: ArchitectureGuardDecision
  ): {
    patchRecord: KnowledgePatchRecord | null;
    reviewRecord: KnowledgePatchReviewRecord;
    persistenceRecord: KnowledgePersistenceRecord | null;
  } {
    const existingPatchRecord = this.getPatchRecord(patchId);
    const existingReviewRecord = this.getPatchReviewRecord(patchId);
    const existingPersistenceRecord = this.getPersistenceRecord(patchId);

    const nextReviewDecision =
      existingReviewRecord?.reviewDecision === "conflict_marked"
        ? "conflict_marked"
        : "pending";

    const reviewRecord = this.upsertPatchReviewRecord({
      patchId,
      validationResult: decision.ok ? "passed" : "failed",
      violations: decision.violations,
      warnings: decision.warnings,
      reviewDecision: nextReviewDecision,
      reviewedBy: existingReviewRecord?.reviewedBy ?? null,
      reviewComment: existingReviewRecord?.reviewComment ?? null,
      reviewedAt: existingReviewRecord?.reviewedAt ?? null
    });

    let patchRecord = existingPatchRecord;
    if (existingPatchRecord) {
      const nextStatus =
        existingPatchRecord.status === "conflict_marked"
          ? "conflict_marked"
          : decision.ok
            ? "pending_adjudication"
            : "validation_failed";
      patchRecord = this.updatePatchRecord({
        patchId,
        status: nextStatus
      });
    }

    return {
      patchRecord,
      reviewRecord,
      persistenceRecord: existingPersistenceRecord
    };
  }

  public applyGuardDecisionToPatchLifecycle(
    patchId: string,
    decision: ArchitectureGuardDecision
  ): KnowledgePatchLifecycleRecord | null {
    const updated = this.applyGuardDecisionToPatch(patchId, decision);
    if (!updated.patchRecord) {
      return null;
    }

    return {
      patchRecord: updated.patchRecord,
      reviewRecord: updated.reviewRecord,
      persistenceRecord: updated.persistenceRecord
    };
  }

  public adjudicatePatch(
    input: AdjudicateKnowledgePatchInput
  ): {
    patchRecord: KnowledgePatchRecord | null;
    reviewRecord: KnowledgePatchReviewRecord;
    persistenceRecord: KnowledgePersistenceRecord;
  } {
    const existingPatchRecord = this.getPatchRecord(input.patchId);
    const reviewedAt = input.reviewedAt ?? new Date().toISOString();
    const reviewRecord = this.upsertPatchReviewRecord({
      patchId: input.patchId,
      reviewDecision: input.decision,
      reviewedBy: input.reviewedBy,
      reviewComment: input.reviewComment ?? null,
      reviewedAt
    });

    const nextStatus =
      input.decision === "approved"
        ? "approved_for_persistence"
        : input.decision === "rejected"
          ? "rejected"
          : "conflict_marked";

    const patchRecord = existingPatchRecord
      ? this.updatePatchRecord({
          patchId: input.patchId,
          status: nextStatus
        })
      : null;

    const persistenceRecord = this.upsertPersistenceRecord({
      patchId: input.patchId,
      persistResult: input.decision === "approved" ? "pending" : "failed",
      errorMessage:
        input.decision === "approved"
          ? null
          : input.reviewComment ?? `Patch ${input.decision} during adjudication.`,
      persistedAt: null
    });

    return {
      patchRecord,
      reviewRecord,
      persistenceRecord
    };
  }

  public adjudicatePatchLifecycle(
    input: AdjudicateKnowledgePatchInput
  ): KnowledgePatchLifecycleRecord | null {
    const updated = this.adjudicatePatch(input);
    if (!updated.patchRecord) {
      return null;
    }

    return {
      patchRecord: updated.patchRecord,
      reviewRecord: updated.reviewRecord,
      persistenceRecord: updated.persistenceRecord
    };
  }

  public approvePatchForPersistence(
    patchId: string,
    reviewedBy: string,
    reviewComment?: string | null
  ) {
    return this.adjudicatePatch({
      patchId,
      decision: "approved",
      reviewedBy,
      reviewComment
    });
  }

  public rejectPatch(
    patchId: string,
    reviewedBy: string,
    reviewComment?: string | null
  ) {
    return this.adjudicatePatch({
      patchId,
      decision: "rejected",
      reviewedBy,
      reviewComment
    });
  }

  public markPatchConflict(
    patchId: string,
    reviewedBy: string,
    reviewComment?: string | null
  ) {
    return this.adjudicatePatch({
      patchId,
      decision: "conflict_marked",
      reviewedBy,
      reviewComment
    });
  }

  public executeApprovedPatchPersistence(
    patchId: string
  ): ExecuteKnowledgePatchPersistenceResult {
    const patchRecord = this.getPatchRecord(patchId);
    if (!patchRecord) {
      return {
        ok: false,
        patchId,
        status: "skipped",
        reason: "patch_not_found",
        targetPath: null,
        persistedVersion: null
      };
    }

    if (patchRecord.status !== "approved_for_persistence") {
      return {
        ok: false,
        patchId,
        status: "skipped",
        reason: `patch_status_${patchRecord.status}`,
        targetPath: null,
        persistedVersion: null
      };
    }

    try {
      const document = this.upsert({
        level: patchRecord.payload.targetLevel,
        slug: patchRecord.payload.targetSlug,
        title: patchRecord.payload.title,
        content: patchRecord.payload.content,
        summary: patchRecord.payload.summary,
        tags: patchRecord.payload.tags,
        ownerAgentId: patchRecord.payload.source.sourceAgentId,
        sourceKind: patchRecord.payload.source.type,
        sourceAgentId: patchRecord.payload.source.sourceAgentId,
        changeSummary: patchRecord.payload.summary
      });

      this.updatePatchRecord({
        patchId,
        status: "persisted"
      });
      this.upsertPersistenceRecord({
        patchId,
        targetPath: document.path,
        persistedVersion: document.version,
        persistResult: "succeeded",
        errorMessage: null,
        persistedAt: new Date().toISOString()
      });

      return {
        ok: true,
        patchId,
        status: "persisted",
        reason: "persisted",
        targetPath: document.path,
        persistedVersion: document.version
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "unknown_error";
      this.updatePatchRecord({
        patchId,
        status: "persistence_failed"
      });
      this.upsertPersistenceRecord({
        patchId,
        persistResult: "failed",
        errorMessage: message,
        persistedAt: new Date().toISOString()
      });

      return {
        ok: false,
        patchId,
        status: "persistence_failed",
        reason: message,
        targetPath: null,
        persistedVersion: null
      };
    }
  }

  public persistApprovedPatch(
    patchId: string
  ): ExecuteKnowledgePatchPersistenceResult {
    return this.executeApprovedPatchPersistence(patchId);
  }

  private assertValidSlug(slug: string): void {
    if (!/^[a-z0-9][a-z0-9-/_]*[a-z0-9]$/i.test(slug)) {
      throw coreErrors.invalidInput(
        `Knowledge slug "${slug}" must use letters, digits, "-", "_" or "/".`
      );
    }
  }
}

export class ExtractionService {
  public extract(candidate: KnowledgeExtractionCandidate): KnowledgeExtractionResult {
    const content = candidate.content.trim();
    if (!content) {
      return {
        accepted: false,
        reason: "empty_content",
        patches: [],
        conflicts: [],
        warnings: ["Knowledge extraction candidate content is empty."],
        candidates: []
      };
    }

    return {
      accepted: false,
      reason: "not_implemented",
      patches: [],
      conflicts: [],
      warnings: ["Knowledge extraction in KnowledgeService remains a placeholder."],
      candidates: []
    };
  }
}

export class GuardService {
  public check(input: KnowledgeGuardCheckInput): KnowledgeGuardResult {
    const violations: KnowledgeGuardViolation[] = [];
    if (!input.content.trim()) {
      violations.push({
        code: "EMPTY_CONTENT",
        message: "Knowledge content must not be empty."
      });
    }
    if (!input.slug.trim()) {
      violations.push({
        code: "EMPTY_SLUG",
        message: "Knowledge slug must not be empty."
      });
    }
    return {
      ok: violations.length === 0,
      violations
    };
  }

  public getLevelDescription(level: KnowledgeLevel): string {
    return KNOWLEDGE_LEVEL_TITLES[level];
  }
}
