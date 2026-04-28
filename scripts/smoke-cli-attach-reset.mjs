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

const smokePort = 42726;
const smokeBaseUrl = `http://127.0.0.1:${smokePort}`;
const rootDir = process.cwd();
const stateDir = resolve(rootDir, ".ai-collab-test", "smoke-cli-attach-reset");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const main = async () => {
  await mkdir(resolve(rootDir, ".ai-collab-test"), { recursive: true });
  await rm(stateDir, { recursive: true, force: true });

  const instance = await startCoreServer({
    host: "127.0.0.1",
    port: smokePort,
    databasePath: ".ai-collab-test/smoke-cli-attach-reset.sqlite"
  });

  try {
    const client = createSmokeClient(smokeBaseUrl, "smoke-cli-attach-reset");
    const sessionA = `member-session-a-${Date.now()}`;
    const sessionB = `member-session-b-${Date.now()}`;
    const hostName = "main-host";
    const workerName = "frontend-worker";

    const hostA = await client.attachNamedSession(sessionA, {
      agentName: hostName,
      role: "host",
      roleDescription: "主控编排"
    });
    const workerA = await client.attachNamedSession(sessionA, {
      agentName: workerName,
      role: "worker",
      roleDescription: "负责学生管理前端页面开发"
    });
    const hostB = await client.attachNamedSession(sessionB, {
      agentName: hostName,
      role: "host",
      roleDescription: "主控编排"
    });

    assert(
      hostA.agent.agentName === hostName && hostA.session.name === sessionA,
      "attach host should bind the host into session A"
    );
    assert(
      workerA.agent.agentName === workerName && workerA.session.name === sessionA,
      "attach worker should bind the worker into session A"
    );
    assert(
      workerA.agent.roleDescription === "负责学生管理前端页面开发",
      "attach worker should persist the provided duty"
    );
    assert(
      hostB.agent.agentName === hostName && hostB.session.name === sessionB,
      "the same member name should be reusable under a different session"
    );

    const sessionInfoA = await client.getSessionByName(sessionA);
    const sessionInfoB = await client.getSessionByName(sessionB);
    const membersA = await client.getMembers(sessionInfoA.id);
    const membersB = await client.getMembers(sessionInfoB.id);

    assert(
      membersA.some((member) => member.agentName === hostName),
      "session A should include the host"
    );
    assert(
      membersA.some(
        (member) =>
          member.agentName === workerName &&
          member.roleDescription === "负责学生管理前端页面开发"
      ),
      "session A should include the worker with duty"
    );
    assert(
      membersB.some((member) => member.agentName === hostName),
      "session B should include the reused host name independently"
    );

    await client.deleteSessionByName(sessionA, {
      requesterAgentId: hostA.agent.id
    });

    let sessionADeleted = false;
    try {
      await client.getSession(sessionInfoA.id);
    } catch {
      sessionADeleted = true;
    }
    const membersBAfterReset = await client.getMembers(sessionInfoB.id);

    assert(
      sessionADeleted,
      "resetting the host should clean up session A entirely"
    );
    assert(
      membersBAfterReset.some((member) => member.agentName === hostName),
      "resetting session A must not affect the same name in session B"
    );

    console.log(
      JSON.stringify(
        {
          sessionA,
          sessionB,
          hostAgentIdA: hostA.agent.id,
          workerAgentIdA: workerA.agent.id,
          hostAgentIdB: hostB.agent.id
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
  console.error("CLI attach/reset smoke test failed.", error);
  process.exitCode = 1;
});
