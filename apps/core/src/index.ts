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
import { fileURLToPath } from "node:url";

import { defaultCoreConfig } from "./config.js";
import { startCoreServer } from "./runtime.js";

export * from "./runtime.js";

const main = async () => {
  await startCoreServer(defaultCoreConfig);
};

const executedDirectly =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (executedDirectly) {
  main().catch((error: unknown) => {
    console.error("Failed to start ai-collab core.", error);
    process.exitCode = 1;
  });
}
