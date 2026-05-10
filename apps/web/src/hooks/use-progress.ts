import { useEffect, useRef, useCallback } from "react";
import type { WsProgressUpdateNotification } from "@ai-collab/protocol";
import { api } from "@/lib/api-client";
import {
  useProgressStore,
  useProgressActions,
  useAllProgressBySession,
} from "@/state/progress-store";
import type { Progress } from "@/types/progress";

export function useSessionProgress(sessionId?: string | null) {
  const { setManyProgress, setLoading, handleProgressUpdate } = useProgressActions();
  const progressList = useAllProgressBySession(sessionId || "");
  const loading = useProgressStore((state) => state.loading);
  const lastFetchedAt = useProgressStore((state) => state.lastFetchedAt);
  const fetchRef = useRef(false);

  const fetch = useCallback(async (sId?: string | null) => {
    if (!sId || fetchRef.current) return;
    fetchRef.current = true;
    setLoading(true);
    try {
      const progress = await api.progress.list({ sessionId: sId });
      setManyProgress(progress);
    } finally {
      setLoading(false);
    }
  }, [setManyProgress, setLoading]);

  const onProgressUpdate = useCallback((message: WsProgressUpdateNotification) => {
    const progress: Progress = {
      sessionId: message.sessionId,
      agentId: message.agentId,
      agentName: message.agentName,
      status: message.status as any,
      percentage: message.percentage,
      currentStep: message.currentStep,
      message: message.message,
      details: message.details,
      createdAt: message.updatedAt,
      updatedAt: message.updatedAt,
      expiresAt: message.updatedAt,
    };
    handleProgressUpdate(progress);
  }, [handleProgressUpdate]);

  useEffect(() => {
    if (sessionId) {
      fetch(sessionId);
    }
    return () => {
      fetchRef.current = false;
    };
  }, [sessionId, fetch]);

  return {
    progressList,
    loading,
    lastFetchedAt,
    fetch,
    onProgressUpdate,
  };
}

export function useProgress(sessionId: string) {
  return useSessionProgress(sessionId);
}
