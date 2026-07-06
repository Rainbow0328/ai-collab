import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConsoleMember, MessageRecord, SessionConsole, SessionSummary, WebAgentRuntime } from "@ai-collab/protocol";
import { api } from "@/lib/api-client";

export type ModelConfigSummary = {
  id: string;
  name: string;
  provider: string;
  modelId: string;
};

export const workbenchKeys = {
  sessions: ["workbench", "sessions"] as const,
  console: (sessionId: string | null | undefined) => ["workbench", "console", sessionId] as const,
  messages: (sessionId: string | null | undefined) => ["workbench", "messages", sessionId] as const,
  runtimes: (sessionId: string | null | undefined) => ["workbench", "runtimes", sessionId] as const,
  models: ["workbench", "models"] as const,
};

export function useSessionsQuery() {
  return useQuery({
    queryKey: workbenchKeys.sessions,
    queryFn: () => api.sessions.list(),
  });
}

export function useConsoleQuery(sessionId: string | null | undefined) {
  return useQuery({
    queryKey: workbenchKeys.console(sessionId),
    queryFn: () => api.sessions.getConsole(sessionId as string),
    enabled: Boolean(sessionId),
    refetchInterval: 5_000,
  });
}

export function useMessagesQuery(sessionId: string | null | undefined) {
  return useQuery({
    queryKey: workbenchKeys.messages(sessionId),
    queryFn: () => api.messages.list(sessionId as string),
    enabled: Boolean(sessionId),
    refetchInterval: 5_000,
  });
}

export function useRuntimesQuery(sessionId: string | null | undefined) {
  return useQuery({
    queryKey: workbenchKeys.runtimes(sessionId),
    queryFn: () => api.webRuntimes.list(sessionId as string),
    enabled: Boolean(sessionId),
    refetchInterval: 5_000,
  });
}

export function useModelsQuery() {
  return useQuery<ModelConfigSummary[]>({
    queryKey: workbenchKeys.models,
    queryFn: () => api.models.list(),
  });
}

export function useCreateHostSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { sessionName: string; modelConfigId: string }) =>
      api.sessionWithAgent.create({
        sessionName: input.sessionName,
        agentName: "web-host",
        displayName: "Web Host",
        modelConfigId: input.modelConfigId,
        roleDescription: "Coordinate the session from the web workbench.",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workbenchKeys.sessions });
    },
  });
}

export function useAddKnowledgeKeeperMutation(sessionId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { modelConfigId: string }) => {
      if (!sessionId) throw new Error("No active session.");
      const joined = await api.sessionWithAgent.join({
        sessionId,
        role: "knowledge_keeper",
        agentName: "knowledge-keeper",
        displayName: "Knowledge Keeper",
        modelConfigId: input.modelConfigId,
        roleDescription: "Maintain project knowledge and user preferences for this session.",
      });
      const runtime = await api.webRuntimes.create({
        sessionId,
        agentId: joined.agent.id,
        role: "knowledge_keeper",
        modelConfigId: input.modelConfigId,
        toolsetId: "knowledge_keeper",
      });
      return { agent: joined.agent, runtime };
    },
    onSuccess: () => invalidateSession(queryClient, sessionId),
  });
}

export function useEnsureHostRuntimeMutation(sessionId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { host: ConsoleMember; modelConfigId: string }) => {
      if (!sessionId) throw new Error("No active session.");
      return api.webRuntimes.create({
        sessionId,
        agentId: input.host.agentId,
        role: "host",
        modelConfigId: input.modelConfigId,
        toolsetId: "host",
      });
    },
    onSuccess: () => invalidateSession(queryClient, sessionId),
  });
}

export function useRuntimeCommandMutation(sessionId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { runtimeId: string; command: "start" | "pause" | "stop" }) => {
      if (input.command === "start") return api.webRuntimes.start(input.runtimeId);
      if (input.command === "pause") return api.webRuntimes.pause(input.runtimeId);
      return api.webRuntimes.stop(input.runtimeId);
    },
    onSuccess: () => invalidateSession(queryClient, sessionId),
  });
}

export function useSendHostMessageMutation(sessionId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { hostAgentId: string; content: string }) => {
      if (!sessionId) throw new Error("No active session.");
      return api.messages.send({
        sessionId,
        fromAgentId: input.hostAgentId,
        toAgentId: input.hostAgentId,
        type: "instruction",
        payload: {
          kind: "web_user_message",
          content: input.content,
          source: "web_workbench",
        },
      });
    },
    onSuccess: () => invalidateSession(queryClient, sessionId),
  });
}

export function getSelectedSessionId(sessions: SessionSummary[], explicit: string | null): string | null {
  if (explicit && sessions.some((session) => session.id === explicit)) return explicit;
  return sessions[0]?.id ?? null;
}

export function getRuntimeForAgent(runtimes: WebAgentRuntime[], agentId: string | null | undefined): WebAgentRuntime | null {
  if (!agentId) return null;
  return runtimes.find((runtime) => runtime.agentId === agentId) ?? null;
}

export function invalidateSession(
  queryClient: ReturnType<typeof useQueryClient>,
  sessionId: string | null | undefined
) {
  void queryClient.invalidateQueries({ queryKey: workbenchKeys.sessions });
  void queryClient.invalidateQueries({ queryKey: workbenchKeys.console(sessionId) });
  void queryClient.invalidateQueries({ queryKey: workbenchKeys.messages(sessionId) });
  void queryClient.invalidateQueries({ queryKey: workbenchKeys.runtimes(sessionId) });
}

export type WorkbenchConsole = SessionConsole;
export type WorkbenchMessage = MessageRecord;
