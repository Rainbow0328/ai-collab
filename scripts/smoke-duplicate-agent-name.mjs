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
import {
  AiCollabSdkError,
  createAiCollabClient
} from "@ai-collab/sdk";

const smokePort = 42700;
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
    databasePath: ".ai-collab-test/smoke-duplicate-agent-name.sqlite"
  });

  try {
    const client = createAiCollabClient({ baseUrl: smokeBaseUrl });
    const sessionName = `duplicate-agent-${Date.now()}`;

    await client.hostSessionByName(sessionName, {
      agentName: "dup-host",
      displayName: "Duplicate Host",
      platform: "codex",
      capabilities: ["planning"],
      connectionMode: "skill-bridge"
    });

    const firstWorker = await client.joinNamedSession(sessionName, {
      agentName: "dup-worker",
      displayName: "Worker One",
      platform: "claude",
      role: "worker",
      capabilities: ["backend"],
      connectionMode: "skill-bridge"
    });

    let duplicateErrorCode = null;
    let duplicateStatusCode = null;

    try {
      await client.joinNamedSession(sessionName, {
        agentName: "dup-worker",
        displayName: "Worker Two",
        platform: "cursor",
        role: "worker",
        capabilities: ["frontend"],
        connectionMode: "skill-bridge"
      });
    } catch (error) {
      if (error instanceof AiCollabSdkError) {
        duplicateErrorCode = error.code ?? null;
        duplicateStatusCode = error.statusCode;
      } else {
        throw error;
      }
    }

    assert(firstWorker.agent.agentName === "dup-worker", "first worker should join successfully");
    assert(
      duplicateErrorCode === "DUPLICATE_AGENT_NAME",
      "duplicate join should return DUPLICATE_AGENT_NAME"
    );
    assert(duplicateStatusCode === 409, "duplicate join should return status 409");

    console.log(
      JSON.stringify(
        {
          sessionName,
          firstWorkerAgentId: firstWorker.agent.id,
          duplicateErrorCode,
          duplicateStatusCode
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
  console.error("Duplicate agent name smoke test failed.", error);
  process.exitCode = 1;
});
