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
import { createAiCollabClient } from "@ai-collab/sdk";

export const createSmokeClient = (baseUrl, label) => {
  return createAiCollabClient({
    baseUrl,
    headers: {
      "x-ai-collab-client": label,
      "x-ai-collab-process": String(process.pid)
    }
  });
};
