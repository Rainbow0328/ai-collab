import type {
  MessageType,
  KnowledgeLevel,
  McpToolDefinition,
  McpCallRequest,
  UpsertUserPreferenceInput,
  ListUserPreferencesInput,
  SendMessageInput,
  MessageProcessCompleteInput,
  MessageProcessFailInput,
  UpsertProgressInput,
  ListProgressFilter,
  AttachSessionInput,
} from "@loopmarshal/protocol";
import { createLoopMarshalClient, LoopMarshalClient } from "@loopmarshal/sdk";

let clientInstance: LoopMarshalClient | null = null;

export const getApiClient = (baseUrl?: string): LoopMarshalClient => {
  if (!clientInstance) {
    clientInstance = createLoopMarshalClient({
      baseUrl: baseUrl ?? (typeof window !== "undefined" ? window.location.origin : `http://${import.meta.env.VITE_LOOPMARSHAL_HOST ?? "127.0.0.1"}:${import.meta.env.VITE_LOOPMARSHAL_PORT ?? "42688"}`),
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
    send: (input: SendMessageInput) => getApiClient().sendMessage(input),
    complete: (messageId: string, input: MessageProcessCompleteInput) =>
      getApiClient().completeMessage(messageId, input),
    fail: (messageId: string, input: MessageProcessFailInput) =>
      getApiClient().failMessage(messageId, input),
  },

  tasks: {
    list: (sessionId: string) => getApiClient().listTasks(sessionId),
  },

  progress: {
    upsert: (input: UpsertProgressInput) => getApiClient().upsertProgress(input),
    get: (sessionId: string, agentId: string) => getApiClient().getProgress(sessionId, agentId),
    list: (filter?: ListProgressFilter) => getApiClient().listProgress(filter ?? {}),
    clear: (sessionId: string) => getApiClient().clearProgress(sessionId),
  },

  knowledge: {
    getManifest: () => getApiClient().getKnowledgeManifest(),
    list: (input?: { level?: KnowledgeLevel; tag?: string; query?: string }) =>
      getApiClient().listKnowledge(input ?? {}),
    get: (level: KnowledgeLevel, slug: string) => getApiClient().getKnowledge(level, slug),
    listChanges: (input?: { level?: KnowledgeLevel; slug?: string; limit?: number }) =>
      getApiClient().listKnowledgeChanges(input ?? {}),
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
      customDuty?: string | null;
      customSkillIds?: string[];
    }) => getApiClient().createWebAgentRuntime(input),
    get: (runtimeId: string) => getApiClient().getWebAgentRuntime(runtimeId),
    update: (runtimeId: string, input: {
      modelConfigId?: string;
      customDuty?: string | null;
      customSkillIds?: string[];
      status?: string;
    }) => getApiClient().updateWebAgentRuntime(runtimeId, input),
    delete: (runtimeId: string) => getApiClient().deleteWebAgentRuntime(runtimeId),
    start: (runtimeId: string) => getApiClient().startWebAgentRuntime(runtimeId),
    pause: (runtimeId: string) => getApiClient().pauseWebAgentRuntime(runtimeId),
    stop: (runtimeId: string) => getApiClient().stopWebAgentRuntime(runtimeId),
  },

  userPreferences: {
    list: (input?: ListUserPreferencesInput) => getApiClient().listUserPreferences(input),
    upsert: (key: string, input: Omit<UpsertUserPreferenceInput, "key">) =>
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
    create: (input: {
      name: string;
      provider: string;
      modelId: string;
      baseUrl?: string;
      apiKey?: string;
    }) => getApiClient().createModel(input),
    delete: (modelId: string) => getApiClient().deleteModel(modelId),
  },

  workflows: {
    list: () => getApiClient().listWorkflows(),
  },

  mcpServers: {
    list: () => getApiClient().listMcpServers(),
    create: (input: {
      name: string;
      url: string;
      description?: string | null;
      transport?: "sse";
      headers?: Record<string, string> | null;
      enabled?: boolean;
    }) => getApiClient().createMcpServer(input),
    update: (serverId: string, input: {
      name?: string;
      url?: string;
      description?: string | null;
      transport?: "sse";
      headers?: Record<string, string> | null;
      enabled?: boolean;
    }) => getApiClient().updateMcpServer(serverId, input),
    delete: (serverId: string) => getApiClient().deleteMcpServer(serverId),
    listTools: (serverId: string) => getApiClient().listMcpServerTools(serverId),
  },

  mcp: {
    call: (input: McpCallRequest) => getApiClient().callMcpTool(input),
    getTools: (options?: { toolsetId?: string; extraToolNames?: string[] }) =>
      getApiClient().getMcpTools(options),
  },

  llm: {
    chat: (input: {
      modelConfigId?: string;
      messages: Array<{ role: string; content: string }>;
      stream?: boolean;
      tools?: McpToolDefinition[];
      tool_choice?: unknown;
      temperature?: number;
    }) => getApiClient().llmChat(input),
  },
} as const;

export type ApiClient = typeof api;

export default api;
