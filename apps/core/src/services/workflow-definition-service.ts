import { randomUUID } from "node:crypto";
import type {
  CreateWorkflowDefinitionInput,
  UpdateWorkflowDefinitionInput,
  WorkflowDefinitionRecord,
  WorkflowEdgeDefinition,
  WorkflowNodeDefinition
} from "@loopmarshal/protocol";
import type { WorkflowDefinitionRepository } from "@loopmarshal/store";
import { coreErrors } from "../errors.js";

const builtinWorkflows: Array<Omit<WorkflowDefinitionRecord, "createdAt" | "updatedAt">> = [
  {
    id: "host-coordination-loop",
    name: "Host Coordination Loop",
    description: "Host waits for user instructions and worker reports, then plans, dispatches, resolves, and updates session insight through tools.",
    role: "host",
    nodes: [
      { id: "heartbeat", label: "Heartbeat", kind: "heartbeat" },
      { id: "claim", label: "Claim Message", kind: "claim_message" },
      { id: "idle", label: "Idle Backoff", kind: "idle" },
      { id: "present", label: "Present Message", kind: "present_message" },
      { id: "trace", label: "Trace Context", kind: "trace", config: { message: "Host received a message and is preparing coordination." } },
      { id: "process", label: "LLM Tool Loop", kind: "llm_tool_loop" },
      { id: "complete", label: "Complete Message", kind: "complete_message" }
    ],
    edges: [
      { from: "heartbeat", to: "claim" },
      { from: "claim", to: "idle", condition: "no_message" },
      { from: "claim", to: "present", condition: "has_message" },
      { from: "present", to: "trace" },
      { from: "trace", to: "process" },
      { from: "process", to: "complete" }
    ],
    enabled: true,
    builtin: true
  },
  {
    id: "worker-message-loop",
    name: "Worker Message Loop",
    description: "Worker waits for assigned tasks, runs the LLM/tool loop, and submits results back to the session.",
    role: "worker",
    nodes: [
      { id: "heartbeat", label: "Heartbeat", kind: "heartbeat" },
      { id: "claim", label: "Claim Task", kind: "claim_message" },
      { id: "idle", label: "Idle Backoff", kind: "idle" },
      { id: "present", label: "Present Task", kind: "present_message" },
      { id: "trace", label: "Trace Task", kind: "trace", config: { message: "Worker received a task and is preparing execution." } },
      { id: "process", label: "LLM Tool Loop", kind: "llm_tool_loop" },
      { id: "complete", label: "Complete Task", kind: "complete_message" }
    ],
    edges: [
      { from: "heartbeat", to: "claim" },
      { from: "claim", to: "idle", condition: "no_message" },
      { from: "claim", to: "present", condition: "has_message" },
      { from: "present", to: "trace" },
      { from: "trace", to: "process" },
      { from: "process", to: "complete" }
    ],
    enabled: true,
    builtin: true
  },
  {
    id: "knowledge-keeper-loop",
    name: "Knowledge Keeper Loop",
    description: "Knowledge keeper uses the worker loop with knowledge-maintenance system rules and knowledge/profile tools.",
    role: "knowledge_keeper",
    nodes: [
      { id: "heartbeat", label: "Heartbeat", kind: "heartbeat" },
      { id: "claim", label: "Claim Knowledge Task", kind: "claim_message" },
      { id: "idle", label: "Idle Backoff", kind: "idle" },
      { id: "present", label: "Present Knowledge Task", kind: "present_message" },
      { id: "trace", label: "Trace Knowledge Task", kind: "trace", config: { message: "Knowledge Keeper received a maintenance task." } },
      { id: "process", label: "LLM Tool Loop", kind: "llm_tool_loop" },
      { id: "complete", label: "Complete Knowledge Task", kind: "complete_message" }
    ],
    edges: [
      { from: "heartbeat", to: "claim" },
      { from: "claim", to: "idle", condition: "no_message" },
      { from: "claim", to: "present", condition: "has_message" },
      { from: "present", to: "trace" },
      { from: "trace", to: "process" },
      { from: "process", to: "complete" }
    ],
    enabled: true,
    builtin: true
  }
];

const supportedNodeKinds = new Set([
  "heartbeat",
  "claim_message",
  "idle",
  "present_message",
  "trace",
  "dispatch_message",
  "wait_for_message",
  "review_gate",
  "llm_tool_loop",
  "complete_message",
  "custom"
]);

export class WorkflowDefinitionService {
  public constructor(private readonly repository: WorkflowDefinitionRepository) {}

