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

const smokePort = 42703;
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
    databasePath: ".ai-collab-test/smoke-session-release.sqlite"
  });

  try {
    const client = createAiCollabClient({ baseUrl: smokeBaseUrl });
    const sessionName = `reusable-session-${Date.now()}`;

    const host = await client.hostSessionByName(sessionName, {
      agentName: "release-host",
      displayName: "Release Host",
      platform: "trae",
      capabilities: ["planning"],
      connectionMode: "skill-bridge"
    });

    const worker = await client.joinNamedSession(sessionName, {
      agentName: "release-worker",
      displayName: "Release Worker",
      platform: "cursor",
      role: "worker",
      capabilities: ["backend"],
      connectionMode: "skill-bridge"
    });

    const workerLeave = await client.leaveAgent(worker.agent.id);
    const membersAfterWorkerLeave = await client.getMembers(host.session.id);
    const hostLeave = await client.leaveAgent(host.agent.id);
    let sessionAfterHostLeaveMissing = false;
    try {
      await client.getSession(host.session.id);
    } catch {
      sessionAfterHostLeaveMissing = true;
    }
    let membersAfterHostLeaveMissing = false;
    try {
      await client.getMembers(host.session.id);
    } catch {
      membersAfterHostLeaveMissing = true;
    }

    assert(workerLeave.sessionClosed === false, "session should stay open until last agent leaves");
    assert(hostLeave.sessionDeleted === true, "host leave should delete the session");
    assert(
      membersAfterWorkerLeave.length === 1,
      "worker leave should remove worker from member list"
    );
    assert(
      membersAfterWorkerLeave[0]?.agentName === "release-host",
      "host should be the only remaining member after worker leave"
    );
    assert(
      sessionAfterHostLeaveMissing,
      "session should be deleted after the host leaves"
    );
    assert(
      membersAfterHostLeaveMissing,
      "member list lookup should fail after the host leaves and the session is deleted"
    );

    const recreated = await client.hostSessionByName(sessionName, {
      agentName: "release-host-2",
      displayName: "Release Host 2",
      platform: "codex",
      capabilities: ["planning"],
      connectionMode: "skill-bridge"
    });

    assert(recreated.session.id !== host.session.id, "recreated session should be a new session");
    assert(recreated.session.name === sessionName, "recreated session should reuse the same name");

    console.log(
      JSON.stringify(
        {
          sessionName,
          originalSessionId: host.session.id,
          workerLeave,
          membersAfterWorkerLeave: membersAfterWorkerLeave.map((member) => member.agentName),
          hostLeave,
          sessionAfterHostLeaveMissing,
          membersAfterHostLeaveMissing,
          recreatedSessionId: recreated.session.id
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
  console.error("Session release smoke test failed.", error);
  process.exitCode = 1;
});
