import { useEffect, useCallback } from "react";
import type { AgentQueueStats, SessionInsight } from "@ai-collab/protocol";
import { api } from "@/lib/api-client";
import {
  useSessionStore,
  useSessionActions,
  useQueueStats,
  useSessionInsight,
  useOverviewLoading,
  useSelectedSessionId,
} from "@/state/session-store";
import { useApi } from "./use-api";

export interface SessionOverview {
  queueStats: AgentQueueStats[];
  insight: SessionInsight | null;
}

export function useSessionOverview(sessionId?: string) {
  const { setQueueStats, setInsight, setOverviewLoading } = useSessionActions();
  const queueStats = useQueueStats();
  const insight = useSessionInsight();
  const loading = useOverviewLoading();

  const { execute: fetchQueueStats, isLoading: queueStatsLoading } = useApi(
    async (sid: string) => {
      const stats = await api.sessions.getQueueStats(sid);
      setQueueStats(stats);
      return stats;
    }
  );

  const { execute: fetchInsight, isLoading: insightLoading } = useApi(
    async (sid: string) => {
      const sessionInsight = await api.sessions.getInsight(sid);
      setInsight(sessionInsight);
      return sessionInsight;
    }
  );

  const refreshOverview = useCallback(
    async (sid: string) => {
      setOverviewLoading(true);
      try {
        await Promise.all([fetchQueueStats(sid), fetchInsight(sid)]);
      } finally {
        setOverviewLoading(false);
      }
    },
    [fetchQueueStats, fetchInsight, setOverviewLoading]
  );

  useEffect(() => {
    if (sessionId) {
      refreshOverview(sessionId);
    }
  }, [sessionId]);

  // 派生统计数据 — 基于 protocol AgentQueueStats 字段: pending, claimed, total
  const totalQueueSize = queueStats.reduce((sum, s) => sum + s.total, 0);
  const totalPending = queueStats.reduce((sum, s) => sum + s.pending, 0);
  const totalClaimed = queueStats.reduce((sum, s) => sum + s.claimed, 0);

  return {
    queueStats,
    insight,
    loading: loading || queueStatsLoading || insightLoading,
    refreshOverview,
    // 派生指标
    totalQueueSize,
    totalPending,
    totalClaimed,
  };
}

export function useSelectedSessionOverview() {
  const selectedId = useSelectedSessionId();
  return useSessionOverview(selectedId ?? undefined);
}

export function useWorkerQueueStats(agentId: string) {
  const queueStats = useQueueStats();
  return queueStats.find((s) => s.agentId === agentId);
}
