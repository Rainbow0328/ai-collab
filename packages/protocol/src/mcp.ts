/**
 * MCP (Model Context Protocol) 工具调用类型定义
 *
 * 用于网页 Agent Runtime 通过 LLM tool_call 自主执行协作操作。
 * 内置工具映射到现有 REST API，外部工具连接到 MCP Server。
 */

/** MCP 工具参数的 JSON Schema 定义 */
export type McpToolParameterSchema = {
  type: "object";
  properties: Record<string, {
    type: string;
    description?: string;
    enum?: string[];
    items?: { type: string; description?: string; enum?: string[] };
    default?: unknown;
  }>;
  required?: string[];
};

/** MCP 工具定义（LLM 可调用的工具描述） */
export type McpToolDefinition = {
  name: string;
  description: string;
  parameters: McpToolParameterSchema;
};

/** MCP 工具集（按角色分组） */
export type McpToolsetId = "worker" | "host" | "knowledge_keeper" | "developer";

/** LLM 返回的 tool_call */
export type McpToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
};

/** MCP 工具执行结果 */
export type McpToolResult = {
  toolCallId: string;
  toolName: string;
  success: boolean;
  result: unknown;
  error?: string;
};

/** MCP 调用请求（前端 → POST /api/mcp/call） */
export type McpCallRequest = {
  agentId: string;
  sessionId: string;
  toolName: string;
  arguments: Record<string, unknown>;
};

/** MCP 调用响应（POST /api/mcp/call → 前端） */
export type McpCallResponse = {
  success: boolean;
  result: unknown;
  error?: string;
};

/** 外部 MCP Server 配置 */
export type McpServerConfig = {
  id: string;
  name: string;
  description: string | null;
  transport: "stdio" | "sse";
  url: string;
  headers?: Record<string, string> | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

/** 创建外部 MCP Server 输入 */
export type CreateMcpServerInput = {
  name: string;
  description?: string | null;
  transport: "stdio" | "sse";
  url: string;
  headers?: Record<string, string> | null;
};

/** 更新外部 MCP Server 输入 */
export type UpdateMcpServerInput = {
  name?: string;
  description?: string | null;
  transport?: "stdio" | "sse";
  url?: string;
  headers?: Record<string, string> | null;
  enabled?: boolean;
};

/** Agent ↔ MCP 工具绑定 */
export type AgentMcpBinding = {
  agentId: string;
  toolsetId: McpToolsetId | null;
  externalToolNames: string[];
};

/** Skill 定义 */
export type SkillDefinition = {
  id: string;
  name: string;
  description: string;
  category: string;
  prompt: string;
  toolIds: string[];
  enabled: boolean;
};

/** Agent 权限策略 */
export type AgentPermissionPolicy = {
  allowFileAccess?: boolean;
  allowNetworkAccess?: boolean;
  allowCodeExecution?: boolean;
  allowedDomains?: string[];
  maxTokensPerTurn?: number;
  knowledge?: {
    read?: boolean;
    write?: boolean;
    delete?: boolean;
  };
  messages?: {
    read?: boolean;
    send?: boolean;
    claim?: boolean;
    complete?: boolean;
    dispatchTask?: boolean;
  };
  filesystem?: {
    read?: boolean;
    write?: boolean;
    allowedPaths?: string[];
  };
  command?: {
    enabled?: boolean;
    background?: boolean;
    requireApproval?: boolean;
    allowedPrefixes?: string[];
  };
  [key: string]: unknown;
};

/** Agent 运行时策略 */
export type AgentRuntimePolicy = {
  maxTurns?: number;
  maxRetries?: number;
  idleTimeoutMs?: number;
  autoRestart?: boolean;
  workflowId?: string;
  pollIntervalSeconds?: number;
  maxToolCallRounds?: number;
  backgroundAllowed?: boolean;
  pauseOnError?: boolean;
  [key: string]: unknown;
};
