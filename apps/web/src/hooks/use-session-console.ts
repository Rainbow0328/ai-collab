import { useCallback, useEffect, useState } from "react";
import type { SessionConsole } from "@ai-collab/protocol";
import { api } from "@/lib/api-client";
import { useSelectedSessionId } from "@/state/session-store";

export function useSessionConsole(sessionId?: string) {
  const [sessionConsole, setSessionConsole] = useState<SessionConsole | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refreshConsole = useCallback(async (sid = sessionId) => {
    if (!sid) {
      setSessionConsole(null);
      return null;
    }

    setLoading(true);
    setError(null);
    try {
      const snapshot = await api.sessions.getConsole(sid);
      setSessionConsole(snapshot);
      return snapshot;
    } catch (err) {
      const nextError = err instanceof Error ? err : new Error(String(err));
      setError(nextError);
      return null;
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void refreshConsole(sessionId);
  }, [sessionId, refreshConsole]);

  return {
    console: sessionConsole,
    loading,
    error,
    refreshConsole,
  };
}

export function useSelectedSessionConsole() {
  const selectedSessionId = useSelectedSessionId();
  return useSessionConsole(selectedSessionId ?? undefined);
}
