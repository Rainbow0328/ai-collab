import { describe, it, expect, beforeAll } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

import { schemaDDL } from "../../../../packages/store/src/schema.js";
import {
  SessionRepository,
  AgentRepository,
  MessageRepository,
  SessionInsightRepository,
  IdentityLeaseRepository,
  SessionBindingRepository,
  SkillRepository,
  AgentProfileRepository,
  ModelConfigRepository,
  MessageTraceRepository
} from "../../../../packages/store/src/index.js";

import { SessionService } from "../services/session-service.js";
import { SkillService } from "../services/skill-service.js";
import { MessageService } from "../services/message-service.js";
import { TraceService } from "../services/trace-service.js";

function createInMemoryDatabase(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(schemaDDL);
  return db;
}

describe("Smoke Tests", () => {
  let db: DatabaseSync;
  let sessionRepo: SessionRepository;
  let sessionService: SessionService;
  let skillService: SkillService;
  let messageService: MessageService;

  beforeAll(() => {
    db = createInMemoryDatabase();

    sessionRepo = new SessionRepository(db);
    const agentRepo = new AgentRepository(db);
    const messageRepo = new MessageRepository(db);
    const sessionInsightRepo = new SessionInsightRepository(db);
    const identityLeaseRepo = new IdentityLeaseRepository(db);
    const sessionBindingRepo = new SessionBindingRepository(db);
    const skillRepo = new SkillRepository(db);
    const agentProfileRepo = new AgentProfileRepository(db);
    const modelConfigRepo = new ModelConfigRepository(db);

    sessionService = new SessionService(
      db,
      sessionRepo,
      agentRepo,
      messageRepo,
      sessionInsightRepo,
      identityLeaseRepo,
      sessionBindingRepo,
      skillRepo,
      agentProfileRepo,
      modelConfigRepo
    );

    skillService = new SkillService(skillRepo);
    const messageTraceRepo = new MessageTraceRepository(db);
    const traceService = new TraceService(messageTraceRepo);
    messageService = new MessageService(sessionRepo, agentRepo, messageRepo, identityLeaseRepo, traceService);
  });

  describe("Session Skill Scope", () => {
    it("创建 Host 会话时显式传入 skillIds，session_skill_scopes 被写入", () => {
      const skill1 = skillService.create({
        name: "code-review",
        description: "Code review skill",
        path: "/skills/code-review",
        roleScope: "worker"
      });
      const skill2 = skillService.create({
        name: "test-gen",
        description: "Test generation skill",
        path: "/skills/test-gen",
        roleScope: "worker"
      });

      const result = sessionService.createSessionWithAgent({
        sessionName: "test-session-1",
        agentName: "host-agent",
        displayName: "Host",
        skillIds: [skill1.id, skill2.id]
      });

      const sessionSkills = skillService.getSessionSkills(result.session.id);
      expect(sessionSkills).toHaveLength(2);
      expect(sessionSkills.map((s) => s.skillId).sort()).toEqual(
        [skill1.id, skill2.id].sort()
      );
    });

    it("Worker 加入会话不会覆盖 Session Skill scope", () => {
      const skill1 = skillService.create({
        name: "code-review-2",
        description: "Code review skill",
        path: "/skills/code-review-2",
        roleScope: "worker"
      });

      const hostResult = sessionService.createSessionWithAgent({
        sessionName: "test-session-2",
        agentName: "host-agent-2",
        displayName: "Host",
        skillIds: [skill1.id]
      });

      sessionService.joinSessionWithAgent({
        sessionId: hostResult.session.id,
        agentName: "worker-agent",
        displayName: "Worker",
        role: "worker",
        roleDescription: "负责执行代码审查和测试生成任务"
      });

      const sessionSkills = skillService.getSessionSkills(hostResult.session.id);
      expect(sessionSkills).toHaveLength(1);
      expect(sessionSkills[0]!.skillId).toBe(skill1.id);
    });

    it("available-skills 只返回当前 Session 授权且启用的 Skill", () => {
      const skill1 = skillService.create({
        name: "code-review-3",
        description: "Code review skill",
        path: "/skills/code-review-3",
        roleScope: "worker"
      });
      const skill2 = skillService.create({
        name: "test-gen-3",
        description: "Test generation skill",
        path: "/skills/test-gen-3",
        roleScope: "worker"
      });

      const result = sessionService.createSessionWithAgent({
        sessionName: "test-session-3",
        agentName: "host-agent-3",
        displayName: "Host",
        skillIds: [skill1.id]
      });

      const availableSkills = skillService.listAvailableSessionSkills(result.session.id);
      expect(availableSkills).toHaveLength(1);
      expect(availableSkills[0]!.id).toBe(skill1.id);
    });

    it("Session 无 Skill scope 时，available-skills 返回空", () => {
      const result = sessionService.createSessionWithAgent({
        sessionName: "test-session-4",
        agentName: "host-agent-4",
        displayName: "Host"
      });

      const availableSkills = skillService.listAvailableSessionSkills(result.session.id);
      expect(availableSkills).toHaveLength(0);
    });
  });

  describe("Knowledge Feedback Message", () => {
    it("用户知识库反馈消息可发送到会话", () => {
      const sessionName = `test-session-kb-${randomUUID()}`;
      const result = sessionService.createSessionWithAgent({
        sessionName,
        agentName: "host-agent-kb",
        displayName: "Host"
      });

      expect(result.session.id).toBeDefined();
      expect(result.agent.id).toBeDefined();

      const foundSession = sessionRepo.findById(result.session.id);
      expect(foundSession).not.toBeNull();

      const message = messageService.sendMessage({
        sessionId: result.session.id,
        fromAgentId: result.agent.id,
        toAgentId: result.agent.id,
        type: "instruction",
        payload: {
          kind: "knowledge_feedback",
          source: "user",
          level: "project",
          slug: "test-project",
          content: "这个项目的技术栈是 React + TypeScript"
        }
      });

      expect(message).toBeDefined();
      expect(message.type).toBe("instruction");
      expect(message.payload).toHaveProperty("kind", "knowledge_feedback");
      expect(message.payload).toHaveProperty("source", "user");
    });
  });
});
