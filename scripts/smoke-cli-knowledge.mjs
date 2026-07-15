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

const smokePort = 42780;
const smokeBaseUrl = `http://127.0.0.1:${smokePort}`;
const rootDir = process.cwd();
const cliEntry = resolve(rootDir, "apps/cli/dist/apps/cli/src/index.js");
const stateDir = resolve(rootDir, ".loopmarshal-test", "smoke-cli-knowledge");

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
  const { createLoopMarshalClient } = await import("@loopmarshal/sdk");

  const instance = await startCoreServer({
    host: "127.0.0.1",
    port: smokePort,
    databasePath: resolve(stateDir, "knowledge.sqlite")
  });

  try {
    const env = {
      LOOPMARSHAL_BASE_URL: smokeBaseUrl,
      LOOPMARSHAL_CLI_STATE_DIR: resolve(stateDir, ".loopmarshal")
    };
    const client = createLoopMarshalClient({ baseUrl: smokeBaseUrl });
    const sessionName = `knowledge-${Date.now()}`;
    const hostName = "main-host";
    const workerName = "worker-one";
    const slug = "smoke/session-direction";
    const userFeedbackSlug = "smoke/user-feedback-direction";
    const content = "Current session direction: host owns knowledge updates; workers may read refs only.";

    await runCliJson({
      args: [
        "attach",
        hostName,
        "--session",
        sessionName,
        "--role",
        "host",
        "--duty",
        "plan and maintain knowledge"
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

    const upserted = await runCliJson({
      args: [
        "knowledge",
        "upsert",
        hostName,
        "--session",
        sessionName,
        "--level",
        "l1",
        "--slug",
        slug,
        "--title",
        "Smoke Session Direction",
        "--content",
        content,
        "--summary",
        "Host-owned knowledge update smoke",
        "--tags",
        "smoke,session",
        "--change-summary",
        "Create smoke L1 direction"
      ],
      env
    });
    assert(upserted.op === "KNOWLEDGE_UPSERTED", "host should upsert knowledge");
    assert(upserted.document?.slug === slug, "upserted document slug should match");

    const userFeedbackContent =
      "User feedback corrected the current session direction and must take priority.";
    const userFeedbackUpserted = await runCliJson({
      args: [
        "knowledge",
        "upsert",
        hostName,
        "--session",
        sessionName,
        "--level",
        "l1",
        "--slug",
        userFeedbackSlug,
        "--title",
        "Smoke User Feedback Direction",
        "--content",
        userFeedbackContent,
        "--summary",
        "User feedback source smoke",
        "--source-kind",
        "user_feedback",
        "--change-summary",
        "User feedback corrected the L1 direction"
      ],
      env
    });
    assert(
      userFeedbackUpserted.op === "KNOWLEDGE_UPSERTED",
      "host should upsert user-feedback knowledge"
    );

    const userFeedbackChanges = await client.listKnowledgeChanges({
      slug: userFeedbackSlug,
      limit: 5
    });
    assert(
      userFeedbackChanges.some((change) => change.sourceKind === "user_feedback"),
      "knowledge changes should retain user_feedback as the source kind"
    );

    const read = await runCliJson({
      args: [
        "knowledge",
        "read",
        workerName,
        "--session",
        sessionName,
        "--ref",
        `L1/${slug}`,
        "--max-chars",
        "200"
      ],
      env
    });
    assert(read.op === "KNOWLEDGE_READ", "worker should read knowledge");
    assert(
      read.document?.content === content,
      "worker read should return the host-upserted knowledge content"
    );

    const denied = await runCli({
      args: [
        "knowledge",
        "upsert",
        workerName,
        "--session",
        sessionName,
        "--level",
        "l1",
        "--slug",
        "smoke/worker-denied",
        "--title",
        "Denied",
        "--content",
        "Workers cannot write knowledge."
      ],
      env
    });
    assert(denied.exitCode !== 0, "worker knowledge upsert should be denied");
    assert(denied.json?.error, "denied worker upsert should return an error payload");

    console.log(
      JSON.stringify(
        {
          sessionName,
          upsertOp: upserted.op,
          userFeedbackSourceRecorded: userFeedbackChanges.some(
            (change) => change.sourceKind === "user_feedback"
          ),
          readOp: read.op,
          workerUpsertDenied: denied.exitCode !== 0
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
