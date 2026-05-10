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

const smokePort = 42707;
const smokeBaseUrl = `http://127.0.0.1:${smokePort}`;
const rootDir = process.cwd();
const cliEntry = resolve(rootDir, "apps/cli/dist/apps/cli/src/index.js");
const stateDir = resolve(rootDir, ".ai-collab-test", "smoke-cli-host-execute");

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
    typeof result?.cmd === "string" &&
      result.cmd.startsWith("ai-collab "),
    `${expectedMode} should return a runnable ai-collab command string`
  );
  return result.cmd.slice("ai-collab ".length).trim().split(/\s+/);
};

const main = async () => {
  await mkdir(resolve(rootDir, ".ai-collab-test"), { recursive: true });
  await rm(stateDir, { recursive: true, force: true });

  const instance = await startCoreServer({
    host: "127.0.0.1",
    port: smokePort,
    databasePath: ".ai-collab-test/smoke-cli-host-execute.sqlite"
  });

  try {
    const env = {
      AI_COLLAB_BASE_URL: smokeBaseUrl,
      AI_COLLAB_CLI_STATE_DIR: stateDir
    };
    const client = createAiCollabClient({ baseUrl: smokeBaseUrl });
    const sessionName = `cli-host-execute-${Date.now()}`;
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
        "负责执行分派下来的开发任务并回报结果"
      ],
      env
    });

    const session = await client.getSessionByName(sessionName);
    const members = await client.getMembers(session.id);
    const hostAgent = members.find((member) => member.agentName === hostName);
    const workerAgent = members.find((member) => member.agentName === workerName);
    assert(hostAgent, "host should exist");
    assert(workerAgent, "worker should exist");

    await client.updateWindowBindingDefaults(sessionName, hostName, {
      intervalSeconds: 1,
      maxRounds: 3
    });

    await client.sendMessage({
      sessionId: session.id,
      fromAgentId: workerAgent.id,
      toAgentId: hostAgent.id,
      type: "instruction",
      payload: {
        content: "请 host 本地处理并回复：host execute 成功",
        result: "pending"
      },
      correlationId: "cli-host-task-1"
    });

    const hostAwaitMessage = await runCliJson({
      args: ["await", hostName, "--session", sessionName],
      env
    });

    const hostResolve = await runCliJson({
      args: [
        "resolve",
        hostName,
        "--session",
        sessionName,
        "--summary",
        "host 已完成本地处理",
        "--reply-content",
        "host execute 成功"
      ],
      env
    });

    assert(
      hostResolve.op === "HOST_DECISION_REQUIRED",
      `resolve should return HOST_DECISION_REQUIRED, got ${hostResolve.op}`
    );

    const hostAwaitAfterResolve = await runCliJson({
      args: ["await", hostName, "--session", sessionName],
      env
    });

    const workerInbox = await client.getInbox(workerAgent.id);
    const hostReply = workerInbox.find(
      (message) => message.correlationId === "cli-host-task-1"
    );

    assert(
      hostAwaitMessage.op === "PROCESS_CLAIMED_MESSAGES" &&
        hostAwaitMessage.kind === "task" &&
        hostAwaitMessage.message?.content === "请 host 本地处理并回复：host execute 成功",
      "await should expose the normalized host task"
    );
    assert(
      hostAwaitAfterResolve.op === "END_TURN_SILENTLY" ||
        hostAwaitAfterResolve.op === "EXECUTE_INTERNAL_CMD",
      "the returned await command should stay inside the wait protocol when no follow-up message arrives"
    );
    assert(
      hostReply?.payload &&
        typeof hostReply.payload === "object" &&
        hostReply.payload.content === "host execute 成功",
      "original sender should receive the host reply"
    );

    console.log(
      JSON.stringify(
        {
          sessionName,
          hostAwaitMessageKind: hostAwaitMessage.kind,
          hostResolveOp: hostResolve.op,
          hostReplyReceived: hostReply?.id ?? null,
          hostAwaitAfterResolveStatus: hostAwaitAfterResolve.status
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
  console.error("CLI host execute smoke test failed.", error);
  process.exitCode = 1;
});
