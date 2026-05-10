import type { DatabaseSync } from "node:sqlite";
import type {
  KnowledgeBuildJudgement,
  CreateKnowledgeBuildJudgementInput,
  FulfillKnowledgeBuildJudgementInput
} from "@ai-collab/protocol";
import { randomUUID } from "node:crypto";

type JudgementRow = {
  id: string;
  session_id: string;
  source: string;
  source_message_id: string | null;
  host_agent_id: string;
  knowledge_build_required: number;
  target_levels_json: string;
  source_kind: string;
  candidate_refs_json: string;
  reason: string;
  next_action: string;
  fulfilled_at: string | null;
  fulfilled_by_change_ids_json: string;
  fulfilled_knowledge_refs_json: string;
  created_at: string;
};

export class KnowledgeBuildJudgementRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public insert(input: CreateKnowledgeBuildJudgementInput): KnowledgeBuildJudgement {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const targetLevelsJson = JSON.stringify(input.targetLevels);
    const candidateRefsJson = JSON.stringify(input.candidateRefs ?? []);

    const statement = this.database.prepare(`
      INSERT INTO knowledge_build_judgements (
        id, session_id, source, source_message_id, host_agent_id,
        knowledge_build_required, target_levels_json, source_kind,
        candidate_refs_json, reason, next_action, created_at
      )
      VALUES (
        @id, @sessionId, @source, @sourceMessageId, @hostAgentId,
        @knowledgeBuildRequired, @targetLevelsJson, @sourceKind,
        @candidateRefsJson, @reason, @nextAction, @createdAt
      )
    `);

    statement.run({
      id,
      sessionId: input.sessionId,
      source: input.source,
      sourceMessageId: input.sourceMessageId ?? null,
      hostAgentId: input.hostAgentId,
      knowledgeBuildRequired: input.knowledgeBuildRequired ? 1 : 0,
      targetLevelsJson,
      sourceKind: input.sourceKind,
      candidateRefsJson,
      reason: input.reason,
      nextAction: input.nextAction,
      createdAt
    });

    return {
      id,
      sessionId: input.sessionId,
      source: input.source,
      sourceMessageId: input.sourceMessageId,
      hostAgentId: input.hostAgentId,
      knowledgeBuildRequired: input.knowledgeBuildRequired,
      targetLevels: input.targetLevels,
      sourceKind: input.sourceKind,
      candidateRefs: input.candidateRefs ?? [],
      reason: input.reason,
      nextAction: input.nextAction,
      fulfilledAt: null,
      fulfilledByChangeIds: [],
      fulfilledKnowledgeRefs: [],
      createdAt
    };
  }

  public listBySessionId(sessionId: string): KnowledgeBuildJudgement[] {
    const statement = this.database.prepare(`
      SELECT * FROM knowledge_build_judgements
      WHERE session_id = ?
      ORDER BY created_at DESC
    `);
    const rows = statement.all(sessionId) as JudgementRow[];
    return rows.map((row) => this.mapRow(row));
  }

  public getBySourceMessageId(
    sessionId: string,
    sourceMessageId: string
  ): KnowledgeBuildJudgement | null {
    const statement = this.database.prepare(`
      SELECT * FROM knowledge_build_judgements
      WHERE session_id = ? AND source_message_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const row = statement.get(sessionId, sourceMessageId) as JudgementRow | undefined;
    return row ? this.mapRow(row) : null;
  }

  public getById(id: string): KnowledgeBuildJudgement | null {
    const statement = this.database.prepare(`
      SELECT * FROM knowledge_build_judgements
      WHERE id = ?
      LIMIT 1
    `);
    const row = statement.get(id) as JudgementRow | undefined;
    return row ? this.mapRow(row) : null;
  }

  public deleteBySessionId(sessionId: string): void {
    this.database.prepare("DELETE FROM knowledge_build_judgements WHERE session_id = ?").run(sessionId);
  }

  private mapRow(row: JudgementRow): KnowledgeBuildJudgement {
    return {
      id: row.id,
      sessionId: row.session_id,
      source: row.source as KnowledgeBuildJudgement["source"],
      sourceMessageId: row.source_message_id ?? undefined,
      hostAgentId: row.host_agent_id,
      knowledgeBuildRequired: row.knowledge_build_required === 1,
      targetLevels: JSON.parse(row.target_levels_json) as KnowledgeBuildJudgement["targetLevels"],
      sourceKind: row.source_kind as KnowledgeBuildJudgement["sourceKind"],
      candidateRefs: JSON.parse(row.candidate_refs_json) as string[],
      reason: row.reason,
      nextAction: row.next_action as KnowledgeBuildJudgement["nextAction"],
      fulfilledAt: row.fulfilled_at ?? null,
      fulfilledByChangeIds: JSON.parse(row.fulfilled_by_change_ids_json) as string[],
      fulfilledKnowledgeRefs: JSON.parse(row.fulfilled_knowledge_refs_json) as string[],
      createdAt: row.created_at
    };
  }

  public fulfil(input: FulfillKnowledgeBuildJudgementInput): KnowledgeBuildJudgement | null {
    const fulfilledAt = new Date().toISOString();
    const changeIdsJson = JSON.stringify(input.changeIds);
    const knowledgeRefsJson = JSON.stringify(input.knowledgeRefs);

    const statement = this.database.prepare(`
      UPDATE knowledge_build_judgements
      SET fulfilled_at = @fulfilledAt,
          fulfilled_by_change_ids_json = @changeIdsJson,
          fulfilled_knowledge_refs_json = @knowledgeRefsJson
      WHERE id = @judgementId
        AND host_agent_id = @hostAgentId
        AND fulfilled_at IS NULL
      RETURNING *
    `);

    const row = statement.get({
      judgementId: input.judgementId,
      hostAgentId: input.hostAgentId,
      fulfilledAt,
      changeIdsJson,
      knowledgeRefsJson
    }) as JudgementRow | undefined;

    return row ? this.mapRow(row) : null;
  }
}
