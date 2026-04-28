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
  ConnectionMode,
  SessionJoinResult,
  WindowBinding
} from "@ai-collab/protocol";
import { AiCollabSdkError, createAiCollabClient } from "@ai-collab/sdk";
import { errorCodes } from "@ai-collab/protocol";

export type CliIdentityContext = {
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
  updatedAt: string;
};

const client = createAiCollabClient({
  headers: {
    "x-ai-collab-client": "cli",
    "x-ai-collab-process": String(process.pid)
  }
});

const bindingStoreDescriptor = "db://window-bindings";

const parseIdentity = (
  identity: string
): {
  sessionName: string;
  agentName: string;
} => {
  const separator = identity.indexOf("::");
  if (separator <= 0 || separator >= identity.length - 2) {
    throw new Error(
      `identity="${identity}" 不符合 "<sessionName>::<agentName>" 规范。`
    );
  }

  return {
    sessionName: identity.slice(0, separator),
    agentName: identity.slice(separator + 2)
  };
};

const buildContextFromBinding = (binding: WindowBinding): CliIdentityContext => {
  return {
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
    updatedAt: binding.runtimeState.updatedAt ?? binding.lastHeartbeatAt
  };
};

export const readCliIdentities = async (
  projectRoot: string
): Promise<CliIdentityContext[]> => {
  void projectRoot;
  const bindings = await client.listWindowBindings();
  return bindings.map((binding) => buildContextFromBinding(binding));
};

export const readCliIdentity = async (
  projectRoot: string,
  identity: string
): Promise<CliIdentityContext | undefined> => {
  void projectRoot;
  const { sessionName, agentName } = parseIdentity(identity);
  try {
    const binding = await client.getWindowBinding(sessionName, agentName);
    return buildContextFromBinding(binding);
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

export const writeCliIdentity = async (
  projectRoot: string,
  identity: string,
  result: SessionJoinResult
): Promise<CliIdentityContext> => {
  void projectRoot;
  return {
    identity,
    sessionId: result.session.id,
    sessionName: result.session.name,
    agentId: result.agent.id,
    agentName: result.agent.agentName,
    displayName: result.agent.displayName,
    platform: result.agent.platform,
    role: result.agent.role,
    roleDescription: result.agent.roleDescription,
    capabilities: result.agent.capabilities,
    connectionMode: result.agent.connectionMode,
    updatedAt: new Date().toISOString()
  };
};

export const clearCliIdentity = async (
  projectRoot: string,
  identity: string
): Promise<void> => {
  void projectRoot;
  void identity;
};

export const clearCliIdentitiesForSession = async (
  projectRoot: string,
  target: {
    sessionId?: string;
    sessionName?: string;
  }
): Promise<string[]> => {
  void projectRoot;
  const bindings = await client.listWindowBindings(target.sessionName);
  return bindings
    .filter((binding) => {
      if (target.sessionId && binding.sessionId === target.sessionId) {
        return true;
      }

      if (target.sessionName && binding.sessionName === target.sessionName) {
        return true;
      }

      return false;
    })
    .map((binding) => binding.identity);
};

export const requireCliIdentity = async (
  projectRoot: string,
  identity: string
): Promise<CliIdentityContext> => {
  const context = await readCliIdentity(projectRoot, identity);
  if (!context) {
    throw new Error(
      `当前系统内不存在 identity="${identity}" 的绑定，请先执行 ai-collab attach <name> --session <sessionName> --role <host|worker> --duty "<职责>"。当前绑定来源为 "${bindingStoreDescriptor}"。`
    );
  }

  return context;
};

export const getCliIdentitiesPath = (projectRoot: string): string => {
  void projectRoot;
  return bindingStoreDescriptor;
};
