import { create } from "zustand";
import type { SessionConsole } from "@ai-collab/protocol";

type ConsoleStore = {
  bySession: Record<string, SessionConsole>;
  loading: boolean;
  lastFetchedAt?: string;
  actions: {
    setConsole: (sessionId: string, value: SessionConsole) => void;
    setLoading: (value: boolean) => void;
    clearSession: (sessionId: string) => void;
  };
};

export const useConsoleStore = create<ConsoleStore>((set) => ({
  bySession: {},
  loading: false,
  actions: {
    setConsole: (sessionId, value) =>
      set((state) => ({
        bySession: {
          ...state.bySession,
          [sessionId]: value,
        },
        lastFetchedAt: new Date().toISOString(),
      })),
    setLoading: (value) => set({ loading: value }),
    clearSession: (sessionId) =>
      set((state) => {
        const next = { ...state.bySession };
        delete next[sessionId];
        return { bySession: next };
      }),
  },
}));

export const useConsoleActions = () => useConsoleStore((state) => state.actions);
export const useConsoleBySession = (sessionId?: string) =>
  useConsoleStore((state) => (sessionId ? state.bySession[sessionId] ?? null : null));
export const useConsoleLoading = () => useConsoleStore((state) => state.loading);
export const useConsoleLastFetchedAt = () => useConsoleStore((state) => state.lastFetchedAt);
