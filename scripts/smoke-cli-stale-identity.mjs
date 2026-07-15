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
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

import { startCoreServer } from "@loopmarshal/core";
import { createLoopMarshalClient } from "@loopmarshal/sdk";

const smokePort = 42713;
const smokeBaseUrl = `http://127.0.0.1:${smokePort}`;
const rootDir = process.cwd();
const cliEntry = resolve(rootDir, "apps/cli/dist/apps/cli/src/index.js");
const stateDir = resolve(rootDir, ".loopmarshal-test", "smoke-cli-stale-identity");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const runCli = async ({ args, env, expectFailure = false }) => {
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

  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });

  if (!expectFailure && exitCode !== 0) {
    throw new Error(
      `CLI command failed (${args.join(" ")}): ${stderr || stdout || exitCode}`
    );
  }

  if (expectFailure && exitCode === 0) {
    throw new Error(`CLI command should have failed: ${args.join(" ")}`);
  }

  return {
    exitCode,
    stdout,
    stderr,
    json: stdout ? JSON.parse(stdout) : null
  };
};

const main = async () => {
  await mkdir(dirname(stateDir), { recursive: true });
  await rm(stateDir, { recursive: true, force: true });

  const instance = await startCoreServer({
    host: "127.0.0.1",
    port: smokePort,
    databasePath: ".loopmarshal-test/smoke-cli-stale-identity.sqlite"
  });

  try {
    const env = {
      LOOPMARSHAL_BASE_URL: smokeBaseUrl,
      LOOPMARSHAL_CLI_STATE_DIR: stateDir,
      LOOPMARSHAL_ENABLE_AUXILIARY_CLI_COMMANDS: "1"
    };
    const client = createLoopMarshalClient({ baseUrl: smokeBaseUrl });
    const sessionName = `cli-stale-${Date.now()}`;
    const hostName = "main-host";
    const hostIdentity = `${sessionName}::${hostName}`;

    await runCli({
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
    const hostedSession = await client.getSessionByName(sessionName);
    const members = await client.getMembers(hostedSession.id);
    const hostAgent = members.find((member) => member.agentName === hostName);
    assert(hostAgent, "attached host should exist in the session");

    await client.deleteSession(hostedSession.id, {
      requesterAgentId: hostAgent.id
    });

    const staleRead = await runCli({
      args: ["members", "--identity", hostIdentity],
      env,
      expectFailure: true
    });

    assert(
      staleRead.json?.error?.message?.includes("已自动清理"),
      "stale identity failure should mention auto cleanup"
    );

    const remainingIdentities = await runCli({
      args: ["identities"],
      env
    });
    const remainingIdentityCount = Array.isArray(remainingIdentities.json?.identities)
      ? remainingIdentities.json.identities.filter(
          (item) => item.identity === hostIdentity
        ).length
      : -1;
    assert(
      remainingIdentityCount === 0,
      "stale identity storage should be empty after auto cleanup"
    );

    console.log(
      JSON.stringify(
        {
          sessionName,
          staleMessage: staleRead.json.error.message,
          remainingIdentityCount
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
  console.error("CLI stale identity smoke test failed.", error);
  process.exitCode = 1;
});
