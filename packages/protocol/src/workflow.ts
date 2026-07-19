import type { AgentRole } from "./types.js";

export type WorkflowNodeKind =
  | "heartbeat"
  | "claim_message"
  | "idle"
  | "present_message"
  | "trace"
  | "dispatch_message"
  | "wait_for_message"
  | "review_gate"
  | "llm_tool_loop"
  | "complete_message"
  | "custom";

export type WorkflowNodeDefinition = {
  id: string;
  label: string;
  kind: WorkflowNodeKind;
  config?: Record<string, unknown>;
};

export type WorkflowEdgeDefinition = {
  from: string;
  to: string;
  condition?: string | null;
};

export type WorkflowDefinitionRecord = {
  id: string;
  name: string;
  description: string | null;
  role: AgentRole;
  nodes: WorkflowNodeDefinition[];
  edges: WorkflowEdgeDefinition[];
  enabled: boolean;
  builtin: boolean;
  /**
   * 'active' = connected to the execution path (AgentWorkflowRegistry)
   * 'planning' = stored in DB but not yet connected to execution
   * Builtin workflows are currently 'planning' — the actual execution
   * path uses the hardcoded LangGraph StateGraph in AgentWorkflowRegistry.
   */
  status: "active" | "planning";
  createdAt: string;
  updatedAt: string;
};

export type CreateWorkflowDefinitionInput = {
  id?: string;
  name: string;
  description?: string | null;
  role: AgentRole;
  nodes: WorkflowNodeDefinition[];
  edges: WorkflowEdgeDefinition[];
};

export type UpdateWorkflowDefinitionInput = {
  name?: string;
  description?: string | null;
  role?: AgentRole;
  nodes?: WorkflowNodeDefinition[];
  edges?: WorkflowEdgeDefinition[];
  enabled?: boolean;
};