  public seedBuiltins(): void {
    const now = new Date().toISOString();
    for (const workflow of builtinWorkflows) {
      const existing = this.repository.findById(workflow.id);
      this.repository.upsert({
        ...workflow,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      });
    }
  }

  public create(input: CreateWorkflowDefinitionInput): WorkflowDefinitionRecord {
    const id = input.id ?? randomUUID();
    if (this.repository.findById(id)) {
      throw coreErrors.duplicateSessionName(id);
    }
    validateWorkflowDefinition(input.nodes, input.edges);
    const now = new Date().toISOString();
    const workflow: WorkflowDefinitionRecord = {
      id,
      name: input.name,
      description: input.description ?? null,
      role: input.role,
      nodes: input.nodes,
      edges: input.edges,
      enabled: true,
      builtin: false,
      createdAt: now,
      updatedAt: now
    };
    this.repository.upsert(workflow);
    return workflow;
  }

  public list(): WorkflowDefinitionRecord[] {
    return this.repository.listAll();
  }

  public get(id: string): WorkflowDefinitionRecord {
    const workflow = this.repository.findById(id);
    if (!workflow) throw coreErrors.invalidInput(`Workflow "${id}" not found.`);
    return workflow;
  }

  public update(id: string, input: UpdateWorkflowDefinitionInput): WorkflowDefinitionRecord {
    const existing = this.get(id);
    const nextNodes = input.nodes ?? existing.nodes;
    const nextEdges = input.edges ?? existing.edges;
    if (input.nodes !== undefined || input.edges !== undefined) {
      validateWorkflowDefinition(nextNodes, nextEdges);
    }
    this.repository.update(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.nodes !== undefined ? { nodesJson: JSON.stringify(input.nodes) } : {}),
      ...(input.edges !== undefined ? { edgesJson: JSON.stringify(input.edges) } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled ? 1 : 0 } : {}),
      ...(existing.builtin ? { builtin: 1 } : {})
    });
    return this.get(id);
  }

  public delete(id: string): { deleted: boolean } {
    const existing = this.get(id);
    if (existing.builtin) {
      throw coreErrors.invalidInput(`Builtin workflow "${id}" cannot be deleted.`);
    }
    this.repository.deleteById(id);
    return { deleted: true };
  }
}

function validateWorkflowDefinition(
  nodes: WorkflowNodeDefinition[],
  edges: WorkflowEdgeDefinition[]
): void {
  if (nodes.length === 0) {
    throw coreErrors.invalidInput("Workflow must contain at least one node.");
  }

  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (!node.id.trim()) {
      throw coreErrors.invalidInput("Workflow node id must not be empty.");
    }
    if (nodeIds.has(node.id)) {
      throw coreErrors.invalidInput(`Workflow node "${node.id}" is duplicated.`);
    }
    if (!node.label.trim()) {
      throw coreErrors.invalidInput(`Workflow node "${node.id}" label must not be empty.`);
    }
    if (!supportedNodeKinds.has(node.kind)) {
      throw coreErrors.invalidInput(`Workflow node "${node.id}" uses unsupported kind "${node.kind}".`);
    }
    nodeIds.add(node.id);
  }

  const conditionKeys = new Set<string>();
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (!nodeIds.has(edge.from)) {
      throw coreErrors.invalidInput(`Workflow edge source "${edge.from}" does not exist.`);
    }
    if (!nodeIds.has(edge.to)) {
      throw coreErrors.invalidInput(`Workflow edge target "${edge.to}" does not exist.`);
    }
    const conditionKey = `${edge.from}:${edge.condition ?? "__default__"}`;
    if (conditionKeys.has(conditionKey)) {
      throw coreErrors.invalidInput(`Workflow node "${edge.from}" has duplicated condition "${edge.condition ?? "default"}".`);
    }
    conditionKeys.add(conditionKey);
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
  }

  const terminalNodeIds = new Set(nodes.map((node) => node.id));
  for (const edge of edges) {
    terminalNodeIds.delete(edge.from);
  }
  if (terminalNodeIds.size === nodes.length && nodes.length > 1) {
    throw coreErrors.invalidInput("Workflow with multiple nodes must contain at least one edge.");
  }

  const reachable = new Set<string>();
  const queue = [nodes[0]!.id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    for (const next of adjacency.get(current) ?? []) {
      queue.push(next);
    }
  }
  const unreachable = nodes.find((node) => !reachable.has(node.id));
  if (unreachable) {
    throw coreErrors.invalidInput(`Workflow node "${unreachable.id}" is unreachable from start node "${nodes[0]!.id}".`);
  }
}
