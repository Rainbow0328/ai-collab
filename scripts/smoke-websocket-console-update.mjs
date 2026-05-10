/*
 * Copyright 2024 Cloud Skill Team
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

process.env.AI_COLLAB_LOG_ROTATION = "false";

const smokePort = 42782;
const smokeBaseUrl = `http://127.0.0.1:${smokePort}`;
const rootDir = process.cwd();
const stateDir = resolve(rootDir, ".ai-collab-test", "smoke-websocket-console-update");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const waitForConnected = (wsClient, timeoutMs = 5_000) => {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("WebSocket client did not connect in time."));
    }, timeoutMs);

    wsClient.once("connected", () => {
      clearTimeout(timer);
      resolvePromise();
    });
    wsClient.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
};

const waitForConsoleReasons = (wsClient, expectedReasons, timeoutMs = 5_000) => {
  return new Promise((resolvePromise, reject) => {
    const seenReasons = new Set();
    const timer = setTimeout(() => {
      reject(
        new Error(
          `Timed out waiting for console:update reasons. Seen: ${Array.from(seenReasons).join(", ")}`
        )
      );
    }, timeoutMs);

    wsClient.on("console:update", (message) => {
      seenReasons.add(message.reason);
      if (expectedReasons.every((reason) => seenReasons.has(reason))) {
        clearTimeout(timer);
        resolvePromise(seenReasons);
      }
    });
  });
};

const main = async () => {
  await mkdir(resolve(rootDir, ".ai-collab-test"), { recursive: true });
  await rm(stateDir, { recursive: true, force: true });
  await mkdir(stateDir, { recursive: true });

  process.env.AI_COLLAB_KNOWLEDGE_ROOT = resolve(stateDir, ".knowledge");
  const { startCoreServer } = await import("@ai-collab/core");
  const { AiCollabWebSocketClient, createAiCollabClient } = await import("@ai-collab/sdk");

  const instance = await startCoreServer({
    host: "127.0.0.1",
    port: smokePort,
    databasePath: resolve(stateDir, "websocket-console-update.sqlite")
  });
  let wsClient;

  try {
    const client = createAiCollabClient({ baseUrl: smokeBaseUrl });
    const sessionName = `ws-console-${Date.now()}`;

    const host = await client.attachSession({
      sessionName,
      agentName: "main-host",
      role: "host",
      roleDescription: "plan and watch the console"
    });
    const worker = await client.attachSession({
      sessionName,
      agentName: "worker-one",
      role: "worker",
      roleDescription: "execute tasks"
    });

    wsClient = new AiCollabWebSocketClient({
      baseUrl: smokeBaseUrl,
      agentId: host.agent.id,
      sessionId: host.session.id,
      heartbeatIntervalMs: 60_000,
      maxReconnectAttempts: 0
    });

    const expectedReasons = ["message_sent", "progress_updated"];
    const consoleUpdates = waitForConsoleReasons(wsClient, expectedReasons);
    wsClient.connect();
    await waitForConnected(wsClient);

    await client.sendMessage({
      sessionId: host.session.id,
      fromAgentId: host.agent.id,
      toAgentId: worker.agent.id,
      type: "task",
      correlationId: "smoke-ws-console-1",
      payload: {
        content: "Trigger a console websocket update."
      }
    });

    await client.upsertProgress({
      sessionId: host.session.id,
      agentId: worker.agent.id,
      agentName: worker.agent.agentName,
      status: "in_progress",
      percentage: 25,
      currentStep: "smoke-console-update",
      message: "Progress update should refresh the console."
    });

    const seenReasons = await consoleUpdates;
    assert(
      expectedReasons.every((reason) => seenReasons.has(reason)),
      "WebSocket should receive console:update for message and progress changes"
    );

    console.log(
      JSON.stringify(
        {
          sessionName,
          consoleUpdateReasons: Array.from(seenReasons)
        },
        null,
        2
      )
    );
  } finally {
    wsClient?.disconnect();
    await instance.close();
    await rm(stateDir, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error("WebSocket console update smoke test failed.", error);
  process.exitCode = 1;
});
