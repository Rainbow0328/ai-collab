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
import { rm } from "node:fs/promises";

import { startCoreServer } from "@ai-collab/core";
import { AiCollabSdkError, createAiCollabClient } from "@ai-collab/sdk";

const smokePort = 42711;
const smokeBaseUrl = `http://127.0.0.1:${smokePort}`;
const databasePath = ".ai-collab-test/smoke-session-lifecycle.sqlite";

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const expectNotFound = async (task, label) => {
  try {
    await task();
  } catch (error) {
    if (
      error instanceof AiCollabSdkError &&
      error.statusCode === 404
    ) {
      return;
    }

    throw error;
  }

  throw new Error(`${label} should return 404.`);
};

const main = async () => {
  await rm(databasePath, { force: true });

  const instance = await startCoreServer({
    host: "127.0.0.1",
    port: smokePort,
    databasePath
  });

  try {
    const client = createAiCollabClient({ baseUrl: smokeBaseUrl });
    const sessionName = `lifecycle-${Date.now()}`;

    const host = await client.createSession({
      sessionName,
      agentName: "host-main",
      displayName: "Host Main",
      platform: "trae",
      capabilities: ["planning"],
      connectionMode: "skill-bridge"
    });

    const worker = await client.joinSessionByName({
      sessionName,
      agentName: "worker-alpha",
      displayName: "Worker Alpha",
      platform: "cursor",
      role: "worker",
      capabilities: ["backend"],
      connectionMode: "skill-bridge"
    });

    await client.sendMessage({
      sessionId: host.session.id,
      fromAgentId: host.agent.id,
      toAgentId: worker.agent.id,
      type: "instruction",
      payload: {
        content: "请处理一个临时任务",
        result: "pending"
      },
      correlationId: "smoke-lifecycle-1"
    });

    const workerInboxBeforeRemoval = await client.getInbox(worker.agent.id);
    assert(
      workerInboxBeforeRemoval.length === 1,
      "worker should receive one pending message before removal"
    );

    const removal = await client.removeSessionMember({
      sessionId: host.session.id,
      requesterAgentId: host.agent.id,
      targetAgentId: worker.agent.id
    });
    assert(
      removal.sessionDeleted === false,
      "removing one worker should not delete the session while host remains"
    );
    assert(
      removal.agentName === "worker-alpha",
      "removal result should contain the removed agent name"
    );

    const membersAfterRemoval = await client.getMembers(host.session.id);
    assert(
      membersAfterRemoval.length === 1 &&
        membersAfterRemoval[0].id === host.agent.id,
      "only host should remain after worker removal"
    );

    await expectNotFound(
      () => client.getInbox(worker.agent.id),
      "removed worker inbox lookup"
    );

    const rejoinedWorker = await client.joinSessionByName({
      sessionName,
      agentName: "worker-alpha",
      displayName: "Worker Alpha Rejoined",
      platform: "cursor",
      role: "worker",
      capabilities: ["backend"],
      connectionMode: "skill-bridge"
    });
    assert(
      rejoinedWorker.agent.agentName === "worker-alpha",
      "worker should be able to rejoin with the same agent name after removal"
    );

    const activeDeletion = await client.deleteSession(host.session.id, {
      requesterAgentId: host.agent.id
    });
    assert(
      activeDeletion.deleted === true,
      "host should be able to delete an active session directly"
    );

    await expectNotFound(
      () => client.getSession(host.session.id),
      "deleted session lookup by id"
    );
    await expectNotFound(
      () => client.getSessionByName(sessionName),
      "deleted session lookup by name"
    );

    const recreated = await client.createSession({
      sessionName,
      agentName: "host-main",
      displayName: "Host Main Recreated",
      platform: "trae",
      capabilities: ["planning"],
      connectionMode: "skill-bridge"
    });
    assert(
      recreated.session.name === sessionName,
      "same session name should be reusable after cleanup"
    );

    const leaveSession = await client.createSession({
      sessionName: `${sessionName}-leave`,
      agentName: "host-leave",
      displayName: "Host Leave",
      platform: "trae",
      capabilities: ["planning"],
      connectionMode: "skill-bridge"
    });
    const hostLeave = await client.leaveAgent(leaveSession.agent.id);
    assert(
      hostLeave.sessionDeleted === true,
      "host leaving should still auto-delete the whole session"
    );

    console.log(
      JSON.stringify(
        {
          sessionName,
          removedAgentName: removal.agentName,
          activeDeletionSessionId: activeDeletion.sessionId,
          sessionDeletedAfterHostLeave: hostLeave.sessionDeleted,
          recreatedSessionId: recreated.session.id
        },
        null,
        2
      )
    );
  } finally {
    await instance.close();
    await rm(databasePath, { force: true });
  }
};

main().catch((error) => {
  console.error("Session lifecycle smoke test failed.", error);
  process.exitCode = 1;
});
