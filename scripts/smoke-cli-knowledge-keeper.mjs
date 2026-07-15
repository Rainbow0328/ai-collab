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
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
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

    // --- Attach all three members with required --duty ---
    await runCliJson({
      args: ["attach", hostName, "--session", sessionName, "--role", "host", "--duty", "主控编排"],
      env
    });
    await runCliJson({
      args: ["attach", workerName, "--session", sessionName, "--role", "worker", "--duty", "implementation"],
      env
    });
    await runCliJson({
      args: ["attach", keeperName, "--session", sessionName, "--role", "knowledge_keeper", "--duty", "知识维护"],
      env
    });

    // --- Verify all three members exist with correct roles ---
    const session = await client.getSessionByName(sessionName);
    const members = await client.getMembers(session.id);
    const hostAgent = members.find((m) => m.agentName === hostName);
    const workerAgent = members.find((m) => m.agentName === workerName);
    const keeperAgent = members.find((m) => m.agentName === keeperName);
    assert(hostAgent && workerAgent && keeperAgent, "all three members should exist");
    assert(keeperAgent.role === "knowledge_keeper", "keeper should have knowledge_keeper role");

    // --- Verify CLI members command ---
    const membersResult = await runCliJson({
      args: ["members", hostName, "--session", sessionName],
      env
    });
    assert(membersResult.op === "SESSION_MEMBERS", "host should see members list");
    assert(membersResult.members.length === 3, "should have 3 members");

    // --- Host upserts a knowledge document (should succeed) ---
    const hostUpsert = await runCliJson({
      args: [
        "knowledge", "upsert", hostName,
        "--session", sessionName,
        "--level", "l1",
        "--slug", "session-direction",
        "--title", "Session Direction",
        "--content", "Host wrote initial L1 document."
      ],
      env
    });
    assert(hostUpsert.op === "KNOWLEDGE_UPSERTED", "host should upsert successfully");

    // --- Keeper reads the document (should succeed — any role can read) ---
    const keeperRead = await runCliJson({
      args: [
        "knowledge", "read", keeperName,
        "--session", sessionName,
        "--ref", "l1/session-direction"
      ],
      env
    });
    assert(keeperRead.op === "KNOWLEDGE_READ", "keeper should read successfully");
    assert(
      keeperRead.document?.content === "Host wrote initial L1 document.",
      "keeper should read what host wrote"
    );

    // --- Keeper lists knowledge (should succeed — any role can list) ---
    const keeperList = await runCliJson({
      args: [
        "knowledge", "list", keeperName,
        "--session", sessionName,
        "--level", "l1"
      ],
      env
    });
    assert(keeperList.op === "KNOWLEDGE_LIST", "keeper should list successfully");

    // --- Keeper upserts a knowledge document (should succeed — knowledge_keeper can write) ---
    const keeperUpsert = await runCliJson({
      args: [
        "knowledge", "upsert", keeperName,
        "--session", sessionName,
        "--level", "l1",
        "--slug", "keeper-notes",
        "--title", "Keeper Notes",
        "--content", "Keeper updated L1 knowledge."
      ],
      env
    });
    assert(keeperUpsert.op === "KNOWLEDGE_UPSERTED", "keeper should upsert successfully (knowledge_keeper has write permission)");

    // --- Worker attempts upsert (should fail — requires host or knowledge_keeper role) ---
    const workerUpsertDenied = await runCli({
      args: [
        "knowledge", "upsert", workerName,
        "--session", sessionName,
        "--level", "l1",
        "--slug", "worker-test",
        "--title", "Worker Upsert Test",
        "--content", "Workers cannot upsert."
      ],
      env
    });
    assert(workerUpsertDenied.exitCode !== 0, "worker upsert should be denied (requires host or knowledge_keeper role)");

    // --- Verify session idle detection ---
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

    console.log(
      JSON.stringify(
        {
          sessionName,
          keeperRole: keeperAgent.role,
          hostUpsert: hostUpsert.op,
          keeperRead: keeperRead.op,
          keeperList: keeperList.op,
          keeperUpsert: keeperUpsert.op,
          workerUpsertDenied: workerUpsertDenied.exitCode !== 0,
          hostIdleOp: hostIdle.op,
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
