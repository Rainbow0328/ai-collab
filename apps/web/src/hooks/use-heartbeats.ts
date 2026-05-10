import { useEffect } from "react";
import type { AgentHeartbeat } from "@ai-collab/protocol";
import { api } from "@/lib/api-client";
import {
  useSessionStore,
  useSessionActions,
  useHeartbeats,
  useHeartbeatsLoading,
  useSelectedSessionId,
} from "@/state/session-store";
import { useApi } from "./use-api";
import { useInterval } from "./use-interval";

export function useSessionHeartbeats(sessionId?: string, autoRefresh = true) {
  const { setHeartbeats, setHeartbeatsLoading } = useSessionActions();
  const heartbeats = useHeartbeats();
  const loading = useHeartbeatsLoading();

  const { execute: fetchHeartbeats, isLoading: fetching } = useApi(async (sid: string) => {
    setHeartbeatsLoading(true);
    try {
      const list = await api.sessions.listHeartbeats(sid);
      setHeartbeats(list);
      return list;
    } finally {
      setHeartbeatsLoading(false);
    }
  });

  useEffect(() => {
    if (sessionId) {
      fetchHeartbeats(sessionId);
    }
  }, [sessionId]);

  // Auto-refresh every 30 seconds when enabled
  useInterval(
    () => sessionId && fetchHeartbeats(sessionId),
    autoRefresh ? 30000 : null
  );

  // Calculate online status
  const isOnline = (heartbeat: AgentHeartbeat): boolean => {
    const lastHeartbeat = new Date(heartbeat.lastHeartbeatAt);
    const now = new Date();
    const diffMs = now.getTime() - lastHeartbeat.getTime();
    
    const isWorkingState = heartbeat.status === "busy";
    const timeoutMs = isWorkingState ? 1800000 : 60000;
    return diffMs < timeoutMs;
  };

  return {
    heartbeats,
    loading: loading || fetching,
    fetchHeartbeats,
    isOnline,
    onlineCount: heartbeats.filter(isOnline).length,
    offlineCount: heartbeats.length - heartbeats.filter(isOnline).length,
  };
}

export function useSelectedSessionHeartbeats(autoRefresh = true) {
  const selectedId = useSelectedSessionId();
  return useSessionHeartbeats(selectedId ?? undefined, autoRefresh);
}
