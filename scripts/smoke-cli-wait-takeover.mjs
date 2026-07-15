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
import { spawn } from "node:child_process";

import { startCoreServer } from "@ai-collab/core";
import { createAiCollabClient } from "@ai-collab/sdk";

const smokePort = 42727;
const smokeBaseUrl = `http://127.0.0.1:${smokePort}`;
const rootDir = process.cwd();
const cliEntry = resolve(rootDir, "apps/cli/dist/apps/cli/src/index.js");
const stateDir = resolve(rootDir, ".ai-collab-test", "smoke-cli-wait-takeover");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const sleep = async (milliseconds) => {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
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

const main = async () => {
  await mkdir(resolve(rootDir, ".ai-collab-test"), { recursive: true });
  await rm(stateDir, { recursive: true, force: true });

  const instance = await startCoreServer({
    host: "127.0.0.1",
    port: smokePort,
    databasePath: ".ai-collab-test/smoke-cli-wait-takeover.sqlite"
  });

  try {
    const env = {
      AI_COLLAB_BASE_URL: smokeBaseUrl,
      AI_COLLAB_CLI_STATE_DIR: stateDir
    };
    const client = createAiCollabClient({ baseUrl: smokeBaseUrl });
    const sessionName = `member-wait-takeover-${Date.now()}`;
    const hostName = "main-host";
    const workerName = "frontend-worker";

    await runCliJson({
      args: [
        "attach",
        hostName,
        "--session",
        sessionName,
        "--role",
        "host",
        "--duty",
        "主控编排"
      ],
      env
    });
    await runCliJson({
      args: [
        "attach",
        workerName,
        "--session",
        sessionName,
        "--role",
        "worker",
        "--duty",
        "负责执行等待链接管与前端任务验证"
      ],
      env
    });

    const session = await client.getSessionByName(sessionName);
    const members = await client.getMembers(session.id);
    const hostAgent = members.find((member) => member.agentName === hostName);
    const workerAgent = members.find((member) => member.agentName === workerName);
    assert(hostAgent, "host should be registered as a session member");
    assert(workerAgent, "worker should be registered as a session member");

    const firstAwaitPromise = runCliJson({
      args: ["await", workerName, "--session", sessionName],
      env
    });

    await sleep(1200);

    const secondAwaitPromise = runCliJson({
      args: ["await", workerName, "--session", sessionName],
      env
    });

    await sleep(2500);

    await client.sendMessage({
      sessionId: session.id,
      fromAgentId: hostAgent.id,
      toAgentId: workerAgent.id,
      type: "instruction",
      payload: {
        content: "请确认：新的等待链接管成功",
        result: "pending"
      },
      correlationId: `wait-takeover-${Date.now()}`,
      idempotencyKey: `wait-takeover:${Date.now()}`
    });

    const firstAwait = await firstAwaitPromise;
    const secondAwait = await secondAwaitPromise;

    assert(
      firstAwait.op === "END_TURN_SILENTLY",
      "the superseded wait chain should stop silently instead of failing or claiming work"
    );
    assert(
      secondAwait.op === "PROCESS_CLAIMED_MESSAGE" &&
        secondAwait.status === "task_claimed" &&
        secondAwait.message?.content === "请确认：新的等待链接管成功",
      "the newer wait chain should take over and claim the incoming task"
    );

    console.log(
      JSON.stringify(
        {
          sessionName,
          firstAwaitOp: firstAwait.op,
          secondAwaitStatus: secondAwait.status,
          claimedContent: secondAwait.message?.content ?? null
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
  console.error("CLI wait takeover smoke test failed.", error);
  process.exitCode = 1;
});
