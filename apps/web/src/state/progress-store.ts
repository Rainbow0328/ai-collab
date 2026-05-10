import { create } from "zustand";
import { useShallow } from "zustand/shallow";
import type {
  Progress,
  ProgressStatus,
  ProgressEvent,
} from "@/types/progress";

interface ProgressStore {
  byAgent: Record<string, Progress>;
  bySession: Record<string, string[]>;
  loading: boolean;
  lastFetchedAt?: string;
  actions: {
    setProgress: (progress: Progress) => void;
    setManyProgress: (progressList: Progress[]) => void;
    updateProgress: (sessionId: string, agentId: string, updates: Partial<Progress>) => void;
    clearSessionProgress: (sessionId: string) => void;
    removeAgentProgress: (sessionId: string, agentId: string) => void;
    setLoading: (loading: boolean) => void;
    handleProgressUpdate: (progressUpdate: Progress) => void;
  };
}

function getAgentKey(sessionId: string, agentId: string): string {
  return `${sessionId}:${agentId}`;
}

export const useProgressStore = create<ProgressStore>((set, get) => ({
  byAgent: {},
  bySession: {},
  loading: false,

  actions: {
    setProgress: (progress) => {
      const key = getAgentKey(progress.sessionId, progress.agentId);
      set((state) => ({
        byAgent: { ...state.byAgent, [key]: progress },
        bySession: {
          ...state.bySession,
          [progress.sessionId]: Array.from(
            new Set([...(state.bySession[progress.sessionId] || []), key])
          ),
        },
      }));
    },

    setManyProgress: (progressList) => {
      const byAgent: Record<string, Progress> = {};
      const bySession: Record<string, string[]> = {};

      for (const progress of progressList) {
        const key = getAgentKey(progress.sessionId, progress.agentId);
        byAgent[key] = progress;
        if (!bySession[progress.sessionId]) {
          bySession[progress.sessionId] = [];
        }
        bySession[progress.sessionId].push(key);
      }

      set({ byAgent, bySession, lastFetchedAt: new Date().toISOString() });
    },

    updateProgress: (sessionId, agentId, updates) => {
      const key = getAgentKey(sessionId, agentId);
      set((state) => {
        const existing = state.byAgent[key];
        if (!existing) return state;

        return {
          byAgent: {
            ...state.byAgent,
            [key]: { ...existing, ...updates },
          },
        };
      });
    },

    clearSessionProgress: (sessionId) => {
      set((state) => {
        const { [sessionId]: _, ...remainingBySession } = state.bySession;
        const byAgent = { ...state.byAgent };
        const keysToRemove = state.bySession[sessionId] || [];
        for (const key of keysToRemove) {
          delete byAgent[key];
        }
        return { bySession: remainingBySession, byAgent };
      });
    },

    removeAgentProgress: (sessionId, agentId) => {
      const key = getAgentKey(sessionId, agentId);
      set((state) => {
        const { [key]: _, ...byAgent } = state.byAgent;
        const bySession = { ...state.bySession };
        if (bySession[sessionId]) {
          bySession[sessionId] = bySession[sessionId].filter((k) => k !== key);
        }
        return { byAgent, bySession };
      });
    },

    setLoading: (loading) => set({ loading }),

    handleProgressUpdate: (progressUpdate) => {
      const { actions } = get();
      actions.setProgress(progressUpdate);
    },
  },
}));

export const useProgressActions = () => useProgressStore((state) => state.actions);
export const useAllProgressBySession = (sessionId: string) =>
  useProgressStore(useShallow((state) => {
    const keys = state.bySession[sessionId] || [];
    return keys.map((key) => state.byAgent[key]).filter(Boolean);
  }));
export const useAgentProgress = (sessionId: string, agentId: string) =>
  useProgressStore((state) => state.byAgent[getAgentKey(sessionId, agentId)]);
export const useProgressLoading = () => useProgressStore((state) => state.loading);
