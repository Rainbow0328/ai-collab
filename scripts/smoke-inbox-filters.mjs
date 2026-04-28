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
import { startCoreServer } from "@ai-collab/core";
import { createAiCollabClient } from "@ai-collab/sdk";

const smokePort = 42701;
const smokeBaseUrl = `http://127.0.0.1:${smokePort}`;

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const main = async () => {
  const instance = await startCoreServer({
    host: "127.0.0.1",
    port: smokePort,
    databasePath: ".ai-collab-test/smoke-inbox-filters.sqlite"
  });

  try {
    const client = createAiCollabClient({ baseUrl: smokeBaseUrl });
    const sessionName = `inbox-filters-${Date.now()}`;

    const host = await client.hostSessionByName(sessionName, {
      agentName: "filters-host",
      displayName: "Filters Host",
      platform: "codex",
      capabilities: ["planning"],
      connectionMode: "skill-bridge"
    });

    const worker = await client.joinNamedSession(sessionName, {
      agentName: "filters-worker",
      displayName: "Filters Worker",
      platform: "claude",
      role: "worker",
      capabilities: ["backend"],
      connectionMode: "skill-bridge"
    });

    const firstMessage = await client.sendMessage({
      sessionId: host.session.id,
      fromAgentId: host.agent.id,
      toAgentId: worker.agent.id,
      type: "instruction",
      payload: {
        content: "first task",
        result: "pending"
      }
    });

    const secondMessage = await client.sendMessage({
      sessionId: host.session.id,
      fromAgentId: host.agent.id,
      toAgentId: worker.agent.id,
      type: "instruction",
      payload: {
        content: "second task",
        result: "pending"
      }
    });

    const pendingBeforeClaim = await client.getInboxWithOptions(worker.agent.id, {
      pendingOnly: true
    });
    const claimedBeforeClaim = await client.getInboxWithOptions(worker.agent.id, {
      claimedOnly: true
    });

    const claimed = await client.claimNext(worker.agent.id);
    const pendingAfterClaim = await client.getInboxWithOptions(worker.agent.id, {
      pendingOnly: true
    });
    const claimedAfterClaim = await client.getInboxWithOptions(worker.agent.id, {
      claimedOnly: true
    });

    assert(claimed, "one message should be claimed");

    const completed = await client.completeMessage(claimed.id, {
      agentId: worker.agent.id
    });

    const pendingAfterComplete = await client.getInboxWithOptions(worker.agent.id, {
      pendingOnly: true
    });
    const claimedAfterComplete = await client.getInboxWithOptions(worker.agent.id, {
      claimedOnly: true
    });

    assert(pendingBeforeClaim.length === 2, "pending inbox before claim should contain two messages");
    assert(claimedBeforeClaim.length === 0, "claimed inbox before claim should be empty");
    assert(claimed.id === firstMessage.id, "claim-next should claim the earliest pending message");
    assert(pendingAfterClaim.length === 1, "pending inbox after claim should contain one message");
    assert(claimedAfterClaim.length === 1, "claimed inbox after claim should contain one message");
    assert(claimedAfterClaim[0]?.id === firstMessage.id, "claimed inbox should contain the claimed message");
    assert(completed.processingStatus === "processed", "completed message should be processed");
    assert(pendingAfterComplete.length === 1, "pending inbox after complete should still contain one message");
    assert(pendingAfterComplete[0]?.id === secondMessage.id, "remaining pending message should be the second one");
    assert(claimedAfterComplete.length === 0, "claimed inbox after complete should be empty");

    console.log(
      JSON.stringify(
        {
          sessionName,
          firstMessageId: firstMessage.id,
          secondMessageId: secondMessage.id,
          claimedMessageId: claimed.id,
          pendingBeforeClaim: pendingBeforeClaim.length,
          claimedBeforeClaim: claimedBeforeClaim.length,
          pendingAfterClaim: pendingAfterClaim.length,
          claimedAfterClaim: claimedAfterClaim.length,
          pendingAfterComplete: pendingAfterComplete.length,
          claimedAfterComplete: claimedAfterComplete.length
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
  console.error("Inbox filters smoke test failed.", error);
  process.exitCode = 1;
});
