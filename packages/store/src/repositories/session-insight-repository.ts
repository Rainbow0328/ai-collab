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
import type { DatabaseSync } from "node:sqlite";

import type {
  ReviewStatus,
  SessionInsight,
  UpdateSessionInsightInput
} from "@loopmarshal/protocol";

type SessionInsightRow = {
  sessionId: string;
  objective: string | null;
  currentProjectUnderstanding: string | null;
  projectSummary: string | null;
  userIntentSummary: string | null;
  latestUserInput: string | null;
  latestReportSummary: string | null;
  recentUserInputsJson: string;
  unappliedUserInputsJson: string;
  userPreferencesJson: string;
  acceptanceCriteriaJson: string;
  constraintsJson: string;
  completedItemsJson: string;
  pendingItemsJson: string;
  blockersJson: string;
  assumptionsJson: string;
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
  readyForReview: number;
  lastUpdatedByAgentId: string | null;
  updatedAt: string;
};

const parseJsonArray = (value: string): string[] => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
};

export class SessionInsightRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public findBySessionId(sessionId: string): SessionInsight | null {
    const statement = this.database.prepare(`
      SELECT
        session_id AS sessionId,
        objective,
        current_project_understanding AS currentProjectUnderstanding,
        project_summary AS projectSummary,
        user_intent_summary AS userIntentSummary,
        latest_user_input AS latestUserInput,
        latest_report_summary AS latestReportSummary,
        recent_user_inputs_json AS recentUserInputsJson,
        unapplied_user_inputs_json AS unappliedUserInputsJson,
        user_preferences_json AS userPreferencesJson,
        acceptance_criteria_json AS acceptanceCriteriaJson,
        constraints_json AS constraintsJson,
        completed_items_json AS completedItemsJson,
        pending_items_json AS pendingItemsJson,
        blockers_json AS blockersJson,
        assumptions_json AS assumptionsJson,
        latest_user_directive_revision AS latestUserDirectiveRevision,
        applied_user_directive_revision AS appliedUserDirectiveRevision,
        current_plan_revision AS currentPlanRevision,
        active_plan_summary AS activePlanSummary,
        last_dispatch_worker_name AS lastDispatchWorkerName,
        last_dispatch_agent_id AS lastDispatchAgentId,
        last_dispatch_message_id AS lastDispatchMessageId,
        last_dispatch_correlation_id AS lastDispatchCorrelationId,
        last_dispatch_task_focus AS lastDispatchTaskFocus,
        review_status AS reviewStatus,
        review_reason AS reviewReason,
        ready_for_review AS readyForReview,
        last_updated_by_agent_id AS lastUpdatedByAgentId,
        updated_at AS updatedAt
      FROM session_insights
      WHERE session_id = ?
    `);

