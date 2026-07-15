import { createLoopMarshalClient, LoopMarshalWebSocketClient } from "@loopmarshal/sdk";
import type { MessageRecord } from "@loopmarshal/protocol";
import { getLogger } from "@loopmarshal/shared";

const logger = getLogger();

export async function waitForNextInboxMessage(
  baseUrl: string,
  agentId: string,
  sessionId: string,
  timeoutMs = 30000
): Promise<MessageRecord | null> {
  let wsClient: LoopMarshalWebSocketClient | null = null;

  // 优雅退出处理
  const cleanup = async () => {
    if (wsClient) {
      wsClient.disconnect();
    }

    // 退出前最后查一次 inbox
    logger.info("Shutdown: checking inbox one last time");
    try {
      const client = createLoopMarshalClient();
      const inbox = await client.getInbox(agentId);
      if (inbox.length > 0) {
        logger.info({ count: inbox.length }, "Shutdown: found messages in inbox");
        return inbox[0];
      }
    } catch (error) {
      logger.error({ error }, "Shutdown: failed to check inbox");
    }

    return null;
  };

  process.once("SIGINT", async () => {
    const msg = await cleanup();
    if (msg) {
      console.log(JSON.stringify(msg, null, 2));
    }
    process.exit(0);
  });

  try {
    // 第一步：先查一遍（最佳实践！）
    const client = createLoopMarshalClient();
    const initialInbox = await client.getInbox(agentId);
    if (initialInbox.length > 0) {
      return initialInbox[0] ?? null;
    }

    // 第二步：尝试 WebSocket 等待
    wsClient = new LoopMarshalWebSocketClient({
      baseUrl,
      agentId,
      sessionId
    });

    wsClient.connect();

    const message = await wsClient.waitForNextMessage(timeoutMs);
    if (message) {
      // 推送只给了消息 ID，需要获取完整消息
      return await client.getMessageById(message.messageId);
    }

    // WebSocket 超时，返回 null，外层走轮询
    return null;

  } catch (error) {
    // WebSocket 失败，降级到轮询
    logger.warn({ error }, "WebSocket wait failed, falling back to polling");
    return null;
  } finally {
    if (wsClient) {
      wsClient.disconnect();
    }
  }
}
