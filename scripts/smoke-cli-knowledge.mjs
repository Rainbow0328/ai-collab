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

process.env.AI_COLLAB_LOG_ROTATION = "false";

const smokePort = 42780;
const smokeBaseUrl = `http://127.0.0.1:${smokePort}`;
const rootDir = process.cwd();
const cliEntry = resolve(rootDir, "apps/cli/dist/apps/cli/src/index.js");
const stateDir = resolve(rootDir, ".ai-collab-test", "smoke-cli-knowledge");

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
  const { createAiCollabClient } = await import("@ai-collab/sdk");

  const instance = await startCoreServer({
    host: "127.0.0.1",
    port: smokePort,
    databasePath: resolve(stateDir, "knowledge.sqlite")
  });

  try {
    const env = {
      AI_COLLAB_BASE_URL: smokeBaseUrl,
      AI_COLLAB_CLI_STATE_DIR: resolve(stateDir, ".ai-collab")
    };
    const client = createAiCollabClient({ baseUrl: smokeBaseUrl });
    const sessionName = `knowledge-${Date.now()}`;
    const hostName = "main-host";
    const workerName = "worker-one";
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
        "update-current",
        hostName,
        "--session",
        sessionName,
        "--level",
        "l1",
        "--content",
        content
      ],
      env
    });
    assert(upserted.op === "KNOWLEDGE_UPDATE_CURRENT", "host should update-current knowledge");
    assert(upserted.slug === "current", "upserted document slug should be current");

    const userFeedbackContent =
      "User feedback corrected the current session direction and must take priority.";
    const userFeedbackUpserted = await runCliJson({
      args: [
        "knowledge",
        "update-current",
        hostName,
        "--session",
        sessionName,
        "--level",
        "l1",
        "--content",
        userFeedbackContent,
        "--source-kind",
        "user_feedback"
      ],
      env
    });
    assert(
      userFeedbackUpserted.op === "KNOWLEDGE_UPDATE_CURRENT",
      "host should update-current with user_feedback source kind"
    );

    const userFeedbackChanges = await client.listKnowledgeChanges({
      slug: "current",
      level: "l1",
      sessionId: (await client.getSessionByName(sessionName)).id,
      limit: 5
    });
    assert(
      userFeedbackChanges.some((change) => change.sourceKind === "user_feedback"),
      "knowledge changes should retain user_feedback as the source kind"
    );

    const read = await runCliJson({
      args: [
        "knowledge",
        "read-current",
        workerName,
        "--session",
        sessionName,
        "--level",
        "l1",
        "--max-chars",
        "200"
      ],
      env
    });
    assert(read.op === "KNOWLEDGE_READ_CURRENT", "worker should read-current knowledge");
    assert(
      read.document?.content === userFeedbackContent,
      "worker read should return the latest host-updated knowledge content"
    );

    const denied = await runCli({
      args: [
        "knowledge",
        "update-current",
        workerName,
        "--session",
        sessionName,
        "--level",
        "l1",
        "--content",
        "Workers cannot write knowledge."
      ],
      env
    });
    assert(denied.exitCode !== 0, "worker update-current should be denied");
    assert(denied.json?.error, "denied worker update-current should return an error payload");

    const nonCurrentSlugDenied = await runCli({
      args: [
        "knowledge",
        "upsert",
        hostName,
        "--session",
        sessionName,
        "--level",
        "l1",
        "--slug",
        "smoke/non-current-slug",
        "--title",
        "Denied",
        "--content",
        "Non-current slugs should be rejected."
      ],
      env
    });
    assert(nonCurrentSlugDenied.exitCode !== 0, "non-current slug upsert should be denied");

    console.log(
      JSON.stringify(
        {
          sessionName,
          updateCurrentOp: upserted.op,
          userFeedbackSourceRecorded: userFeedbackChanges.some(
            (change) => change.sourceKind === "user_feedback"
          ),
          readCurrentOp: read.op,
          workerUpdateCurrentDenied: denied.exitCode !== 0,
          nonCurrentSlugDenied: nonCurrentSlugDenied.exitCode !== 0
        },
        null,
        2
      )
    );

    // ==========================================
    // Judgement + Fulfil Flow
    // ==========================================

    const judgeResult = await runCliJson({
      args: [
        "knowledge", "judge", hostName,
        "--session", sessionName,
        "--source", "user_message",
        "--source-message-id", "msg-judge-001",
        "--knowledge-build-required", "true",
        "--target-levels", "l1,l2",
        "--source-kind", "user_feedback",
        "--reason", "用户提出了新功能需要更新L1和L2",
        "--next-action", "knowledge_upsert_then_dispatch"
      ],
      env
    });
    assert(
      judgeResult.op === "KNOWLEDGE_BUILD_JUDGEMENT_CREATED",
      "knowledge judge should create a judgement"
    );
    assert(judgeResult.judgement.knowledgeBuildRequired === true, "knowledgeBuildRequired should be true");
    assert(judgeResult.judgement.targetLevels.length === 2, "targetLevels should contain l1 and l2");
    const judgementId = judgeResult.judgement.id;

    const updateWithFulfil = await runCliJson({
      args: [
        "knowledge", "update-current", hostName,
        "--session", sessionName,
        "--level", "l1",
        "--content", "Direction updated from user feedback via judge flow.",
        "--source-kind", "user_feedback",
        "--judgement-id", judgementId
      ],
      env
    });
    assert(updateWithFulfil.op === "KNOWLEDGE_UPDATE_CURRENT", "update-current with judgement-id should succeed");
    assert(
      updateWithFulfil.fulfilledJudgement !== null,
      "judgement should be auto-fulfilled after update-current"
    );
    assert(
      updateWithFulfil.fulfilledJudgement.fulfilledAt !== null,
      "fulfilledAt should be set"
    );
    assert(
      updateWithFulfil.fulfilledJudgement.fulfilledKnowledgeRefs.includes("l1/current"),
      "fulfilledKnowledgeRefs should contain l1/current"
    );

    const fulfilResult = await runCliJson({
      args: [
        "knowledge", "fulfil-judgement", hostName,
        "--session", sessionName,
        "--judgement-id", judgementId
      ],
      env
    });
    assert(
      fulfilResult.op === "KNOWLEDGE_BUILD_JUDGEMENT_FULFILLED",
      "explicit fulfil-judgement should succeed even if already fulfilled"
    );

    console.log(
      JSON.stringify(
        {
          judgementFlow: {
            judgeCreated: judgeResult.op === "KNOWLEDGE_BUILD_JUDGEMENT_CREATED",
            autoFulfilledViaUpsert: upsertWithFulfil.fulfilledJudgement !== null,
            explicitFulfilOk: fulfilResult.op === "KNOWLEDGE_BUILD_JUDGEMENT_FULFILLED",
            passed: true
          }
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
