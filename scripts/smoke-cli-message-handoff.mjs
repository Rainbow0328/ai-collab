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

import { startCoreServer } from "@ai-collab/core";
import { createSmokeClient } from "./helpers/create-smoke-client.mjs";

const smokePort = 42716;
const smokeBaseUrl = `http://127.0.0.1:${smokePort}`;
const rootDir = process.cwd();
const stateDir = resolve(rootDir, ".ai-collab-test", "smoke-cli-message-handoff");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const sleep = async (milliseconds) => {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
};

const main = async () => {
  await mkdir(resolve(rootDir, ".ai-collab-test"), { recursive: true });
  await rm(stateDir, { recursive: true, force: true });

  const instance = await startCoreServer({
    host: "127.0.0.1",
    port: smokePort,
    databasePath: ".ai-collab-test/smoke-cli-message-handoff.sqlite"
  });

  try {
    const client = createSmokeClient(smokeBaseUrl, "smoke-cli-message-handoff");
    const sessionName = `cli-message-handoff-${Date.now()}`;
    const hostName = "main-host";
    const workerName = "frontend-worker";

    const host = await client.attachNamedSession(sessionName, {
      agentName: hostName,
      role: "host",
      roleDescription: "主控编排"
    });
    const worker = await client.attachNamedSession(sessionName, {
      agentName: workerName,
      role: "worker",
      roleDescription: "负责执行分派下来的开发任务并回报结果"
    });

    const correlationId = `message-handoff-${Date.now()}`;
    const dispatched = await client.sendMessage({
      sessionId: host.session.id,
      fromAgentId: host.agent.id,
      toAgentId: worker.agent.id,
      type: "instruction",
      payload: {
        content: "请回复：第一轮任务已接收",
        result: "pending"
      },
      correlationId,
      idempotencyKey: `${correlationId}:dispatch`
    });

    const firstWorkerAwait = await client.claimNext(worker.agent.id, {
      types: ["instruction"],
      correlationId
    });

    assert(
      firstWorkerAwait?.id === dispatched.id &&
        firstWorkerAwait.payload &&
        typeof firstWorkerAwait.payload === "object" &&
        firstWorkerAwait.payload.content === "请回复：第一轮任务已接收",
      "worker should claim the dispatched task"
    );

    const workerReport = await client.sendMessage({
      sessionId: host.session.id,
      fromAgentId: worker.agent.id,
      toAgentId: host.agent.id,
      type: "result",
      payload: {
        content: "第一轮任务已接收",
        result: "done"
      },
      correlationId,
      idempotencyKey: `${correlationId}:report`
    });
    await client.completeMessage(firstWorkerAwait.id, {
      agentId: worker.agent.id
    });
    const firstHostAwait = await client.claimNext(host.agent.id, {
      types: ["result", "progress", "error"],
      correlationId
    });

    assert(
      firstHostAwait?.id === workerReport.id &&
        firstHostAwait.payload &&
        typeof firstHostAwait.payload === "object" &&
        firstHostAwait.payload.content === "第一轮任务已接收",
      "host should claim the first worker report"
    );

    await client.completeMessage(firstHostAwait.id, {
      agentId: host.agent.id
    });
    await sleep(50);

    const followupCorrelationId = `followup-${Date.now()}`;
    const followupReport = await client.sendMessage({
      sessionId: host.session.id,
      fromAgentId: worker.agent.id,
      toAgentId: host.agent.id,
      type: "progress",
      payload: {
        content: "host resolve 后续报告",
        result: "pending"
      },
      correlationId: followupCorrelationId,
      idempotencyKey: `${followupCorrelationId}:report`
    });
    const resolvedHostAwait = await client.claimNext(host.agent.id, {
      types: ["progress"],
      correlationId: followupCorrelationId
    });

    assert(
      resolvedHostAwait?.id === followupReport.id &&
        resolvedHostAwait.payload &&
        typeof resolvedHostAwait.payload === "object" &&
        resolvedHostAwait.payload.content === "host resolve 后续报告",
      "host should claim the follow-up report after completing the previous one"
    );

    await sleep(50);

    console.log(
      JSON.stringify(
        {
          sessionName,
          dispatchedMessageId: dispatched.id,
          firstWorkerClaimedId: firstWorkerAwait.id,
          firstHostClaimedId: firstHostAwait.id,
          followupClaimedId: resolvedHostAwait.id
        },
        null,
        2
      )
    );
  } finally {
    await instance.close();
    await rm(stateDir, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error("CLI message handoff smoke test failed.", error);
  process.exitCode = 1;
});
