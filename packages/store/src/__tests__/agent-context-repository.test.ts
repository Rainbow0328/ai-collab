import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { schemaDDL } from "../schema.js";
import { runMigrations } from "../migrations.js";
import { AgentContextRepository } from "../repositories/agent-context-repository.js";

function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(schemaDDL);
  runMigrations(db);
  return db;
}

describe("AgentContextRepository", () => {
  it("returns null for non-existent runtime", () => {
    const db = createTestDb();
    const repo = new AgentContextRepository(db);
    expect(repo.findByRuntimeId("non-existent")).toBeNull();
    db.close();
  });

  it("creates and retrieves a snapshot", () => {
    const db = createTestDb();
    const repo = new AgentContextRepository(db);

    const snapshot = repo.upsert({
      runtimeId: "rt-1",
      sessionId: "session-1",
      agentId: "agent-1",
      role: "host",
      conversationSummary: "User wants to build a chat app",
      recentTurns: [
        { role: "user", content: "Build a chat app", timestamp: "2024-01-01T00:00:00Z" },
        { role: "assistant", content: "I'll help you build that.", timestamp: "2024-01-01T00:00:01Z" },
      ],
      confirmedDecisions: ["Use React for frontend", "Use SQLite for database"],
      unresolvedQuestions: ["Should we use WebSocket or SSE?"],
      pendingActions: ["Design L1 architecture"],
    });

    expect(snapshot.runtimeId).toBe("rt-1");
    expect(snapshot.confirmedDecisions).toHaveLength(2);
    expect(snapshot.recentTurns).toHaveLength(2);

    const loaded = repo.findByRuntimeId("rt-1");
    expect(loaded).not.toBeNull();
    expect(loaded!.conversationSummary).toBe("User wants to build a chat app");
    expect(loaded!.confirmedDecisions).toEqual(["Use React for frontend", "Use SQLite for database"]);
    expect(loaded!.unresolvedQuestions).toEqual(["Should we use WebSocket or SSE?"]);
    expect(loaded!.recentTurns[0]!.role).toBe("user");
    expect(loaded!.recentTurns[0]!.content).toBe("Build a chat app");

    db.close();
  });

  it("upsert merges fields — only provided fields are updated", () => {
    const db = createTestDb();
    const repo = new AgentContextRepository(db);

    // Initial create
    repo.upsert({
      runtimeId: "rt-2",
      sessionId: "session-1",
      agentId: "agent-2",
      role: "host",
      confirmedDecisions: ["Decision A"],
      unresolvedQuestions: ["Question 1"],
    });

    // Partial update — only update confirmedDecisions
    const updated = repo.upsert({
      runtimeId: "rt-2",
      sessionId: "session-1",
      agentId: "agent-2",
      role: "host",
      confirmedDecisions: ["Decision A", "Decision B"],
    });

    // confirmedDecisions should be replaced (not merged)
    expect(updated.confirmedDecisions).toEqual(["Decision A", "Decision B"]);
    // unresolvedQuestions should be preserved from previous
    expect(updated.unresolvedQuestions).toEqual(["Question 1"]);

    db.close();
  });

  it("persists across 30 turns (multi-turn continuity simulation)", () => {
    const db = createTestDb();
    const repo = new AgentContextRepository(db);

    // Initialize
    repo.upsert({
      runtimeId: "rt-30",
      sessionId: "session-30",
      agentId: "agent-30",
      role: "host",
      confirmedDecisions: [],
      recentTurns: [],
    });

    // Simulate 30 turns
    for (let i = 1; i <= 30; i++) {
      const existing = repo.findByRuntimeId("rt-30")!;
      const recentTurns = [...existing.recentTurns];
      recentTurns.push({ role: "user", content: `User message ${i}` });
      recentTurns.push({ role: "assistant", content: `Assistant response ${i}` });

      // Keep only last 10 turns (window management simulation)
      const trimmed = recentTurns.slice(-10);

      repo.upsert({
        runtimeId: "rt-30",
        sessionId: "session-30",
        agentId: "agent-30",
        role: "host",
        recentTurns: trimmed,
        ...(i === 5 ? { confirmedDecisions: ["Confirmed at turn 5"] } : {}),
        lastProcessedMessageId: `msg-${i}`,
      });
    }

    const final = repo.findByRuntimeId("rt-30")!;
    // After 30 turns with 10-turn window, should have last 10 turns
    expect(final.recentTurns).toHaveLength(10);
    expect(final.recentTurns[0]!.content).toBe("User message 26");
    expect(final.recentTurns[9]!.content).toBe("Assistant response 30");
    // Confirmed decision from turn 5 should persist
    expect(final.confirmedDecisions).toEqual(["Confirmed at turn 5"]);
    // Last processed message should be msg-30
    expect(final.lastProcessedMessageId).toBe("msg-30");

    db.close();
  });

  it("survives service restart — snapshot persists in database", () => {
    const db = createTestDb();
    const repo1 = new AgentContextRepository(db);

    repo1.upsert({
      runtimeId: "rt-restart",
      sessionId: "session-restart",
      agentId: "agent-restart",
      role: "host",
      conversationSummary: "User confirmed architecture at turn 3",
      confirmedDecisions: ["Use React", "Use SQLite"],
      unresolvedQuestions: ["WebSocket vs SSE"],
    });

    // Simulate restart by creating a new repository instance with the same DB
    const repo2 = new AgentContextRepository(db);
    const loaded = repo2.findByRuntimeId("rt-restart");

    expect(loaded).not.toBeNull();
    expect(loaded!.conversationSummary).toBe("User confirmed architecture at turn 3");
    expect(loaded!.confirmedDecisions).toEqual(["Use React", "Use SQLite"]);
    expect(loaded!.unresolvedQuestions).toEqual(["WebSocket vs SSE"]);

    db.close();
  });

  it("deletes a snapshot by runtimeId", () => {
    const db = createTestDb();
    const repo = new AgentContextRepository(db);

    repo.upsert({
      runtimeId: "rt-delete",
      sessionId: "session-1",
      agentId: "agent-delete",
      role: "host",
    });
    expect(repo.findByRuntimeId("rt-delete")).not.toBeNull();

    repo.deleteByRuntimeId("rt-delete");
    expect(repo.findByRuntimeId("rt-delete")).toBeNull();

    db.close();
  });
});
