import type {
  WsConsoleUpdateNotification,
  WsConsoleUpdateReason,
  WsInboxMessageNotification,
  WsProgressUpdateNotification,
} from "@ai-collab/protocol";
import { getLogger } from "@ai-collab/shared";
import type { FastifyRequest } from "fastify";

const logger = getLogger();

/** Minimal WebSocket interface to avoid requiring @types/ws */
interface WebSocketLike {
  readyState: number;
  close(code?: number, reason?: string): void;
  send(data: string): void;
  on(event: "message", listener: (data: Buffer) => void): void;
  on(event: "close", listener: () => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
}

/** Minimal Fastify server interface for WebSocket registration */
interface FastifyServerLike {
  get(path: string, opts: { websocket: true }, handler: (socket: WebSocketLike, request: FastifyRequest) => void): void;
}

export type ConnectionInfo = {
  socket: WebSocketLike;
  agentId: string;
  sessionId: string;
  connectedAt: Date;
  lastHeartbeatAt: Date;
};

export class WebSocketService {
  private connections: Map<string, ConnectionInfo[]> = new Map();

  public register(server: FastifyServerLike): void {
    server.get("/ws", { websocket: true }, (socket: WebSocketLike, request: FastifyRequest) => {
      this.handleConnection(socket, request);
    });
  }

  private handleConnection(socket: WebSocketLike, request: FastifyRequest): void {
    const query = request.query as { agentId?: string; sessionId?: string };
    const agentId = query.agentId;
    const sessionId = query.sessionId;

    if (!agentId || !sessionId) {
      logger.warn("WebSocket connection rejected: missing agentId or sessionId");
      socket.close(4000, "Missing agentId or sessionId");
      return;
    }

    logger.info({ agentId, sessionId }, "New WebSocket connection established");

    const connectionInfo: ConnectionInfo = {
      socket,
      agentId,
      sessionId,
      connectedAt: new Date(),
      lastHeartbeatAt: new Date()
    };

    const existing = this.connections.get(agentId) ?? [];
    existing.push(connectionInfo);
    this.connections.set(agentId, existing);

    socket.on("message", (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(agentId, message);
      } catch (error) {
        logger.error({ error, agentId }, "Failed to parse WebSocket message");
      }
    });

    socket.on("close", () => {
      logger.info({ agentId }, "WebSocket connection closed");
      const connections = this.connections.get(agentId) ?? [];
      const filtered = connections.filter(c => c.socket !== socket);
      if (filtered.length === 0) {
        this.connections.delete(agentId);
      } else {
        this.connections.set(agentId, filtered);
      }
    });

    socket.on("error", (error: Error) => {
      logger.error({ error, agentId }, "WebSocket error");
    });
  }

  private handleMessage(agentId: string, message: Record<string, unknown>): void {
    const connections = this.connections.get(agentId);
    if (!connections || connections.length === 0) {
      return;
    }

    const connection = connections.find(c => c.socket.readyState === 1);
    if (!connection) {
      return;
    }

    switch (message.type) {
      case "ping":
        connection.lastHeartbeatAt = new Date();
        connection.socket.send(JSON.stringify({
          type: "pong",
          timestamp: new Date().toISOString()
        }));
        break;
      default:
        logger.debug({ messageType: message.type, agentId }, "Received unknown message type");
    }
  }

  public sendToAgent(agentId: string, message: WsInboxMessageNotification): void {
    const connections = this.connections.get(agentId) ?? [];
    for (const connection of connections) {
      try {
        connection.socket.send(JSON.stringify(message));
        logger.debug({ agentId, messageType: message.type }, "Message sent via WebSocket");
      } catch (error) {
        logger.error({ error, agentId }, "Failed to send WebSocket message");
      }
    }
  }

  public broadcastToSession(sessionId: string, message: unknown): void {
    for (const [agentId, connections] of this.connections.entries()) {
      for (const connection of connections) {
        if (connection.sessionId === sessionId) {
          try {
            connection.socket.send(JSON.stringify(message));
          } catch (error) {
            logger.error({ error, agentId }, "Failed to broadcast WebSocket message");
          }
        }
      }
    }
  }

  public broadcastProgress(notification: WsProgressUpdateNotification): void {
    this.broadcastToSession(notification.sessionId, notification);
  }

  public broadcastConsoleUpdate(
    sessionId: string,
    reason: WsConsoleUpdateReason
  ): void {
    const notification: WsConsoleUpdateNotification = {
      type: "console:update",
      sessionId,
      reason,
      updatedAt: new Date().toISOString()
    };
    this.broadcastToSession(sessionId, notification);
  }

  public broadcastConsoleUpdateToAll(reason: WsConsoleUpdateReason): void {
    const sessionIds = new Set<string>();
    for (const connections of this.connections.values()) {
      for (const connection of connections) {
        sessionIds.add(connection.sessionId);
      }
    }

    for (const sessionId of sessionIds) {
      this.broadcastConsoleUpdate(sessionId, reason);
    }
  }

  public getConnectionCount(): number {
    let count = 0;
    for (const connections of this.connections.values()) {
      count += connections.length;
    }
    return count;
  }

  public getSessionConnectionCount(sessionId: string): number {
    let count = 0;
    for (const connections of this.connections.values()) {
      for (const connection of connections) {
        if (connection.sessionId === sessionId) {
          count++;
        }
      }
    }
    return count;
  }

  public getConnectionStats(): Record<string, unknown> {
    const sessionStats: Record<string, number> = {};
    for (const connections of this.connections.values()) {
      for (const connection of connections) {
        sessionStats[connection.sessionId] = (sessionStats[connection.sessionId] ?? 0) + 1;
      }
    }

    return {
      totalConnections: this.getConnectionCount(),
      sessionConnections: sessionStats
    };
  }
}
