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

import { createLoopMarshalClient } from "@loopmarshal/sdk";

process.env.LOOPMARSHAL_LOG_ROTATION = "false";

const smokePort = 42779;
const smokeBaseUrl = `http://127.0.0.1:${smokePort}`;
const rootDir = process.cwd();
const cliEntry = resolve(rootDir, "apps/cli/dist/apps/cli/src/index.js");
const stateDir = resolve(rootDir, ".loopmarshal-test", "smoke-cli-session-idle");

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

const main = async () => {
  await mkdir(resolve(rootDir, ".loopmarshal-test"), { recursive: true });
  await rm(stateDir, { recursive: true, force: true });
  await mkdir(stateDir, { recursive: true });

  process.env.LOOPMARSHAL_KNOWLEDGE_ROOT = resolve(stateDir, ".knowledge");
  const { startCoreServer } = await import("@loopmarshal/core");

  const instance = await startCoreServer({
    host: "127.0.0.1",
    port: smokePort,
    databasePath: resolve(stateDir, "session-idle.sqlite")
  });

  try {
    const env = {
      LOOPMARSHAL_BASE_URL: smokeBaseUrl,
      LOOPMARSHAL_CLI_STATE_DIR: resolve(stateDir, ".loopmarshal")
    };
    const client = createLoopMarshalClient({ baseUrl: smokeBaseUrl });
    const sessionName = `session-idle-${Date.now()}`;
    const hostName = "main-host";
    const workerName = "worker-one";

    await runCliJson({
      args: [
        "attach",
        hostName,
        "--session",
        sessionName,
        "--role",
        "host",
        "--duty",
        "plan and dispatch"
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
        "execute assigned tasks"
      ],
      env
    });

    await client.updateWindowBindingDefaults(sessionName, hostName, {
      intervalSeconds: 1,
      maxRounds: 1
    });
    await client.updateWindowBindingDefaults(sessionName, workerName, {
      intervalSeconds: 1,
      maxRounds: 1
    });

    const workerWait = await runCliJson({
      args: ["await", workerName, "--session", sessionName],
      env
    });
    assert(
      workerWait.op === "EXECUTE_INTERNAL_CMD" ||
        workerWait.op === "END_TURN_SILENTLY",
      "worker wait should enter a waiting state without claiming a task"
    );

    const hostWait = await runCliJson({
      args: ["await", hostName, "--session", sessionName],
      env
    });
    assert(
      hostWait.op === "PROCESS_SESSION_IDLE",
      `host await should stop waiting when all workers are idle, got ${hostWait.op}`
    );
    assert(
      hostWait.status === "all_workers_waiting",
      "host idle control result should expose all_workers_waiting status"
    );

    console.log(
      JSON.stringify(
        {
          sessionName,
          workerWaitOp: workerWait.op,
          hostWaitOp: hostWait.op,
          hostWaitStatus: hostWait.status
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
  console.error(error);
  process.exitCode = 1;
});
