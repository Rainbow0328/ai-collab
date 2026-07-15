import type {
  WsServerMessage,
  WsClientMessage,
  WsInboxMessageNotification,
  WsProgressUpdateNotification,
  WsMessageClaimedNotification,
  WsConsoleUpdateNotification,
} from "@ai-collab/protocol";

export type AiCollabWebSocketClientOptions = {
  baseUrl: string;
  agentId: string;
  sessionId: string;
  heartbeatIntervalMs?: number;
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number;
};

type WebSocketEventMap = {
  connected: [];
  disconnected: [];
  reconnecting: [{ attempt: number }];
  pong: [WsServerMessage & { type: "pong" }];
  "inbox:message": [WsInboxMessageNotification];
  "inbox:claimed": [WsMessageClaimedNotification];
  "progress:update": [WsProgressUpdateNotification];
  "console:update": [WsConsoleUpdateNotification];
  error: [unknown];
  unknown: [WsServerMessage];
  maxReconnectAttemptsReached: [];
};

export class AiCollabWebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private listeners: { [K in keyof WebSocketEventMap]?: ((...args: WebSocketEventMap[K]) => void)[] } = {};

  constructor(private options: AiCollabWebSocketClientOptions) {}

  public on<K extends keyof WebSocketEventMap>(
    event: K,
    listener: (...args: WebSocketEventMap[K]) => void
  ): this {
    let list = this.listeners[event];
    if (!list) {
      list = [];
      this.listeners[event] = list;
    }
    list.push(listener);
    return this;
  }

  public once<K extends keyof WebSocketEventMap>(
    event: K,
    listener: (...args: WebSocketEventMap[K]) => void
  ): this {
    const onceWrapper = (...args: WebSocketEventMap[K]) => {
      this.removeListener(event, onceWrapper);
      listener(...args);
    };
    return this.on(event, onceWrapper);
  }

  public removeListener<K extends keyof WebSocketEventMap>(
    event: K,
    listener: (...args: WebSocketEventMap[K]) => void
  ): this {
    const eventListeners = this.listeners[event];
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
    return this;
  }

  private emit<K extends keyof WebSocketEventMap>(
    event: K,
    ...args: WebSocketEventMap[K]
  ): void {
    const eventListeners = this.listeners[event];
    if (eventListeners) {
      for (const listener of [...eventListeners]) {
        listener(...args);
      }
    }
  }

  public connect(): void {
    if (this.stopped) return;

    const { baseUrl, agentId, sessionId } = this.options;
    const wsUrl = `${baseUrl.replace(/^http/, "ws")}/ws?agentId=${encodeURIComponent(agentId)}&sessionId=${encodeURIComponent(sessionId)}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.emit("connected");
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data.toString()) as WsServerMessage;
        this.handleMessage(message);
      } catch (error) {
        this.emit("error", error);
      }
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      this.emit("disconnected");

      if (!this.stopped) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (error) => {
      this.emit("error", error);
    };
  }

  private handleMessage(message: WsServerMessage): void {
    switch (message.type) {
      case "pong":
        this.emit("pong", message as WsServerMessage & { type: "pong" });
        break;
      case "inbox:new-message":
        this.emit("inbox:message", message as WsInboxMessageNotification);
        break;
      case "inbox:claimed":
        this.emit("inbox:claimed", message as WsMessageClaimedNotification);
        break;
      case "progress:update":
        this.emit("progress:update", message as WsProgressUpdateNotification);
        break;
      case "console:update":
        this.emit("console:update", message as WsConsoleUpdateNotification);
        break;
      case "error":
        this.emit("error", message);
        break;
      default:
        this.emit("unknown", message);
    }
  }

  private startHeartbeat(): void {
    const interval = this.options.heartbeatIntervalMs ?? 30000;
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: "ping", timestamp: new Date().toISOString() });
    }, interval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= (this.options.maxReconnectAttempts ?? 5)) {
      this.emit("maxReconnectAttemptsReached");
      return;
    }

    const delay = this.options.reconnectDelayMs ?? 1000;
    this.reconnectAttempts++;

    setTimeout(() => {
      this.emit("reconnecting", { attempt: this.reconnectAttempts });
      this.connect();
    }, delay);
  }

  public send(message: WsClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  public waitForNextMessage(timeoutMs = 30000): Promise<WsInboxMessageNotification | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.removeListener("inbox:message", handler);
        resolve(null);
      }, timeoutMs);

      const handler = (message: WsInboxMessageNotification) => {
        clearTimeout(timer);
        resolve(message);
      };

      this.once("inbox:message", handler);
    });
  }

  public disconnect(): void {
    this.stopped = true;
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
