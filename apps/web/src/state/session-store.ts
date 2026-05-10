import { create } from "zustand";
import type { Session, Agent, ConnectionState } from "@/types";
import type { SessionSummary, AgentHeartbeat, AgentQueueStats, SessionInsight } from "@ai-collab/protocol";

interface SessionStore {
  allSessions: SessionSummary[];
  currentSession: Session | null;
  currentAgent: Agent | null;
  members: Agent[];
  heartbeats: AgentHeartbeat[];
  queueStats: AgentQueueStats[];
  insight: SessionInsight | null;
  selectedSessionId: string | null;
  connection: ConnectionState;
  loading: boolean;
  heartbeatsLoading: boolean;
  overviewLoading: boolean;
  actions: {
    setAllSessions: (sessions: SessionSummary[]) => void;
    setSession: (session: Session) => void;
    setAgent: (agent: Agent) => void;
    setMembers: (members: Agent[]) => void;
    setHeartbeats: (heartbeats: AgentHeartbeat[]) => void;
    setQueueStats: (queueStats: AgentQueueStats[]) => void;
    setInsight: (insight: SessionInsight | null) => void;
    setSelectedSessionId: (sessionId: string | null) => void;
    setConnectionStatus: (status: ConnectionState["status"]) => void;
    setLoading: (loading: boolean) => void;
    setHeartbeatsLoading: (loading: boolean) => void;
    setOverviewLoading: (loading: boolean) => void;
    reset: () => void;
  };
}

export const useSessionStore = create<SessionStore>((set) => ({
  allSessions: [],
  currentSession: null,
  currentAgent: null,
  members: [],
  heartbeats: [],
  queueStats: [],
  insight: null,
  selectedSessionId: null,
  connection: {
    status: "disconnected",
    reconnectAttempts: 0,
  },
  loading: false,
  heartbeatsLoading: false,
  overviewLoading: false,

  actions: {
    setAllSessions: (sessions) => set({ allSessions: sessions }),
    setSession: (session) => set({ currentSession: session }),
    setAgent: (agent) => set({ currentAgent: agent }),
    setMembers: (members) => set({ members }),
    setHeartbeats: (heartbeats) => set({ heartbeats }),
    setQueueStats: (queueStats) => set({ queueStats }),
    setInsight: (insight) => set({ insight }),
    setSelectedSessionId: (sessionId) => set({ selectedSessionId: sessionId }),
    setConnectionStatus: (status) =>
      set((state) => ({
        connection: {
          ...state.connection,
          status,
          lastConnectedAt: status === "connected" ? new Date().toISOString() : state.connection.lastConnectedAt,
        },
      })),
    setLoading: (loading) => set({ loading }),
    setHeartbeatsLoading: (loading) => set({ heartbeatsLoading: loading }),
    setOverviewLoading: (loading) => set({ overviewLoading: loading }),
    reset: () =>
      set({
        currentSession: null,
        currentAgent: null,
        members: [],
        heartbeats: [],
        queueStats: [],
        insight: null,
        selectedSessionId: null,
        connection: { status: "disconnected", reconnectAttempts: 0 },
      }),
  },
}));

export const useSessionActions = () => useSessionStore((state) => state.actions);
export const useAllSessions = () => useSessionStore((state) => state.allSessions);
export const useCurrentSession = () => useSessionStore((state) => state.currentSession);
export const useCurrentAgent = () => useSessionStore((state) => state.currentAgent);
export const useSelectedSessionId = () => useSessionStore((state) => state.selectedSessionId);
export const useSelectedSession = () =>
  useSessionStore((state) => {
    if (!state.selectedSessionId) return null;
    return state.allSessions.find((s) => s.id === state.selectedSessionId) ?? null;
  });
export const useHeartbeats = () => useSessionStore((state) => state.heartbeats);
export const useQueueStats = () => useSessionStore((state) => state.queueStats);
export const useSessionInsight = () => useSessionStore((state) => state.insight);
export const useHeartbeatsLoading = () => useSessionStore((state) => state.heartbeatsLoading);
export const useOverviewLoading = () => useSessionStore((state) => state.overviewLoading);
export const useConnectionStatus = () => useSessionStore((state) => state.connection);
export const useSessionsLoading = () => useSessionStore((state) => state.loading);
