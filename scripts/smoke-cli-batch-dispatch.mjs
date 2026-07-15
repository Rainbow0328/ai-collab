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

const smokePort = 42731;
const smokeBaseUrl = `http://127.0.0.1:${smokePort}`;
const rootDir = process.cwd();
const cliEntry = resolve(rootDir, "apps/cli/dist/apps/cli/src/index.js");
const stateDir = resolve(rootDir, ".loopmarshal-test", "smoke-cli-batch-dispatch");

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

  const instance = await startCoreServer({
    host: "127.0.0.1",
    port: smokePort,
    databasePath: ".loopmarshal-test/smoke-cli-batch-dispatch.sqlite"
  });

  try {
    const env = {
      LOOPMARSHAL_BASE_URL: smokeBaseUrl,
      LOOPMARSHAL_CLI_STATE_DIR: stateDir
    };
    const client = createLoopMarshalClient({ baseUrl: smokeBaseUrl });
    const sessionName = `member-batch-dispatch-${Date.now()}`;
    const hostName = "main-host";
    const workerFront = "frontend-worker";
    const workerBack = "backend-worker";

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
        workerFront,
        "--session",
        sessionName,
        "--role",
        "worker",
        "--duty",
        "负责前端页面开发与交互实现"
      ],
      env
    });
    await runCliJson({
      args: [
        "attach",
        workerBack,
        "--session",
        sessionName,
        "--role",
        "worker",
        "--duty",
        "负责后端接口实现与数据模型调整"
      ],
      env
    });

    await client.updateWindowBindingDefaults(sessionName, hostName, {
      intervalSeconds: 1,
      maxRounds: 4
    });

    const dispatchMany = await runCliJson({
      args: [
        "dispatch-many",
        hostName,
        "--session",
        sessionName,
        "--task",
        `${workerFront}::请实现商品发布页面`,
        "--task",
        `${workerFront}::请补齐商品详情页交互`,
        "--task",
        `${workerBack}::请实现商品发布接口和评论接口`
      ],
      env
    });

    assert(
      dispatchMany.op === "EXECUTE_INTERNAL_CMD",
      "dispatch-many should hand back an executable internal command"
    );
    assert(
      typeof dispatchMany.cmd === "string" &&
        dispatchMany.cmd ===
          `loopmarshal await ${hostName} --session ${sessionName}`,
      "dispatch-many should return a fully assembled host await command"
    );

    const session = await client.getSessionByName(sessionName);
    const members = await client.getMembers(session.id);
    const frontAgent = members.find((member) => member.agentName === workerFront);
    const backAgent = members.find((member) => member.agentName === workerBack);
    assert(frontAgent, "front worker should exist after attach");
    assert(backAgent, "back worker should exist after attach");

    const frontInbox = await client.getInboxWithOptions(frontAgent.id, {
      pendingOnly: true
    });
    const backInbox = await client.getInboxWithOptions(backAgent.id, {
      pendingOnly: true
    });

    assert(
      frontInbox.length === 1,
      "dispatch-many should merge same-batch tasks for the same worker into one pending message"
    );
    assert(
      backInbox.length === 1,
      "dispatch-many should create one pending message for the second worker"
    );

    const frontPayload = frontInbox[0]?.payload ?? {};
    const backPayload = backInbox[0]?.payload ?? {};

    assert(
      typeof frontPayload.content === "string" &&
        frontPayload.content.includes("请实现商品发布页面") &&
        frontPayload.content.includes("请补齐商品详情页交互"),
      "merged same-worker batch payload should contain both task blocks"
    );
    assert(
      typeof backPayload.content === "string" &&
        backPayload.content.includes("请实现商品发布接口和评论接口"),
      "second worker should receive its own batch task content"
    );

    console.log(
      JSON.stringify(
        {
          sessionName,
          hostContinueCmd: dispatchMany.cmd,
          frontPendingCount: frontInbox.length,
          backPendingCount: backInbox.length
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
  console.error("CLI batch dispatch smoke test failed.", error);
  process.exitCode = 1;
});
