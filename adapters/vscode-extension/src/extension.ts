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
import * as vscode from "vscode";
import { AiCollabSdkError, createAiCollabClient } from "@ai-collab/sdk";

type SessionState = {
  sessionId: string;
  agentId: string;
  agentName: string;
  role: "host" | "worker" | "knowledge_keeper";
  displayName: string;
};

const stateKey = "ai-collab.currentSession";

const getClient = () => {
  return createAiCollabClient({
    headers: {
      "x-ai-collab-client": "vscode-extension",
      "x-ai-collab-process": String(process.pid)
    }
  });
};

const getStoredState = (
  context: vscode.ExtensionContext
): SessionState | undefined => {
  return context.workspaceState.get<SessionState>(stateKey);
};

const setStoredState = async (
  context: vscode.ExtensionContext,
  state: SessionState | undefined
): Promise<void> => {
  await context.workspaceState.update(stateKey, state);
};

const renderStatusBarText = (state: SessionState | undefined): string => {
  if (!state) {
    return "$(hubot) AI Collab: idle";
  }

  return `$(hubot) AI Collab: ${state.role} • ${state.sessionId.slice(0, 8)}`;
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof AiCollabSdkError) {
    return `${error.message} (${error.statusCode})`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown AI Collab error.";
};

const promptDisplayName = async (): Promise<string | undefined> => {
  return vscode.window.showInputBox({
    prompt: "Display name for this VS Code client",
    placeHolder: "VS Code Worker"
  });
};

const promptAgentName = async (): Promise<string | undefined> => {
  return vscode.window.showInputBox({
    prompt: "Stable agent name for this VS Code client",
    placeHolder: "vscode-worker"
  });
};

const hostSession = async (
  context: vscode.ExtensionContext,
  statusBar: vscode.StatusBarItem
) => {
  const sessionName = await vscode.window.showInputBox({
    prompt: "Session name to host",
    placeHolder: "school-platform"
  });
  if (!sessionName) {
    return;
  }

  const displayName = await promptDisplayName();
  if (!displayName) {
    return;
  }

  const agentName = await promptAgentName();
  if (!agentName) {
    return;
  }

  try {
    const result = await getClient().createSession({
      sessionName,
      agentName,
      displayName,
      platform: "vscode",
      capabilities: ["docs", "review"],
      connectionMode: "extension"
    });

    await setStoredState(context, {
      sessionId: result.session.id,
      agentId: result.agent.id,
      agentName: result.agent.agentName,
      role: "host",
      displayName
    });

    statusBar.text = renderStatusBarText(getStoredState(context));
    void vscode.window.showInformationMessage(
      `Hosted session "${result.session.name}".`
    );
  } catch (error: unknown) {
    void vscode.window.showErrorMessage(toErrorMessage(error));
  }
};

const joinSession = async (
  context: vscode.ExtensionContext,
  statusBar: vscode.StatusBarItem
) => {
  const sessionId = await vscode.window.showInputBox({
    prompt: "Session ID to join",
    placeHolder: "paste a session id"
  });
  if (!sessionId) {
    return;
  }

  const displayName = await promptDisplayName();
  if (!displayName) {
    return;
  }

  const agentName = await promptAgentName();
  if (!agentName) {
    return;
  }

  const rolePick = await vscode.window.showQuickPick<
    vscode.QuickPickItem & { role: "worker" }
  >(
    [
      {
        label: "worker",
        description: "Participate as an implementation agent",
        role: "worker"
      }
    ],
    {
      placeHolder: "Select collaboration role"
    }
  );
  if (!rolePick) {
    return;
  }

  try {
    const result = await getClient().joinSession(sessionId, {
      agentName,
      displayName,
      platform: "vscode",
      role: rolePick.role,
      capabilities: ["docs", "review"],
      connectionMode: "extension"
    });

    await setStoredState(context, {
      sessionId: result.session.id,
      agentId: result.agent.id,
      agentName: result.agent.agentName,
      role: result.agent.role,
      displayName
    });

    statusBar.text = renderStatusBarText(getStoredState(context));
    void vscode.window.showInformationMessage(
      `Joined session "${result.session.name}" as ${result.agent.role}.`
    );
  } catch (error: unknown) {
    void vscode.window.showErrorMessage(toErrorMessage(error));
  }
};

const showStatus = async (context: vscode.ExtensionContext) => {
  const localState = getStoredState(context);

  try {
    const coreStatus = await getClient().getStatus();
    void vscode.window.showInformationMessage(
      [
        `Core: ${coreStatus.status}`,
        localState
          ? `Session: ${localState.sessionId}, Role: ${localState.role}`
          : "Session: not connected"
      ].join(" | ")
    );
  } catch (error: unknown) {
    void vscode.window.showErrorMessage(toErrorMessage(error));
  }
};

const openInbox = async (context: vscode.ExtensionContext) => {
  const localState = getStoredState(context);
  if (!localState) {
    void vscode.window.showWarningMessage(
      "This VS Code client has not joined an AI Collab session."
    );
    return;
  }

  try {
    const messages = await getClient().getInbox(localState.agentId);
    const content =
      messages.length === 0
        ? "# AI Collab Inbox\n\nNo messages."
        : [
            "# AI Collab Inbox",
            "",
            ...messages.map((message, index) => {
              return [
                `## ${index + 1}. ${message.type}`,
                `- Message ID: ${message.id}`,
                `- From: ${message.fromAgentId}`,
                `- Delivery: ${message.deliveryStatus}`,
                "",
                "```json",
                JSON.stringify(message.payload, null, 2),
                "```",
                ""
              ].join("\n");
            })
          ].join("\n");

    const document = await vscode.workspace.openTextDocument({
      content,
      language: "markdown"
    });
    await vscode.window.showTextDocument(document, {
      preview: false
    });
  } catch (error: unknown) {
    void vscode.window.showErrorMessage(toErrorMessage(error));
  }
};

const leaveSession = async (
  context: vscode.ExtensionContext,
  statusBar: vscode.StatusBarItem
) => {
  await setStoredState(context, undefined);
  statusBar.text = renderStatusBarText(undefined);
  void vscode.window.showInformationMessage("Cleared local AI Collab session.");
};

export const activate = (context: vscode.ExtensionContext) => {
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBar.command = "aiCollab.showStatus";
  statusBar.text = renderStatusBarText(getStoredState(context));
  statusBar.show();

  context.subscriptions.push(statusBar);
  context.subscriptions.push(
    vscode.commands.registerCommand("aiCollab.hostSession", async () => {
      await hostSession(context, statusBar);
    }),
    vscode.commands.registerCommand("aiCollab.joinSession", async () => {
      await joinSession(context, statusBar);
    }),
    vscode.commands.registerCommand("aiCollab.showStatus", async () => {
      await showStatus(context);
    }),
    vscode.commands.registerCommand("aiCollab.openInbox", async () => {
      await openInbox(context);
    }),
    vscode.commands.registerCommand("aiCollab.leaveSession", async () => {
      await leaveSession(context, statusBar);
    })
  );
};

export const deactivate = () => {
  return undefined;
};
