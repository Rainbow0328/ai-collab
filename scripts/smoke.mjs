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
import { createLoopMarshalClient } from "@loopmarshal/sdk";
import { startCoreServer } from "@loopmarshal/core";

const main = async () => {
  const instance = await startCoreServer();

  try {
    const client = createLoopMarshalClient();
    const host = await client.createSession({
      sessionName: `smoke-${Date.now()}`,
      agentName: "smoke-host",
      displayName: "Smoke Host",
      platform: "codex",
      capabilities: ["planning"],
      connectionMode: "skill-bridge"
    });

    const worker = await client.joinSession(host.session.id, {
      agentName: "smoke-worker",
      displayName: "Smoke Worker",
      platform: "claude",
      role: "worker",
      roleDescription: "Backend implementation worker for smoke testing",
      capabilities: ["backend"],
      connectionMode: "skill-bridge"
    });

    const message = await client.sendMessage({
      sessionId: host.session.id,
      fromAgentId: host.agent.id,
      toAgentId: worker.agent.id,
      type: "instruction",
      payload: {
        text: "Run smoke validation"
      }
    });

    const claimed = await client.claimNext(worker.agent.id);
    const completedMessage = claimed
      ? await client.completeMessage(claimed.id, {
          agentId: worker.agent.id
        })
      : null;

    const taskResult = await client.createTask({
      sessionId: host.session.id,
      title: "Smoke Task",
      description: "Ensure the end-to-end flow succeeds",
      createdByAgentId: host.agent.id,
      assignedToAgentId: worker.agent.id,
      priority: "normal"
    });

    const completed = await client.completeTask(taskResult.task.id, {
      completedByAgentId: worker.agent.id,
      summary: "Smoke validation completed"
    });

    const tasks = await client.listTasks(host.session.id);
    console.log(
      JSON.stringify(
        {
          sessionId: host.session.id,
          memberCount: 2,
          claimedStatus: claimed?.processingStatus ?? null,
          completedMessageStatus: completedMessage?.processingStatus ?? null,
          completedStatus: completed.status,
          taskCount: tasks.length
        },
        null,
        2
      )
    );
  } finally {
    await instance.close();
  }
};

main().catch((error) => {
  console.error("Smoke test failed.", error);
  process.exitCode = 1;
});
