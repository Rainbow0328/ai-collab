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
import type {
  AgentPlatform,
  AgentRole,
  ConnectionMode
} from "@ai-collab/protocol";
import { AiCollabSdkError, createAiCollabClient } from "@ai-collab/sdk";
import { errorCodes } from "@ai-collab/protocol";

import type { CliIdentityContext } from "./context.js";

export type WindowProfile = {
  windowKey: string;
  windowName: string;
  identity: string;
  sessionId: string;
  sessionName: string;
  agentId: string;
  agentName: string;
  displayName: string;
  platform: AgentPlatform;
  role: AgentRole;
  roleDescription: string | null;
  capabilities: string[];
  connectionMode: ConnectionMode;
  defaults: {
    intervalSeconds: number;
    maxRounds: number;
  };
  updatedAt: string;
};

const client = createAiCollabClient({
  headers: {
    "x-ai-collab-client": "cli",
    "x-ai-collab-process": String(process.pid)
  }
});

const bindingStoreDescriptor = "db://window-bindings";

export const buildWindowProfileKey = (
  sessionName: string,
  windowName: string
): string => {
  return `${sessionName}::${windowName}`;
};

const mapBindingToProfile = (binding: Awaited<ReturnType<typeof client.getWindowBinding>>): WindowProfile => {
  return {
    windowKey: binding.windowKey,
    windowName: binding.windowName,
    identity: binding.identity,
    sessionId: binding.sessionId,
    sessionName: binding.sessionName,
    agentId: binding.agentId,
    agentName: binding.agentName,
    displayName: binding.displayName,
    platform: binding.platform,
    role: binding.role,
    roleDescription: binding.roleDescription,
    capabilities: binding.capabilities,
    connectionMode: binding.connectionMode,
    defaults: {
      intervalSeconds: binding.defaults.intervalSeconds,
      maxRounds: binding.defaults.maxRounds
    },
    updatedAt: binding.runtimeState.updatedAt ?? binding.lastHeartbeatAt
  };
};

export const readWindowProfiles = async (
  projectRoot: string
): Promise<WindowProfile[]> => {
  void projectRoot;
  const bindings = await client.listWindowBindings();
  return bindings.map((binding) => mapBindingToProfile(binding));
};

export const readWindowProfile = async (
  projectRoot: string,
  sessionName: string,
  windowName: string
): Promise<WindowProfile | undefined> => {
  void projectRoot;
  try {
    const binding = await client.getWindowBinding(sessionName, windowName);
    return mapBindingToProfile(binding);
  } catch (error: unknown) {
    if (
      error instanceof AiCollabSdkError &&
      error.code === errorCodes.sessionNotFound
    ) {
      return undefined;
    }

    throw error;
  }
};

export const writeWindowProfile = async (
  projectRoot: string,
  profile: WindowProfile
): Promise<WindowProfile> => {
  void projectRoot;
  const binding = await client.updateWindowBindingDefaults(
    profile.sessionName,
    profile.windowName,
    {
      intervalSeconds: profile.defaults.intervalSeconds,
      maxRounds: profile.defaults.maxRounds
    }
  );
  return mapBindingToProfile(binding);
};

export const clearWindowProfile = async (
  projectRoot: string,
  sessionName: string,
  windowName: string
): Promise<void> => {
  void projectRoot;
  void sessionName;
  void windowName;
};

export const clearWindowProfilesForIdentity = async (
  projectRoot: string,
  identity: string
): Promise<string[]> => {
  void projectRoot;
  return [identity.split("::")[1] ?? identity].filter(Boolean);
};

export const clearWindowProfilesForSession = async (
  projectRoot: string,
  target: {
    sessionId?: string;
    sessionName?: string;
  }
): Promise<string[]> => {
  void projectRoot;
  if (!target.sessionName) {
    return [];
  }

  const bindings = await client.listWindowBindings(target.sessionName);
  return bindings
    .filter((binding) => {
      if (target.sessionId && binding.sessionId === target.sessionId) {
        return true;
      }

      return binding.sessionName === target.sessionName;
    })
    .map((binding) => binding.windowName);
};

export const clearWindowProfilesForAgent = async (
  projectRoot: string,
  target: {
    sessionId: string;
    agentId?: string;
    agentName?: string;
  }
): Promise<string[]> => {
  void projectRoot;
  const bindings = await client.listWindowBindings();
  return bindings
    .filter((binding) => {
      if (binding.sessionId !== target.sessionId) {
        return false;
      }

      if (target.agentId && binding.agentId === target.agentId) {
        return true;
      }

      if (target.agentName && binding.agentName === target.agentName) {
        return true;
      }

      return false;
    })
    .map((binding) => binding.windowName);
};

export const registerWindowProfileFromIdentity = async (
  projectRoot: string,
  options: {
    windowName: string;
    context: CliIdentityContext;
    intervalSeconds: number;
    maxRounds: number;
  }
): Promise<WindowProfile> => {
  void projectRoot;
  const binding = await client.updateWindowBindingDefaults(
    options.context.sessionName,
    options.windowName,
    {
      intervalSeconds: options.intervalSeconds,
      maxRounds: options.maxRounds
    }
  );

  return mapBindingToProfile(binding);
};

export const requireWindowProfile = async (
  projectRoot: string,
  sessionName: string,
  windowName: string
): Promise<WindowProfile> => {
  const profile = await readWindowProfile(projectRoot, sessionName, windowName);
  if (!profile) {
    throw new Error(
      `当前未找到 session="${sessionName}" 下 name="${windowName}" 的成员绑定。请先执行 ai-collab attach <name> --session <sessionName> --role <host|worker> --duty "<职责>"。当前绑定来源为 "${bindingStoreDescriptor}"。`
    );
  }

  return profile;
};

export const getWindowProfilesStorePath = (projectRoot: string): string => {
  void projectRoot;
  return bindingStoreDescriptor;
};
