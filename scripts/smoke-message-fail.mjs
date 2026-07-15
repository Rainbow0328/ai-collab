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
import { startCoreServer } from "@loopmarshal/core";
import {
  LoopMarshalSdkError,
  createLoopMarshalClient
} from "@loopmarshal/sdk";

const smokePort = 42699;
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
    databasePath: ".loopmarshal-test/smoke-message-fail.sqlite"
  });

  try {
    const client = createLoopMarshalClient({ baseUrl: smokeBaseUrl });
    const sessionName = `message-fail-${Date.now()}`;

    const host = await client.hostSessionByName(sessionName, {
      agentName: "fail-host",
      displayName: "Fail Host",
      platform: "codex",
      capabilities: ["planning"],
      connectionMode: "skill-bridge"
    });

    const worker = await client.joinNamedSession(sessionName, {
      agentName: "fail-worker",
      displayName: "Fail Worker",
      platform: "claude",
      role: "worker",
      capabilities: ["backend"],
      connectionMode: "skill-bridge"
    });

    await client.sendMessage({
      sessionId: host.session.id,
      fromAgentId: host.agent.id,
      toAgentId: worker.agent.id,
      type: "instruction",
      correlationId: "fail-correlation",
      payload: {
        content: "simulate failure",
        result: "pending"
      }
    });

    const pendingBeforeClaim = await client.getInboxWithOptions(worker.agent.id, {
      pendingOnly: true
    });
    const claimed = await client.claimNext(worker.agent.id);
    const claimedOnlyBeforeFail = await client.getInboxWithOptions(worker.agent.id, {
      claimedOnly: true
    });

    assert(claimed, "worker should claim one message");

    const failed = await client.failMessage(claimed.id, {
      agentId: worker.agent.id,
      reason: "simulated failure"
    });

    const pendingAfterFail = await client.getInboxWithOptions(worker.agent.id, {
      pendingOnly: true
    });
    const claimedOnlyAfterFail = await client.getInboxWithOptions(worker.agent.id, {
      claimedOnly: true
    });

    let completionErrorCode = null;
    try {
      await client.completeMessage(claimed.id, {
        agentId: worker.agent.id
      });
    } catch (error) {
      if (error instanceof LoopMarshalSdkError) {
        completionErrorCode = error.code ?? null;
      } else {
        throw error;
      }
    }

    assert(pendingBeforeClaim.length === 1, "pending inbox before claim should contain one message");
    assert(claimedOnlyBeforeFail.length === 1, "claimed inbox before fail should contain one message");
    assert(failed.processingStatus === "failed", "message should be marked as failed");
    assert(failed.failureReason === "simulated failure", "failure reason should be persisted");
    assert(pendingAfterFail.length === 0, "pending inbox after fail should be empty");
    assert(claimedOnlyAfterFail.length === 0, "claimed inbox after fail should be empty");
    assert(
      completionErrorCode === "MESSAGE_ALREADY_FINISHED",
      "completing a failed message should return MESSAGE_ALREADY_FINISHED"
    );

    console.log(
      JSON.stringify(
        {
          sessionName,
          claimedMessageId: claimed.id,
          failedStatus: failed.processingStatus,
          failureReason: failed.failureReason,
          pendingBeforeClaim: pendingBeforeClaim.length,
          claimedBeforeFail: claimedOnlyBeforeFail.length,
          pendingAfterFail: pendingAfterFail.length,
          claimedAfterFail: claimedOnlyAfterFail.length,
          completionErrorCode
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
  console.error("Message fail smoke test failed.", error);
  process.exitCode = 1;
});
