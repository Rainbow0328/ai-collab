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

process.env.LOOPMARSHAL_LOG_ROTATION = "false";

const smokePort = 42784;
const smokeBaseUrl = `http://127.0.0.1:${smokePort}`;
const rootDir = process.cwd();
const cliEntry = resolve(rootDir, "apps/cli/dist/apps/cli/src/index.js");
const stateDir = resolve(rootDir, ".loopmarshal-test", "smoke-cli-profile-permission");

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
  await mkdir(resolve(rootDir, ".loopmarshal-test"), { recursive: true });
  await rm(stateDir, { recursive: true, force: true });
  await mkdir(stateDir, { recursive: true });

  process.env.LOOPMARSHAL_KNOWLEDGE_ROOT = resolve(stateDir, ".knowledge");
  const { startCoreServer } = await import("@loopmarshal/core");

  const instance = await startCoreServer({
    host: "127.0.0.1",
    port: smokePort,
    databasePath: resolve(stateDir, "profile-permission.sqlite")
  });

  try {
    const env = {
      LOOPMARSHAL_BASE_URL: smokeBaseUrl,
      LOOPMARSHAL_CLI_STATE_DIR: resolve(stateDir, ".loopmarshal")
    };
    const sessionName = `profile-perm-${Date.now()}`;
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

    const hostSet = await runCliJson({
      args: ["profile", "set", hostName, "--session", sessionName, "collaboration", "host prefers autonomous progression"],
      env
    });
    assert(hostSet.op === "PROFILE_SET", "host should set profile");
    assert(hostSet.entry?.key === "collaboration", "entry key should match");

    const hostGet = await runCliJson({
      args: ["profile", "get", hostName, "--session", sessionName, "collaboration"],
      env
    });
    assert(hostGet.op === "PROFILE_GET", "host should get profile");
    assert(
      hostGet.entries?.collaboration === "host prefers autonomous progression",
      "host should read what was set"
    );

    const keeperSet = await runCliJson({
      args: ["profile", "set", keeperName, "--session", sessionName, "knowledge_habits", "keeper records observations"],
      env
    });
    assert(keeperSet.op === "PROFILE_SET", "keeper should set profile");

    const keeperGet = await runCliJson({
      args: ["profile", "get", keeperName, "--session", sessionName],
      env
    });
    assert(keeperGet.op === "PROFILE_GET", "keeper should get profile");

    const workerGetDenied = await runCli({
      args: ["profile", "get", workerName, "--session", sessionName],
      env
    });
    assert(workerGetDenied.exitCode !== 0, "worker profile get should be denied");

    const workerSetDenied = await runCli({
      args: ["profile", "set", workerName, "--session", sessionName, "forbidden", "workers cannot write profile"],
      env
    });
    assert(workerSetDenied.exitCode !== 0, "worker profile set should be denied");

    const hostDelete = await runCliJson({
      args: ["profile", "delete", hostName, "--session", sessionName, "collaboration"],
      env
    });
    assert(hostDelete.op === "PROFILE_DELETE", "host should delete profile entry");

    console.log(
      JSON.stringify(
        {
          sessionName,
          hostSetOp: hostSet.op,
          hostGetOp: hostGet.op,
          keeperSetOp: keeperSet.op,
          keeperGetOp: keeperGet.op,
          workerGetDenied: workerGetDenied.exitCode !== 0,
          workerSetDenied: workerSetDenied.exitCode !== 0,
          hostDeleteOp: hostDelete.op
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
  console.error("CLI profile permission smoke test failed.", error);
  process.exitCode = 1;
});
