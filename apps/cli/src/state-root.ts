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
import { homedir } from "node:os";
import { join } from "node:path";

const defaultWindowsStateDirName = "loopmarshal";
const defaultPosixStateDirName = ".loopmarshal";

export const getCliStateRoot = (projectRoot: string): string => {
  void projectRoot;
  const explicitStateRoot = process.env.LOOPMARSHAL_CLI_STATE_DIR?.trim();
  if (explicitStateRoot) {
    return explicitStateRoot;
  }

  const localAppData = process.env.LOCALAPPDATA?.trim();
  if (process.platform === "win32" && localAppData) {
    return join(localAppData, defaultWindowsStateDirName);
  }

  return join(homedir(), defaultPosixStateDirName);
};

export const getLegacyProjectStateRoot = (projectRoot: string): string => {
  return join(projectRoot, ".loopmarshal");
};
