import type {
  Agent,
  Session,
  MessageRecord,
  MessageType,
  Task,
  SessionInsight,
  AgentQueueStats,
  AttachSessionInput,
  JoinSessionByNameInput
} from "@ai-collab/protocol";
import { createAiCollabClient, AiCollabClient } from "@ai-collab/sdk";

let clientInstance: AiCollabClient | null = null;

export const getApiClient = (baseUrl?: string): AiCollabClient => {
  if (!clientInstance) {
    clientInstance = createAiCollabClient({
      baseUrl: baseUrl ?? (typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:42688"),
    });
  }
  return clientInstance;
};

export const api = {
  status: {
    get: () => getApiClient().getStatus(),
  },

  sessions: {
    list: () => getApiClient().listSessions(),
    get: (sessionId: string) => getApiClient().getSession(sessionId),
    getByName: (sessionName: string) => getApiClient().getSessionByName(sessionName),
    create: (input: AttachSessionInput) => getApiClient().attachSession(input),
    delete: (sessionName: string, requesterAgentId?: string) =>
      getApiClient().deleteSessionByName(sessionName, { requesterAgentId }),
    getMembers: (sessionId: string) => getApiClient().getMembers(sessionId),
    getQueueStats: (sessionId: string) => getApiClient().getSessionQueueStats(sessionId),
    getInsight: (sessionId: string) => getApiClient().getSessionInsight(sessionId),
    getConsole: (sessionId: string) => getApiClient().getSessionConsole(sessionId),
    listHeartbeats: (sessionId: string) => getApiClient().listHeartbeats(sessionId),
  },

  agents: {
    heartbeat: (agentId: string) => getApiClient().heartbeat(agentId),
    leave: (agentId: string) => getApiClient().leaveAgent(agentId),
    getInbox: (agentId: string) => getApiClient().getInbox(agentId),
  },

  messages: {
    list: (sessionId: string) => getApiClient().listMessages(sessionId),
    get: (messageId: string) => getApiClient().getMessageById(messageId),
    claimNext: (agentId: string, options?: { types?: MessageType[] }) =>
      getApiClient().claimNext(agentId, options),
    send: (input: import("@ai-collab/protocol").SendMessageInput) =>
      getApiClient().sendMessage(input),
    complete: (messageId: string, input: import("@ai-collab/protocol").MessageProcessCompleteInput) =>
      getApiClient().completeMessage(messageId, input),
    fail: (messageId: string, input: import("@ai-collab/protocol").MessageProcessFailInput) =>
      getApiClient().failMessage(messageId, input),
  },

  tasks: {
    list: (sessionId: string) => getApiClient().listTasks(sessionId),
  },

  progress: {
    upsert: (input: import("@ai-collab/protocol").UpsertProgressInput) =>
      getApiClient().upsertProgress(input),
    get: (sessionId: string, agentId: string) =>
      getApiClient().getProgress(sessionId, agentId),
    list: (filter?: import("@ai-collab/protocol").ListProgressFilter) =>
      getApiClient().listProgress(filter ?? {}),
    clear: (sessionId: string) => getApiClient().clearProgress(sessionId),
  },

  knowledge: {
    getManifest: () => getApiClient().getKnowledgeManifest(),
    list: (input?: import("@ai-collab/protocol").ListKnowledgeInput) =>
      getApiClient().listKnowledge(input),
    get: (level: import("@ai-collab/protocol").KnowledgeLevel, slug: string) =>
      getApiClient().getKnowledge(level, slug),
    listChanges: (input?: import("@ai-collab/protocol").ListKnowledgeChangesInput) =>
      getApiClient().listKnowledgeChanges(input),
  },

  workflows: {
    list: () => getApiClient().listWorkflows(),
    get: (workflowId: string) => getApiClient().getWorkflow(workflowId),
    create: (input: {
      id?: string;
      name: string;
      description?: string | null;
      role: import("@ai-collab/protocol").AgentRole;
      nodes: import("@ai-collab/protocol").WorkflowNodeDefinition[];
      edges: import("@ai-collab/protocol").WorkflowEdgeDefinition[];
      enabled?: boolean;
    }) => getApiClient().createWorkflow(input),
    update: (workflowId: string, input: {
      name?: string;
      description?: string | null;
      role?: import("@ai-collab/protocol").AgentRole;
      nodes?: import("@ai-collab/protocol").WorkflowNodeDefinition[];
      edges?: import("@ai-collab/protocol").WorkflowEdgeDefinition[];
      enabled?: boolean;
    }) => getApiClient().updateWorkflow(workflowId, input),
    delete: (workflowId: string) => getApiClient().deleteWorkflow(workflowId),
  },

  webRuntimes: {
    list: (sessionId?: string) => getApiClient().listWebAgentRuntimes(sessionId),
    create: (input: {
      sessionId: string;
      agentId: string;
      role: string;
      modelConfigId?: string;
      agentProfileId?: string | null;
      toolsetId?: string | null;
    }) => getApiClient().createWebAgentRuntime(input),
    get: (runtimeId: string) => getApiClient().getWebAgentRuntime(runtimeId),
    update: (runtimeId: string, input: {
      toolsetId?: string | null;
      modelConfigId?: string;
      status?: string;
      currentStep?: string | null;
      lastError?: string | null;
      lastTickAt?: string | null;
    }) => getApiClient().updateWebAgentRuntime(runtimeId, input),
    delete: (runtimeId: string) => getApiClient().deleteWebAgentRuntime(runtimeId),
    start: (runtimeId: string) => getApiClient().startWebAgentRuntime(runtimeId),
    pause: (runtimeId: string) => getApiClient().pauseWebAgentRuntime(runtimeId),
    stop: (runtimeId: string) => getApiClient().stopWebAgentRuntime(runtimeId),
  },

  userProfile: {
    get: (agentId: string) => getApiClient().getUserProfile(agentId),
    set: (key: string, value: string, agentId: string) =>
      getApiClient().setUserProfileEntry(agentId, key, value),
    delete: (key: string, agentId: string) =>
      getApiClient().deleteUserProfileEntry(agentId, key),
  },

  userPreferences: {
    list: (input?: import("@ai-collab/protocol").ListUserPreferencesInput) =>
      getApiClient().listUserPreferences(input),
    upsert: (key: string, input: Omit<import("@ai-collab/protocol").UpsertUserPreferenceInput, "key">) =>
      getApiClient().upsertUserPreference(key, input),
    delete: (key: string) => getApiClient().deleteUserPreference(key),
  },

  sessionWithAgent: {
    join: (input: {
      sessionId: string;
      role: string;
      agentName: string;
      displayName: string;
      modelConfigId?: string;
      agentProfileId?: string | null;
      roleDescription?: string | null;
    }) => getApiClient().joinSessionWithAgent(input),
    create: (input: {
      sessionName: string;
      agentName: string;
      displayName: string;
      modelConfigId?: string;
      agentProfileId?: string | null;
      roleDescription?: string | null;
    }) => getApiClient().createSessionWithAgent(input),
  },

  models: {
    list: () => getApiClient().listModels(),
  },

  mcpServers: {
    list: () => getApiClient().listMcpServers(),
    create: (input: { name: string; url: string; description?: string | null; transport?: "stdio" | "sse"; headers?: Record<string, string> | null; enabled?: boolean }) =>
      getApiClient().createMcpServer(input),
    update: (serverId: string, input: { name?: string; url?: string; description?: string | null; transport?: "stdio" | "sse"; headers?: Record<string, string> | null; enabled?: boolean }) =>
      getApiClient().updateMcpServer(serverId, input),
    delete: (serverId: string) => getApiClient().deleteMcpServer(serverId),
    listTools: (serverId: string) => getApiClient().listMcpServerTools(serverId),
  },

  agentProfiles: {
    get: (profileId: string) => getApiClient().getAgentProfile(profileId),
    list: () => getApiClient().listAgentProfiles(),
  },

  mcp: {
    call: (input: import("@ai-collab/protocol").McpCallRequest) =>
      getApiClient().callMcpTool(input),
    getTools: (options?: { toolsetId?: string; extraToolNames?: string[] }) =>
      getApiClient().getMcpTools(options),
  },

  llm: {
    chat: (input: {
      modelConfigId?: string;
      messages: Array<{ role: string; content: string }>;
      stream?: boolean;
      tools?: import("@ai-collab/protocol").McpToolDefinition[];
      tool_choice?: unknown;
      temperature?: number;
    }) => getApiClient().llmChat(input),
  },

  skills: {
    get: (skillId: string) => getApiClient().getSkill(skillId),
    list: () => getApiClient().listSkills(),
  },
} as const;

export type ApiClient = typeof api;

export default api;
