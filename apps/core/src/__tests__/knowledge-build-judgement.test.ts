import { describe, it, expect, beforeAll } from "vitest";
import { DatabaseSync } from "node:sqlite";

import { schemaDDL, KnowledgeBuildJudgementRepository } from "@ai-collab/store";
import { HostKnowledgeBuildService } from "../services/host-knowledge-build-service.js";

function createInMemoryDatabase(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(schemaDDL);
  return db;
}

describe("Knowledge Build Judgement", () => {
  let db: DatabaseSync;
  let judgementRepo: KnowledgeBuildJudgementRepository;
  let service: HostKnowledgeBuildService;

  const sessionId = "test-session-1";
  const hostAgentId = "host-agent-1";
  const otherHostAgentId = "host-agent-2";

  beforeAll(() => {
    db = createInMemoryDatabase();
    judgementRepo = new KnowledgeBuildJudgementRepository(db);
    service = new HostKnowledgeBuildService(judgementRepo);
  });

  describe("createJudgement", () => {
    it("Host 可以创建 user_message judgement", () => {
      const judgement = service.createJudgement({
        sessionId,
        source: "user_message",
        sourceMessageId: "msg-001",
        hostAgentId,
        knowledgeBuildRequired: true,
        targetLevels: ["l1"],
        sourceKind: "user_feedback",
        candidateRefs: ["l1/session-direction"],
        reason: "用户提出新功能",
        nextAction: "knowledge_upsert"
      });

      expect(judgement.id).toBeDefined();
      expect(judgement.sessionId).toBe(sessionId);
      expect(judgement.source).toBe("user_message");
      expect(judgement.sourceMessageId).toBe("msg-001");
      expect(judgement.knowledgeBuildRequired).toBe(true);
      expect(judgement.targetLevels).toEqual(["l1"]);
      expect(judgement.fulfilledAt).toBeNull();
    });

    it("user_message 缺少 sourceMessageId 被拒绝", () => {
      expect(() =>
        service.createJudgement({
          sessionId,
          source: "user_message",
          hostAgentId,
          knowledgeBuildRequired: true,
          targetLevels: ["l1"],
          sourceKind: "user_feedback",
          reason: "用户提出新功能",
          nextAction: "knowledge_upsert"
        })
      ).toThrow("sourceMessageId is required");
    });

    it("user_feedback 缺少 sourceMessageId 被拒绝", () => {
      expect(() =>
        service.createJudgement({
          sessionId,
          source: "user_feedback",
          hostAgentId,
          knowledgeBuildRequired: true,
          targetLevels: ["l1"],
          sourceKind: "user_feedback",
          reason: "用户反馈",
          nextAction: "knowledge_upsert"
        })
      ).toThrow("sourceMessageId is required");
    });

    it("worker_report 缺少 sourceMessageId 被拒绝", () => {
      expect(() =>
        service.createJudgement({
          sessionId,
          source: "worker_report",
          hostAgentId,
          knowledgeBuildRequired: true,
          targetLevels: ["l2"],
          sourceKind: "worker_report",
          reason: "Worker 回报",
          nextAction: "knowledge_upsert"
        })
      ).toThrow("sourceMessageId is required");
    });

    it("host_planning 可以没有 sourceMessageId", () => {
      const judgement = service.createJudgement({
        sessionId,
        source: "host_planning",
        hostAgentId,
        knowledgeBuildRequired: true,
        targetLevels: ["l1"],
        sourceKind: "host_update",
        reason: "Host 规划",
        nextAction: "knowledge_upsert"
      });

      expect(judgement.id).toBeDefined();
      expect(judgement.sourceMessageId).toBeUndefined();
    });

    it("knowledgeBuildRequired=true 且 targetLevels=[] 被拒绝", () => {
      expect(() =>
        service.createJudgement({
          sessionId,
          source: "user_message",
          sourceMessageId: "msg-002",
          hostAgentId,
          knowledgeBuildRequired: true,
          targetLevels: [],
          sourceKind: "user_feedback",
          reason: "用户提出新功能",
          nextAction: "knowledge_upsert"
        })
      ).toThrow("targetLevels is required");
    });

    it("knowledgeBuildRequired=true 且 sourceKind=none 被拒绝", () => {
      expect(() =>
        service.createJudgement({
          sessionId,
          source: "user_message",
          sourceMessageId: "msg-003",
          hostAgentId,
          knowledgeBuildRequired: true,
          targetLevels: ["l1"],
          sourceKind: "none",
          reason: "用户提出新功能",
          nextAction: "knowledge_upsert"
        })
      ).toThrow("sourceKind cannot be none");
    });

    it("knowledgeBuildRequired=false 且 nextAction=knowledge_upsert 被拒绝", () => {
      expect(() =>
        service.createJudgement({
          sessionId,
          source: "user_message",
          sourceMessageId: "msg-004",
          hostAgentId,
          knowledgeBuildRequired: false,
          targetLevels: [],
          sourceKind: "none",
          reason: "无需更新",
          nextAction: "knowledge_upsert"
        })
      ).toThrow("nextAction cannot be knowledge_upsert");
    });

    it("knowledgeBuildRequired=false 且 nextAction=knowledge_upsert_then_dispatch 被拒绝", () => {
      expect(() =>
        service.createJudgement({
          sessionId,
          source: "user_message",
          sourceMessageId: "msg-005",
          hostAgentId,
          knowledgeBuildRequired: false,
          targetLevels: [],
          sourceKind: "none",
          reason: "无需更新",
          nextAction: "knowledge_upsert_then_dispatch"
        })
      ).toThrow("nextAction cannot be knowledge_upsert or knowledge_upsert_then_dispatch");
    });

    it("knowledgeBuildRequired=false 且 nextAction=dispatch 成功", () => {
      const judgement = service.createJudgement({
        sessionId,
        source: "user_message",
        sourceMessageId: "msg-006",
        hostAgentId,
        knowledgeBuildRequired: false,
        targetLevels: [],
        sourceKind: "none",
        reason: "无需更新",
        nextAction: "dispatch"
      });

      expect(judgement.id).toBeDefined();
      expect(judgement.knowledgeBuildRequired).toBe(false);
      expect(judgement.nextAction).toBe("dispatch");
    });
  });

  describe("fulfilJudgement", () => {
    it("required judgement fulfil 时 knowledgeRefs=[] 被拒绝", () => {
      const judgement = service.createJudgement({
        sessionId,
        source: "user_message",
        sourceMessageId: "msg-fulfil-001",
        hostAgentId,
        knowledgeBuildRequired: true,
        targetLevels: ["l1"],
        sourceKind: "user_feedback",
        reason: "需要更新",
        nextAction: "knowledge_upsert"
      });

      expect(() =>
        service.fulfilJudgement({
          judgementId: judgement.id,
          hostAgentId,
          changeIds: [],
          knowledgeRefs: []
        })
      ).toThrow("knowledgeRefs is required");
    });

    it("required judgement fulfil 带合法 refs 成功", () => {
      const judgement = service.createJudgement({
        sessionId,
        source: "user_message",
        sourceMessageId: "msg-fulfil-002",
        hostAgentId,
        knowledgeBuildRequired: true,
        targetLevels: ["l1"],
        sourceKind: "user_feedback",
        reason: "需要更新",
        nextAction: "knowledge_upsert"
      });

      const result = service.fulfilJudgement({
        judgementId: judgement.id,
        hostAgentId,
        changeIds: [],
        knowledgeRefs: ["l1/session-direction"]
      });

      expect(result.fulfilledAt).not.toBeNull();
      expect(result.fulfilledKnowledgeRefs).toContain("l1/session-direction");
    });

    it("非同一 Host fulfil 被拒绝", () => {
      const judgement = service.createJudgement({
        sessionId,
        source: "user_message",
        sourceMessageId: "msg-fulfil-003",
        hostAgentId,
        knowledgeBuildRequired: true,
        targetLevels: ["l1"],
        sourceKind: "user_feedback",
        reason: "需要更新",
        nextAction: "knowledge_upsert"
      });

      expect(() =>
        service.fulfilJudgement({
          judgementId: judgement.id,
          hostAgentId: otherHostAgentId,
          changeIds: [],
          knowledgeRefs: ["l1/session-direction"]
        })
      ).toThrow("hostAgentId does not match");
    });

    it("fulfilled 后查询能看到 fulfilledAt 和 fulfilledKnowledgeRefs", () => {
      const judgement = service.createJudgement({
        sessionId,
        source: "user_message",
        sourceMessageId: "msg-fulfil-004",
        hostAgentId,
        knowledgeBuildRequired: true,
        targetLevels: ["l1", "l2"],
        sourceKind: "user_feedback",
        reason: "需要更新",
        nextAction: "knowledge_upsert"
      });

      const result = service.fulfilJudgement({
        judgementId: judgement.id,
        hostAgentId,
        changeIds: ["change-1"],
        knowledgeRefs: ["l1/session-direction", "l2/message-protocol"]
      });

      expect(result.fulfilledAt).not.toBeNull();
      expect(result.fulfilledKnowledgeRefs).toEqual([
        "l1/session-direction",
        "l2/message-protocol"
      ]);
      expect(result.fulfilledByChangeIds).toEqual(["change-1"]);

      const fetched = service.getJudgementById(judgement.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.fulfilledAt).not.toBeNull();
      expect(fetched!.fulfilledKnowledgeRefs).toHaveLength(2);
    });

    it("非法 ref 格式被拒绝", () => {
      const judgement = service.createJudgement({
        sessionId,
        source: "user_message",
        sourceMessageId: "msg-fulfil-005",
        hostAgentId,
        knowledgeBuildRequired: true,
        targetLevels: ["l1"],
        sourceKind: "user_feedback",
        reason: "需要更新",
        nextAction: "knowledge_upsert"
      });

      expect(() =>
        service.fulfilJudgement({
          judgementId: judgement.id,
          hostAgentId,
          changeIds: [],
          knowledgeRefs: ["invalid-ref"]
        })
      ).toThrow("Invalid knowledgeRef");
    });

    it("已经 fulfilled 的 judgement 不允许重复 fulfil", () => {
      const judgement = service.createJudgement({
        sessionId,
        source: "user_message",
        sourceMessageId: "msg-fulfil-006",
        hostAgentId,
        knowledgeBuildRequired: true,
        targetLevels: ["l1"],
        sourceKind: "user_feedback",
        reason: "需要更新",
        nextAction: "knowledge_upsert"
      });

      service.fulfilJudgement({
        judgementId: judgement.id,
        hostAgentId,
        changeIds: [],
        knowledgeRefs: ["l1/session-direction"]
      });

      expect(() =>
        service.fulfilJudgement({
          judgementId: judgement.id,
          hostAgentId,
          changeIds: [],
          knowledgeRefs: ["l1/session-direction"]
        })
      ).toThrow("already fulfilled");
    });
  });

  describe("assertDispatchAllowed", () => {
    it("无 currentMessageId 时直接放行", () => {
      expect(() =>
        service.assertDispatchAllowed(sessionId, hostAgentId, null)
      ).not.toThrow();
    });

    it("无 judgement 时拒绝派发", () => {
      expect(() =>
        service.assertDispatchAllowed(sessionId, hostAgentId, "msg-nonexistent")
      ).toThrow("has not completed knowledge build judgement");
    });

    it("knowledgeBuildRequired=true 且未 fulfil 时拒绝派发", () => {
      service.createJudgement({
        sessionId,
        source: "user_message",
        sourceMessageId: "msg-dispatch-001",
        hostAgentId,
        knowledgeBuildRequired: true,
        targetLevels: ["l1"],
        sourceKind: "user_feedback",
        reason: "需要更新",
        nextAction: "knowledge_upsert"
      });

      expect(() =>
        service.assertDispatchAllowed(sessionId, hostAgentId, "msg-dispatch-001")
      ).toThrow("has not been completed yet");
    });

    it("knowledgeBuildRequired=true 且已 fulfil 后允许派发", () => {
      const judgement = service.createJudgement({
        sessionId,
        source: "user_message",
        sourceMessageId: "msg-dispatch-002",
        hostAgentId,
        knowledgeBuildRequired: true,
        targetLevels: ["l1"],
        sourceKind: "user_feedback",
        reason: "需要更新",
        nextAction: "knowledge_upsert"
      });

      service.fulfilJudgement({
        judgementId: judgement.id,
        hostAgentId,
        changeIds: [],
        knowledgeRefs: ["l1/session-direction"]
      });

      expect(() =>
        service.assertDispatchAllowed(sessionId, hostAgentId, "msg-dispatch-002")
      ).not.toThrow();
    });

    it("knowledgeBuildRequired=false 且 nextAction=dispatch 时允许派发", () => {
      service.createJudgement({
        sessionId,
        source: "user_message",
        sourceMessageId: "msg-dispatch-003",
        hostAgentId,
        knowledgeBuildRequired: false,
        targetLevels: [],
        sourceKind: "none",
        reason: "无需更新",
        nextAction: "dispatch"
      });

      expect(() =>
        service.assertDispatchAllowed(sessionId, hostAgentId, "msg-dispatch-003")
      ).not.toThrow();
    });
  });
});
