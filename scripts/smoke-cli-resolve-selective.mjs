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

const smokePort = 42783;
const smokeBaseUrl = `http://127.0.0.1:${smokePort}`;
const rootDir = process.cwd();
const cliEntry = resolve(rootDir, "apps/cli/dist/apps/cli/src/index.js");
const stateDir = resolve(rootDir, ".ai-collab-test", "smoke-cli-resolve-selective");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const runCli = async ({ args, env }) => {
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

  return {
    exitCode,
    stdout,
    stderr,
    json: stdout ? JSON.parse(stdout) : null
  };
};

const runCliJson = async (input) => {
  const result = await runCli(input);
  if (result.exitCode !== 0) {
    throw new Error(
      `CLI command failed (${input.args.join(" ")}): ${result.stderr || result.stdout || result.exitCode}`
    );
  }
  return result.json;
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
    databasePath: resolve(stateDir, "resolve-selective.sqlite")
  });

  try {
    const env = {
      AI_COLLAB_BASE_URL: smokeBaseUrl,
      AI_COLLAB_CLI_STATE_DIR: resolve(stateDir, ".ai-collab")
    };
    const client = createAiCollabClient({ baseUrl: smokeBaseUrl });
    const sessionName = `resolve-selective-${Date.now()}`;
    const hostName = "main-host";
    const workerOneName = "worker-one";
    const workerTwoName = "worker-two";

    await runCliJson({
      args: ["attach", hostName, "--session", sessionName, "--role", "host"],
      env
    });
    await runCliJson({
      args: ["attach", workerOneName, "--session", sessionName, "--role", "worker", "--duty", "work one"],
      env
    });
    await runCliJson({
      args: ["attach", workerTwoName, "--session", sessionName, "--role", "worker", "--duty", "work two"],
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
    const hostAgent = members.find((m) => m.agentName === hostName);
    const workerOne = members.find((m) => m.agentName === workerOneName);
    const workerTwo = members.find((m) => m.agentName === workerTwoName);
    assert(hostAgent && workerOne && workerTwo, "all members should exist");

    await client.sendMessage({
      sessionId: session.id,
      fromAgentId: workerOne.id,
      toAgentId: hostAgent.id,
      type: "result",
      payload: { content: "worker one done", result: "done" },
      correlationId: "selective-report-one"
    });
    await client.sendMessage({
      sessionId: session.id,
      fromAgentId: workerTwo.id,
      toAgentId: hostAgent.id,
      type: "result",
      payload: { content: "worker two done", result: "done" },
      correlationId: "selective-report-two"
    });

    const hostAwait = await runCliJson({
      args: ["await", hostName, "--session", sessionName],
      env
    });
    assert(
      hostAwait.op === "PROCESS_CLAIMED_MESSAGES",
      `host should claim both reports, got ${hostAwait.op}`
    );
    assert(hostAwait.messageCount === 2, "host should claim both reports");
    const messageIds = hostAwait.messages.map((m) => m.id || m.messageId);
    assert(messageIds.length === 2, "should have 2 message ids");

    const selectiveResolve = await runCliJson({
      args: [
        "resolve", hostName,
        "--session", sessionName,
        "--message-id", messageIds[0],
        "--summary", "resolved first report only"
      ],
      env
    });
    assert(
      selectiveResolve.op === "HOST_DECISION_REQUIRED",
      `selective resolve should return HOST_DECISION_REQUIRED, got ${selectiveResolve.op}`
    );
    assert(selectiveResolve.resolvedCount === 1, "should resolve only 1 message");
    assert(
      selectiveResolve.resolvedMessageIds.length === 1,
      "resolvedMessageIds should contain 1 id"
    );

    const secondHostAwait = await runCliJson({
      args: ["await", hostName, "--session", sessionName],
      env
    });
    assert(
      secondHostAwait.op === "PROCESS_CLAIMED_MESSAGES",
      `host should still have the second claimed message, got ${secondHostAwait.op}`
    );
    assert(secondHostAwait.messageCount === 1, "host should have 1 remaining message");

    const resolveAll = await runCliJson({
      args: [
        "resolve", hostName,
        "--session", sessionName,
        "--summary", "resolved remaining report"
      ],
      env
    });
    assert(
      resolveAll.op === "HOST_DECISION_REQUIRED",
      `resolve all should return HOST_DECISION_REQUIRED, got ${resolveAll.op}`
    );
    assert(resolveAll.resolvedCount === 1, "should resolve the remaining message");

    const finalAwait = await runCliJson({
      args: ["await", hostName, "--session", sessionName],
      env
    });
    assert(
      finalAwait.op === "PROCESS_SESSION_IDLE",
      `host should be idle after resolving all, got ${finalAwait.op}`
    );

    console.log(
      JSON.stringify(
        {
          sessionName,
          firstClaimCount: hostAwait.messageCount,
          selectiveResolveCount: selectiveResolve.resolvedCount,
          remainingClaimCount: secondHostAwait.messageCount,
          finalResolveCount: resolveAll.resolvedCount,
          finalIdleOp: finalAwait.op
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
  console.error("CLI resolve selective smoke test failed.", error);
  process.exitCode = 1;
});
