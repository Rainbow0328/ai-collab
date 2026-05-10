import type {
  KnowledgeBuildJudgement,
  CreateKnowledgeBuildJudgementInput,
  FulfillKnowledgeBuildJudgementInput
} from "@ai-collab/protocol";
import { KnowledgeBuildJudgementRepository } from "@ai-collab/store";

import { coreErrors } from "../errors.js";

const SOURCES_REQUIRING_MESSAGE_ID = new Set([
  "user_message",
  "user_feedback",
  "worker_report"
]);

const isKnowledgeRef = (value: string): boolean =>
  /^l[123]\/[^\s]+$/.test(value);

export class HostKnowledgeBuildService {
  public constructor(
    private readonly judgementRepo: KnowledgeBuildJudgementRepository
  ) {}

  public createJudgement(
    input: CreateKnowledgeBuildJudgementInput
  ): KnowledgeBuildJudgement {
    if (input.knowledgeBuildRequired && input.targetLevels.length === 0) {
      throw coreErrors.invalidInput(
        "targetLevels is required when knowledgeBuildRequired is true."
      );
    }

    if (
      !input.knowledgeBuildRequired &&
      (input.nextAction === "knowledge_upsert" ||
        input.nextAction === "knowledge_upsert_then_dispatch")
    ) {
      throw coreErrors.invalidInput(
        "nextAction cannot be knowledge_upsert or knowledge_upsert_then_dispatch when knowledgeBuildRequired is false."
      );
    }

    if (
      input.knowledgeBuildRequired &&
      input.sourceKind === "none"
    ) {
      throw coreErrors.invalidInput(
        "sourceKind cannot be none when knowledgeBuildRequired is true."
      );
    }

    if (
      SOURCES_REQUIRING_MESSAGE_ID.has(input.source) &&
      !input.sourceMessageId
    ) {
      throw coreErrors.invalidInput(
        `sourceMessageId is required when source is ${input.source}.`
      );
    }

    return this.judgementRepo.insert(input);
  }

  public listJudgements(sessionId: string): KnowledgeBuildJudgement[] {
    return this.judgementRepo.listBySessionId(sessionId);
  }

  public getJudgementBySourceMessage(
    sessionId: string,
    sourceMessageId: string
  ): KnowledgeBuildJudgement | null {
    return this.judgementRepo.getBySourceMessageId(sessionId, sourceMessageId);
  }

  public getJudgementById(id: string): KnowledgeBuildJudgement | null {
    return this.judgementRepo.getById(id);
  }

  public fulfilJudgement(
    input: FulfillKnowledgeBuildJudgementInput
  ): KnowledgeBuildJudgement {
    const judgement = this.judgementRepo.getById(input.judgementId);
    if (!judgement) {
      throw coreErrors.invalidInput(
        "Cannot fulfil judgement: judgement record not found."
      );
    }

    if (judgement.hostAgentId !== input.hostAgentId) {
      throw coreErrors.invalidInput(
        "Knowledge build judgement hostAgentId does not match the current host."
      );
    }

    if (judgement.knowledgeBuildRequired && input.knowledgeRefs.length === 0) {
      throw coreErrors.invalidInput(
        "knowledgeRefs is required when fulfilling a judgement with knowledgeBuildRequired true."
      );
    }

    for (const ref of input.knowledgeRefs) {
      if (!isKnowledgeRef(ref)) {
        throw coreErrors.invalidInput(
          `Invalid knowledgeRef "${ref}", must be l1/slug, l2/slug, or l3/slug.`
        );
      }
    }

    const result = this.judgementRepo.fulfil(input);
    if (!result) {
      throw coreErrors.invalidInput(
        "Cannot fulfil judgement: judgement record is already fulfilled."
      );
    }
    return result;
  }

  public checkDispatchGate(sessionId: string, hostAgentId: string): {
    allowed: boolean;
    reason: string | null;
    judgement: KnowledgeBuildJudgement | null;
  } {
    const judgements = this.judgementRepo.listBySessionId(sessionId);
    const latestJudgement = judgements.length > 0 ? judgements[0] : null;

    if (!latestJudgement) {
      return {
        allowed: true,
        reason: null,
        judgement: null
      };
    }

    if (latestJudgement.hostAgentId !== hostAgentId) {
      return {
        allowed: false,
        reason: "Knowledge build judgement hostAgentId does not match the current host.",
        judgement: latestJudgement
      };
    }

    if (
      latestJudgement.knowledgeBuildRequired &&
      !latestJudgement.fulfilledAt
    ) {
      return {
        allowed: false,
        reason: "Knowledge build judgement requires knowledge update, but it has not been completed yet.",
        judgement: latestJudgement
      };
    }

    return {
      allowed: true,
      reason: null,
      judgement: latestJudgement
    };
  }

  public assertDispatchAllowed(
    sessionId: string,
    hostAgentId: string,
    currentMessageId?: string | null
  ): void {
    if (!currentMessageId) {
      return;
    }

    const judgement = this.judgementRepo.getBySourceMessageId(
      sessionId,
      currentMessageId
    );

    if (!judgement) {
      throw coreErrors.invalidInput(
        "Current user message has not completed knowledge build judgement. Run ai-collab knowledge judge first."
      );
    }

    if (judgement.hostAgentId !== hostAgentId) {
      throw coreErrors.invalidInput(
        "Knowledge build judgement hostAgentId does not match the current host."
      );
    }

    if (
      judgement.knowledgeBuildRequired &&
      !judgement.fulfilledAt
    ) {
      throw coreErrors.invalidInput(
        "Knowledge build judgement requires knowledge update, but it has not been completed yet. Run ai-collab knowledge fulfil-judgement first."
      );
    }
  }
}
