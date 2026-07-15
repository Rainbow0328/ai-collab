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
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

import { createAiCollabClient } from "@ai-collab/sdk";

process.env.AI_COLLAB_LOG_ROTATION = "false";

const smokePort = 42781;
const smokeBaseUrl = `http://127.0.0.1:${smokePort}`;
const rootDir = process.cwd();
const cliEntry = resolve(rootDir, "apps/cli/dist/apps/cli/src/index.js");
const stateDir = resolve(rootDir, ".ai-collab-test", "smoke-cli-host-batch-await");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const runCliJson = async ({ args, env }) => {
  const child = spawn(process.execPath, [cliEntry, ...args], {
    cwd: rootDir,
    env: {
      ...process.env,
      ...env
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const exitCode = await new Promise((resolveCode, reject) => {
    child.on("error", reject);
    child.on("close", resolveCode);
  });

  if (exitCode !== 0) {
    throw new Error(
      `CLI command failed (${args.join(" ")}): ${stderr || stdout || exitCode}`
    );
  }

  return JSON.parse(stdout);
};

const assertExecuteCmd = (result, expectedMode) => {
  assert(
    result?.op === "EXECUTE_INTERNAL_CMD",
    `${expectedMode} should return an internal execute-cmd handoff`
  );
  assert(
    typeof result?.cmd === "string" && result.cmd.startsWith("ai-collab "),
    `${expectedMode} should return a runnable ai-collab command string`
  );
  return result.cmd.slice("ai-collab ".length).trim().split(/\s+/);
};

const main = async () => {
  await mkdir(resolve(rootDir, ".ai-collab-test"), { recursive: true });
  await rm(stateDir, { recursive: true, force: true });
  await mkdir(stateDir, { recursive: true });

  process.env.AI_COLLAB_KNOWLEDGE_ROOT = resolve(stateDir, ".knowledge");
  const { startCoreServer } = await import("@ai-collab/core");

  const instance = await startCoreServer({
    host: "127.0.0.1",
    port: smokePort,
    databasePath: resolve(stateDir, "host-batch-await.sqlite")
  });

  try {
    const env = {
      AI_COLLAB_BASE_URL: smokeBaseUrl,
      AI_COLLAB_CLI_STATE_DIR: resolve(stateDir, ".ai-collab")
    };
    const client = createAiCollabClient({ baseUrl: smokeBaseUrl });
    const sessionName = `host-batch-await-${Date.now()}`;
    const hostName = "main-host";
    const workerOneName = "worker-one";
    const workerTwoName = "worker-two";

    await runCliJson({
      args: ["attach", hostName, "--session", sessionName, "--role", "host", "--duty", "plan and dispatch"],
      env
    });
    await runCliJson({
      args: ["attach", workerOneName, "--session", sessionName, "--role", "worker", "--duty", "execute work one"],
      env
    });
    await runCliJson({
      args: ["attach", workerTwoName, "--session", sessionName, "--role", "worker", "--duty", "execute work two"],
      env
    });

    await client.updateWindowBindingDefaults(sessionName, hostName, {
      intervalSeconds: 1,
      maxRounds: 1
    });
    await client.updateWindowBindingDefaults(sessionName, workerOneName, {
      intervalSeconds: 1,
      maxRounds: 1
    });
    await client.updateWindowBindingDefaults(sessionName, workerTwoName, {
      intervalSeconds: 1,
      maxRounds: 1
    });

    const session = await client.getSessionByName(sessionName);
    const members = await client.getMembers(session.id);
    const hostAgent = members.find((member) => member.agentName === hostName);
    const workerOne = members.find((member) => member.agentName === workerOneName);
    const workerTwo = members.find((member) => member.agentName === workerTwoName);
    assert(hostAgent && workerOne && workerTwo, "all members should exist");

    await client.sendMessage({
      sessionId: session.id,
      fromAgentId: workerOne.id,
      toAgentId: hostAgent.id,
      type: "result",
      payload: { content: "worker one done", result: "done" },
      correlationId: "batch-report-one"
    });
    await client.sendMessage({
      sessionId: session.id,
      fromAgentId: workerTwo.id,
      toAgentId: hostAgent.id,
      type: "progress",
      payload: { content: "worker two pending", result: "pending" },
      correlationId: "batch-report-two"
    });

    const firstHostAwait = await runCliJson({
      args: ["await", hostName, "--session", sessionName],
      env
    });
    assert(
      firstHostAwait.op === "PROCESS_CLAIMED_MESSAGE",
      `host await should return a claimed message batch, got ${firstHostAwait.op}`
    );
    assert(firstHostAwait.messageCount === 2, "host should claim both reports");

    const restoredHostAwait = await runCliJson({
      args: ["await", hostName, "--session", sessionName],
      env
    });
    assert(
      restoredHostAwait.op === "PROCESS_CLAIMED_MESSAGE" &&
        restoredHostAwait.messageCount === 2,
      "host await should restore the already claimed batch before claiming anything else"
    );

    const resolveMany = await runCliJson({
      args: ["resolve-many", hostName, "--session", sessionName, "--summary", "reviewed worker reports"],
      env
    });
    const nextAwaitArgs = assertExecuteCmd(resolveMany, "resolve-many");

    await runCliJson({
      args: ["await", workerOneName, "--session", sessionName],
      env
    });
    await runCliJson({
      args: ["await", workerTwoName, "--session", sessionName],
      env
    });

    const hostAfterResolve = await runCliJson({
      args: nextAwaitArgs,
      env
    });
    assert(
      hostAfterResolve.op === "PROCESS_SESSION_IDLE",
      `host should move to next planning stage after resolving batch, got ${hostAfterResolve.op}`
    );

    console.log(
      JSON.stringify(
        {
          sessionName,
          firstHostAwaitOp: firstHostAwait.op,
          restoredCount: restoredHostAwait.messageCount,
          hostAfterResolveOp: hostAfterResolve.op
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
  console.error("CLI host batch await smoke test failed.", error);
  process.exitCode = 1;
});
