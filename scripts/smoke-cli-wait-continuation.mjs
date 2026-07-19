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
import { createLoopMarshalClient } from "@loopmarshal/sdk";

const smokePort = 42728;
const smokeBaseUrl = `http://127.0.0.1:${smokePort}`;
const rootDir = process.cwd();
const cliEntry = resolve(rootDir, "apps/cli/dist/apps/cli/src/index.js");
const stateDir = resolve(rootDir, ".loopmarshal-test", "smoke-cli-wait-continuation");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const runCliJson = async ({ args, env, delayedActions = [] }) => {
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

  const timers = delayedActions.map(({ delayMs, run }) =>
    setTimeout(() => {
      void run();
    }, delayMs)
  );

  const exitCode = await new Promise((resolveCode, reject) => {
    child.on("error", reject);
    child.on("close", resolveCode);
  });

  for (const timer of timers) {
    clearTimeout(timer);
  }

  if (exitCode !== 0) {
    throw new Error(
      `CLI command failed (${args.join(" ")}): ${stderr || stdout || exitCode}`
    );
  }

  return JSON.parse(stdout);
};

const internalCommandToArgs = (cmd) => {
  assert(
    typeof cmd === "string" && cmd.startsWith("loopmarshal "),
    "cmd should be a runnable loopmarshal command string"
  );
  return cmd.slice("loopmarshal ".length).trim().split(/\s+/);
};

const main = async () => {
  await mkdir(resolve(rootDir, ".loopmarshal-test"), { recursive: true });
  await rm(stateDir, { recursive: true, force: true });

  const instance = await startCoreServer({
    host: "127.0.0.1",
    port: smokePort,
    databasePath: ".loopmarshal-test/smoke-cli-wait-continuation.sqlite"
  });

  try {
    const env = {
      LOOPMARSHAL_BASE_URL: smokeBaseUrl,
      LOOPMARSHAL_CLI_STATE_DIR: stateDir
    };
    const client = createLoopMarshalClient({ baseUrl: smokeBaseUrl });
    const sessionName = `member-wait-cont-${Date.now()}`;
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
        "负责执行前端页面与交互相关任务"
      ],
      env
    });

    const session = await client.getSessionByName(sessionName);
    const members = await client.getMembers(session.id);
    const hostAgent = members.find((member) => member.agentName === hostName);
    const workerAgent = members.find((member) => member.agentName === workerName);
    assert(hostAgent, "host should be registered as a session member");
    assert(workerAgent, "worker should be registered as a session member");

    await client.updateWindowBindingDefaults(sessionName, hostName, {
      intervalSeconds: 1,
      maxRounds: 4
    });
    await client.updateWindowBindingDefaults(sessionName, workerName, {
      intervalSeconds: 1,
      maxRounds: 4
    });

    const firstWorkerWait = await runCliJson({
      args: ["await", workerName, "--session", sessionName],
      env,
      delayedActions: [
        {
          delayMs: 600,
          run: () =>
            client.sendMessage({
              sessionId: session.id,
              fromAgentId: hostAgent.id,
              toAgentId: workerAgent.id,
              type: "instruction",
              payload: {
                content: "请确认：持续等待已接到任务",
                result: "pending"
              },
              correlationId: `wait-cont-worker-${Date.now()}`,
              idempotencyKey: `wait-cont-worker:${Date.now()}`
            })
        }
      ]
    });

    assert(
      firstWorkerWait.op === "PROCESS_CLAIMED_MESSAGE" &&
        firstWorkerWait.status === "task_claimed" &&
        firstWorkerWait.message?.content === "请确认：持续等待已接到任务",
      "await should consume internal continuations and return only after claiming the task"
    );

    const hostDispatch = await runCliJson({
      args: [
        "dispatch-many",
        hostName,
        "--session",
        sessionName,
        "--task",
        `${workerName}::请处理：host dispatch-many 续等链验证`
      ],
      env,
      delayedActions: [
        {
          delayMs: 600,
          run: () =>
            client.sendMessage({
              sessionId: session.id,
              fromAgentId: workerAgent.id,
              toAgentId: hostAgent.id,
              type: "result",
              payload: {
                content: "dispatch-many 持续等待已收到 worker 回报",
                result: "completed"
              },
              correlationId: `dispatch-wait-host-${Date.now()}`,
              idempotencyKey: `dispatch-wait-host:${Date.now()}`
            })
        }
      ]
    });

    assert(
      hostDispatch.op === "PROCESS_CLAIMED_MESSAGE" &&
        hostDispatch.status === "message_claimed" &&
        hostDispatch.message?.content === "dispatch-many 持续等待已收到 worker 回报",
      "dispatch-many should enter await and return only after claiming a worker report"
    );

    console.log(
      JSON.stringify(
        {
          sessionName,
          firstWorkerWaitOp: firstWorkerWait.op,
          workerWaitStatus: firstWorkerWait.status,
          hostDispatchOp: hostDispatch.op,
          hostDispatchStatus: hostDispatch.status
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
  console.error("CLI wait continuation smoke test failed.", error);
  process.exitCode = 1;
});
