export interface ConnectionState {
  status: "disconnected" | "connecting" | "connected" | "reconnecting";
  lastConnectedAt?: string;
  reconnectAttempts: number;
}

export interface Notification {
  id: string;
  type: "info" | "success" | "warning" | "error";
  message: string;
  createdAt: string;
}

export interface SessionContextState {
  currentSessionId?: string;
  currentAgentId?: string;
  connection: ConnectionState;
  notifications: Notification[];
}
