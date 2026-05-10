import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WsProgressUpdateNotification } from "@ai-collab/protocol";
import { api } from "@/lib/api-client";
import { useWebSocket } from "@/lib/websocket-client";
import {
  useConsoleActions,
  useConsoleBySession,
  useConsoleLastFetchedAt,
  useConsoleLoading,
  useConsoleStore,
} from "@/state/console-store";
import { useProgressActions } from "@/state/progress-store";
import { useSelectedSessionId } from "@/state/session-store";

const CONSOLE_REFRESH_DEBOUNCE_MS = 500;

export function useConsole(sessionId?: string) {
  const consoleSnapshot = useConsoleBySession(sessionId);
  const loading = useConsoleLoading();
  const lastFetchedAt = useConsoleLastFetchedAt();
  const { setConsole, setLoading } = useConsoleActions();
  const { handleProgressUpdate } = useProgressActions();
  const [error, setError] = useState<Error | null>(null);
  const inFlightRef = useRef<Promise<unknown> | null>(null);
  const refreshAgainRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(
    async (sid = sessionId) => {
      if (!sid) {
        return null;
      }

      if (inFlightRef.current) {
        refreshAgainRef.current = true;
        await inFlightRef.current;
        return getConsoleStoreSnapshot(sid);
      }

      setLoading(true);
      setError(null);
      const request = (async () => {
        const value = await api.sessions.getConsole(sid);
        setConsole(sid, value);
        return value;
      })();
      inFlightRef.current = request;

      try {
        return await request;
      } catch (err) {
        const nextError = err instanceof Error ? err : new Error(String(err));
        setError(nextError);
        return null;
      } finally {
        inFlightRef.current = null;
        setLoading(false);
        if (refreshAgainRef.current) {
          refreshAgainRef.current = false;
          void refresh(sid);
        }
      }
    },
    [sessionId, setConsole, setLoading]
  );

  const scheduleRefresh = useCallback(
    (sid = sessionId) => {
      if (!sid) {
        return;
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void refresh(sid);
      }, CONSOLE_REFRESH_DEBOUNCE_MS);
    },
    [refresh, sessionId]
  );

  const handleProgressNotification = useCallback(
    (message: WsProgressUpdateNotification) => {
      handleProgressUpdate({
        sessionId: message.sessionId,
        agentId: message.agentId,
        agentName: message.agentName,
        status: message.status as never,
        percentage: message.percentage,
        currentStep: message.currentStep,
        message: message.message,
        details: message.details,
        createdAt: message.updatedAt,
        updatedAt: message.updatedAt,
        expiresAt: message.updatedAt,
      });
      if (message.sessionId === sessionId) {
        scheduleRefresh(message.sessionId);
      }
    },
    [handleProgressUpdate, scheduleRefresh, sessionId]
  );

  const { status: realtimeStatus } = useWebSocket({
    enabled: Boolean(sessionId),
    sessionId,
    onConsoleUpdate: (message) => {
      if (message.sessionId === sessionId) {
        scheduleRefresh(message.sessionId);
      }
    },
    onProgressUpdate: handleProgressNotification,
    onInboxMessage: (message) => {
      scheduleRefresh(sessionId);
      void message;
    },
    onMessageClaimed: () => {
      scheduleRefresh(sessionId);
    },
  });

  useEffect(() => {
    void refresh();
  }, [sessionId, refresh]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const members = consoleSnapshot?.members ?? [];
  const host = useMemo(() => members.find((member) => member.role === "host") ?? null, [members]);
  const workers = useMemo(() => members.filter((member) => member.role === "worker"), [members]);

  return {
    console: consoleSnapshot,
    session: consoleSnapshot?.session ?? null,
    members,
    host,
    workers,
    taskThreads: consoleSnapshot?.taskThreads ?? [],
    recentMessages: consoleSnapshot?.recentMessages ?? [],
    knowledgeSummary: consoleSnapshot?.knowledgeSummary ?? null,
    idleInfo: consoleSnapshot?.idleInfo ?? null,
    loading,
    error,
    lastFetchedAt,
    realtimeStatus,
    refresh,
  };
}

export function useSelectedConsole() {
  const selectedSessionId = useSelectedSessionId();
  return useConsole(selectedSessionId ?? undefined);
}

function getConsoleStoreSnapshot(sessionId: string) {
  return useConsoleStore.getState().bySession[sessionId] ?? null;
}