    const row = statement.get(sessionId) as SessionInsightRow | undefined;
    return row ? this.mapRow(row) : null;
  }

  public upsert(
    input: UpdateSessionInsightInput & { updatedAt: string }
  ): SessionInsight | null {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.findBySessionId(input.sessionId);
      if (
        input.expectedUpdatedAt !== undefined &&
        existing?.updatedAt !== input.expectedUpdatedAt
      ) {
        this.database.exec("ROLLBACK");
        return null;
      }

      if (input.expectedUpdatedAt !== undefined && !existing) {
        this.database.exec("ROLLBACK");
        return null;
      }

      const merged = this.buildMergedInsight(existing, input);
      this.writeMergedInsight(merged);
      this.database.exec("COMMIT");
      return merged;
    } catch (error) {
      this.safeRollback();
      throw error;
    }
  }

  public deleteBySessionId(sessionId: string): void {
    const statement = this.database.prepare(`
      DELETE FROM session_insights
      WHERE session_id = ?
    `);

    statement.run(sessionId);
  }

  public clearDispatchForAgent(
    sessionId: string,
    agentId: string,
    updatedAt: string
  ): void {
    const statement = this.database.prepare(`
      UPDATE session_insights
      SET last_dispatch_worker_name = NULL,
          last_dispatch_agent_id = NULL,
          last_dispatch_message_id = NULL,
          last_dispatch_correlation_id = NULL,
          last_dispatch_task_focus = NULL,
          updated_at = @updatedAt
      WHERE session_id = @sessionId
        AND last_dispatch_agent_id = @agentId
    `);

    statement.run({
      sessionId,
      agentId,
      updatedAt
    });
  }

  private buildMergedInsight(
    existing: SessionInsight | null,
    input: UpdateSessionInsightInput & { updatedAt: string }
  ): SessionInsight {
    const mergeMode = input.mergeMode ?? "replace";
    return {
      sessionId: input.sessionId,
      objective:
        input.objective !== undefined
          ? input.objective
          : existing?.objective ?? null,
      currentProjectUnderstanding:
        input.currentProjectUnderstanding !== undefined
          ? input.currentProjectUnderstanding
          : existing?.currentProjectUnderstanding ?? null,
      projectSummary:
        input.projectSummary !== undefined
          ? input.projectSummary
          : existing?.projectSummary ?? null,
      userIntentSummary:
        input.userIntentSummary !== undefined
          ? input.userIntentSummary
          : existing?.userIntentSummary ?? null,
      latestUserInput:
        input.latestUserInput !== undefined
          ? input.latestUserInput
          : existing?.latestUserInput ?? null,
      latestReportSummary:
        input.latestReportSummary !== undefined
          ? input.latestReportSummary
          : existing?.latestReportSummary ?? null,
      recentUserInputs: this.mergeArray(
        existing?.recentUserInputs ?? [],
        input.recentUserInputs,
        mergeMode,
        12
      ),
      unappliedUserInputs: this.mergeArray(
        existing?.unappliedUserInputs ?? [],
        input.unappliedUserInputs,
        mergeMode,
        12
      ),
      userPreferences: this.mergeArray(
        existing?.userPreferences ?? [],
        input.userPreferences,
        mergeMode
      ),
      acceptanceCriteria: this.mergeArray(
        existing?.acceptanceCriteria ?? [],
        input.acceptanceCriteria,
        mergeMode
      ),
      constraints: this.mergeArray(existing?.constraints ?? [], input.constraints, mergeMode),
      completedItems: this.mergeArray(
        existing?.completedItems ?? [],
        input.completedItems,
        mergeMode
      ),
      pendingItems: this.mergeArray(existing?.pendingItems ?? [], input.pendingItems, mergeMode),
      blockers: this.mergeArray(existing?.blockers ?? [], input.blockers, mergeMode),
      assumptions: this.mergeArray(existing?.assumptions ?? [], input.assumptions, mergeMode),
      latestUserDirectiveRevision:
        input.latestUserDirectiveRevision ??
        existing?.latestUserDirectiveRevision ??
        0,
      appliedUserDirectiveRevision:
        input.appliedUserDirectiveRevision ??
        existing?.appliedUserDirectiveRevision ??
        0,
      currentPlanRevision:
        input.currentPlanRevision ??
        existing?.currentPlanRevision ??
        0,
      activePlanSummary:
        input.activePlanSummary !== undefined
          ? input.activePlanSummary
          : existing?.activePlanSummary ?? null,
      lastDispatchWorkerName:
        input.lastDispatchWorkerName !== undefined
          ? input.lastDispatchWorkerName
          : existing?.lastDispatchWorkerName ?? null,
      lastDispatchAgentId:
        input.lastDispatchAgentId !== undefined
          ? input.lastDispatchAgentId
          : existing?.lastDispatchAgentId ?? null,
      lastDispatchMessageId:
        input.lastDispatchMessageId !== undefined
          ? input.lastDispatchMessageId
          : existing?.lastDispatchMessageId ?? null,
      lastDispatchCorrelationId:
        input.lastDispatchCorrelationId !== undefined
          ? input.lastDispatchCorrelationId
          : existing?.lastDispatchCorrelationId ?? null,
      lastDispatchTaskFocus:
        input.lastDispatchTaskFocus !== undefined
          ? input.lastDispatchTaskFocus
          : existing?.lastDispatchTaskFocus ?? null,
      reviewStatus: input.reviewStatus ?? existing?.reviewStatus ?? "in_progress",
      reviewReason:
        input.reviewReason !== undefined
          ? input.reviewReason
          : existing?.reviewReason ?? null,
      readyForReview:
        input.readyForReview ?? existing?.readyForReview ?? false,
      lastUpdatedByAgentId: input.updatedByAgentId,
      updatedAt: input.updatedAt
    } satisfies SessionInsight;
  }

  private writeMergedInsight(merged: SessionInsight): void {
    const statement = this.database.prepare(`
      INSERT INTO session_insights (
        session_id,
        objective,
        current_project_understanding,
        project_summary,
        user_intent_summary,
        latest_user_input,
        latest_report_summary,
        recent_user_inputs_json,
        unapplied_user_inputs_json,
        user_preferences_json,
        acceptance_criteria_json,
        constraints_json,
        completed_items_json,
        pending_items_json,
        blockers_json,
        assumptions_json,
        latest_user_directive_revision,
        applied_user_directive_revision,
        current_plan_revision,
        active_plan_summary,
        last_dispatch_worker_name,
        last_dispatch_agent_id,
        last_dispatch_message_id,
        last_dispatch_correlation_id,
        last_dispatch_task_focus,
        review_status,
        review_reason,
        ready_for_review,
        last_updated_by_agent_id,
        updated_at
      ) VALUES (
        @sessionId,
        @objective,
        @currentProjectUnderstanding,
        @projectSummary,
        @userIntentSummary,
        @latestUserInput,
        @latestReportSummary,
        @recentUserInputsJson,
        @unappliedUserInputsJson,
        @userPreferencesJson,
        @acceptanceCriteriaJson,
        @constraintsJson,
        @completedItemsJson,
        @pendingItemsJson,
        @blockersJson,
        @assumptionsJson,
        @latestUserDirectiveRevision,
        @appliedUserDirectiveRevision,
        @currentPlanRevision,
        @activePlanSummary,
        @lastDispatchWorkerName,
        @lastDispatchAgentId,
        @lastDispatchMessageId,
        @lastDispatchCorrelationId,
        @lastDispatchTaskFocus,
        @reviewStatus,
        @reviewReason,
        @readyForReview,
        @lastUpdatedByAgentId,
        @updatedAt
      )
      ON CONFLICT(session_id) DO UPDATE SET
        objective = excluded.objective,
        current_project_understanding = excluded.current_project_understanding,
        project_summary = excluded.project_summary,
        user_intent_summary = excluded.user_intent_summary,
        latest_user_input = excluded.latest_user_input,
        latest_report_summary = excluded.latest_report_summary,
        recent_user_inputs_json = excluded.recent_user_inputs_json,
        unapplied_user_inputs_json = excluded.unapplied_user_inputs_json,
        user_preferences_json = excluded.user_preferences_json,
        acceptance_criteria_json = excluded.acceptance_criteria_json,
        constraints_json = excluded.constraints_json,
        completed_items_json = excluded.completed_items_json,
        pending_items_json = excluded.pending_items_json,
        blockers_json = excluded.blockers_json,
        assumptions_json = excluded.assumptions_json,
        latest_user_directive_revision = excluded.latest_user_directive_revision,
        applied_user_directive_revision = excluded.applied_user_directive_revision,
        current_plan_revision = excluded.current_plan_revision,
        active_plan_summary = excluded.active_plan_summary,
        last_dispatch_worker_name = excluded.last_dispatch_worker_name,
        last_dispatch_agent_id = excluded.last_dispatch_agent_id,
        last_dispatch_message_id = excluded.last_dispatch_message_id,
        last_dispatch_correlation_id = excluded.last_dispatch_correlation_id,
        last_dispatch_task_focus = excluded.last_dispatch_task_focus,
        review_status = excluded.review_status,
        review_reason = excluded.review_reason,
        ready_for_review = excluded.ready_for_review,
        last_updated_by_agent_id = excluded.last_updated_by_agent_id,
        updated_at = excluded.updated_at
    `);

    statement.run({
      sessionId: merged.sessionId,
      objective: merged.objective,
      currentProjectUnderstanding: merged.currentProjectUnderstanding,
      projectSummary: merged.projectSummary,
      userIntentSummary: merged.userIntentSummary,
      latestUserInput: merged.latestUserInput,
      latestReportSummary: merged.latestReportSummary,
      recentUserInputsJson: JSON.stringify(merged.recentUserInputs),
      unappliedUserInputsJson: JSON.stringify(merged.unappliedUserInputs),
      userPreferencesJson: JSON.stringify(merged.userPreferences),
      acceptanceCriteriaJson: JSON.stringify(merged.acceptanceCriteria),
      constraintsJson: JSON.stringify(merged.constraints),
      completedItemsJson: JSON.stringify(merged.completedItems),
      pendingItemsJson: JSON.stringify(merged.pendingItems),
      blockersJson: JSON.stringify(merged.blockers),
      assumptionsJson: JSON.stringify(merged.assumptions),
      latestUserDirectiveRevision: merged.latestUserDirectiveRevision,
      appliedUserDirectiveRevision: merged.appliedUserDirectiveRevision,
      currentPlanRevision: merged.currentPlanRevision,
      activePlanSummary: merged.activePlanSummary,
      lastDispatchWorkerName: merged.lastDispatchWorkerName,
      lastDispatchAgentId: merged.lastDispatchAgentId,
      lastDispatchMessageId: merged.lastDispatchMessageId,
      lastDispatchCorrelationId: merged.lastDispatchCorrelationId,
      lastDispatchTaskFocus: merged.lastDispatchTaskFocus,
      reviewStatus: merged.reviewStatus,
      reviewReason: merged.reviewReason,
      readyForReview: merged.readyForReview ? 1 : 0,
      lastUpdatedByAgentId: merged.lastUpdatedByAgentId ?? null,
      updatedAt: merged.updatedAt
    });
  }

  private mergeArray(
    existing: string[],
    incoming: string[] | undefined,
    mergeMode: "replace" | "append",
    limit?: number
  ) {
    if (incoming === undefined) {
      const normalizedExisting = existing
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      if (limit && normalizedExisting.length > limit) {
        return normalizedExisting.slice(normalizedExisting.length - limit);
      }

      return normalizedExisting;
    }

    const normalize = (values: string[]) =>
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

    const distinct =
      mergeMode === "replace"
        ? [...new Set(normalize(incoming ?? []))]
        : [...new Set([...normalize(existing), ...normalize(incoming ?? [])])];

    if (limit && distinct.length > limit) {
      return distinct.slice(distinct.length - limit);
    }

    return distinct;
  }

  private mapRow(row: SessionInsightRow): SessionInsight {
    return {
      sessionId: row.sessionId,
      objective: row.objective,
      currentProjectUnderstanding: row.currentProjectUnderstanding,
      projectSummary: row.projectSummary,
      userIntentSummary: row.userIntentSummary,
      latestUserInput: row.latestUserInput,
      latestReportSummary: row.latestReportSummary,
      recentUserInputs: parseJsonArray(row.recentUserInputsJson),
      unappliedUserInputs: parseJsonArray(row.unappliedUserInputsJson),
      userPreferences: parseJsonArray(row.userPreferencesJson),
      acceptanceCriteria: parseJsonArray(row.acceptanceCriteriaJson),
      constraints: parseJsonArray(row.constraintsJson),
      completedItems: parseJsonArray(row.completedItemsJson),
      pendingItems: parseJsonArray(row.pendingItemsJson),
      blockers: parseJsonArray(row.blockersJson),
      assumptions: parseJsonArray(row.assumptionsJson),
      latestUserDirectiveRevision: row.latestUserDirectiveRevision,
      appliedUserDirectiveRevision: row.appliedUserDirectiveRevision,
      currentPlanRevision: row.currentPlanRevision,
      activePlanSummary: row.activePlanSummary,
      lastDispatchWorkerName: row.lastDispatchWorkerName,
      lastDispatchAgentId: row.lastDispatchAgentId,
      lastDispatchMessageId: row.lastDispatchMessageId,
      lastDispatchCorrelationId: row.lastDispatchCorrelationId,
      lastDispatchTaskFocus: row.lastDispatchTaskFocus,
      reviewStatus: row.reviewStatus,
      reviewReason: row.reviewReason,
      readyForReview: row.readyForReview === 1,
      ...(row.lastUpdatedByAgentId
        ? { lastUpdatedByAgentId: row.lastUpdatedByAgentId }
        : {}),
      updatedAt: row.updatedAt
    };
  }

  private safeRollback(): void {
    try {
      this.database.exec("ROLLBACK");
    } catch {
      // Ignore rollback errors when the transaction has already been closed.
    }
  }
}
