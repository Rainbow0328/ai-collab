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
  SessionInsight,
  UpdateSessionInsightInput
} from "@ai-collab/protocol";
import {
  AgentRepository,
  SessionInsightRepository,
  SessionRepository
} from "@ai-collab/store";

import { coreErrors } from "../errors.js";

const now = (): string => {
  return new Date().toISOString();
};

export class SessionInsightService {
  public constructor(
    private readonly sessions: SessionRepository,
    private readonly agents: AgentRepository,
    private readonly sessionInsights: SessionInsightRepository
  ) {}

  public getSessionInsight(sessionId: string): SessionInsight {
    const session = this.sessions.findById(sessionId);
    if (!session) {
      throw coreErrors.sessionNotFound(sessionId);
    }

    return (
      this.sessionInsights.findBySessionId(sessionId) ?? {
        sessionId,
        objective: null,
        currentProjectUnderstanding: null,
        projectSummary: null,
        userIntentSummary: null,
        latestUserInput: null,
        latestReportSummary: null,
        recentUserInputs: [],
        unappliedUserInputs: [],
        userPreferences: [],
        acceptanceCriteria: [],
        constraints: [],
        completedItems: [],
        pendingItems: [],
        blockers: [],
        assumptions: [],
        latestUserDirectiveRevision: 0,
        appliedUserDirectiveRevision: 0,
        currentPlanRevision: 0,
        activePlanSummary: null,
        lastDispatchWorkerName: null,
        lastDispatchAgentId: null,
        lastDispatchMessageId: null,
        lastDispatchCorrelationId: null,
        lastDispatchTaskFocus: null,
        reviewStatus: "in_progress",
        reviewReason: null,
        readyForReview: false,
        updatedAt: session.updatedAt
      }
    );
  }

  public updateSessionInsight(input: UpdateSessionInsightInput): SessionInsight {
    const session = this.sessions.findById(input.sessionId);
    if (!session) {
      throw coreErrors.sessionNotFound(input.sessionId);
    }

    const actor = this.agents.findById(input.updatedByAgentId);
    if (!actor) {
      throw coreErrors.agentNotFound(input.updatedByAgentId);
    }
    if (actor.sessionId !== input.sessionId) {
      throw coreErrors.crossSessionAgent(input.updatedByAgentId, input.sessionId);
    }

    const updatedInsight = this.sessionInsights.upsert({
      ...input,
      updatedAt: now()
    });
    if (!updatedInsight) {
      throw coreErrors.sessionInsightConflict(input.sessionId);
    }

    return updatedInsight;
  }
}
