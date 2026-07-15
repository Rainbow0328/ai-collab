import { useEffect, useRef, useState, useCallback } from "react";
import { AiCollabWebSocketClient, type AiCollabWebSocketClientOptions } from "@ai-collab/sdk";
import type {
  WsServerMessage,
  WsProgressUpdateNotification,
  WsInboxMessageNotification,
  WsMessageClaimedNotification,
  WsConsoleUpdateNotification,
} from "@ai-collab/protocol";

export type UseWebSocketOptions = Partial<AiCollabWebSocketClientOptions> & {
  enabled?: boolean;
  onMessage?: (message: WsServerMessage) => void;
  onProgressUpdate?: (message: WsProgressUpdateNotification) => void;
  onInboxMessage?: (message: WsInboxMessageNotification) => void;
  onMessageClaimed?: (message: WsMessageClaimedNotification) => void;
  onConsoleUpdate?: (message: WsConsoleUpdateNotification) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
};

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const clientRef = useRef<AiCollabWebSocketClient | null>(null);
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected" | "reconnecting">("disconnected");
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const connect = useCallback((opts: AiCollabWebSocketClientOptions) => {
    if (clientRef.current) {
      clientRef.current.disconnect();
    }
    setStatus("connecting");
    const client = new AiCollabWebSocketClient(opts);

    client.on("connected", () => {
      setStatus("connected");
      optionsRef.current.onConnected?.();
    });

    client.on("disconnected", () => {
      setStatus("disconnected");
      optionsRef.current.onDisconnected?.();
    });

    client.on("reconnecting", () => {
      setStatus("reconnecting");
    });

    client.on("inbox:message", (message: WsInboxMessageNotification) => {
      optionsRef.current.onInboxMessage?.(message);
      optionsRef.current.onMessage?.(message);
    });

    client.on("inbox:claimed", (message: WsMessageClaimedNotification) => {
      optionsRef.current.onMessageClaimed?.(message);
      optionsRef.current.onMessage?.(message);
    });

    client.on("progress:update", (message: WsProgressUpdateNotification) => {
      optionsRef.current.onProgressUpdate?.(message);
      optionsRef.current.onMessage?.(message);
    });

    client.on("console:update", (message: WsConsoleUpdateNotification) => {
      optionsRef.current.onConsoleUpdate?.(message);
      optionsRef.current.onMessage?.(message);
    });

    client.connect();
    clientRef.current = client;
    return client;
  }, []);

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
      setStatus("disconnected");
    }
  }, []);

  useEffect(() => {
    return () => { disconnect(); };
  }, [disconnect]);

  useEffect(() => {
    if (!options.enabled || !options.sessionId) {
      disconnect();
      return;
    }

    const baseUrl =
      options.baseUrl ??
      (typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:42688");

    connect({
      ...options,
      baseUrl,
      agentId: options.agentId ?? "web-dashboard",
      sessionId: options.sessionId,
    });

    return () => { disconnect(); };
  }, [
    options.enabled,
    options.baseUrl,
    options.agentId,
    options.sessionId,
    options.heartbeatIntervalMs,
    options.reconnectDelayMs,
    options.maxReconnectAttempts,
    connect,
    disconnect,
  ]);

  return { status, disconnect, client: clientRef.current };
}
