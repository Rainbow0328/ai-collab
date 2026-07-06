import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";

import { schemaDDL } from "../../../../packages/store/src/schema.js";
import { WorkflowDefinitionRepository } from "../../../../packages/store/src/index.js";
import { WorkflowDefinitionService } from "../services/workflow-definition-service.js";

function createService(): WorkflowDefinitionService {
  const db = new DatabaseSync(":memory:");
  db.exec(schemaDDL);
  return new WorkflowDefinitionService(new WorkflowDefinitionRepository(db));
}

describe("WorkflowDefinitionService", () => {
  it("rejects workflow edges that reference missing nodes", () => {
    const service = createService();

    expect(() =>
      service.create({
        id: "bad-workflow",
        name: "Bad Workflow",
        role: "worker",
        nodes: [
          { id: "claim", label: "Claim", kind: "claim_message" },
          { id: "process", label: "Process", kind: "llm_tool_loop" }
        ],
        edges: [
          { from: "claim", to: "missing", condition: "has_message" }
        ]
      })
    ).toThrow('Workflow edge target "missing" does not exist.');
  });

  it("persists a valid executable workflow definition", () => {
    const service = createService();

    const workflow = service.create({
      id: "valid-worker-loop",
      name: "Valid Worker Loop",
      role: "worker",
      nodes: [
        { id: "heartbeat", label: "Heartbeat", kind: "heartbeat" },
        { id: "claim", label: "Claim", kind: "claim_message" },
        { id: "idle", label: "Idle", kind: "idle" },
        { id: "process", label: "Process", kind: "llm_tool_loop" }
      ],
      edges: [
        { from: "heartbeat", to: "claim" },
        { from: "claim", to: "idle", condition: "no_message" },
        { from: "claim", to: "process", condition: "has_message" }
      ]
    });

    expect(workflow.id).toBe("valid-worker-loop");
    expect(service.get("valid-worker-loop").edges).toHaveLength(3);
  });

  it("accepts trace nodes with runtime config", () => {
    const service = createService();

    const workflow = service.create({
      id: "trace-worker-loop",
      name: "Trace Worker Loop",
      role: "worker",
      nodes: [
        { id: "claim", label: "Claim", kind: "claim_message" },
        { id: "trace", label: "Trace", kind: "trace", config: { message: "claimed", step: "Tracing", includePayload: true } },
        { id: "process", label: "Process", kind: "llm_tool_loop", config: { prompt: "Summarize this task" } }
      ],
      edges: [
        { from: "claim", to: "trace", condition: "has_message" },
        { from: "trace", to: "process" }
      ]
    });

    expect(workflow.nodes[1]?.kind).toBe("trace");
    expect(workflow.nodes[1]?.config).toHaveProperty("message", "claimed");
  });

  it("accepts gate and wait workflow nodes", () => {
    const service = createService();

    const workflow = service.create({
      id: "gated-host-loop",
      name: "Gated Host Loop",
      role: "host",
      nodes: [
        { id: "dispatch", label: "Dispatch", kind: "dispatch_message", config: { messageType: "task", message: "Run frontend task" } },
        { id: "wait", label: "Wait For Worker", kind: "wait_for_message", config: { messageType: "result", processingStatus: "processed" } },
        { id: "review", label: "Review Gate", kind: "review_gate", config: { reviewStatus: "ready_for_review" } }
      ],
      edges: [
        { from: "dispatch", to: "wait", condition: "sent" },
        { from: "wait", to: "review", condition: "ready" }
      ]
    });

    expect(workflow.nodes.map((node) => node.kind)).toEqual([
      "dispatch_message",
      "wait_for_message",
      "review_gate"
    ]);
  });

  it("rejects unreachable workflow nodes", () => {
    const service = createService();

    expect(() =>
      service.create({
        id: "unreachable-workflow",
        name: "Unreachable Workflow",
        role: "worker",
        nodes: [
          { id: "start", label: "Start", kind: "trace" },
          { id: "next", label: "Next", kind: "trace" },
          { id: "orphan", label: "Orphan", kind: "trace" }
        ],
        edges: [
          { from: "start", to: "next" }
        ]
      })
    ).toThrow('Workflow node "orphan" is unreachable from start node "start".');
  });

  it("rejects duplicated edge conditions from the same node", () => {
    const service = createService();

    expect(() =>
      service.create({
        id: "duplicate-condition-workflow",
        name: "Duplicate Condition Workflow",
        role: "worker",
        nodes: [
          { id: "claim", label: "Claim", kind: "claim_message" },
          { id: "a", label: "A", kind: "trace" },
          { id: "b", label: "B", kind: "trace" }
        ],
        edges: [
          { from: "claim", to: "a", condition: "ready" },
          { from: "claim", to: "b", condition: "ready" }
        ]
      })
    ).toThrow('Workflow node "claim" has duplicated condition "ready".');
  });
});
