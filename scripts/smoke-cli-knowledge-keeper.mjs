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

const smokePort = 42782;
const smokeBaseUrl = `http://127.0.0.1:${smokePort}`;
const rootDir = process.cwd();
const cliEntry = resolve(rootDir, "apps/cli/dist/apps/cli/src/index.js");
const stateDir = resolve(rootDir, ".ai-collab-test", "smoke-cli-knowledge-keeper");

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
    databasePath: resolve(stateDir, "knowledge-keeper.sqlite")
  });

  try {
    const env = {
      AI_COLLAB_BASE_URL: smokeBaseUrl,
      AI_COLLAB_CLI_STATE_DIR: resolve(stateDir, ".ai-collab")
    };
    const client = createAiCollabClient({ baseUrl: smokeBaseUrl });
    const sessionName = `keeper-${Date.now()}`;
    const hostName = "main-host";
    const workerName = "worker-a";
    const keeperName = "keeper";

    await runCliJson({
      args: ["attach", hostName, "--session", sessionName, "--role", "host"],
      env
    });
    await runCliJson({
      args: ["attach", workerName, "--session", sessionName, "--role", "worker", "--duty", "implementation"],
      env
    });
    await runCliJson({
      args: ["attach", keeperName, "--session", sessionName, "--role", "knowledge_keeper"],
      env
    });

    const session = await client.getSessionByName(sessionName);
    const members = await client.getMembers(session.id);
    const hostAgent = members.find((m) => m.agentName === hostName);
    const workerAgent = members.find((m) => m.agentName === workerName);
    const keeperAgent = members.find((m) => m.agentName === keeperName);
    assert(hostAgent && workerAgent && keeperAgent, "all three members should exist");
    assert(keeperAgent.role === "knowledge_keeper", "keeper should have knowledge_keeper role");

    const membersResult = await runCliJson({
      args: ["members", hostName, "--session", sessionName],
      env
    });
    assert(membersResult.op === "SESSION_MEMBERS", "host should see members list");
    assert(membersResult.members.length === 3, "should have 3 members");

    const hostUpdateCurrent = await runCliJson({
      args: [
        "knowledge", "update-current", hostName,
        "--session", sessionName,
        "--level", "l1",
        "--content", "Host wrote initial L1 current."
      ],
      env
    });
    assert(hostUpdateCurrent.op === "KNOWLEDGE_UPDATE_CURRENT", "host should update-current");

    const keeperReadCurrent = await runCliJson({
      args: [
        "knowledge", "read-current", keeperName,
        "--session", sessionName,
        "--level", "l1"
      ],
      env
    });
    assert(keeperReadCurrent.op === "KNOWLEDGE_READ_CURRENT", "keeper should read-current");
    assert(
      keeperReadCurrent.document?.content === "Host wrote initial L1 current.",
      "keeper should read what host wrote"
    );

    const keeperUpdateCurrent = await runCliJson({
      args: [
        "knowledge", "update-current", keeperName,
        "--session", sessionName,
        "--level", "l1",
        "--content", "Keeper updated L1 current with refined knowledge."
      ],
      env
    });
    assert(keeperUpdateCurrent.op === "KNOWLEDGE_UPDATE_CURRENT", "keeper should update-current");

    const workerUpdateCurrentDenied = await runCli({
      args: [
        "knowledge", "update-current", workerName,
        "--session", sessionName,
        "--level", "l1",
        "--content", "Workers cannot write knowledge."
      ],
      env
    });
    assert(workerUpdateCurrentDenied.exitCode !== 0, "worker update-current should be denied");

    await client.updateWindowBindingDefaults(sessionName, hostName, {
      intervalSeconds: 1,
      maxRounds: 1
    });
    await client.updateWindowBindingDefaults(sessionName, workerName, {
      intervalSeconds: 1,
      maxRounds: 1
    });
    await client.updateWindowBindingDefaults(sessionName, keeperName, {
      intervalSeconds: 1,
      maxRounds: 1
    });

    const hostIdle = await runCliJson({
      args: ["await", hostName, "--session", sessionName],
      env
    });
    assert(
      hostIdle.op === "PROCESS_SESSION_IDLE",
      `host should see idle state, got ${hostIdle.op}`
    );
    assert(
      hostIdle.businessWorkersIdle === true,
      "business workers should be idle"
    );
    assert(
      hostIdle.knowledgeKeepersIdle === true,
      "knowledge keepers should be idle"
    );
    assert(
      hostIdle.pendingKnowledgeTasks === false,
      "no pending knowledge tasks"
    );

    console.log(
      JSON.stringify(
        {
          sessionName,
          keeperRole: keeperAgent.role,
          hostUpdateCurrent: hostUpdateCurrent.op,
          keeperReadCurrent: keeperReadCurrent.op,
          keeperUpdateCurrent: keeperUpdateCurrent.op,
          keeperUpsert: keeperUpsert.op,
          workerUpdateCurrentDenied: workerUpdateCurrentDenied.exitCode !== 0,
          workerUpsertDenied: workerUpsertDenied.exitCode !== 0,
          hostIdleOp: hostIdle.op,
          businessWorkersIdle: hostIdle.businessWorkersIdle,
          knowledgeKeepersIdle: hostIdle.knowledgeKeepersIdle,
          pendingKnowledgeTasks: hostIdle.pendingKnowledgeTasks
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
  console.error("CLI knowledge keeper smoke test failed.", error);
  process.exitCode = 1;
});
