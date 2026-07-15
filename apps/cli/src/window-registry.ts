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
import type { AgentPlatform, ConnectionMode } from "@loopmarshal/protocol";

import type { WindowProfile } from "./window-profile.js";

export type WindowRegistryEntry = {
  windowName: string;
  identity: string;
  role: "host" | "worker" | "knowledge_keeper";
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
  expectedRole?: "host" | "worker" | "knowledge_keeper"
): WindowRegistryEntry => {
  void projectRoot;

  if (profile) {
    if (profile.sessionName !== sessionName) {
      throw new Error(
        `name="${windowName}" is bound to session="${profile.sessionName}" but requested session="${sessionName}". Run loopmarshal reset ${windowName} --session ${sessionName} first, then re-attach.`
      );
    }

    return {
      windowName: profile.windowName,
      identity: profile.identity,
      role: profile.role === "host" ? "host" : profile.role === "knowledge_keeper" ? "knowledge_keeper" : "worker",
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
      `name="${windowName}" has no local binding and role cannot be inferred. Use loopmarshal attach <name> --session <sessionName> --role <host|worker|knowledge_keeper> --duty "<description>" instead.`
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
