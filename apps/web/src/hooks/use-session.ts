import { useEffect } from "react";
import { api } from "@/lib/api-client";
import {
  useSessionStore,
  useSessionActions,
  useSelectedSessionId,
} from "@/state/session-store";
import { useApi } from "./use-api";

export function useSession(sessionName?: string) {
  const { setSession, setMembers, setLoading } = useSessionActions();
  const currentSession = useSessionStore((state) => state.currentSession);
  const loading = useSessionStore((state) => state.loading);

  const { execute: fetchByName, isLoading: fetchingByName } = useApi(async (name: string) => {
    setLoading(true);
    try {
      const session = await api.sessions.getByName(name);
      const members = await api.sessions.getMembers(session.id);
      setSession(session);
      setMembers(members);
      return { session, members };
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    if (sessionName && (!currentSession || currentSession.name !== sessionName)) {
      fetchByName(sessionName);
    }
  }, [sessionName]);

  return {
    session: currentSession,
    loading: loading || fetchingByName,
    refresh: () => sessionName && fetchByName(sessionName),
  };
}

export function useSessionDetail(sessionId?: string) {
  const { setSession, setMembers, setLoading } = useSessionActions();
  const currentSession = useSessionStore((state) => state.currentSession);
  const members = useSessionStore((state) => state.members);
  const loading = useSessionStore((state) => state.loading);

  const { execute: fetchDetail, isLoading: fetchingDetail } = useApi(async (id: string) => {
    setLoading(true);
    try {
      const [session, memberList] = await Promise.all([
        api.sessions.get(id),
        api.sessions.getMembers(id),
      ]);
      setSession(session);
      setMembers(memberList);
      return { session, members: memberList };
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    if (sessionId && (!currentSession || currentSession.id !== sessionId)) {
      fetchDetail(sessionId);
    }
  }, [sessionId]);

  return {
    session: currentSession,
    members,
    loading: loading || fetchingDetail,
    refresh: () => sessionId && fetchDetail(sessionId),
  };
}

export function useSelectedSessionDetail() {
  const selectedId = useSelectedSessionId();
  return useSessionDetail(selectedId ?? undefined);
}
