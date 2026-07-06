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
import { AiCollabSdkError } from "@ai-collab/sdk";
import { errorCodes, type CollaborationRunState } from "@ai-collab/protocol";

export type WindowRuntimeState = {
  windowKey: string;
  sessionName: string;
  windowName: string;
  identity: string;
  role: "host" | "worker";
  activeFlow: string | null;
  activeWaitPid: number | null;
  currentMessageId: string | null;
  currentCorrelationId: string | null;
  currentMessageKind: "task" | "report" | null;
  waitChainId: string | null;
  waitChainStatus: string | null;
  lastPollAt: string | null;
  lastClaimAt: string | null;
  lastSubmitAt: string | null;
  pendingInboxCount: number | null;
  claimedInboxCount: number | null;
  lastCommand: string | null;
  lastStatus: string | null;
  lastWorkflowStep: string | null;
  lastAutomationState: string | null;
  lastTurnDisposition: string | null;
  state: CollaborationRunState | null;
  requiredAction: string | null;
  requiredTool: string | null;
  continuationToken: string | null;
  userVisibleResponseAllowed: boolean | null;
  leaseExpiresAt: string | null;
  updatedAt: string;
};

const client = createAiCollabClient({
  headers: {
    "x-ai-collab-client": "cli",
    "x-ai-collab-process": String(process.pid)
  }
});

const runtimeStoreDescriptor = "db://window-runtime-state";

export const buildWindowRuntimeStateKey = (
  sessionName: string,
  windowName: string
): string => {
  return `${sessionName}::${windowName}`;
};

const mapBindingToRuntimeState = (
  binding: Awaited<ReturnType<typeof client.getWindowBinding>>
): WindowRuntimeState => {
  return {
    windowKey: binding.windowKey,
    sessionName: binding.sessionName,
    windowName: binding.windowName,
    identity: binding.identity,
    role: binding.role === "host" ? "host" : "worker",
    activeFlow: binding.runtimeState.activeFlow,
    activeWaitPid: null,
    currentMessageId: binding.runtimeState.currentMessageId,
    currentCorrelationId: binding.runtimeState.currentCorrelationId,
    currentMessageKind: binding.runtimeState.currentMessageKind,
    waitChainId: binding.runtimeState.waitChainId,
    waitChainStatus: binding.runtimeState.waitChainStatus,
    lastPollAt: binding.runtimeState.lastPollAt,
    lastClaimAt: binding.runtimeState.lastClaimAt,
    lastSubmitAt: binding.runtimeState.lastSubmitAt,
    pendingInboxCount: binding.runtimeState.pendingInboxCount,
    claimedInboxCount: binding.runtimeState.claimedInboxCount,
    lastCommand: binding.runtimeState.lastCommand,
    lastStatus: binding.runtimeState.lastStatus,
    lastWorkflowStep: binding.runtimeState.lastWorkflowStep,
    lastAutomationState: binding.runtimeState.lastAutomationState,
    lastTurnDisposition: binding.runtimeState.lastTurnDisposition,
    state: binding.runtimeState.state,
    requiredAction: binding.runtimeState.requiredAction,
    requiredTool: binding.runtimeState.requiredTool,
    continuationToken: binding.runtimeState.continuationToken,
    userVisibleResponseAllowed: binding.runtimeState.userVisibleResponseAllowed,
    leaseExpiresAt: binding.runtimeState.leaseExpiresAt,
    updatedAt: binding.runtimeState.updatedAt ?? binding.lastHeartbeatAt
  };
};

export const readWindowRuntimeStates = async (
  projectRoot: string
): Promise<WindowRuntimeState[]> => {
  void projectRoot;
  const bindings = await client.listWindowBindings();
  return bindings.map((binding) => mapBindingToRuntimeState(binding));
};

export const readWindowRuntimeState = async (
  projectRoot: string,
  sessionName: string,
  windowName: string
): Promise<WindowRuntimeState | undefined> => {
  void projectRoot;
  try {
    const binding = await client.getWindowBinding(sessionName, windowName);
    return mapBindingToRuntimeState(binding);
  } catch {
    return undefined;
  }
};

export const writeWindowRuntimeState = async (
  projectRoot: string,
  state: WindowRuntimeState
): Promise<WindowRuntimeState> => {
  void projectRoot;
  const binding = await client.updateWindowRuntimeState(
    state.sessionName,
    state.windowName,
    {
      activeFlow: state.activeFlow,
      currentMessageId: state.currentMessageId,
      currentCorrelationId: state.currentCorrelationId,
      currentMessageKind: state.currentMessageKind,
      waitChainId: state.waitChainId,
      waitChainStatus: state.waitChainStatus,
      lastPollAt: state.lastPollAt,
      lastClaimAt: state.lastClaimAt,
      lastSubmitAt: state.lastSubmitAt,
      pendingInboxCount: state.pendingInboxCount,
      claimedInboxCount: state.claimedInboxCount,
      lastCommand: state.lastCommand,
      lastStatus: state.lastStatus,
      lastWorkflowStep: state.lastWorkflowStep,
      lastAutomationState: state.lastAutomationState,
      lastTurnDisposition: state.lastTurnDisposition,
      state: state.state,
      requiredAction: state.requiredAction,
      requiredTool: state.requiredTool,
      continuationToken: state.continuationToken,
      userVisibleResponseAllowed: state.userVisibleResponseAllowed,
      leaseExpiresAt: state.leaseExpiresAt
    }
  );
  return mapBindingToRuntimeState(binding);
};

export const clearWindowRuntimeState = async (
  projectRoot: string,
  sessionName: string,
  windowName: string
): Promise<void> => {
  void projectRoot;
  try {
    await client.clearWindowRuntimeState(sessionName, windowName);
  } catch (error: unknown) {
    if (
      error instanceof AiCollabSdkError &&
      error.code === errorCodes.sessionNotFound
    ) {
      return;
    }

    throw error;
  }
};

export const getWindowRuntimeStatesStorePath = (
  projectRoot: string
): string => {
  void projectRoot;
  return runtimeStoreDescriptor;
};
