import type {
  Agent,
  Session,
  MessageRecord,
  MessageType,
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
    getTimeline: (sessionId: string) => getApiClient().getSessionTimeline(sessionId),
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
    getManifest: (sessionId?: string) => getApiClient().getKnowledgeManifest(sessionId),
    list: (input?: import("@ai-collab/protocol").ListKnowledgeInput) =>
      getApiClient().listKnowledge(input),
    get: (level: import("@ai-collab/protocol").KnowledgeLevel, slug: string, sessionId?: string) =>
      getApiClient().getKnowledge(level, slug, sessionId),
    listChanges: (input?: import("@ai-collab/protocol").ListKnowledgeChangesInput) =>
      getApiClient().listKnowledgeChanges(input),
    feedback: (input: import("@ai-collab/protocol").KnowledgeFeedbackInput) =>
      getApiClient().submitKnowledgeFeedback(input),
    listJudgements: (sessionId: string) =>
      getApiClient().listKnowledgeBuildJudgements(sessionId),
  },

  models: {
    list: () => getApiClient().listModelConfigs(),
    get: (id: string) => getApiClient().getModelConfig(id),
    create: (input: import("@ai-collab/protocol").CreateModelConfigInput) =>
      getApiClient().createModelConfig(input),
    update: (id: string, input: import("@ai-collab/protocol").UpdateModelConfigInput) =>
      getApiClient().updateModelConfig(id, input),
    delete: (id: string) => getApiClient().deleteModelConfig(id),
    test: (id: string, input?: { prompt?: string }) =>
      getApiClient().testModelConfig(id, input),
  },

  agentProfiles: {
    list: () => getApiClient().listAgentProfiles(),
    get: (id: string) => getApiClient().getAgentProfile(id),
    create: (input: import("@ai-collab/protocol").CreateAgentProfileInput) =>
      getApiClient().createAgentProfile(input),
    update: (id: string, input: import("@ai-collab/protocol").UpdateAgentProfileInput) =>
      getApiClient().updateAgentProfile(id, input),
    delete: (id: string) => getApiClient().deleteAgentProfile(id),
    updateSkills: (id: string, skillIds: string[]) =>
      getApiClient().updateAgentProfileSkills(id, skillIds),
  },

  skills: {
    list: () => getApiClient().listSkills(),
    get: (id: string) => getApiClient().getSkill(id),
    create: (input: { name: string; description?: string | null; path: string; roleScope?: string | null }) =>
      getApiClient().createSkill(input),
    update: (id: string, input: { name?: string; description?: string | null; roleScope?: string | null; enabled?: boolean }) =>
      getApiClient().updateSkill(id, input),
    delete: (id: string) => getApiClient().deleteSkill(id),
    scan: (directoryPath: string) => getApiClient().scanSkills(directoryPath),
  },

  sessionSkills: {
    get: (sessionId: string) => getApiClient().getSessionSkills(sessionId),
    getAvailable: (sessionId: string) => getApiClient().getAvailableSessionSkills(sessionId),
    set: (sessionId: string, skillIds: string[]) =>
      getApiClient().setSessionSkills(sessionId, skillIds),
  },

  sessionWithAgent: {
    create: (input: import("@ai-collab/protocol").CreateSessionWithAgentInput) =>
      getApiClient().createSessionWithAgent(input),
    join: (input: import("@ai-collab/protocol").JoinSessionWithAgentInput) =>
      getApiClient().joinSessionWithAgent(input),
  },

  userProfile: {
    get: (agentId: string, key?: string) => getApiClient().getProfile(key, agentId),
    set: (key: string, value: string, agentId: string) => getApiClient().setProfile(key, value, agentId),
    delete: (key: string, agentId: string) => getApiClient().deleteProfile(key, agentId),
  },
} as const;

export type ApiClient = typeof api;

export default api;
