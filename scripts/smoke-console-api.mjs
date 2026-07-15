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

process.env.LOOPMARSHAL_LOG_ROTATION = "false";

const smokePort = 42781;
const smokeBaseUrl = `http://127.0.0.1:${smokePort}`;
const rootDir = process.cwd();
const stateDir = resolve(rootDir, ".loopmarshal-test", "smoke-console-api");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const main = async () => {
  await mkdir(resolve(rootDir, ".loopmarshal-test"), { recursive: true });
  await rm(stateDir, { recursive: true, force: true });
  await mkdir(stateDir, { recursive: true });

  process.env.LOOPMARSHAL_KNOWLEDGE_ROOT = resolve(stateDir, ".knowledge");
  const { startCoreServer } = await import("@loopmarshal/core");
  const { createLoopMarshalClient } = await import("@loopmarshal/sdk");

  const instance = await startCoreServer({
    host: "127.0.0.1",
    port: smokePort,
    databasePath: resolve(stateDir, "console-api.sqlite")
  });

  try {
    const client = createLoopMarshalClient({ baseUrl: smokeBaseUrl });
    const sessionName = `console-api-${Date.now()}`;
    const correlationId = "smoke-console-thread-1";
    const reportContent = "Worker completed the console aggregation smoke task.";

    const host = await client.attachSession({
      sessionName,
      agentName: "main-host",
      role: "host",
      roleDescription: "plan, dispatch, and maintain knowledge"
    });
    const worker = await client.attachSession({
      sessionName,
      agentName: "worker-one",
      role: "worker",
      roleDescription: "execute assigned tasks"
    });

    const taskMessage = await client.sendMessage({
      sessionId: host.session.id,
      fromAgentId: host.agent.id,
      toAgentId: worker.agent.id,
      type: "task",
      correlationId,
      payload: {
        content: "Run the console aggregation smoke task."
      }
    });

    const claimed = await client.claimNext(worker.agent.id, {
      types: ["task"],
      correlationId
    });
    assert(claimed?.id === taskMessage.id, "worker should claim the dispatched task");

    await client.completeMessage(taskMessage.id, {
      agentId: worker.agent.id
    });

    await client.sendMessage({
      sessionId: host.session.id,
      fromAgentId: worker.agent.id,
      toAgentId: host.agent.id,
      type: "result",
      correlationId,
      payload: {
        content: reportContent,
        result: "completed"
      }
    });

    const snapshot = await client.getSessionConsole(host.session.id);
    const thread = snapshot.taskThreads.find(
      (item) => item.correlationId === correlationId
    );

    assert(thread, "console snapshot should include the task thread");
    assert(thread.status === "reported", "task thread should be reported");
    assert(
      thread.workerReport?.content === reportContent,
      "task thread should expose the worker report content"
    );
    assert(
      snapshot.members.every((member) =>
        ["offline", "working", "waiting"].includes(member.status)
      ),
      "console members should only expose the three user-facing statuses"
    );

    console.log(
      JSON.stringify(
        {
          sessionName,
          threadStatus: thread.status,
          workerReport: thread.workerReport?.content,
          memberStatuses: snapshot.members.map((member) => ({
            agentName: member.agentName,
            status: member.status
          }))
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
  console.error("Console API smoke test failed.", error);
  process.exitCode = 1;
});
