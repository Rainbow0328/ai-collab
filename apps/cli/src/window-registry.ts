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
import type { AgentPlatform, ConnectionMode } from "@ai-collab/protocol";

import type { WindowProfile } from "./window-profile.js";

export type WindowRegistryEntry = {
  windowName: string;
  identity: string;
  role: "host" | "worker";
  roleDescription: string | null;
  platform: AgentPlatform;
  agentName: string;
  displayName: string;
  sessionName: string;
  capabilities: string[];
  connectionMode: ConnectionMode;
  source: "derived" | "profile";
};

const inferLegacyRole = (
  windowName: string
): "host" | "worker" | null => {
  const normalized = windowName.trim().toLowerCase();
  if (normalized.startsWith("host-")) {
    return "host";
  }
  if (normalized.startsWith("worker-")) {
    return "worker";
  }
  return null;
};

export const resolveWindowRegistryEntry = (
  projectRoot: string,
  sessionName: string,
  windowName: string,
  profile?: WindowProfile,
  expectedRole?: "host" | "worker"
): WindowRegistryEntry => {
  void projectRoot;

  if (profile) {
    if (profile.sessionName !== sessionName) {
      throw new Error(
        `name="${windowName}" 当前绑定的 session="${profile.sessionName}" 与请求的 session="${sessionName}" 不一致。请先执行 ai-collab reset ${windowName} --session ${sessionName}，再重新接入。`
      );
    }

    return {
      windowName: profile.windowName,
      identity: profile.identity,
      role: profile.role === "host" ? "host" : "worker",
      roleDescription: profile.roleDescription,
      platform: profile.platform,
      agentName: profile.agentName,
      displayName: profile.displayName,
      sessionName: profile.sessionName,
      capabilities: profile.capabilities,
      connectionMode: "skill-bridge",
      source: "profile"
    };
  }

  const role = expectedRole ?? inferLegacyRole(windowName);
  if (!role) {
    throw new Error(
      `name="${windowName}" 当前没有可用的本地绑定，也无法从旧兼容命令推断角色。请改用 ai-collab attach <name> --session <sessionName> --role <host|worker> --duty "<职责>"。`
    );
  }

  return {
    windowName,
    identity: `${sessionName}::${windowName}`,
    role,
    roleDescription: null,
    platform: "generic" as AgentPlatform,
    agentName: windowName,
    displayName: windowName,
    sessionName,
    capabilities: [],
    connectionMode: "skill-bridge",
    source: "derived"
  };
};
