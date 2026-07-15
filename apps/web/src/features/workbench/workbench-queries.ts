import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ConsoleMember,
  MessageRecord,
  SessionConsole,
  SessionSummary,
  WebAgentRuntime,
} from "@loopmarshal/protocol";
import { api } from "@/lib/api-client";

/* ==================== Query Keys ==================== */

export const qk = {
  sessions: ["sessions"] as const,
  console: (sid: string | null | undefined) => ["console", sid] as const,
  messages: (sid: string | null | undefined) => ["messages", sid] as const,
  runtimes: (sid: string | null | undefined) => ["runtimes", sid] as const,
  models: ["models"] as const,
  knowledgeManifest: ["knowledge", "manifest"] as const,
  knowledgeList: ["knowledge", "list"] as const,
  knowledgeDoc: (level: string, slug: string) => ["knowledge", "doc", level, slug] as const,
  knowledgeChanges: ["knowledge", "changes"] as const,
  mcpServers: ["mcp", "servers"] as const,
  preferences: ["preferences"] as const,
};

/* ==================== Session Queries ==================== */

export function useSessionsQuery() {
  return useQuery({
    queryKey: qk.sessions,
    queryFn: () => api.sessions.list(),
  });
}

export function useConsoleQuery(sessionId: string | null | undefined) {
  return useQuery({
    queryKey: qk.console(sessionId),
    queryFn: () => api.sessions.getConsole(sessionId as string),
    enabled: Boolean(sessionId),
    refetchInterval: 5_000,
  });
}

export function useMessagesQuery(sessionId: string | null | undefined) {
  return useQuery({
    queryKey: qk.messages(sessionId),
    queryFn: () => api.messages.list(sessionId as string),
    enabled: Boolean(sessionId),
    refetchInterval: 5_000,
  });
}

export function useRuntimesQuery(sessionId: string | null | undefined) {
  return useQuery({
    queryKey: qk.runtimes(sessionId),
    queryFn: () => api.webRuntimes.list(sessionId as string),
    enabled: Boolean(sessionId),
    refetchInterval: 5_000,
  });
}

export function useModelsQuery() {
  return useQuery({
    queryKey: qk.models,
    queryFn: () => api.models.list(),
  });
}

/* ==================== Mutations ==================== */

export function useCreateHostSessionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { sessionName: string; modelConfigId: string }) => {
      // 1. Create session + host agent
      const { agent, session } = await api.sessionWithAgent.create({
        sessionName: input.sessionName,
        agentName: "web-host",
        displayName: "Web Host",
        modelConfigId: input.modelConfigId,
        roleDescription: "Coordinate the session from the web workbench.",
      });

      // 2. Create web runtime for the host
      try {
        const runtime = await api.webRuntimes.create({
          sessionId: session.id,
          agentId: agent.id,
          role: "host",
          modelConfigId: input.modelConfigId,
          toolsetId: "host",
        });

        // 3. Start the runtime
        try {
          await api.webRuntimes.start(runtime.id);
        } catch {
          // Runtime start failure is non-fatal — user can retry from the panel
        }
      } catch {
        // Runtime creation failure is non-fatal — user can retry from the panel
      }

      return { agent, session };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.sessions });
    },
  });
}

export function useAddKnowledgeKeeperMutation(sessionId: string | null | undefined) {
  const qc = useQueryClient();
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
    onSuccess: () => invalidateSession(qc, sessionId),
  });
}

export function useEnsureHostRuntimeMutation(sessionId: string | null | undefined) {
  const qc = useQueryClient();
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
    onSuccess: () => invalidateSession(qc, sessionId),
  });
}

export function useRuntimeCommandMutation(sessionId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { runtimeId: string; command: "start" | "pause" | "stop" }) => {
      if (input.command === "start") return api.webRuntimes.start(input.runtimeId);
      if (input.command === "pause") return api.webRuntimes.pause(input.runtimeId);
      return api.webRuntimes.stop(input.runtimeId);
    },
    onSuccess: () => invalidateSession(qc, sessionId),
  });
}

export function useSendHostMessageMutation(sessionId: string | null | undefined) {
  const qc = useQueryClient();
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
    onSuccess: () => invalidateSession(qc, sessionId),
  });
}

export function useDeleteRuntimeMutation(sessionId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runtimeId: string) => api.webRuntimes.delete(runtimeId),
    onSuccess: () => invalidateSession(qc, sessionId),
  });
}

/* ==================== Helpers ==================== */

export function getSelectedSessionId(sessions: SessionSummary[], explicit: string | null): string | null {
  if (explicit && sessions.some((s) => s.id === explicit)) return explicit;
  return sessions[0]?.id ?? null;
}

export function getRuntimeForAgent(
  runtimes: WebAgentRuntime[],
  agentId: string | null | undefined
): WebAgentRuntime | null {
  if (!agentId) return null;
  return runtimes.find((r) => r.agentId === agentId) ?? null;
}

export function invalidateSession(
  qc: ReturnType<typeof useQueryClient>,
  sessionId: string | null | undefined
) {
  void qc.invalidateQueries({ queryKey: qk.sessions });
  void qc.invalidateQueries({ queryKey: qk.console(sessionId) });
  void qc.invalidateQueries({ queryKey: qk.messages(sessionId) });
  void qc.invalidateQueries({ queryKey: qk.runtimes(sessionId) });
}

export type WorkbenchConsole = SessionConsole;
export type WorkbenchMessage = MessageRecord;
