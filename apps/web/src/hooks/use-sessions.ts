import { useEffect, useRef, useState, useCallback } from 'react';
import type { SessionSummary } from '@ai-collab/protocol';
import { api } from '@/lib/api-client';
import {
  useSessionStore,
  useSessionActions,
  useAllSessions,
  useSelectedSessionId,
  useSessionsLoading,
} from '@/state/session-store';

export function useSessions() {
  const { setAllSessions, setLoading, setSelectedSessionId } = useSessionActions();
  const sessions = useAllSessions();
  const selectedId = useSelectedSessionId();
  const loading = useSessionsLoading();
  const fetchRef = useRef(false);
  const [localLoading, setLocalLoading] = useState(false);

  const fetchSessions = useCallback(async () => {
    if (fetchRef.current) return;
    fetchRef.current = true;
    setLocalLoading(true);
    setLoading(true);
    try {
      const list = await api.sessions.list();
      setAllSessions(list);
      return list;
    } finally {
      setLocalLoading(false);
      setLoading(false);
    }
  }, [setAllSessions, setLoading]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const selectSession = (sessionId: string | null) => {
    setSelectedSessionId(sessionId);
  };

  return {
    sessions,
    loading: loading || localLoading,
    selectedId,
    fetchSessions,
    selectSession,
  };
}

export function useSessionBootstrap() {
  const { setAllSessions, setLoading, setSelectedSessionId } = useSessionActions();
  const sessions = useAllSessions();
  const selectedId = useSelectedSessionId();
  const loading = useSessionsLoading();
  const bootstrappedRef = useRef(false);
  const [localLoading, setLocalLoading] = useState(false);

  const fetchSessions = useCallback(async () => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    setLocalLoading(true);
    setLoading(true);
    try {
      const list = await api.sessions.list();
      setAllSessions(list);

      const hasSelectedSession = selectedId
        ? list.some((session) => session.id === selectedId)
        : false;

      if (!hasSelectedSession) {
        const nextSession = [...list].sort((a, b) => {
          const aTime = new Date(a.lastActivityAt ?? a.createdAt).getTime();
          const bTime = new Date(b.lastActivityAt ?? b.createdAt).getTime();
          return bTime - aTime;
        })[0];
        setSelectedSessionId(nextSession?.id ?? null);
      }

      return list;
    } finally {
      setLocalLoading(false);
      setLoading(false);
    }
  }, [setAllSessions, setLoading, setSelectedSessionId, selectedId]);

  useEffect(() => {
    if (!bootstrappedRef.current) {
      fetchSessions();
    }
  }, [fetchSessions]);

  return {
    sessions,
    selectedId,
    loading: loading || localLoading,
    fetchSessions,
  };
}

export function useSelectedSession() {
  const session = useSessionStore((state) =>
    state.selectedSessionId
      ? state.allSessions.find((s) => s.id === state.selectedSessionId) ?? null
      : null
  );
  return session;
}

export function useSessionById(sessionId: string): SessionSummary | undefined {
  return useSessionStore((state) => state.allSessions.find((s) => s.id === sessionId));
}
