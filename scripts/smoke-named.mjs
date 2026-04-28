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
import { createAiCollabClient } from "@ai-collab/sdk";
import { startCoreServer } from "@ai-collab/core";

const main = async () => {
  const instance = await startCoreServer();

  try {
    const client = createAiCollabClient();
    const sessionName = `named-${Date.now()}`;

    const host = await client.hostSessionByName(sessionName, {
      agentName: "named-host",
      displayName: "Named Host",
      platform: "codex",
      capabilities: ["planning"],
      connectionMode: "skill-bridge"
    });

    const resolved = await client.getSessionByName(sessionName);

    const worker = await client.joinNamedSession(sessionName, {
      agentName: "named-worker",
      displayName: "Named Worker",
      platform: "claude",
      role: "worker",
      capabilities: ["backend"],
      connectionMode: "skill-bridge"
    });

    const message = await client.sendMessage({
      sessionId: resolved.id,
      fromAgentId: host.agent.id,
      toAgentId: worker.agent.id,
      type: "instruction",
      payload: {
        text: "Use name-based join flow"
      }
    });

    const claimed = await client.claimNext(worker.agent.id);

    console.log(
      JSON.stringify(
        {
          sessionName,
          resolvedSessionId: resolved.id,
          hostAgentId: host.agent.id,
          workerAgentId: worker.agent.id,
          messageId: message.id,
          claimedStatus: claimed?.processingStatus ?? null
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
  console.error("Named smoke test failed.", error);
  process.exitCode = 1;
});
