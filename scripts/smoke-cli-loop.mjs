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

import { startCoreServer } from "@loopmarshal/core";

const smokePort = 42703;
const smokeBaseUrl = `http://127.0.0.1:${smokePort}`;
const rootDir = process.cwd();
const cliEntry = resolve(rootDir, "apps/cli/dist/apps/cli/src/index.js");
const stateDir = resolve(rootDir, ".loopmarshal-test", "smoke-cli-loop");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const internalCommandToArgs = (cmd) => {
  assert(
    typeof cmd === "string" && cmd.startsWith("loopmarshal "),
    "cmd should be a runnable loopmarshal command string"
  );
  return cmd.slice("loopmarshal ".length).trim().split(/\s+/);
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

  const instance = await startCoreServer({
    host: "127.0.0.1",
    port: smokePort,
    databasePath: ".loopmarshal-test/smoke-cli-loop.sqlite"
  });

  try {
    const env = {
      LOOPMARSHAL_BASE_URL: smokeBaseUrl,
      LOOPMARSHAL_CLI_STATE_DIR: stateDir
    };
    const sessionName = `cli-loop-${Date.now()}`;
    const hostName = "main-host";
    const workerName = "frontend-worker";

    const host = await runCliJson({
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
    const worker = await runCliJson({
      args: [
        "attach",
        workerName,
        "--session",
        sessionName,
        "--role",
        "worker",
        "--duty",
        "负责执行分派下来的开发任务并回报结果"
      ],
      env
    });
    const dispatch = await runCliJson({
      args: [
        "dispatch-many",
        hostName,
        "--session",
        sessionName,
        "--task",
        `${workerName}::请返回 cli submit 测试成功`
      ],
      env
    });
    const workerAwait = await runCliJson({
      args: ["await", workerName, "--session", sessionName],
      env
    });
    const workerSubmit = await runCliJson({
      args: [
        "submit",
        workerName,
        "--session",
        sessionName,
        "--content",
        "cli submit 测试成功"
      ],
      env
    });
    const hostAwait = await runCliJson({
      args: internalCommandToArgs(dispatch.cmd),
      env
    });

    assert(host.op === "SESSION_READY", "host attach should succeed");
    assert(worker.op === "SESSION_READY", "worker attach should succeed");
    assert(dispatch.op === "EXECUTE_INTERNAL_CMD", "dispatch-many should hand off to await");
    assert(
      workerAwait.op === "PROCESS_CLAIMED_MESSAGE" &&
        workerAwait.kind === "task",
      "worker await should claim one task"
    );
    assert(workerSubmit.op === "EXECUTE_INTERNAL_CMD", "submit should hand off back to await");
    assert(
      hostAwait.op === "PROCESS_CLAIMED_MESSAGE" &&
        hostAwait.kind === "report" &&
        hostAwait.message?.content === "cli submit 测试成功",
      "host await should receive the worker report"
    );

    console.log(
      JSON.stringify(
        {
          sessionName,
          dispatchOp: dispatch.op,
          workerAwaitOp: workerAwait.op,
          workerSubmitOp: workerSubmit.op,
          hostAwaitOp: hostAwait.op
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
  console.error("CLI loop smoke test failed.", error);
  process.exitCode = 1;
});
