#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { Command } from "commander";
import {
  createAiCollabClient,
  AiCollabSdkError
} from "@ai-collab/sdk";
import { wrapForDisplay } from "@ai-collab/shared";
import {
  errorCodes,
  type Agent,
  type KnowledgeLevel,
  knowledgeSourceKinds,
  type KnowledgeSourceKind,
  type MessageRecord,
  type MessageType,
  type WindowBinding
} from "@ai-collab/protocol";

import {
  clearCliIdentity,
  clearCliIdentitiesForSession,
  requireCliIdentity,
  type CliIdentityContext,
  writeCliIdentity
} from "./context.js";
import { withLocalLoopLock } from "./local-loop-lock.js";
import { clearLocalLoopLocksForIdentity } from "./local-loop-lock.js";
import {
  buildWindowProfileKey,
  getWindowProfilesStorePath,
  clearWindowProfile,
  clearWindowProfilesForIdentity,
  clearWindowProfilesForSession,
  requireWindowProfile,
  registerWindowProfileFromIdentity,
  type WindowProfile
} from "./window-profile.js";
import {
  buildWindowRuntimeStateKey,
  clearWindowRuntimeState,
  getWindowRuntimeStatesStorePath,
  readWindowRuntimeState,
  writeWindowRuntimeState,
  type WindowRuntimeState
} from "./window-runtime-state.js";
import {
  type CommandTraceEvent,
  createCommandTrace,
  getCommandTraceStorePath
} from "./command-trace.js";

import {
  DEFAULT_LOOP_INTERVAL_SECONDS,
  DEFAULT_LOOP_MAX_ROUNDS,
  DEFAULT_WINDOW_WAIT_SLICE_ELAPSED_SECONDS,
  DEFAULT_WINDOW_WAIT_CONTINUATION_BUDGET,
  DEFAULT_LOOP_CONTINUE_AFTER_MATCH,
  DEFAULT_LOOP_MAX_MATCHES,
  DEFAULT_HOST_LOOP_ACK_MATCHED,
  DEFAULT_POLL_BACKOFF_GROWTH,
  DEFAULT_POLL_BACKOFF_MAX_FACTOR,
  DEFAULT_POLL_JITTER_RATIO,
  DEFAULT_HOST_REPORT_TYPE,
  DEFAULT_WORKER_TASK_TYPE,
  SUPPORTED_MESSAGE_TYPES,
  HOST_EXECUTABLE_MESSAGE_TYPES,
  HOST_REPORT_MESSAGE_TYPES,
  HOST_RESOLVABLE_MESSAGE_TYPES,
  FORBIDDEN_PURE_WAIT_COMMANDS,
  WINDOW_WAIT_ALIAS_NAMES
} from "./constants.js";

const projectRoot = process.cwd();
const program = new Command();
const client = createAiCollabClient({
  headers: {
    "x-ai-collab-client": "cli",
    "x-ai-collab-process": String(process.pid)
  }
});
const cliLeaseOwnerToken = `cli:${process.pid}:${randomUUID()}`;
const runtimeTerminalProgressHints = [
  "running",
  "no output",
  "background"
] as const;
const finalRuntimeResultPreamble =
  "INTERNAL: this JSON is the final completed result of the ai-collab wait command. Ignore any earlier terminal progress text such as running, no output, background status, or streaming command wrappers. ";

const printJson = (value: unknown) => {
  console.log(JSON.stringify(wrapForDisplay(value), null, 2));
};

const buildIdentity = (sessionName: string, agentName: string): string => {
  return `${sessionName}::${agentName}`;
};

const loadRuntimeModule = async () => {
  return import("./runtime.js");
};

const requireIdentityOption = (identity: string | undefined): string => {
  if (!identity) {
    throw new Error("--identity must be explicitly provided.");
  }

  return identity;
};

const isTruthyEnvValue = (value: string | undefined): boolean => {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
};


const requireLiveCliIdentity = async (
  identity: string
): Promise<CliIdentityContext> => {
  let context: CliIdentityContext;
  try {
    context = await requireCliIdentity(projectRoot, identity);
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`${error.message} The binding may have been automatically cleaned up.`);
    }
    throw error;
  }

  try {
    await client.getSession(context.sessionId);
    const members = await client.getMembers(context.sessionId);
    if (!members.some((member) => member.id === context.agentId)) {
      await clearCliIdentity(projectRoot, identity);
      await clearWindowProfilesForIdentity(projectRoot, identity);
      throw new Error(
        `identity="${identity}" local binding is invalid and has been automatically cleaned up: member "${context.agentName}" no longer exists in the remote session. Please re-run ai-collab attach <name> --session <sessionName> --role <host|worker|knowledge_keeper> --duty "<duty>".`
      );
    }
  } catch (error: unknown) {
    if (
      isSdkErrorCode(error, errorCodes.sessionNotFound) ||
      isSdkErrorCode(error, errorCodes.sessionClosed) ||
      isSdkErrorCode(error, errorCodes.agentNotFound)
    ) {
      if (
        isSdkErrorCode(error, errorCodes.sessionNotFound) ||
        isSdkErrorCode(error, errorCodes.sessionClosed)
      ) {
        await clearCliIdentitiesForSession(projectRoot, {
          sessionId: context.sessionId,
          sessionName: context.sessionName
        });
        await clearWindowProfilesForSession(projectRoot, {
          sessionId: context.sessionId,
          sessionName: context.sessionName
        });
      } else {
        await clearCliIdentity(projectRoot, identity);
        await clearWindowProfilesForIdentity(projectRoot, identity);
      }
      throw new Error(
        `identity="${identity}" local binding is invalid and has been automatically cleaned up: ${error.message}. Please re-run ai-collab attach <name> --session <sessionName> --role <host|worker|knowledge_keeper> --duty "<duty>".`
      );
    }

    throw error;
  }

  return context;
};

const cleanupSessionBeforeHostCreate = async (sessionName: string) => {
  try {
    const existingSession = await client.getSessionByName(sessionName);
    const members = (await client.getMembers(existingSession.id)).sort((left, right) =>
      left.role === right.role ? 0 : left.role === "host" ? 1 : -1
    );

    for (const member of members) {
      try {
        await client.leaveAgent(member.id);
      } catch (error: unknown) {
        if (!isSdkErrorCode(error, errorCodes.agentNotFound)) {
          throw error;
        }
      }
    }

    let deletion:
      | { sessionId: string; sessionName: string; deleted: true }
      | { sessionId: string; sessionName: string; deleted: true; alreadyRemoved: true };
    try {
      deletion = await client.deleteSessionByName(sessionName);
    } catch (error: unknown) {
      if (!isSdkErrorCode(error, errorCodes.sessionNotFound)) {
        throw error;
      }

      deletion = {
        sessionId: existingSession.id,
        sessionName,
        deleted: true,
        alreadyRemoved: true
      };
    }
    const clearedIdentities = await clearCliIdentitiesForSession(projectRoot, {
      sessionId: existingSession.id,
      sessionName
    });
    const clearedWindows = await clearWindowProfilesForSession(projectRoot, {
      sessionId: existingSession.id,
      sessionName
    });

    return {
      cleaned: true,
      sessionId: existingSession.id,
      sessionName,
      removedMemberCount: members.length,
      clearedIdentityCount: clearedIdentities.length,
      clearedWindowCount: clearedWindows.length,
      deletion
    };
  } catch (error: unknown) {
    if (isSdkErrorCode(error, errorCodes.sessionNotFound)) {
      return {
        cleaned: false
      };
    }

    throw error;
  }
};

const clearLocalWindowState = async (options: {
  sessionName: string;
  windowName: string;
  identity: string;
}) => {
  const clearedLockPaths = clearLocalLoopLocksForIdentity(
    projectRoot,
    options.identity
  );
  await clearCliIdentity(projectRoot, options.identity);
  const clearedWindowNames = await clearWindowProfilesForIdentity(
    projectRoot,
    options.identity
  );
  await clearWindowProfile(projectRoot, options.sessionName, options.windowName);
  await clearWindowRuntimeState(
    projectRoot,
    options.sessionName,
    options.windowName
  );

  return {
    sessionName: options.sessionName,
    identity: options.identity,
    windowName: options.windowName,
    clearedWindowNames,
    clearedLockPaths
  };
};

const cleanupResidualWindowMember = async (options: {
  sessionName: string;
  agentName: string;
}) => {
  try {
    const session = await client.getSessionByName(options.sessionName);
    const members = await client.getMembers(session.id);
    const matchedMembers = members.filter(
      (member) => member.agentName === options.agentName
    );

    for (const member of matchedMembers) {
      try {
        await client.leaveAgent(member.id);
      } catch (error: unknown) {
        if (!isSdkErrorCode(error, errorCodes.agentNotFound)) {
          throw error;
        }
      }
    }

    return {
      cleaned: matchedMembers.length > 0,
      sessionId: session.id,
      sessionName: options.sessionName,
      removedMemberCount: matchedMembers.length,
      clearedIdentityCount: 0,
      clearedWindowCount: 0
    };
  } catch (error: unknown) {
    if (isSdkErrorCode(error, errorCodes.sessionNotFound)) {
      return {
        cleaned: false
      };
    }

    throw error;
  }
};

const ensureWindowRole = (
  profile: WindowProfile,
  expectedRole: "host" | "worker" | "knowledge_keeper"
): void => {
  if (profile.role !== expectedRole) {
    throw new Error(
      `window="${profile.windowName}" has role "${profile.role}", cannot execute ${expectedRole} command.`
    );
  }
};

const ensureWindowRoleAny = (
  profile: WindowProfile,
  expectedRoles: Array<"host" | "worker" | "knowledge_keeper">
): void => {
  if (!expectedRoles.includes(profile.role as "host" | "worker" | "knowledge_keeper")) {
    throw new Error(
      `window="${profile.windowName}" has role "${profile.role}", only ${expectedRoles.join(" or ")} can execute this command.`
    );
  }
};

const syncWindowProfileWithContext = async (
  profile: WindowProfile,
  context: CliIdentityContext
): Promise<WindowProfile> => {
  return registerWindowProfileFromIdentity(projectRoot, {
    windowName: profile.windowName,
    context,
    intervalSeconds: profile.defaults.intervalSeconds,
    maxRounds: profile.defaults.maxRounds
  });
};

const requireLiveWindowContext = async (
  sessionName: string,
  windowName: string,
  expectedRole?: "host" | "worker" | "knowledge_keeper"
): Promise<{
  profile: WindowProfile;
  context: CliIdentityContext;
}> => {
  const profile = await requireWindowProfile(projectRoot, sessionName, windowName);
  if (expectedRole) {
    ensureWindowRole(profile, expectedRole);
  }

  const context = await requireLiveCliIdentity(profile.identity);
  return {
    profile: await syncWindowProfileWithContext(profile, context),
    context
  };
};

const attachNamedMember = async (options: {
  sessionName: string;
  name: string;
  role: "host" | "worker" | "knowledge_keeper";
  duty: string;
}) => {
  const result = await client.attachNamedSession(options.sessionName, {
    agentName: options.name,
    role: options.role,
    roleDescription: options.duty
  });
  const identity = buildIdentity(options.sessionName, options.name);
  const context = await writeCliIdentity(projectRoot, identity, result);
  const profile = await registerWindowProfileFromIdentity(projectRoot, {
    windowName: options.name,
    context,
    intervalSeconds: DEFAULT_LOOP_INTERVAL_SECONDS,
    maxRounds: DEFAULT_LOOP_MAX_ROUNDS
  });

  const activeFlow =
    options.role === "host" ? "host-cycle" :
    options.role === "knowledge_keeper" ? "worker-cycle" :
    "worker-cycle";

  const runtimeState = await persistWindowRuntimeState(profile, {
    activeFlow,
    activeWaitPid: null,
    currentMessageId: null,
    currentCorrelationId: null,
    currentMessageKind: null,
    lastCommand: "attach",
    lastStatus: "ready",
    lastWorkflowStep: "session_ready",
    lastAutomationState:
      options.role === "host" ? "host_ready" : "worker_ready",
    lastTurnDisposition: "silent_hold"
  });

  return {
    result,
    context,
    profile,
    runtimeState
  };
};

const resetNamedMember = async (options: {
  sessionName: string;
  name: string;
}) => {
  const identity = buildIdentity(options.sessionName, options.name);
  const localReset = await clearLocalWindowState({
    sessionName: options.sessionName,
    windowName: options.name,
    identity
  });

  try {
    const session = await client.getSessionByName(options.sessionName);
    const members = await client.getMembers(session.id);
    const matched = members.find((member) => member.agentName === options.name);

    if (!matched) {
      return {
        localReset,
        remoteReset: {
          cleaned: false
        }
      };
    }

    const remoteReset =
      matched.role === "host"
        ? await cleanupSessionBeforeHostCreate(options.sessionName)
        : await cleanupResidualWindowMember({
            sessionName: options.sessionName,
            agentName: options.name
          });

    return {
      localReset,
      remoteReset
    };
  } catch (error: unknown) {
    if (isSdkErrorCode(error, errorCodes.sessionNotFound)) {
      return {
        localReset,
        remoteReset: {
          cleaned: false
        }
      };
    }

    throw error;
  }
};

const persistWindowRuntimeState = async (
  profile: WindowProfile,
  patch: Partial<WindowRuntimeState>
): Promise<WindowRuntimeState> => {
  const existing = await readWindowRuntimeState(
    projectRoot,
    profile.sessionName,
    profile.windowName
  );
  return writeWindowRuntimeState(projectRoot, {
    windowKey: buildWindowRuntimeStateKey(
      profile.sessionName,
      profile.windowName
    ),
    sessionName: profile.sessionName,
    windowName: profile.windowName,
    identity: profile.identity,
    role: profile.role === "host" ? "host" : "worker",
    activeFlow: existing?.activeFlow ?? null,
    activeWaitPid: existing?.activeWaitPid ?? null,
    currentMessageId: existing?.currentMessageId ?? null,
    currentCorrelationId: existing?.currentCorrelationId ?? null,
    currentMessageKind: existing?.currentMessageKind ?? null,
    waitChainId: existing?.waitChainId ?? null,
    waitChainStatus: existing?.waitChainStatus ?? null,
    lastPollAt: existing?.lastPollAt ?? null,
    lastClaimAt: existing?.lastClaimAt ?? null,
    lastSubmitAt: existing?.lastSubmitAt ?? null,
    pendingInboxCount: existing?.pendingInboxCount ?? null,
    claimedInboxCount: existing?.claimedInboxCount ?? null,
    lastCommand: existing?.lastCommand ?? null,
    lastStatus: existing?.lastStatus ?? null,
    lastWorkflowStep: existing?.lastWorkflowStep ?? null,
    lastAutomationState: existing?.lastAutomationState ?? null,
    lastTurnDisposition: existing?.lastTurnDisposition ?? null,
    updatedAt: new Date().toISOString(),
    ...patch
  });
};

const buildRuntimeWaitChainId = (
  context: CliIdentityContext,
  flow: "host" | "worker"
) => {
  return `${flow}:${context.identity}:${cliLeaseOwnerToken}`;
};

const getInboxCountsForContext = async (context: CliIdentityContext) => {
  const [pendingInbox, claimedInbox] = await Promise.all([
    client.getInboxWithOptions(context.agentId, {
      pendingOnly: true
    }),
    client.getInboxWithOptions(context.agentId, {
      claimedOnly: true
    })
  ]);

  return {
    pendingInboxCount: pendingInbox.length,
    claimedInboxCount: claimedInbox.length
  };
};

const recordWindowWaitHeartbeat = async (options: {
  profile: WindowProfile;
  context: CliIdentityContext;
  flow: "host" | "worker";
  commandName: WindowRuntimeState["lastCommand"];
  status: string;
  workflowStep: string;
  automationState: string;
  turnDisposition: string;
  message?: MessageRecord | null | undefined;
  messageKind?: "task" | "report" | null | undefined;
  markClaimed?: boolean | undefined;
  inboxCounts?:
    | {
        pendingInboxCount: number;
        claimedInboxCount: number;
      }
    | undefined;
}) => {
  const now = new Date().toISOString();
  const inboxCounts =
    options.inboxCounts ?? (await getInboxCountsForContext(options.context));

  return persistWindowRuntimeState(options.profile, {
    activeFlow: options.profile.role === "host" ? "host-cycle" : "worker-cycle",
    currentMessageId: options.message?.id ?? null,
    currentCorrelationId: options.message?.correlationId ?? null,
    currentMessageKind:
      options.message && options.messageKind ? options.messageKind : null,
    waitChainId: buildRuntimeWaitChainId(options.context, options.flow),
    waitChainStatus: options.markClaimed ? "claimed" : "polling",
    lastPollAt: now,
    lastClaimAt: options.markClaimed ? now : null,
    pendingInboxCount: inboxCounts.pendingInboxCount,
    claimedInboxCount: inboxCounts.claimedInboxCount,
    lastCommand: options.commandName,
    lastStatus: options.status,
    lastWorkflowStep: options.workflowStep,
    lastAutomationState: options.automationState,
    lastTurnDisposition: options.turnDisposition
  });
};

type TraceStepSink = {
  step: (event: CommandTraceEvent, data: unknown) => void;
};

const getRuntimeStringField = (
  record: Record<string, unknown>,
  key: string
): string | null => {
  const value = record[key];
  return typeof value === "string" ? value : null;
};

const getRuntimeRecordField = (
  record: Record<string, unknown>,
  key: string
): Record<string, unknown> | null => {
  const value = record[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
};

const updateWindowStateFromResult = async (
  profile: WindowProfile,
  commandName:
    | "host"
    | "join"
    | "reset"
    | "await"
    | "listen"
    | "watch"
    | "standby"
    | "hold"
    | "continue"
    | "submit"
    | "dispatch-many"
    | "resolve",
  result: Record<string, unknown>
): Promise<WindowRuntimeState> => {
  const status = getRuntimeStringField(result, "status");
  const workflowStep = getRuntimeStringField(result, "workflowStep");
  const automationState = getRuntimeStringField(result, "automationState");
  const turnDisposition = getRuntimeStringField(result, "turnDisposition");
  const messageKind = getRuntimeStringField(result, "messageKind");
  const existingRun = getRuntimeRecordField(result, "existingRun");
  const backlog = getRuntimeRecordField(result, "backlog");
  const submittedAt = getRuntimeStringField(result, "submittedAt");
  const waitChainId = getRuntimeStringField(result, "waitChainId");
  const lastPollAt = getRuntimeStringField(result, "lastPollAt");
  const lastClaimAt = getRuntimeStringField(result, "lastClaimAt");

  let currentMessageId: string | null = null;
  let currentCorrelationId: string | null = null;
  let currentMessageKind: "task" | "report" | null = null;
  let activeWaitPid: number | null =
    existingRun && typeof existingRun.pid === "number" ? existingRun.pid : null;
  let waitChainStatus: string | null =
    status === "already_running"
      ? "already_running"
      : workflowStep === "message_received"
        ? "claimed"
        : workflowStep === "waiting" || workflowStep === "waiting_handoff"
          ? "polling"
          : "idle";
  const currentMessageRecord =
    getRuntimeRecordField(result, "message") ??
    getRuntimeRecordField(result, "nextMessage");
  const currentTaskRecord =
    getRuntimeRecordField(result, "task") ??
    getRuntimeRecordField(result, "nextTask");
  const currentReportRecord =
    getRuntimeRecordField(result, "report") ??
    getRuntimeRecordField(result, "nextReport");

  if (profile.role === "worker" && status === "task_claimed") {
    currentMessageId = getRuntimeStringField(currentTaskRecord ?? {}, "messageId");
    currentCorrelationId = getRuntimeStringField(
      currentTaskRecord ?? {},
      "correlationId"
    );
    currentMessageKind = currentMessageId ? "task" : null;
    activeWaitPid = null;
  } else if (profile.role === "host" && status === "message_claimed") {
    if (messageKind === "task") {
      currentMessageId = getRuntimeStringField(
        (currentTaskRecord ?? currentMessageRecord) ?? {},
        "messageId"
      );
      currentCorrelationId = getRuntimeStringField(
        (currentTaskRecord ?? currentMessageRecord) ?? {},
        "correlationId"
      );
      currentMessageKind = currentMessageId ? "task" : null;
    } else if (messageKind === "report") {
      currentMessageId = getRuntimeStringField(
        (currentReportRecord ?? currentMessageRecord) ?? {},
        "messageId"
      );
      currentCorrelationId = getRuntimeStringField(
        (currentReportRecord ?? currentMessageRecord) ?? {},
        "correlationId"
      );
      currentMessageKind = currentMessageId ? "report" : null;
    } else {
      currentMessageId = getRuntimeStringField(
        (currentMessageRecord ?? currentTaskRecord ?? currentReportRecord) ?? {},
        "messageId"
      );
      currentCorrelationId = getRuntimeStringField(
        (currentMessageRecord ?? currentTaskRecord ?? currentReportRecord) ?? {},
        "correlationId"
      );
      currentMessageKind = null;
    }
    activeWaitPid = null;
  } else if (status !== "already_running") {
    activeWaitPid = null;
  }

  if (
    workflowStep === "command_handoff" ||
    status === "wait_timeout" ||
    status === "wait_timeout_continue"
  ) {
    currentMessageId = null;
    currentCorrelationId = null;
    currentMessageKind = null;
  }

  if (status === "reset" || status === "ready") {
    waitChainStatus = "idle";
  }

  return persistWindowRuntimeState(profile, {
    activeFlow: profile.role === "host" ? "host-cycle" : "worker-cycle",
    activeWaitPid,
    currentMessageId,
    currentCorrelationId,
    currentMessageKind,
    waitChainId,
    waitChainStatus,
    lastPollAt,
    lastClaimAt,
    lastSubmitAt: submittedAt,
    pendingInboxCount:
      typeof backlog?.pendingInboxCount === "number"
        ? backlog.pendingInboxCount
        : null,
    claimedInboxCount:
      typeof backlog?.claimedInboxCount === "number"
        ? backlog.claimedInboxCount
        : null,
    lastCommand: commandName,
    lastStatus: status,
    lastWorkflowStep: workflowStep,
    lastAutomationState: automationState,
    lastTurnDisposition: turnDisposition
  });
};

const pickDefinedFields = (
  source: Record<string, unknown>,
  keys: string[]
): Record<string, unknown> => {
  const next: Record<string, unknown> = {};
  for (const key of keys) {
    if (source[key] !== undefined) {
      next[key] = source[key];
    }
  }
  return next;
};

const buildWindowDebugResult = (
  profile: WindowProfile,
  commandName: string,
  result: Record<string, unknown>,
  runtimeState: WindowRuntimeState,
  commandTrace?: {
    commandRunId: string;
    tracePath: string;
  }
) => {
  const {
    intervalSeconds: _ignoredIntervalSeconds,
    maxRounds: _ignoredMaxRounds,
    ...sanitizedResult
  } = result;

  return {
    command: commandName,
    window: {
      name: profile.windowName,
      sessionName: profile.sessionName,
      role: profile.role,
      platform: profile.platform,
      identity: profile.identity,
      agentName: profile.agentName
    },
    waitPolicy: {
      ownedByRuntime: true,
      userConfigurable: false,
      doNotChooseIntervalOrRounds: true
    },
    runtimeState,
    ...(commandTrace ? { commandTrace } : {}),
    ...sanitizedResult
  };
};

const buildControlMessageView = (record: unknown) => {
  const messageRecord =
    record && typeof record === "object" && !Array.isArray(record)
      ? (record as Record<string, unknown>)
      : null;

  if (!messageRecord) {
    return null;
  }

  const payloadView = parseMessagePayloadView(messageRecord.payload ?? null);

  return {
    messageId:
      getRuntimeStringField(messageRecord, "messageId") ??
      getRuntimeStringField(messageRecord, "id"),
    correlationId: getRuntimeStringField(messageRecord, "correlationId"),
    type: getRuntimeStringField(messageRecord, "type"),
    content:
      getRuntimeStringField(messageRecord, "content") ?? payloadView.content,
    result: getRuntimeStringField(messageRecord, "result") ?? payloadView.result,
    payload: messageRecord.payload ?? null
  };
};

const appendControlMessageViews = (
  items: Array<{
    messageId: string | null;
    correlationId: string | null;
    type: string | null;
    content: string | null;
    result: string | null;
    payload: unknown;
  }>,
  candidate: unknown
) => {
  if (Array.isArray(candidate)) {
    for (const item of candidate) {
      const view = buildControlMessageView(item);
      if (view) {
        items.push(view);
      }
    }
    return;
  }

  const view = buildControlMessageView(candidate);
  if (view) {
    items.push(view);
  }
};

const dedupeControlMessageViews = (
  items: Array<{
    messageId: string | null;
    correlationId: string | null;
    type: string | null;
    content: string | null;
    result: string | null;
    payload: unknown;
  }>
) => {
  const seen = new Set<string>();
  const deduped: typeof items = [];

  for (const item of items) {
    const key =
      item.messageId ??
      `${item.correlationId ?? ""}:${item.type ?? ""}:${item.content ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
};

const inferClaimedMessageKind = (result: Record<string, unknown>) => {
  const messageKind = getRuntimeStringField(result, "messageKind");
  if (
    messageKind === "task" ||
    messageKind === "report" ||
    messageKind === "mixed" ||
    messageKind === "unknown"
  ) {
    return messageKind;
  }

  const itemKind = getRuntimeStringField(result, "itemKind");
  if (
    itemKind === "task" ||
    itemKind === "report" ||
    itemKind === "mixed" ||
    itemKind === "unknown"
  ) {
    return itemKind;
  }

  const status = getRuntimeStringField(result, "status");
  if (status === "task_claimed" || status === "task-received") {
    return "task";
  }
  if (status === "message_claimed" || status === "report-received") {
    return "report";
  }

  if (result.tasks && result.reports) {
    return "mixed";
  }
  if (result.task || result.tasks) {
    return "task";
  }
  if (result.report || result.reports) {
    return "report";
  }

  return null;
};

const inferRuntimeRole = (result: Record<string, unknown>) => {
  const workflowRole = getRuntimeStringField(result, "workflowRole");
  if (workflowRole === "host" || workflowRole === "worker" || workflowRole === "knowledge_keeper") {
    return workflowRole;
  }

  const mode = getRuntimeStringField(result, "mode");
  if (mode?.startsWith("host")) {
    return "host";
  }
  if (mode?.startsWith("worker")) {
    return "worker";
  }
  if (mode?.startsWith("knowledge")) {
    return "knowledge_keeper";
  }

  return null;
};

const resolveClaimedMessageViews = (result: Record<string, unknown>) => {
  const messageKind = inferClaimedMessageKind(result);
  const items: Array<{
    messageId: string | null;
    correlationId: string | null;
    type: string | null;
    content: string | null;
    result: string | null;
    payload: unknown;
  }> = [];

  if (messageKind === "task") {
    appendControlMessageViews(items, result.tasks);
    appendControlMessageViews(items, result.task);
    appendControlMessageViews(items, result.item);
    appendControlMessageViews(items, result.nextTask);
    appendControlMessageViews(items, result.message);
    appendControlMessageViews(items, result.nextMessage);
    appendControlMessageViews(items, result.messages);
    return dedupeControlMessageViews(items);
  }

  if (messageKind === "report") {
    appendControlMessageViews(items, result.reports);
    appendControlMessageViews(items, result.report);
    appendControlMessageViews(items, result.item);
    appendControlMessageViews(items, result.nextReport);
    appendControlMessageViews(items, result.message);
    appendControlMessageViews(items, result.nextMessage);
    appendControlMessageViews(items, result.messages);
    return dedupeControlMessageViews(items);
  }

  appendControlMessageViews(items, result.tasks);
  appendControlMessageViews(items, result.task);
  appendControlMessageViews(items, result.reports);
  appendControlMessageViews(items, result.report);
  appendControlMessageViews(items, result.item);
  appendControlMessageViews(items, result.nextTask);
  appendControlMessageViews(items, result.nextReport);
  appendControlMessageViews(items, result.message);
  appendControlMessageViews(items, result.nextMessage);
  appendControlMessageViews(items, result.messages);
  return dedupeControlMessageViews(items);
};

const buildWindowControlResult = (
  debugResult: Record<string, unknown>
): Record<string, unknown> => {
  const explicitResultType = getRuntimeStringField(debugResult, "resultType");
  const status = getRuntimeStringField(debugResult, "status");
  const nextActionRequired = getRuntimeStringField(
    debugResult,
    "nextActionRequired"
  );
  const workflowStep = getRuntimeStringField(debugResult, "workflowStep");
  const messageKind = inferClaimedMessageKind(debugResult);
  const claimedMessages = resolveClaimedMessageViews(debugResult);
  const claimedMessage = claimedMessages[0] ?? null;

  if (
    explicitResultType === "execute_cmd" ||
    debugResult.currentTurnMustExecuteNextCommand === true ||
    nextActionRequired === "continue_wait_loop"
  ) {
    const cmd =
      getRuntimeStringField(debugResult, "nextCommand") ??
      getRuntimeStringField(debugResult, "terminalCommand");

    return {
      op: "EXECUTE_INTERNAL_CMD",
      ...(cmd ? { cmd } : {})
    };
  }

  if (
    workflowStep === "message_received" ||
    status === "task_claimed" ||
    status === "message_claimed" ||
    status === "task-received" ||
    status === "report-received" ||
    (debugResult.matched === true && claimedMessages.length > 0)
  ) {
    return {
      op: "PROCESS_CLAIMED_MESSAGES",
      role: inferRuntimeRole(debugResult),
      kind: messageKind,
      status,
      message: claimedMessage,
      messages: claimedMessages,
      messageCount: claimedMessages.length
    };
  }

  if (
    status === "all_workers_waiting" ||
    workflowStep === "session_idle_detected" ||
    nextActionRequired === "continue_host_planning"
  ) {
    const idleData = debugResult.idleAssessment as Record<string, unknown> | undefined;
    return {
      op: "PROCESS_SESSION_IDLE",
      role: "host",
      status: status ?? "all_workers_waiting",
      businessWorkersIdle: idleData?.businessWorkersIdle ?? true,
      knowledgeKeepersIdle: idleData?.knowledgeKeepersIdle ?? true,
      sessionIdle: idleData?.sessionIdle ?? true,
      pendingKnowledgeTasks: idleData?.pendingKnowledgeTasks ?? false,
      nextExpectedOwner: "host",
      message: {
        content:
          "All workers are currently in waiting/idle state. Host cannot continue waiting. Please proceed with planning, dispatch the next round, check for knowledge base updates, or report back to the user."
      }
    };
  }

  if (
    status === "already_running" ||
    status === "wait_chain_superseded" ||
    status === "wait-chain-superseded" ||
    status === "wait_timeout" ||
    status === "idle-timeout" ||
    debugResult.currentTurnMustEndSilently === true
  ) {
    return {
      op: "END_TURN_SILENTLY",
      status: status ?? nextActionRequired ?? "silent_stop"
    };
  }

  if (
    explicitResultType === "host_decision_required" ||
    nextActionRequired === "host_must_decide" ||
    debugResult.workflowDirective === "host_decision_required" ||
    debugResult.turnDisposition === "host_decision_required"
  ) {
    return {
      op: "HOST_DECISION_REQUIRED",
      status: status ?? "resolved",
      resolvedCount: debugResult.resolvedCount ?? 0,
      failedCount: debugResult.failedCount ?? 0,
      resolvedMessageIds: debugResult.resolvedMessageIds ?? [],
      failed: debugResult.failed ?? [],
      nextAllowedActions: [
        "await_remaining_workers",
        "dispatch_next_batch",
        "update_project_knowledge",
        "update_user_profile",
        "finish"
      ]
    };
  }

  if (status === "ready") {
    const memberSource =
      (debugResult.member &&
      typeof debugResult.member === "object" &&
      !Array.isArray(debugResult.member)
        ? (debugResult.member as Record<string, unknown>)
        : null) ??
      (debugResult.window &&
      typeof debugResult.window === "object" &&
      !Array.isArray(debugResult.window)
        ? (debugResult.window as Record<string, unknown>)
        : null) ??
      {};

    return {
      op: "SESSION_READY",
      member: pickDefinedFields(
        memberSource,
        ["name", "sessionName", "role", "roleDescription"]
      )
    };
  }

  if (status === "reset") {
    return {
      op: "CLEANUP_DONE",
      ...(debugResult.member &&
      typeof debugResult.member === "object" &&
      !Array.isArray(debugResult.member)
        ? {
            member: pickDefinedFields(
              debugResult.member as Record<string, unknown>,
              ["name", "sessionName", "identity"]
            )
          }
        : {})
    };
  }

  return {
    op: "INFO",
    ...(status ? { status } : {}),
    ...(nextActionRequired ? { nextAction: nextActionRequired } : {})
  };
};

const buildWindowCommandOutputs = (
  profile: WindowProfile,
  commandName: string,
  result: Record<string, unknown>,
  runtimeState: WindowRuntimeState,
  commandTrace?: {
    commandRunId: string;
    tracePath: string;
  }
) => {
  const debug = buildWindowDebugResult(
    profile,
    commandName,
    result,
    runtimeState,
    commandTrace
  );

  return {
    control: buildWindowControlResult(debug),
    debug
  };
};

const printControlJson = (debugResult: Record<string, unknown>) => {
  printJson(buildWindowControlResult(debugResult));
};

const buildWindowProfileSummary = (profile: WindowProfile) => {
  return {
    key: buildWindowProfileKey(profile.sessionName, profile.windowName),
    name: profile.windowName,
    sessionName: profile.sessionName,
    role: profile.role,
    roleDescription: profile.roleDescription,
    platform: profile.platform,
    identity: profile.identity,
    agentName: profile.agentName,
    waitPolicy: {
      ownedByRuntime: true,
      userConfigurable: false,
      doNotChooseIntervalOrRounds: true
    },
    updatedAt: profile.updatedAt
  };
};

const buildSessionMemberView = (sessionName: string, member: Agent) => {
  return {
    name: member.agentName,
    role: member.role,
    duty: member.roleDescription,
    status: member.status,
    identity: buildIdentity(sessionName, member.agentName)
  };
};

const parseListOption = (value: string, previous: string[]) => {
  previous.push(value);
  return previous;
};

const parseTagsOption = (value: string | undefined): string[] => {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
};

const ensureKnowledgeLevel = (value: string | undefined): KnowledgeLevel => {
  if (value === "l1" || value === "l2" || value === "l3") {
    return value;
  }
  throw new Error("knowledge level must be l1, l2, or l3.");
};

const ensureKnowledgeSourceKind = (
  value: string | undefined
): KnowledgeSourceKind => {
  const normalized = value ?? "host_update";
  if ((knowledgeSourceKinds as readonly string[]).includes(normalized)) {
    return normalized as KnowledgeSourceKind;
  }
  throw new Error(
    `knowledge source-kind must be one of: ${knowledgeSourceKinds.join(", ")}.`
  );
};

const parseKnowledgeRef = (ref: string): {
  level: KnowledgeLevel;
  slug: string;
  fragment: string | null;
} => {
  const [pathPart, fragment] = ref.split("#", 2);
  const normalized = (pathPart ?? "")
    .replace(/^knowledge:/i, "")
    .replace(/^\/+/, "");
  const [level, ...slugParts] = normalized.split("/");
  if (slugParts.length === 0) {
    throw new Error(`Invalid knowledge reference "${ref}". Expected format: L1/session-direction or l2/cli-flow#section.`);
  }
  return {
    level: ensureKnowledgeLevel(level?.toLowerCase()),
    slug: slugParts.join("/"),
    fragment: fragment ?? null
  };
};

type WindowDispatchTaskSpec = {
  targetWindowName: string;
  content: string;
};

const ensurePathWithinProject = (inputPath: string): string => {
  const resolved = resolve(projectRoot, inputPath);
  if (!resolved.startsWith(resolve(projectRoot))) {
    throw new Error(
      `Path traversal detected: "${inputPath}" is outside the project root directory.`
    );
  }
  return resolved;
};

const ensureStagingDir = (sessionId: string, subDir: string): string => {
  const dir = join(projectRoot, ".knowledge", sessionId, "staging", subDir);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
};

const readContentFile = (filePath: string): string => {
  const resolved = ensurePathWithinProject(filePath);
  if (!existsSync(resolved)) {
    throw new Error(`File does not exist: ${filePath}`);
  }
  return readFileSync(resolved, "utf-8");
};

const writeOutputFile = (filePath: string, content: string): void => {
  const resolved = ensurePathWithinProject(filePath);
  const dir = dirname(resolved);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(resolved, content, "utf-8");
};

const resolveKnowledgeRefFragment = (
  content: string,
  anchor: string
): { found: boolean; fragment: string; availableAnchors: string[] } => {
  const lines = content.split("\n");
  const headingPattern = new RegExp(`^##\\s+${anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  const allAnchors: string[] = [];
  for (const line of lines) {
    const match = /^##\s+(.+)$/.exec(line);
    if (match) {
      allAnchors.push(match[1]!.trim());
    }
  }

  const lineStart = lines.findIndex((line) => headingPattern.test(line));
  if (lineStart === -1) {
    return { found: false, fragment: content, availableAnchors: allAnchors };
  }

  let lineEnd = lineStart + 1;
  while (lineEnd < lines.length && !/^##\s/.test(lines[lineEnd]!)) {
    lineEnd++;
  }
  lineEnd--;

  return {
    found: true,
    fragment: lines.slice(lineStart, lineEnd + 1).join("\n"),
    availableAnchors: allAnchors
  };
};

const extractTaskIdFromPayload = (payloadContent: string): string | null => {
  try {
    const parsed = JSON.parse(payloadContent) as Record<string, unknown>;
    if (parsed.schema === "ai-collab.task.v1" && typeof parsed.taskId === "string") {
      return parsed.taskId;
    }
  } catch {
    return null;
  }
  return null;
};

const getNextTaskId = (sessionId: string): string => {
  const counterPath = join(
    projectRoot,
    ".knowledge",
    sessionId,
    "meta",
    "task-counter.json"
  );
  let counter = 1;
  if (existsSync(counterPath)) {
    try {
      const data = JSON.parse(readFileSync(counterPath, "utf-8")) as { nextId: number };
      counter = data.nextId ?? 1;
    } catch {
      counter = 1;
    }
  }
  const dir = dirname(counterPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(counterPath, JSON.stringify({ nextId: counter + 1 }), "utf-8");
  return `TASK-${String(counter).padStart(3, "0")}`;
};

const wrapSimpleTaskAsV1 = (
  goal: string,
  knowledgeRefs: string | undefined
): string => {
  const refs: Array<{ ref: string; reason?: string }> = [];
  if (knowledgeRefs) {
    for (const rawRef of knowledgeRefs.split(",")) {
      const trimmed = rawRef.trim();
      if (trimmed) {
        refs.push({ ref: trimmed });
      }
    }
  }
  const task: Record<string, unknown> = {
    schema: "ai-collab.task.v1",
    taskId: "TASK-AUTO",
    goal,
    ...(refs.length > 0 ? { knowledgeRefs: refs } : {})
  };
  return JSON.stringify(task);
};

const inferSourceKind = (
  source: string
): string => {
  const mapping: Record<string, string> = {
    user_message: "user_feedback",
    user_feedback: "user_feedback",
    host_planning: "host_update",
    worker_report: "worker_report",
    system_idle: "system"
  };
  return mapping[source] ?? "manual";
};

const inferNextAction = (
  knowledgeBuild: boolean
): string => {
  return knowledgeBuild ? "knowledge_upsert_then_dispatch" : "dispatch";
};

type PreparedWindowDispatchTask = {
  targetWindowName: string;
  targetProfile: WindowProfile;
  content: string;
};

const parseWindowDispatchTaskSpec = (
  rawValue: string
): WindowDispatchTaskSpec => {
  const value = rawValue.trim();
  if (!value) {
    throw new Error(
      "Batch dispatch tasks cannot be empty. Use --task \"<workerWindow>::<task content>\"."
    );
  }

  if (value.startsWith("{")) {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      const targetWindowName =
        typeof parsed.to === "string"
          ? parsed.to.trim()
          : typeof parsed.windowName === "string"
            ? parsed.windowName.trim()
            : typeof parsed.workerWindow === "string"
              ? parsed.workerWindow.trim()
              : "";
      const content =
        typeof parsed.content === "string" ? parsed.content.trim() : "";
      if (targetWindowName && content) {
        return {
          targetWindowName,
          content
        };
      }
    } catch (error: unknown) {
      throw new Error(
        `Failed to parse batch dispatch task JSON: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    throw new Error(
      "Batch dispatch task JSON must include one of to/windowName/workerWindow, and content."
    );
  }

  for (const separator of ["::", "=>", "="]) {
    const index = value.indexOf(separator);
    if (index <= 0) {
      continue;
    }

    const targetWindowName = value.slice(0, index).trim();
    const content = value.slice(index + separator.length).trim();
    if (targetWindowName && content) {
      return {
        targetWindowName,
        content
      };
    }
  }

  throw new Error(
    "Invalid batch dispatch task format. Use --task \"<workerWindow>::<task content>\", or pass JSON containing to and content."
  );
};

const buildMergedDispatchTaskContent = (contents: string[]) => {
  if (contents.length === 1) {
    return contents[0]!;
  }

  return contents
    .map((content, index) => `Task ${index + 1}\n${content}`)
    .join("\n\n---\n\n");
};

const normalizeWindowDispatchTasks = (
  rawTasks: WindowDispatchTaskSpec[]
): WindowDispatchTaskSpec[] => {
  const grouped = new Map<string, string[]>();

  for (const task of rawTasks) {
    const existing = grouped.get(task.targetWindowName) ?? [];
    existing.push(task.content.trim());
    grouped.set(task.targetWindowName, existing);
  }

  return Array.from(grouped.entries()).map(([targetWindowName, contents]) => ({
    targetWindowName,
    content: buildMergedDispatchTaskContent(
      contents.filter((value) => value.length > 0)
    )
  }));
};

const resolveWorkerRoleDescription = (
  role: "worker",
  roleDescription: string | undefined,
  optionName: string
): string | undefined => {
  const normalized = roleDescription?.trim();
  if (role !== "worker") {
    return normalized || undefined;
  }

  if (!normalized) {
    throw new Error(
      `Worker joining must provide a role description. Use ${optionName} \"<description>\" to describe this worker's purpose.`
    );
  }

  return normalized;
};

const ensureMessageType = (value: string): MessageType => {
  if (SUPPORTED_MESSAGE_TYPES.includes(value as MessageType)) {
    return value as MessageType;
  }

  throw new Error(
    `Unsupported message type "${value}". Supported values: ${SUPPORTED_MESSAGE_TYPES.join(", ")}`
  );
};

const sleep = async (milliseconds: number) => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
};

const hashStableValue = (value: unknown): string => {
  return createHash("sha1")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 16);
};

const buildDerivedIdempotencyKey = (
  scope: string,
  seed: Record<string, unknown>
): string => {
  return `${scope}:${hashStableValue(seed)}`;
};

const computeAdaptiveSleepMs = (options: {
  baseIntervalSeconds: number;
  round: number;
  seed: string;
}): number => {
  const backoffFactor = Math.min(
    DEFAULT_POLL_BACKOFF_GROWTH ** Math.max(options.round - 1, 0),
    DEFAULT_POLL_BACKOFF_MAX_FACTOR
  );
  const baseMilliseconds = options.baseIntervalSeconds * 1000 * backoffFactor;
  const jitterMagnitude = baseMilliseconds * DEFAULT_POLL_JITTER_RATIO;
  const jitterSeed = Number.parseInt(
    hashStableValue([options.seed, options.round]).slice(0, 8),
    16
  );
  const normalized = Number.isNaN(jitterSeed) ? 0.5 : (jitterSeed % 1000) / 999;
  const jitter = (normalized * 2 - 1) * jitterMagnitude;

  return Math.max(250, Math.round(baseMilliseconds + jitter));
};

const isSdkErrorCode = (
  error: unknown,
  code: string
): error is AiCollabSdkError => {
  return error instanceof AiCollabSdkError && error.code === code;
};

const isWaitChainControlError = (error: unknown): error is AiCollabSdkError => {
  return (
    error instanceof AiCollabSdkError &&
    (error.code === errorCodes.identityBusy ||
      error.code === errorCodes.waitChainSuperseded)
  );
};

const shellEscape = (value: string): string => {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
};

const appendCommandOption = (
  parts: string[],
  flag: string,
  value: string | boolean | string[] | undefined
) => {
  if (value === undefined) {
    return;
  }

  if (typeof value === "boolean") {
    if (value) {
      parts.push(flag);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      parts.push(flag, shellEscape(item));
    }
    return;
  }

  parts.push(flag, shellEscape(value));
};

const buildRuntimeResumeCommand = (
  subcommand: string,
  options: Array<[string, string | boolean | string[] | undefined]>
): string => {
  const parts = ["ai-collab", "runtime", subcommand];

  for (const [flag, value] of options) {
    appendCommandOption(parts, flag, value);
  }

  return parts.join(" ");
};

const buildAiCollabTerminalCommand = (args: string[]) => {
  return ["ai-collab", ...args.map(shellEscape)].join(" ");
};

type WindowWaitAliasName = (typeof WINDOW_WAIT_ALIAS_NAMES)[number];

type WindowWaitContinuationState = {
  sequenceId: string;
  originCommand: string;
  currentAlias: WindowWaitAliasName;
  currentStep: number;
  currentPass: number;
  totalSlices: number;
  nextAlias: WindowWaitAliasName;
  nextStep: number;
  nextPass: number;
  remainingSlices: number;
  canContinue: boolean;
  nextToken: string | null;
  nextCommand: string | null;
  nextCommandArgs: string[] | null;
  nextTerminalCommand: string | null;
};

type WindowContinueTokenPayload = {
  version: 1 | 2;
  alias: WindowWaitAliasName;
  sequenceId: string;
  step: number;
  pass: number;
  totalSlices: number;
  originCommand: string;
  issuedAt: string;
  expiresAt: string;
};

const isWindowWaitAliasName = (
  value: string
): value is WindowWaitAliasName => {
  return WINDOW_WAIT_ALIAS_NAMES.includes(value as WindowWaitAliasName);
};

const parseOptionalPositiveInteger = (
  name: string,
  value: string | undefined,
  fallback: number
): number => {
  if (value === undefined) {
    return fallback;
  }

  return ensurePositiveInteger(name, value, fallback);
};

const encodeOpaqueToken = (value: string) => {
  return Buffer.from(value, "utf8").toString("base64url");
};

const decodeOpaqueToken = (token: string): string => {
  return Buffer.from(token, "base64url").toString("utf8");
};

const buildWindowContinueCommandArgs = (options: {
  windowName: string;
  sessionName: string;
  token: string;
}) => {
  const continuation = decodeWindowContinueToken(
    options.token,
    options.windowName,
    options.sessionName
  );

  return [
    "await",
    options.windowName,
    "--session",
    options.sessionName,
    "--continue-seq",
    continuation.sequenceId,
    "--continue-step",
    String(continuation.step),
    "--continue-pass",
    String(continuation.pass),
    "--continue-budget",
    String(continuation.totalSlices),
    "--continue-origin",
    continuation.originCommand
  ];
};

const buildWindowContinueToken = (options: {
  alias: WindowWaitAliasName;
  windowName: string;
  sessionName: string;
  sequenceId: string;
  step: number;
  pass: number;
  totalSlices: number;
  originCommand: string;
}) => {
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  void options.windowName;
  void options.sessionName;

  return encodeOpaqueToken(
    [
      "2",
      options.alias,
      options.sequenceId,
      String(options.step),
      String(options.pass),
      String(options.totalSlices),
      options.originCommand,
      String(Date.parse(issuedAt)),
      String(Date.parse(expiresAt))
    ].join("|")
  );
};

const decodeWindowContinueToken = (
  token: string,
  expectedWindowName: string,
  expectedSessionName: string
): WindowContinueTokenPayload => {
  const decoded = decodeOpaqueToken(token);

  if (decoded.startsWith("2|")) {
    const [
      version,
      aliasValue,
      sequenceId,
      stepRaw,
      passRaw,
      totalSlicesRaw,
      originCommand,
      issuedAtRaw,
      expiresAtRaw
    ] = decoded.split("|");

    if (
      version !== "2" ||
      !aliasValue ||
      !isWindowWaitAliasName(aliasValue) ||
      !sequenceId ||
      !originCommand ||
      !stepRaw ||
      !passRaw ||
      !totalSlicesRaw ||
      !issuedAtRaw ||
      !expiresAtRaw
    ) {
      throw new Error("continue token version or alias is invalid.");
    }

    const issuedAt = new Date(Number(issuedAtRaw)).toISOString();
    const expiresAt = new Date(Number(expiresAtRaw)).toISOString();
    const step = ensurePositiveInteger("continue-step", stepRaw, 1);
    const pass = ensurePositiveInteger("continue-pass", passRaw, 1);
    const totalSlices = ensurePositiveInteger(
      "continue-budget",
      totalSlicesRaw,
      DEFAULT_WINDOW_WAIT_CONTINUATION_BUDGET
    );

    if (Date.parse(expiresAt) <= Date.now()) {
      throw new Error("continue token has expired.");
    }

    return {
      version: 2,
      alias: aliasValue,
      sequenceId,
      step,
      pass,
      totalSlices,
      originCommand,
      issuedAt,
      expiresAt
    };
  }

  const parsed = JSON.parse(decoded) as Record<string, unknown>;
  const aliasValue = parsed.alias;
  if (
    parsed.version !== 1 ||
    typeof aliasValue !== "string" ||
    !isWindowWaitAliasName(aliasValue)
  ) {
    throw new Error("continue token version or alias is invalid.");
  }

  const windowName =
    typeof parsed.windowName === "string" ? parsed.windowName : null;
  const sessionName =
    typeof parsed.sessionName === "string" ? parsed.sessionName : null;
  if (windowName !== expectedWindowName || sessionName !== expectedSessionName) {
    throw new Error("continue token does not match the current window/session.");
  }

  const sequenceId =
    typeof parsed.sequenceId === "string" ? parsed.sequenceId : null;
  const originCommand =
    typeof parsed.originCommand === "string" ? parsed.originCommand : null;
  const issuedAt =
    typeof parsed.issuedAt === "string" ? parsed.issuedAt : null;
  const expiresAt =
    typeof parsed.expiresAt === "string" ? parsed.expiresAt : null;
  const step = ensurePositiveInteger(
    "continue-step",
    String(parsed.step ?? ""),
    1
  );
  const pass = ensurePositiveInteger(
    "continue-pass",
    String(parsed.pass ?? ""),
    1
  );
  const totalSlices = ensurePositiveInteger(
    "continue-budget",
    String(parsed.totalSlices ?? ""),
    DEFAULT_WINDOW_WAIT_CONTINUATION_BUDGET
  );

  if (!sequenceId || !originCommand || !issuedAt || !expiresAt) {
    throw new Error("continue token is missing required fields.");
  }

  if (Date.parse(expiresAt) <= Date.now()) {
    throw new Error("continue token has expired.");
  }

  return {
    version: 1,
    alias: aliasValue,
    sequenceId,
    step,
    pass,
    totalSlices,
    originCommand,
    issuedAt,
    expiresAt
  };
};

const getNextWindowWaitAlias = (
  currentAlias: WindowWaitAliasName,
  currentPass: number
): {
  alias: WindowWaitAliasName;
  pass: number;
} => {
  const currentIndex = WINDOW_WAIT_ALIAS_NAMES.indexOf(currentAlias);
  const nextIndex =
    currentIndex >= 0
      ? (currentIndex + 1) % WINDOW_WAIT_ALIAS_NAMES.length
      : 0;

  return {
    alias: WINDOW_WAIT_ALIAS_NAMES[nextIndex] ?? "await",
    pass: nextIndex === 0 ? currentPass + 1 : currentPass
  };
};

const buildWindowWaitAliasCommandArgs = (options: {
  alias: WindowWaitAliasName;
  windowName: string;
  sessionName: string;
  continuation?: {
    sequenceId: string;
    step: number;
    pass: number;
    totalSlices: number;
    originCommand: string;
  };
}) => {
  const args = ["await", options.windowName, "--session", options.sessionName];

  if (options.continuation) {
    args.push("--continue-seq", options.continuation.sequenceId);
    args.push("--continue-step", String(options.continuation.step));
    args.push("--continue-pass", String(options.continuation.pass));
    args.push("--continue-budget", String(options.continuation.totalSlices));
    args.push("--continue-origin", options.continuation.originCommand);
  }

  return args;
};

const resolveWindowWaitContinuationState = (options: {
  alias: WindowWaitAliasName;
  windowName: string;
  sessionName: string;
  originCommand: string;
  continueSeq?: string | undefined;
  continueStep?: string | undefined;
  continuePass?: string | undefined;
  continueBudget?: string | undefined;
  continueOrigin?: string | undefined;
}): WindowWaitContinuationState => {
  const sequenceId = options.continueSeq ?? randomUUID();
  const currentStep = parseOptionalPositiveInteger(
    "continue-step",
    options.continueStep,
    1
  );
  const currentPass = parseOptionalPositiveInteger(
    "continue-pass",
    options.continuePass,
    1
  );
  const totalSlices = parseOptionalPositiveInteger(
    "continue-budget",
    options.continueBudget,
    DEFAULT_WINDOW_WAIT_CONTINUATION_BUDGET
  );
  const originCommand = options.continueOrigin ?? options.originCommand;
  const nextAliasInfo = getNextWindowWaitAlias(options.alias, currentPass);
  const canContinue = currentStep < totalSlices;
  const nextStep = currentStep + 1;
  const nextToken = canContinue
    ? buildWindowContinueToken({
        alias: nextAliasInfo.alias,
        windowName: options.windowName,
        sessionName: options.sessionName,
        sequenceId,
        step: nextStep,
        pass: nextAliasInfo.pass,
        totalSlices,
        originCommand
      })
    : null;
  const nextCommandArgs = nextToken
    ? buildWindowContinueCommandArgs({
        windowName: options.windowName,
        sessionName: options.sessionName,
        token: nextToken
      })
    : null;
  const nextCommand = nextCommandArgs
    ? ["ai-collab", ...nextCommandArgs.map(shellEscape)].join(" ")
    : null;
  const nextTerminalCommand = nextCommandArgs
    ? buildAiCollabTerminalCommand(nextCommandArgs)
    : null;

  return {
    sequenceId,
    originCommand,
    currentAlias: options.alias,
    currentStep,
    currentPass,
    totalSlices,
    nextAlias: nextAliasInfo.alias,
    nextStep,
    nextPass: nextAliasInfo.pass,
    remainingSlices: Math.max(0, totalSlices - currentStep),
    canContinue,
    nextToken,
    nextCommand,
    nextCommandArgs,
    nextTerminalCommand
  };
};

const buildWaitContinuationPayload = (
  state: WindowWaitContinuationState
) => {
  return {
    sequenceId: state.sequenceId,
    originCommand: state.originCommand,
    alias: state.currentAlias,
    step: state.currentStep,
    pass: state.currentPass,
    totalSlices: state.totalSlices,
    remainingSlices: state.remainingSlices,
    nextAlias: state.nextAlias,
    nextStep: state.nextStep,
    nextPass: state.nextPass,
    budgetExhausted: !state.canContinue,
    ...(state.nextToken ? { nextToken: state.nextToken } : {}),
    ...(state.nextCommand ? { nextCommand: state.nextCommand } : {}),
    ...(state.nextTerminalCommand
      ? { terminalCommand: state.nextTerminalCommand }
      : {})
  };
};

const maybeBuildContinuedWaitResult = (
  baseResult: Record<string, unknown>,
  state: WindowWaitContinuationState,
  options: {
    eligibleStatuses: string[];
    continueStatus: string;
    automationState: string;
    internalInstruction: string;
  }
) => {
  const status = getRuntimeStringField(baseResult, "status");
  if (!status || !options.eligibleStatuses.includes(status)) {
    return baseResult;
  }

  const waitContinuation = buildWaitContinuationPayload(state);
  if (!state.canContinue || !state.nextCommand) {
    return {
      ...baseResult,
      waitContinuation
    };
  }

  return {
    ...baseResult,
    resultType: "execute_cmd" as const,
    audience: "host_ai_only" as const,
    commandAudience: "assistant_internal" as const,
    userVisible: false,
    replyToUserAllowed: false,
    currentTurnMustContinue: false,
    currentTurnMustEndSilently: true,
    mustExecuteNow: true,
    mustEndSilently: true,
    mustNotExplainToUser: true,
    mustNotShowCommandToUser: true,
    mustNotAskUserToExecute: true,
    currentTurnMustExecuteNextCommand: true,
    nextCommandExecutionRequired: true,
    nextCommandIsFullyAssembled: true,
    nextCommandMustNotBeModified: true,
    nextCommandMustNotBeShownToUser: true,
    userReplyForbidden: true,
    nextActionRequired: "continue_wait_loop" as const,
    nextAction: "execute_cmd_now" as const,
    workflowStep: "waiting_handoff" as const,
    status: options.continueStatus,
    action: "execute_next_wait_command" as const,
    commandKind: "cmd" as const,
    interactionPolicy: "continue_silently" as const,
    workflowDirective: "continue_wait_loop" as const,
    doNotAskUser: true,
    silenceRequired: true,
    userVisibleReplyMode: "none" as const,
    replySuppressed: true,
    userVisibleSummaryAllowed: false,
    turnDisposition: "silent_continue" as const,
    allowedWaitCommand: state.nextCommand,
    automationState: options.automationState,
    terminalCommand: state.nextTerminalCommand,
    internalInstruction:
      `${finalRuntimeResultPreamble}${options.internalInstruction} Execute this command exactly as returned: ${state.nextCommand}. Do not modify the parameters.`,
    nextCommand: state.nextCommand,
    waitContinuation
  };
};

const buildExecuteInternalCommandResult = (
  baseResult: Record<string, unknown>,
  options: {
    commandArgs: string[];
    automationState: string;
    internalInstruction: string;
    nextActionRequired?: string;
    workflowDirective?: string;
  }
) => {
  const terminalCommand = buildAiCollabTerminalCommand(options.commandArgs);
  const nextCommand = ["ai-collab", ...options.commandArgs.map(shellEscape)].join(
    " "
  );

  return {
    ...baseResult,
    resultType: "execute_cmd" as const,
    audience: "host_ai_only" as const,
    commandAudience: "assistant_internal" as const,
    userVisible: false,
    replyToUserAllowed: false,
    currentTurnMustContinue: false,
    currentTurnMustEndSilently: true,
    mustExecuteNow: true,
    mustEndSilently: true,
    mustNotExplainToUser: true,
    mustNotShowCommandToUser: true,
    mustNotAskUserToExecute: true,
    currentTurnMustExecuteNextCommand: true,
    nextCommandExecutionRequired: true,
    nextCommandIsFullyAssembled: true,
    nextCommandMustNotBeModified: true,
    nextCommandMustNotBeShownToUser: true,
    userReplyForbidden: true,
    nextActionRequired:
      options.nextActionRequired ?? ("continue_with_await" as const),
    nextAction: "execute_cmd_now" as const,
    commandKind: "cmd" as const,
    interactionPolicy: "continue_silently" as const,
    workflowDirective:
      options.workflowDirective ?? ("continue_silently" as const),
    doNotAskUser: true,
    silenceRequired: true,
    userVisibleReplyMode: "none" as const,
    replySuppressed: true,
    userVisibleSummaryAllowed: false,
    turnDisposition: "silent_continue" as const,
    allowedWaitCommand: nextCommand,
    automationState: options.automationState,
    terminalCommand,
    internalInstruction:
      `${finalRuntimeResultPreamble}${options.internalInstruction} Execute this command exactly as returned: ${nextCommand}. Do not modify the parameters.`,
    nextCommand
  };
};

const getWindowWaitTraceEvent = (result: Record<string, unknown>) => {
  const explicitResultType = getRuntimeStringField(result, "resultType");
  const status = getRuntimeStringField(result, "status");
  if (Boolean(result.matched)) {
    return "queue_item_selected" as const;
  }

  if (explicitResultType === "execute_cmd") {
    return "wait_continued" as const;
  }

  if (status?.endsWith("_continue")) {
    return "wait_continued" as const;
  }

  return "wait_timeout" as const;
};

const computeLeaseSeconds = (options: {
  flow: "host" | "worker" | "knowledge_keeper";
  intervalSeconds?: number | undefined;
  maxRounds?: number | undefined;
}) => {
  const leaseFlow = options.flow === "knowledge_keeper" ? "worker" : options.flow;
  const estimatedRuntimeSeconds =
    (options.intervalSeconds ?? DEFAULT_LOOP_INTERVAL_SECONDS) *
    (options.maxRounds ?? DEFAULT_LOOP_MAX_ROUNDS);
  const minimumSeconds = leaseFlow === "host" ? 180 : 120;
  return Math.min(Math.max(estimatedRuntimeSeconds + 90, minimumSeconds), 7200);
};

const sliceWaitRounds = (options: {
  intervalSeconds: number;
  maxRounds: number;
}) => {
  const slicedMaxRounds = Math.min(
    options.maxRounds,
    Math.max(
      1,
      Math.ceil(DEFAULT_WINDOW_WAIT_SLICE_ELAPSED_SECONDS / options.intervalSeconds)
    )
  );

  return {
    intervalSeconds: options.intervalSeconds,
    maxRounds: slicedMaxRounds,
    waitWindowSeconds: DEFAULT_WINDOW_WAIT_SLICE_ELAPSED_SECONDS,
    maxElapsedSeconds: DEFAULT_WINDOW_WAIT_SLICE_ELAPSED_SECONDS,
    sliced: slicedMaxRounds < options.maxRounds
  };
};

const buildWaitChainAuth = (
  context: CliIdentityContext,
  flow: "host" | "worker" | "knowledge_keeper"
) => {
  const leaseFlow = flow === "knowledge_keeper" ? "worker" : flow;
  return {
    identity: context.identity,
    flow: leaseFlow,
    ownerToken: cliLeaseOwnerToken
  };
};

const withCliIdentityLease = async <T>(
  context: CliIdentityContext,
  flow: "host" | "worker" | "knowledge_keeper",
  options: {
    intervalSeconds?: number | undefined;
    maxRounds?: number | undefined;
  },
  task: () => Promise<T>
): Promise<T> => {
  const leaseFlow = flow === "knowledge_keeper" ? "worker" : flow;
  await client.acquireIdentityLease({
    identity: context.identity,
    flow: leaseFlow,
    ownerToken: cliLeaseOwnerToken,
    leaseSeconds: computeLeaseSeconds({
      flow: leaseFlow,
      intervalSeconds: options.intervalSeconds,
      maxRounds: options.maxRounds
    }),
    takeover: true
  });

  try {
    return await task();
  } finally {
    try {
      await client.releaseIdentityLease({
        identity: context.identity,
        flow: leaseFlow,
        ownerToken: cliLeaseOwnerToken
      });
    } catch {
      // Lease expiry on the core side prevents permanent lock retention.
    }
  }
};

const renewCliIdentityLease = async (
  context: CliIdentityContext,
  flow: "host" | "worker" | "knowledge_keeper",
  options: {
    intervalSeconds?: number | undefined;
    maxRounds?: number | undefined;
  }
): Promise<boolean> => {
  const leaseFlow = flow === "knowledge_keeper" ? "worker" : flow;
  try {
    await client.acquireIdentityLease({
      identity: context.identity,
      flow: leaseFlow,
      ownerToken: cliLeaseOwnerToken,
      leaseSeconds: computeLeaseSeconds({
        flow: leaseFlow,
        intervalSeconds: options.intervalSeconds,
        maxRounds: options.maxRounds
      }),
      takeover: false
    });
    return true;
  } catch (error: unknown) {
    if (isWaitChainControlError(error)) {
      return false;
    }
    throw error;
  }
};

const buildAlreadyRunningResult = (options: {
  mode: string;
  identity: string;
  flow: string;
  existing: {
    pid: number | null;
    acquiredAt: string | null;
  };
}) => {
  const workflowRole = options.flow === "host-cycle" ? "host" : "worker";
  const automationState =
    workflowRole === "host" ? "host_wait_loop_active" : "wait_loop_active";

  return {
    commandResultState: "completed" as const,
    commandResultIsFinal: true,
    ignoreIntermediateCommandStateText: true,
    intermediateCommandStateTextIsNotAuthoritative: true,
    runtimeTerminalProgressHints,
    currentTurnMustContinue: false,
    currentTurnMustEndSilently: true,
    userReplyForbidden: true,
    nextActionRequired: "stop_silently" as const,
    workflowModel: "message_loop" as const,
    workflowContract: "wait_receive_process_report_wait" as const,
    workflowRole,
    workflowStep: "waiting" as const,
    messageKind: null,
    mode: options.mode,
    status: "already_running" as const,
    action: "already_waiting" as const,
    identity: options.identity,
    flow: options.flow,
    doNotAskUser: true,
    interactionPolicy: "continue_silently" as const,
    workflowDirective: "continue_silently" as const,
    silenceRequired: true,
    userVisibleReplyMode: "none" as const,
    replySuppressed: true,
    userVisibleSummaryAllowed: false,
    turnDisposition: "silent_hold" as const,
    waitStrategy: "runtime_only" as const,
    sleepCommandForbidden: true,
    FORBIDDEN_PURE_WAIT_COMMANDS,
    automationState,
    internalInstruction:
      `${finalRuntimeResultPreamble}Do not reply to the user. Do not summarize this result. A wait chain for this identity is already running. Stop here silently. Do not execute Start-Sleep, sleep, timeout, ping, or any other pure wait command. Only the ai-collab wait chain is allowed.`,
    existingRun: {
      pid: options.existing.pid,
      acquiredAt: options.existing.acquiredAt
    }
  };
};

const ensurePositiveInteger = (
  name: string,
  value: string,
  fallback: number
): number => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  if (parsed <= 0) {
    throw new Error(`${name} must be an integer greater than 0.`);
  }
  return parsed;
};

const resolveContinueAfterMatch = (
  continueAfterMatch: boolean | undefined,
  maxMatches: number
) => {
  if (!continueAfterMatch && maxMatches > 1) {
    throw new Error(
      "When max-matches is greater than 1, --continue-after-match must also be enabled."
    );
  }

  return continueAfterMatch ?? false;
};

type WorkerLoopResult = {
  mode: "worker-await-loop";
  matched: boolean;
  superseded: boolean;
  round: number;
  maxRounds: number;
  intervalSeconds: number;
  continueAfterMatch: boolean;
  maxMatches: number;
  agentId: string;
  agentName: string;
  message: unknown;
  messageCount: number;
  messages: unknown[];
  matchedRounds: number[];
  backlog: {
    pendingInboxCount: number;
    claimedInboxCount: number;
  };
  lastPollAt: string;
  lastClaimAt: string | null;
  startedAt: string;
  finishedAt: string;
};

type HostLoopResult = {
  mode: "host-report-await-loop";
  matched: boolean;
  superseded: boolean;
  round: number;
  maxRounds: number;
  intervalSeconds: number;
  continueAfterMatch: boolean;
  maxMatches: number;
  agentId: string;
  agentName: string;
  filter: {
    fromAgentId: string | null;
    type: MessageType | null;
    correlationId: string | null;
    pendingOnly: boolean;
    includeAcknowledged: boolean;
    ackMatched: boolean;
  };
  messageCount: number;
  messages: unknown[];
  matchedRounds: number[];
  acknowledgedMessageIds: string[];
  backlog: {
    pendingInboxCount: number;
    claimedInboxCount: number;
  };
  lastPollAt: string;
  lastClaimAt: string | null;
  startedAt: string;
  finishedAt: string;
};

type HostLoopItemKind = "task" | "report" | "mixed" | "unknown" | null;

type HostLoopUnifiedResult = {
  mode: "host-await-loop";
  matched: boolean;
  superseded: boolean;
  round: number;
  maxRounds: number;
  intervalSeconds: number;
  agentId: string;
  agentName: string;
  itemKind: HostLoopItemKind;
  actionHint:
    | "execute_locally"
    | "review_report"
    | "review_messages"
    | "idle_timeout";
  message: MessageRecord | null;
  item: RuntimeMessageSummary | null;
  task: RuntimeMessageSummary | null;
  report: RuntimeMessageSummary | null;
  items: RuntimeMessageSummary[];
  tasks: RuntimeMessageSummary[];
  reports: RuntimeMessageSummary[];
  messageCount: number;
  messages: MessageRecord[];
  matchedRounds: number[];
  acknowledgedMessageIds: string[];
  backlog: {
    pendingInboxCount: number;
    claimedInboxCount: number;
  };
  lastPollAt: string;
  lastClaimAt: string | null;
  startedAt: string;
  finishedAt: string;
  defaults: {
    intervalSeconds: number;
    maxRounds: number;
    ackMatched: boolean;
  };
};

type RuntimeMessageSummary = {
  messageId: string;
  type: MessageType;
  correlationId: string | null;
  deliveryStatus: MessageRecord["deliveryStatus"];
  processingStatus: MessageRecord["processingStatus"];
  fromAgentId: string;
  toAgentId: string | null;
  content: string | null;
  result: string | null;
  payload: unknown;
  createdAt: string;
};

const parseMessagePayloadView = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return {
      content: null,
      result: null
    };
  }

  const payloadRecord = payload as Record<string, unknown>;

  return {
    content:
      typeof payloadRecord.content === "string" ? payloadRecord.content : null,
    result:
      typeof payloadRecord.result === "string" ? payloadRecord.result : null
  };
};

const extractPayloadRecord = (
  payload: unknown
): Record<string, unknown> | null => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  return payload as Record<string, unknown>;
};

const summarizeMessage = (message: MessageRecord): RuntimeMessageSummary => {
  const payloadView = parseMessagePayloadView(message.payload);

  return {
    messageId: message.id,
    type: message.type,
    correlationId: message.correlationId ?? null,
    deliveryStatus: message.deliveryStatus,
    processingStatus: message.processingStatus,
    fromAgentId: message.fromAgentId,
    toAgentId: message.toAgentId ?? null,
    content: payloadView.content,
    result: payloadView.result,
    payload: message.payload,
    createdAt: message.createdAt
  };
};

const isUnfinishedClaimedMessage = (message: MessageRecord | null): message is MessageRecord => {
  return message?.processingStatus === "claimed";
};

const findClaimedRememberedMessage = async (
  context: CliIdentityContext,
  messageId: string | null | undefined
): Promise<MessageRecord | null> => {
  if (!messageId) {
    return null;
  }
  const message = await findMessageForAgent(context, messageId);
  return isUnfinishedClaimedMessage(message) ? message : null;
};

const sortMessagesByCreatedAt = <T extends { createdAt: string }>(
  messages: T[]
): T[] => {
  return [...messages].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt)
  );
};

const filterClaimedMessagesForContext = (
  messages: MessageRecord[],
  options: {
    types?: MessageType[] | undefined;
    fromAgentId?: string | undefined;
    correlationId?: string | undefined;
  } = {}
): MessageRecord[] => {
  return sortMessagesByCreatedAt(
    messages.filter((message) => {
      if (message.processingStatus !== "claimed") {
        return false;
      }
      if (options.types && !options.types.includes(message.type)) {
        return false;
      }
      if (options.fromAgentId && message.fromAgentId !== options.fromAgentId) {
        return false;
      }
      if (
        options.correlationId &&
        message.correlationId !== options.correlationId
      ) {
        return false;
      }
      return true;
    })
  );
};

const isHostTaskMessage = (message: MessageRecord): boolean =>
  HOST_EXECUTABLE_MESSAGE_TYPES.includes(message.type);

const isHostReportMessage = (message: MessageRecord): boolean =>
  HOST_REPORT_MESSAGE_TYPES.includes(message.type);

const classifyHostMessages = (messages: MessageRecord[]) => {
  const sortedMessages = sortMessagesByCreatedAt(messages);
  const items = sortedMessages.map((message) => summarizeMessage(message));
  const tasks = sortedMessages
    .filter((message) => isHostTaskMessage(message))
    .map((message) => summarizeMessage(message));
  const reports = sortedMessages
    .filter((message) => isHostReportMessage(message))
    .map((message) => summarizeMessage(message));
  const unknowns = sortedMessages.filter(
    (message) => !isHostTaskMessage(message) && !isHostReportMessage(message)
  );
  const itemKind: HostLoopItemKind =
    sortedMessages.length === 0
      ? null
      : unknowns.length > 0
        ? "unknown"
        : tasks.length > 0 && reports.length > 0
          ? "mixed"
          : tasks.length > 0
            ? "task"
            : "report";

  return {
    itemKind,
    messages: sortedMessages,
    items,
    tasks,
    reports,
    unknowns,
    firstItem: items[0] ?? null,
    firstTask: tasks[0] ?? null,
    firstReport: reports[0] ?? null
  };
};

const isWorkerWaitingOrIdle = (binding: WindowBinding): boolean => {
  const state = binding.runtimeState;
  const pendingInboxCount = state.pendingInboxCount ?? 0;
  const claimedInboxCount = state.claimedInboxCount ?? 0;

  if (pendingInboxCount > 0 || claimedInboxCount > 0) {
    return false;
  }

  return (
    state.lastWorkflowStep === "waiting" ||
    state.lastWorkflowStep === "waiting_handoff" ||
    state.waitChainStatus === "polling" ||
    state.waitChainStatus === "idle" ||
    state.lastStatus === "wait_timeout" ||
    state.lastStatus === "wait_timeout_continue" ||
    state.lastTurnDisposition === "silent_hold"
  );
};

const assessSessionIdleForHost = async (context: CliIdentityContext) => {
  const [bindings, queueStats] = await Promise.all([
    client.listWindowBindings(context.sessionName),
    client.getSessionQueueStats(context.sessionId)
  ]);
  const workers = bindings.filter((binding) => binding.role === "worker");
  const knowledgeKeepers = bindings.filter((binding) => binding.role === "knowledge_keeper");
  const hasQueuedMessages = queueStats.some(
    (stats) => stats.pending > 0 || stats.claimed > 0
  );
  const workerStates = workers.map((worker) => ({
    agentId: worker.agentId,
    agentName: worker.agentName,
    windowName: worker.windowName,
    waitingOrIdle: isWorkerWaitingOrIdle(worker),
    runtimeState: worker.runtimeState
  }));
  const knowledgeKeeperStates = knowledgeKeepers.map((keeper) => ({
    agentId: keeper.agentId,
    agentName: keeper.agentName,
    windowName: keeper.windowName,
    waitingOrIdle: isWorkerWaitingOrIdle(keeper),
    runtimeState: keeper.runtimeState
  }));
  const businessWorkersIdle =
    workers.length > 0 &&
    workerStates.every((worker) => worker.waitingOrIdle);
  const knowledgeKeepersIdle =
    knowledgeKeepers.length === 0 ||
    knowledgeKeeperStates.every((keeper) => keeper.waitingOrIdle);
  const sessionIdle =
    businessWorkersIdle &&
    knowledgeKeepersIdle &&
    !hasQueuedMessages;
  const pendingKnowledgeTasks = queueStats.some(
    (stats) => stats.pending > 0 || stats.claimed > 0
  );

  return {
    allWorkersWaiting: sessionIdle,
    businessWorkersIdle,
    knowledgeKeepersIdle,
    sessionIdle,
    pendingKnowledgeTasks,
    workerCount: workers.length,
    knowledgeKeeperCount: knowledgeKeepers.length,
    hasQueuedMessages,
    workerStates,
    knowledgeKeeperStates,
    queueStats
  };
};

const runWorkerAwaitTask = async (
  context: CliIdentityContext,
  options: {
    profile?: WindowProfile | undefined;
    trace?: TraceStepSink | undefined;
    intervalSeconds: number;
    maxRounds: number;
    maxElapsedSeconds?: number | undefined;
  }
) => {
  const loopResult = await runWorkerAwaitLoop(context, {
    profile: options.profile,
    trace: options.trace,
    intervalSeconds: options.intervalSeconds,
    maxRounds: options.maxRounds,
    maxElapsedSeconds: options.maxElapsedSeconds,
    continueAfterMatch: false,
    maxMatches: 1
  });
  const taskMessage = loopResult.messages[0] as MessageRecord | undefined;
  const task = taskMessage ? summarizeMessage(taskMessage) : null;

  return {
    commandResultState: "completed" as const,
    commandResultIsFinal: true,
    ignoreIntermediateCommandStateText: true,
    intermediateCommandStateTextIsNotAuthoritative: true,
    runtimeTerminalProgressHints,
    currentTurnMustContinue: loopResult.matched,
    currentTurnMustEndSilently: !loopResult.matched,
    userReplyForbidden: true,
    nextActionRequired: loopResult.matched
      ? ("process_claimed_task_now" as const)
      : ("stop_silently" as const),
    workflowModel: "message_loop" as const,
    workflowContract: "wait_receive_process_report_wait" as const,
    workflowRole: (options.profile?.role === "knowledge_keeper" ? "knowledge_keeper" : "worker") as "knowledge_keeper" | "worker",
    workflowStep: loopResult.matched
      ? ("message_received" as const)
      : ("waiting" as const),
    messageKind: loopResult.matched ? ("task" as const) : null,
    mode: "await" as const,
    status: loopResult.matched
      ? ("task_claimed" as const)
      : loopResult.superseded
        ? ("wait_chain_superseded" as const)
        : ("wait_timeout" as const),
    action: loopResult.matched
      ? ("process_task" as const)
      : loopResult.superseded
        ? ("stop_silently" as const)
        : ("wait" as const),
    matched: loopResult.matched,
    superseded: loopResult.superseded,
    identity: context.identity,
    agentId: context.agentId,
    agentName: context.agentName,
    intervalSeconds: options.intervalSeconds,
    maxRounds: options.maxRounds,
    round: loopResult.round,
    task,
    message: task,
    waitChainId: buildRuntimeWaitChainId(context, "worker"),
    lastPollAt: loopResult.lastPollAt,
    lastClaimAt: loopResult.lastClaimAt,
    backlog: loopResult.backlog,
    doNotAskUser: true,
    interactionPolicy: "continue_silently" as const,
    workflowDirective: loopResult.matched
      ? ("process_claimed_message" as const)
      : ("continue_silently" as const),
    silenceRequired: true,
    userVisibleReplyMode: "none" as const,
    replySuppressed: true,
    userVisibleSummaryAllowed: false,
    turnDisposition: loopResult.matched
      ? ("silent_handoff" as const)
      : ("silent_hold" as const),
    waitStrategy: "runtime_only" as const,
    sleepCommandForbidden: true,
    FORBIDDEN_PURE_WAIT_COMMANDS,
    allowedWaitCommand: "ai-collab await" as const,
    automationState: loopResult.matched
      ? ("resume_claimed_task" as const)
      : loopResult.superseded
        ? ("wait_chain_superseded" as const)
        : ("wait_loop_active" as const),
    internalInstruction: loopResult.matched
      ? `${finalRuntimeResultPreamble}Do not reply to the user. This command has already claimed a worker task, so the current turn must continue immediately into task processing. After finishing, report with ai-collab submit. Do not insert Start-Sleep, sleep, timeout, ping, or any pure wait command.`
      : loopResult.superseded
        ? `${finalRuntimeResultPreamble}Do not reply to the user. This wait chain has been superseded by a newer wait command from the same window. Stop here silently and let the newer wait chain continue. Do not execute Start-Sleep, sleep, timeout, ping, or any other pure wait command.`
        : `${finalRuntimeResultPreamble}Do not reply to the user. No task arrived in this round. If collaboration is still active, continue waiting silently. Do not execute Start-Sleep, sleep, timeout, ping, or any other pure wait command. Only ai-collab await is allowed for waiting.`,
    startedAt: loopResult.startedAt,
    finishedAt: loopResult.finishedAt
  };
};

const submitWorkerResult = async (
  context: CliIdentityContext,
  options: {
    messageId: string;
    content: string;
    result?: string | undefined;
    type?: MessageType | undefined;
    correlationId?: string | undefined;
    idempotencyKey?: string | undefined;
    failReason?: string | undefined;
    markAs: "completed" | "failed";
    role?: "worker" | "knowledge_keeper" | undefined;
    knowledgeUpdateAssessment?: Record<string, unknown> | undefined;
  }
) => {
  const markAs = options.markAs === "failed" ? "failed" : "completed";
  const resolvedType =
    options.type ??
    (markAs === "failed" ? ("error" as const) : ("result" as const));
  const resolvedResult =
    options.result ?? (markAs === "failed" ? "failed" : "completed");
  const sourceMessage = await client.getMessageById(options.messageId);
  const resolvedCorrelationId =
    options.correlationId ?? sourceMessage.correlationId ?? undefined;
  const report = await sendStandardHostReport(context, {
    content: options.content,
    result: resolvedResult,
    type: resolvedType,
    correlationId: resolvedCorrelationId,
    idempotencyKey: options.idempotencyKey,
    knowledgeUpdateAssessment: options.knowledgeUpdateAssessment
  });
  const authFlow = options.role === "knowledge_keeper" ? "knowledge_keeper" : "worker";
  let processedMessage: MessageRecord;

  try {
    processedMessage =
      markAs === "failed"
        ? await client.failMessage(options.messageId, {
            agentId: context.agentId,
            ...(options.failReason ? { reason: options.failReason } : {}),
            ...buildWaitChainAuth(context, authFlow)
          })
        : await client.completeMessage(options.messageId, {
            agentId: context.agentId,
            ...buildWaitChainAuth(context, authFlow)
          });
  } catch (error: unknown) {
    if (!isSdkErrorCode(error, errorCodes.messageAlreadyFinished)) {
      throw error;
    }

    const existingMessage = await client.getMessageById(options.messageId);
    if (
      existingMessage.claimedByAgentId !== context.agentId ||
      (existingMessage.processingStatus !== "processed" &&
        existingMessage.processingStatus !== "failed")
    ) {
      throw error;
    }

    processedMessage = existingMessage;
  }

  return {
    markAs,
    correlationId: resolvedCorrelationId ?? null,
    report,
    processedMessage
  };
};

const waitForHostReport = async (
  context: CliIdentityContext,
  options: {
    intervalSeconds: number;
    maxRounds: number;
    maxElapsedSeconds?: number | undefined;
    fromName?: string | undefined;
    fromAgentId?: string | undefined;
    type?: MessageType | undefined;
    correlationId?: string | undefined;
  }
) => {
  const loopResult = await runHostReportAwaitLoop(context, {
    intervalSeconds: options.intervalSeconds,
    maxRounds: options.maxRounds,
    maxElapsedSeconds: options.maxElapsedSeconds,
    pendingOnly: true,
    includeAcknowledged: false,
    fromName: options.fromName,
    fromAgentId: options.fromAgentId,
    type: options.type,
    correlationId: options.correlationId,
    continueAfterMatch: false,
    maxMatches: 1,
    excludeMessageIds: [],
    ackMatched: true
  });
  const reportMessage = loopResult.messages[0] as MessageRecord | undefined;
  const report = reportMessage ? summarizeMessage(reportMessage) : null;

  return {
    mode: "await" as const,
    status: loopResult.matched
      ? ("report_claimed" as const)
      : loopResult.superseded
        ? ("wait_chain_superseded" as const)
        : ("wait_timeout" as const),
    matched: loopResult.matched,
    superseded: loopResult.superseded,
    identity: context.identity,
    agentId: context.agentId,
    agentName: context.agentName,
    intervalSeconds: options.intervalSeconds,
    maxRounds: options.maxRounds,
    round: loopResult.round,
    filter: loopResult.filter,
    report,
    message: report,
    acknowledgedMessageIds: loopResult.acknowledgedMessageIds,
    startedAt: loopResult.startedAt,
    finishedAt: loopResult.finishedAt
  };
};

const runHostAwaitMessage = async (
  context: CliIdentityContext,
  options: {
    profile?: WindowProfile | undefined;
    trace?: TraceStepSink | undefined;
    intervalSeconds: number;
    maxRounds: number;
    maxElapsedSeconds?: number | undefined;
    fromName?: string | undefined;
    fromAgentId?: string | undefined;
    type?: MessageType | undefined;
    correlationId?: string | undefined;
  }
) => {
  const loopResult = await runHostAwaitLoop(context, {
    profile: options.profile,
    trace: options.trace,
    intervalSeconds: options.intervalSeconds,
    maxRounds: options.maxRounds,
    maxElapsedSeconds: options.maxElapsedSeconds,
    pendingOnly: true,
    includeAcknowledged: false,
    fromName: options.fromName,
    fromAgentId: options.fromAgentId,
    type: options.type,
    correlationId: options.correlationId,
    excludeMessageIds: [],
    ackMatched: true
  });
  const idleAssessment =
    !loopResult.matched && !loopResult.superseded
      ? await assessSessionIdleForHost(context)
      : null;
  const allWorkersWaiting = idleAssessment?.allWorkersWaiting === true;

  return {
    commandResultState: "completed" as const,
    commandResultIsFinal: true,
    ignoreIntermediateCommandStateText: true,
    intermediateCommandStateTextIsNotAuthoritative: true,
    runtimeTerminalProgressHints,
    currentTurnMustContinue: loopResult.matched || allWorkersWaiting,
    currentTurnMustEndSilently: !loopResult.matched && !allWorkersWaiting,
    userReplyForbidden: true,
    nextActionRequired: loopResult.matched
      ? loopResult.itemKind === "task"
        ? ("process_claimed_host_task_now" as const)
        : loopResult.itemKind === "report"
          ? ("review_claimed_report_now" as const)
          : ("review_claimed_messages_now" as const)
      : allWorkersWaiting
        ? ("continue_host_planning" as const)
      : ("stop_silently" as const),
    workflowModel: "message_loop" as const,
    workflowContract: "wait_receive_process_report_wait" as const,
    workflowRole: "host" as const,
    workflowStep: loopResult.matched
      ? ("message_received" as const)
      : allWorkersWaiting
        ? ("session_idle_detected" as const)
      : ("waiting" as const),
    messageKind: loopResult.itemKind ?? (allWorkersWaiting ? "session_idle" : null),
    mode: "await" as const,
    status: loopResult.matched
      ? ("message_claimed" as const)
      : allWorkersWaiting
        ? ("all_workers_waiting" as const)
      : loopResult.superseded
        ? ("wait_chain_superseded" as const)
        : ("wait_timeout" as const),
    action: loopResult.matched
      ? loopResult.itemKind === "task"
        ? ("process_local_task" as const)
        : ("review_report" as const)
      : allWorkersWaiting
        ? ("continue_host_planning" as const)
      : loopResult.superseded
        ? ("stop_silently" as const)
        : ("wait" as const),
    matched: loopResult.matched,
    superseded: loopResult.superseded,
    identity: context.identity,
    agentId: context.agentId,
    agentName: context.agentName,
    intervalSeconds: options.intervalSeconds,
    maxRounds: options.maxRounds,
    round: loopResult.round,
    message: loopResult.item,
    task: loopResult.task,
    report: loopResult.report,
    item: loopResult.item,
    items: loopResult.items,
    tasks: loopResult.tasks,
    reports: loopResult.reports,
    messages: loopResult.messages,
    messageCount: loopResult.messageCount,
    claimedCount: loopResult.messageCount,
    waitChainId: buildRuntimeWaitChainId(context, "host"),
    lastPollAt: loopResult.lastPollAt,
    lastClaimAt: loopResult.lastClaimAt,
    backlog: loopResult.backlog,
    idleAssessment,
    doNotAskUser: true,
    interactionPolicy: allWorkersWaiting
      ? ("host_must_continue" as const)
      : ("continue_silently" as const),
    workflowDirective: loopResult.matched
      ? loopResult.itemKind === "task"
        ? ("process_claimed_message" as const)
        : loopResult.itemKind === "report"
          ? ("review_received_report" as const)
          : ("review_received_messages" as const)
      : allWorkersWaiting
        ? ("continue_host_planning" as const)
      : ("continue_silently" as const),
    silenceRequired: !allWorkersWaiting,
    userVisibleReplyMode: allWorkersWaiting ? ("host_action_required" as const) : ("none" as const),
    replySuppressed: !allWorkersWaiting,
    userVisibleSummaryAllowed: allWorkersWaiting,
    turnDisposition: loopResult.matched
      ? ("silent_handoff" as const)
      : allWorkersWaiting
        ? ("host_continue" as const)
      : ("silent_hold" as const),
    waitStrategy: "runtime_only" as const,
    sleepCommandForbidden: true,
    FORBIDDEN_PURE_WAIT_COMMANDS,
    allowedWaitCommand: "ai-collab await" as const,
    automationState: loopResult.matched
      ? loopResult.itemKind === "task"
        ? ("host_execute_local" as const)
        : loopResult.itemKind === "report"
          ? ("host_report_received" as const)
          : ("host_messages_received" as const)
      : allWorkersWaiting
        ? ("host_session_idle_detected" as const)
      : loopResult.superseded
        ? ("host_wait_chain_superseded" as const)
        : ("host_wait_loop_active" as const),
    internalInstruction: loopResult.matched
      ? loopResult.itemKind === "task"
        ? `${finalRuntimeResultPreamble}Do not reply to the user. This command has already claimed a host task, so the current turn must continue immediately into host-side processing. After finishing, resolve it with ai-collab resolve. Do not insert Start-Sleep, sleep, timeout, ping, or any pure wait command.`
        : loopResult.itemKind === "report"
          ? `${finalRuntimeResultPreamble}Do not reply to the user. This command has already claimed one or more worker reports. Review every returned report together and resolve them with ai-collab resolve after finishing. Do not insert Start-Sleep, sleep, timeout, ping, or any pure wait command.`
          : `${finalRuntimeResultPreamble}Do not reply to the user. This command has already claimed one or more host messages. Review every returned message and resolve them with ai-collab resolve after finishing. Do not insert Start-Sleep, sleep, timeout, ping, or any pure wait command.`
      : loopResult.superseded
        ? `${finalRuntimeResultPreamble}Do not reply to the user. This wait chain has been superseded by a newer wait command from the same window. Stop here silently and let the newer wait chain continue. Do not execute Start-Sleep, sleep, timeout, ping, or any other pure wait command.`
        : allWorkersWaiting
          ? `${finalRuntimeResultPreamble}All workers in this session are waiting or idle and there are no pending or claimed messages. Do not continue the wait loop. Continue host planning now: check whether the user intent has been satisfied, decide whether knowledge needs to be updated, dispatch the next tasks if work remains, or report closure to the user.`
        : `${finalRuntimeResultPreamble}Do not reply to the user. No host message arrived in this round. If collaboration is still active, continue waiting silently. Do not execute Start-Sleep, sleep, timeout, ping, or any other pure wait command. Only ai-collab await is allowed for waiting.`,
    acknowledgedMessageIds: loopResult.acknowledgedMessageIds,
    startedAt: loopResult.startedAt,
    finishedAt: loopResult.finishedAt
  };
};

const resolveSessionMemberByName = async (
  sessionId: string,
  agentName: string
): Promise<Agent> => {
  const matchedMember = (await client.getMembers(sessionId)).find(
    (member) => member.agentName === agentName
  );

  if (!matchedMember) {
    throw new Error(`Collaboration member with name "${agentName}" not found.`);
  }

  return matchedMember;
};

const buildCliDispatchPayload = (options: {
  content: string;
  result: string;
}) => {
  return {
    content: options.content,
    result: options.result
  };
};

const mergeCliDispatchPayloads = (
  existingMessages: MessageRecord[],
  nextPayload: ReturnType<typeof buildCliDispatchPayload>
) => {
  if (existingMessages.length === 0) {
    return nextPayload;
  }

  const mergedContentBlocks = [
    ...existingMessages
      .map((message) => {
        const payload = extractPayloadRecord(message.payload);
        return typeof payload?.content === "string" ? payload.content.trim() : "";
      })
      .filter((value) => value.length > 0),
    nextPayload.content.trim()
  ].filter((value) => value.length > 0);

  return {
    ...nextPayload,
    content: mergedContentBlocks.join("\n\n---\n\n"),
    mergedFromMessageIds: existingMessages.map((message) => message.id),
    mergedMode: "merge" as const
  };
};

const findClaimedMessageForContext = async (
  context: CliIdentityContext,
  options: {
    types?: MessageType[] | undefined;
    fromAgentId?: string | undefined;
    correlationId?: string | undefined;
  } = {}
): Promise<MessageRecord | null> => {
  const claimedMessages = await findClaimedMessagesForContext(context, options);
  return claimedMessages[0] ?? null;
};

const findClaimedMessagesForContext = async (
  context: CliIdentityContext,
  options: {
    types?: MessageType[] | undefined;
    fromAgentId?: string | undefined;
    correlationId?: string | undefined;
  } = {}
): Promise<MessageRecord[]> => {
  const claimedInbox = await client.getInboxWithOptions(context.agentId, {
    claimedOnly: true
  });

  return filterClaimedMessagesForContext(claimedInbox, options);
};

const claimOrReuseHostReport = async (
  context: CliIdentityContext,
  options: {
    fromAgentId?: string | undefined;
    correlationId?: string | undefined;
    type?: MessageType | undefined;
  }
): Promise<{
  message: MessageRecord | null;
  acknowledgedMessageIds: string[];
}> => {
  const claimedReport = await findClaimedMessageForContext(context, {
    types: HOST_REPORT_MESSAGE_TYPES,
    fromAgentId: options.fromAgentId,
    correlationId: options.correlationId
  });

  if (claimedReport) {
    return {
      message: claimedReport,
      acknowledgedMessageIds: [claimedReport.id]
    };
  }

  const claimedNext = await client.claimNext(context.agentId, {
    types:
      options.type && HOST_REPORT_MESSAGE_TYPES.includes(options.type)
        ? [options.type]
        : HOST_REPORT_MESSAGE_TYPES,
    ...(options.fromAgentId ? { fromAgentId: options.fromAgentId } : {}),
    ...(options.correlationId ? { correlationId: options.correlationId } : {}),
    ...buildWaitChainAuth(context, "host")
  });

  if (!claimedNext) {
    return {
      message: null,
      acknowledgedMessageIds: []
    };
  }

  return {
    message: claimedNext,
    acknowledgedMessageIds: [claimedNext.id]
  };
};

const runWorkerAwaitLoop = async (
  context: CliIdentityContext,
  options: {
    profile?: WindowProfile | undefined;
    trace?: TraceStepSink | undefined;
    intervalSeconds: number;
    maxRounds: number;
    maxElapsedSeconds?: number | undefined;
    continueAfterMatch: boolean;
    maxMatches: number;
  }
): Promise<WorkerLoopResult> => {
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  const messages: MessageRecord[] = [];
  const matchedRounds: number[] = [];
  let lastPollAt = startedAt;
  let lastClaimAt: string | null = null;
  let backlog = {
    pendingInboxCount: 0,
    claimedInboxCount: 0
  };
  const buildSupersededResult = (round: number): WorkerLoopResult => ({
    mode: "worker-await-loop",
    matched: false,
    superseded: true,
    round,
    maxRounds: options.maxRounds,
    intervalSeconds: options.intervalSeconds,
    continueAfterMatch: options.continueAfterMatch,
    maxMatches: options.continueAfterMatch ? options.maxMatches : 1,
    agentId: context.agentId,
    agentName: context.agentName,
    message: messages[0] ?? null,
    messageCount: messages.length,
    messages,
    matchedRounds,
    backlog,
    lastPollAt,
    lastClaimAt,
    startedAt,
    finishedAt: new Date().toISOString()
  });

  for (let round = 1; round <= options.maxRounds; round += 1) {
    const leaseStillOwned = await renewCliIdentityLease(context, options.profile?.role === "knowledge_keeper" ? "knowledge_keeper" : "worker", {
      intervalSeconds: options.intervalSeconds,
      maxRounds: options.maxRounds
    });
    if (!leaseStillOwned) {
      return buildSupersededResult(Math.max(round - 1, 0));
    }

    let message: MessageRecord | null;
    try {
      message =
        (await findClaimedMessageForContext(context)) ??
        (await client.claimNext(
          context.agentId,
          buildWaitChainAuth(context, "worker")
        ));
    } catch (error: unknown) {
      if (isWaitChainControlError(error)) {
        return buildSupersededResult(round);
      }
      throw error;
    }

    lastPollAt = new Date().toISOString();
    backlog = await getInboxCountsForContext(context);
    if (options.profile) {
      await recordWindowWaitHeartbeat({
        profile: options.profile,
        context,
        flow: "worker",
        commandName: "await",
        status: message ? "task_claimed" : "wait_polling",
        workflowStep: message ? "message_received" : "waiting",
        automationState: message ? "resume_claimed_task" : "wait_loop_active",
        turnDisposition: message ? "silent_handoff" : "silent_hold",
        message,
        messageKind: message ? "task" : null,
        markClaimed: Boolean(message),
        inboxCounts: backlog
      });
    }
    options.trace?.step(message ? "wait_claimed" : "wait_poll", {
      flow: "worker-cycle",
      round,
      matched: Boolean(message),
      messageId: message?.id ?? null,
      backlog
    });
    if (!message && (backlog.pendingInboxCount > 0 || backlog.claimedInboxCount > 0)) {
      options.trace?.step("wait_backlog", {
        flow: "worker-cycle",
        round,
        backlog
      });
    }

    if (message) {
      messages.push(message);
      matchedRounds.push(round);
      lastClaimAt = lastPollAt;

      if (
        !options.continueAfterMatch ||
        messages.length >= options.maxMatches
      ) {
        return {
          mode: "worker-await-loop",
          matched: true,
          superseded: false,
          round,
          maxRounds: options.maxRounds,
          intervalSeconds: options.intervalSeconds,
          continueAfterMatch: options.continueAfterMatch,
          maxMatches: options.continueAfterMatch ? options.maxMatches : 1,
          agentId: context.agentId,
          agentName: context.agentName,
          message: messages[0] ?? null,
          messageCount: messages.length,
          messages,
          matchedRounds,
          backlog,
          lastPollAt,
          lastClaimAt,
          startedAt,
          finishedAt: new Date().toISOString()
        };
      }
    }

    const elapsedMilliseconds = Date.now() - startedAtMs;
    const elapsedBudgetReached =
      options.maxElapsedSeconds !== undefined &&
      elapsedMilliseconds >= options.maxElapsedSeconds * 1000;

    if (!elapsedBudgetReached && round < options.maxRounds) {
      await sleep(
        computeAdaptiveSleepMs({
          baseIntervalSeconds: options.intervalSeconds,
          round,
          seed: `${context.identity}:worker-await-loop`
        })
      );
    }
  }

  return {
    mode: "worker-await-loop",
    matched: false,
    superseded: false,
    round: options.maxRounds,
    maxRounds: options.maxRounds,
    intervalSeconds: options.intervalSeconds,
    continueAfterMatch: options.continueAfterMatch,
    maxMatches: options.continueAfterMatch ? options.maxMatches : 1,
    agentId: context.agentId,
    agentName: context.agentName,
    message: messages[0] ?? null,
    messageCount: messages.length,
    messages,
    matchedRounds,
    backlog,
    lastPollAt,
    lastClaimAt,
    startedAt,
    finishedAt: new Date().toISOString()
  };
};

const runHostReportAwaitLoop = async (
  context: CliIdentityContext,
  options: {
    profile?: WindowProfile | undefined;
    trace?: TraceStepSink | undefined;
    intervalSeconds: number;
    maxRounds: number;
    maxElapsedSeconds?: number | undefined;
    pendingOnly: boolean;
    includeAcknowledged: boolean;
    fromName?: string | undefined;
    fromAgentId?: string | undefined;
    type?: MessageType | undefined;
    correlationId?: string | undefined;
    continueAfterMatch: boolean;
    maxMatches: number;
    excludeMessageIds: string[];
    ackMatched: boolean;
  }
): Promise<HostLoopResult> => {
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  if (!options.ackMatched) {
    throw new Error(
      "host-report-await-loop has been consolidated into atomic claim mode and does not support --no-ack-matched."
    );
  }
  if (options.includeAcknowledged) {
    throw new Error(
      "host-report-await-loop has been consolidated into atomic claim mode and does not support --include-acknowledged."
    );
  }
  if (options.excludeMessageIds.length > 0) {
    throw new Error(
      "host-report-await-loop has been consolidated into atomic claim mode and does not support --exclude-message-id."
    );
  }
  if (options.type && !HOST_REPORT_MESSAGE_TYPES.includes(options.type)) {
    throw new Error(
      `host-report-await-loop only supports host report message types: ${HOST_REPORT_MESSAGE_TYPES.join(", ")}.`
    );
  }

  const excludedIds = new Set(options.excludeMessageIds);
  const collectedMessages: MessageRecord[] = [];
  const matchedRounds: number[] = [];
  const acknowledgedMessageIds: string[] = [];
  let lastPollAt = startedAt;
  let lastClaimAt: string | null = null;
  let backlog = {
    pendingInboxCount: 0,
    claimedInboxCount: 0
  };
  let expectedFromAgentId = options.fromAgentId;

  if (options.fromName) {
    const matchedMember = await resolveSessionMemberByName(
      context.sessionId,
      options.fromName
    );

    if (expectedFromAgentId && expectedFromAgentId !== matchedMember.id) {
      throw new Error(
        `from-name "${options.fromName}" does not match from-agent-id "${expectedFromAgentId}".`
      );
    }

    expectedFromAgentId = matchedMember.id;
  }

  const buildSupersededResult = (round: number): HostLoopResult => ({
    mode: "host-report-await-loop",
    matched: false,
    superseded: true,
    round,
    maxRounds: options.maxRounds,
    intervalSeconds: options.intervalSeconds,
    continueAfterMatch: options.continueAfterMatch,
    maxMatches: options.continueAfterMatch ? options.maxMatches : 1,
    agentId: context.agentId,
    agentName: context.agentName,
    filter: {
      fromAgentId: expectedFromAgentId ?? null,
      type: options.type ?? null,
      correlationId: options.correlationId ?? null,
      pendingOnly: true,
      includeAcknowledged: false,
      ackMatched: true
    },
      messageCount: collectedMessages.length,
      messages: collectedMessages,
      matchedRounds,
      acknowledgedMessageIds,
      backlog,
      lastPollAt,
      lastClaimAt,
      startedAt,
      finishedAt: new Date().toISOString()
  });

  for (let round = 1; round <= options.maxRounds; round += 1) {
    const leaseStillOwned = await renewCliIdentityLease(context, "host", {
      intervalSeconds: options.intervalSeconds,
      maxRounds: options.maxRounds
    });
    if (!leaseStillOwned) {
      return buildSupersededResult(Math.max(round - 1, 0));
    }

    let message: MessageRecord | null;
    let claimedIds: string[];
    try {
      const claimed = await claimOrReuseHostReport(context, {
        fromAgentId: expectedFromAgentId,
        correlationId: options.correlationId,
        type: options.type
      });
      message = claimed.message;
      claimedIds = claimed.acknowledgedMessageIds;
    } catch (error: unknown) {
      if (isWaitChainControlError(error)) {
        return buildSupersededResult(round);
      }
      throw error;
    }

    lastPollAt = new Date().toISOString();
    backlog = await getInboxCountsForContext(context);
    if (options.profile) {
      await recordWindowWaitHeartbeat({
        profile: options.profile,
        context,
        flow: "host",
        commandName: "await",
        status: message ? "report_claimed" : "wait_polling",
        workflowStep: message ? "message_received" : "waiting",
        automationState: message ? "host_report_received" : "host_wait_loop_active",
        turnDisposition: message ? "silent_handoff" : "silent_hold",
        message,
        messageKind: message ? "report" : null,
        markClaimed: Boolean(message),
        inboxCounts: backlog
      });
    }
    options.trace?.step(message ? "wait_claimed" : "wait_poll", {
      flow: "host-report-cycle",
      round,
      matched: Boolean(message),
      messageId: message?.id ?? null,
      backlog
    });
    if (!message && (backlog.pendingInboxCount > 0 || backlog.claimedInboxCount > 0)) {
      options.trace?.step("wait_backlog", {
        flow: "host-report-cycle",
        round,
        backlog
      });
    }

    if (message && !excludedIds.has(message.id)) {
      excludedIds.add(message.id);
      collectedMessages.push(message);
      acknowledgedMessageIds.push(...claimedIds);
      matchedRounds.push(round);
      lastClaimAt = lastPollAt;

      if (
        !options.continueAfterMatch ||
        collectedMessages.length >= options.maxMatches
      ) {
        return {
          mode: "host-report-await-loop",
          matched: true,
          superseded: false,
          round,
          maxRounds: options.maxRounds,
          intervalSeconds: options.intervalSeconds,
          continueAfterMatch: options.continueAfterMatch,
          maxMatches: options.continueAfterMatch ? options.maxMatches : 1,
          agentId: context.agentId,
          agentName: context.agentName,
          filter: {
            fromAgentId: expectedFromAgentId ?? null,
            type: options.type ?? null,
            correlationId: options.correlationId ?? null,
            pendingOnly: true,
            includeAcknowledged: false,
            ackMatched: true
          },
          messageCount: collectedMessages.length,
          messages: collectedMessages,
          matchedRounds,
          acknowledgedMessageIds,
          backlog,
          lastPollAt,
          lastClaimAt,
          startedAt,
          finishedAt: new Date().toISOString()
        };
      }
    }

    const elapsedMilliseconds = Date.now() - startedAtMs;
    const elapsedBudgetReached =
      options.maxElapsedSeconds !== undefined &&
      elapsedMilliseconds >= options.maxElapsedSeconds * 1000;

    if (!elapsedBudgetReached && round < options.maxRounds) {
      await sleep(
        computeAdaptiveSleepMs({
          baseIntervalSeconds: options.intervalSeconds,
          round,
          seed: `${context.identity}:host-report-await-loop`
        })
      );
    }
  }

  return {
    mode: "host-report-await-loop",
    matched: false,
    superseded: false,
    round: options.maxRounds,
    maxRounds: options.maxRounds,
    intervalSeconds: options.intervalSeconds,
    continueAfterMatch: options.continueAfterMatch,
    maxMatches: options.continueAfterMatch ? options.maxMatches : 1,
    agentId: context.agentId,
    agentName: context.agentName,
    filter: {
      fromAgentId: expectedFromAgentId ?? null,
      type: options.type ?? null,
      correlationId: options.correlationId ?? null,
      pendingOnly: true,
      includeAcknowledged: false,
      ackMatched: true
    },
    messageCount: collectedMessages.length,
    messages: collectedMessages,
    matchedRounds,
    acknowledgedMessageIds,
    backlog,
    lastPollAt,
    lastClaimAt,
    startedAt,
    finishedAt: new Date().toISOString()
  };
};

const runHostAwaitLoop = async (
  context: CliIdentityContext,
  options: {
    profile?: WindowProfile | undefined;
    trace?: TraceStepSink | undefined;
    intervalSeconds: number;
    maxRounds: number;
    maxElapsedSeconds?: number | undefined;
    pendingOnly: boolean;
    includeAcknowledged: boolean;
    fromName?: string | undefined;
    fromAgentId?: string | undefined;
    type?: MessageType | undefined;
    correlationId?: string | undefined;
    excludeMessageIds: string[];
    ackMatched: boolean;
  }
): Promise<HostLoopUnifiedResult> => {
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  if (!options.ackMatched) {
    throw new Error(
      "host-await-loop has been consolidated into atomic claim mode and does not support --no-ack-matched."
    );
  }
  if (options.includeAcknowledged) {
    throw new Error(
      "host-await-loop has been consolidated into atomic claim mode and does not support --include-acknowledged."
    );
  }
  if (options.excludeMessageIds.length > 0) {
    throw new Error(
      "host-await-loop has been consolidated into atomic claim mode and does not support --exclude-message-id."
    );
  }

  const excludedIds = new Set(options.excludeMessageIds);
  const acknowledgedMessageIds: string[] = [];
  const matchedRounds: number[] = [];
  let lastPollAt = startedAt;
  let lastClaimAt: string | null = null;
  let backlog = {
    pendingInboxCount: 0,
    claimedInboxCount: 0
  };
  let expectedFromAgentId = options.fromAgentId;

  if (options.fromName) {
    const matchedMember = await resolveSessionMemberByName(
      context.sessionId,
      options.fromName
    );

    if (expectedFromAgentId && expectedFromAgentId !== matchedMember.id) {
      throw new Error(
        `from-name "${options.fromName}" does not match from-agent-id "${expectedFromAgentId}".`
      );
    }

    expectedFromAgentId = matchedMember.id;
  }

  const buildSupersededResult = (round: number): HostLoopUnifiedResult => ({
    mode: "host-await-loop",
    matched: false,
    superseded: true,
    round,
    maxRounds: options.maxRounds,
    intervalSeconds: options.intervalSeconds,
    agentId: context.agentId,
    agentName: context.agentName,
    itemKind: null,
    actionHint: "idle_timeout",
    message: null,
    item: null,
    task: null,
    report: null,
    items: [],
    tasks: [],
    reports: [],
    messageCount: 0,
    messages: [],
    matchedRounds,
    acknowledgedMessageIds,
    backlog,
    lastPollAt,
    lastClaimAt,
    startedAt,
    finishedAt: new Date().toISOString(),
    defaults: {
      intervalSeconds: DEFAULT_LOOP_INTERVAL_SECONDS,
      maxRounds: DEFAULT_LOOP_MAX_ROUNDS,
      ackMatched: DEFAULT_HOST_LOOP_ACK_MATCHED
    }
  });

  const buildMatchedResult = (resultOptions: {
    round: number;
    messages: MessageRecord[];
    backlog: {
      pendingInboxCount: number;
      claimedInboxCount: number;
    };
    restored: boolean;
  }): HostLoopUnifiedResult => {
    const classified = classifyHostMessages(resultOptions.messages);
    const actionHint: HostLoopUnifiedResult["actionHint"] =
      classified.itemKind === "task"
        ? "execute_locally"
        : classified.itemKind === "report"
          ? "review_report"
          : "review_messages";

    return {
      mode: "host-await-loop",
      matched: true,
      superseded: false,
      round: resultOptions.round,
      maxRounds: options.maxRounds,
      intervalSeconds: options.intervalSeconds,
      agentId: context.agentId,
      agentName: context.agentName,
      itemKind: classified.itemKind,
      actionHint,
      message: classified.messages[0] ?? null,
      item: classified.firstItem,
      task: classified.firstTask,
      report: classified.firstReport,
      items: classified.items,
      tasks: classified.tasks,
      reports: classified.reports,
      messageCount: classified.messages.length,
      messages: classified.messages,
      matchedRounds,
      acknowledgedMessageIds,
      backlog: resultOptions.backlog,
      lastPollAt,
      lastClaimAt,
      startedAt,
      finishedAt: new Date().toISOString(),
      defaults: {
        intervalSeconds: DEFAULT_LOOP_INTERVAL_SECONDS,
        maxRounds: DEFAULT_LOOP_MAX_ROUNDS,
        ackMatched: DEFAULT_HOST_LOOP_ACK_MATCHED
      }
    };
  };

  for (let round = 1; round <= options.maxRounds; round += 1) {
    const leaseStillOwned = await renewCliIdentityLease(context, "host", {
      intervalSeconds: options.intervalSeconds,
      maxRounds: options.maxRounds
    });
    if (!leaseStillOwned) {
      return buildSupersededResult(Math.max(round - 1, 0));
    }

    const claimedMessages = await findClaimedMessagesForContext(context, {
      ...(expectedFromAgentId ? { fromAgentId: expectedFromAgentId } : {}),
      ...(options.correlationId ? { correlationId: options.correlationId } : {}),
      ...(options.type ? { types: [options.type] } : {})
    });
    lastPollAt = new Date().toISOString();
    backlog = await getInboxCountsForContext(context);

    if (claimedMessages.length > 0) {
      matchedRounds.push(round);
      lastClaimAt = lastPollAt;
      if (options.profile) {
        const classified = classifyHostMessages(claimedMessages);
        await recordWindowWaitHeartbeat({
          profile: options.profile,
          context,
          flow: "host",
          commandName: "await",
          status: "message_claimed",
          workflowStep: "message_received",
          automationState:
            classified.itemKind === "task"
              ? "host_execute_local"
              : classified.itemKind === "report"
                ? "host_report_received"
                : "host_messages_received",
          turnDisposition: "silent_handoff",
          message: claimedMessages[0] ?? null,
          messageKind:
            classified.itemKind === "task" || classified.itemKind === "report"
              ? classified.itemKind
              : null,
          markClaimed: true,
          inboxCounts: backlog
        });
      }
      options.trace?.step("wait_claimed", {
        flow: "host-cycle",
        round,
        matched: true,
        restored: true,
        messageIds: claimedMessages.map((message) => message.id),
        messageCount: claimedMessages.length,
        backlog
      });

      return buildMatchedResult({
        round,
        messages: claimedMessages,
        backlog,
        restored: true
      });
    }

    let newlyClaimedMessages: MessageRecord[];
    try {
      const claimOptions = {
        types: options.type ? [options.type] : HOST_RESOLVABLE_MESSAGE_TYPES,
        ...(expectedFromAgentId ? { fromAgentId: expectedFromAgentId } : {}),
        ...(options.correlationId ? { correlationId: options.correlationId } : {}),
        maxMessages: 10,
        ...buildWaitChainAuth(context, "host")
      };
      newlyClaimedMessages = await client.claimMany(
        context.agentId,
        claimOptions
      );
    } catch (error: unknown) {
      if (isWaitChainControlError(error)) {
        return buildSupersededResult(round);
      }
      throw error;
    }

    lastPollAt = new Date().toISOString();
    backlog = await getInboxCountsForContext(context);

    const matchedMessages = newlyClaimedMessages.filter(
      (message) => !excludedIds.has(message.id)
    );

    if (matchedMessages.length > 0) {
      matchedRounds.push(round);
      lastClaimAt = lastPollAt;
      if (options.profile) {
        const classified = classifyHostMessages(matchedMessages);
        await recordWindowWaitHeartbeat({
          profile: options.profile,
          context,
          flow: "host",
          commandName: "await",
          status: "message_claimed",
          workflowStep: "message_received",
          automationState:
            classified.itemKind === "task"
              ? "host_execute_local"
              : classified.itemKind === "report"
                ? "host_report_received"
                : "host_messages_received",
          turnDisposition: "silent_handoff",
          message: matchedMessages[0] ?? null,
          messageKind:
            classified.itemKind === "task" || classified.itemKind === "report"
              ? classified.itemKind
              : null,
          markClaimed: true,
          inboxCounts: backlog
        });
      }
      options.trace?.step("wait_claimed", {
        flow: "host-cycle",
        round,
        matched: true,
        messageIds: matchedMessages.map((message) => message.id),
        messageCount: matchedMessages.length,
        backlog
      });

      return buildMatchedResult({
        round,
        messages: matchedMessages,
        backlog,
        restored: false
      });
    }

    const idleAssessment = await assessSessionIdleForHost(context);
    if (idleAssessment.allWorkersWaiting) {
      if (options.profile) {
        await recordWindowWaitHeartbeat({
          profile: options.profile,
          context,
          flow: "host",
          commandName: "await",
          status: "all_workers_waiting",
          workflowStep: "session_idle_detected",
          automationState: "host_session_idle_detected",
          turnDisposition: "host_continue",
          inboxCounts: backlog
        });
      }
      options.trace?.step("wait_timeout", {
        flow: "host-cycle",
        round,
        status: "session_idle_detected",
        idleAssessment,
        backlog
      });
      break;
    }

    if (options.profile) {
      await recordWindowWaitHeartbeat({
        profile: options.profile,
        context,
        flow: "host",
        commandName: "await",
        status: "wait_polling",
        workflowStep: "waiting",
        automationState: "host_wait_loop_active",
        turnDisposition: "silent_hold",
        inboxCounts: backlog
      });
    }
    options.trace?.step("wait_poll", {
      flow: "host-cycle",
      round,
      matched: false,
      messageId: null,
      backlog
    });
    if (backlog.pendingInboxCount > 0 || backlog.claimedInboxCount > 0) {
      options.trace?.step("wait_backlog", {
        flow: "host-cycle",
        round,
        backlog
      });
    }

    const elapsedMilliseconds = Date.now() - startedAtMs;
    const elapsedBudgetReached =
      options.maxElapsedSeconds !== undefined &&
      elapsedMilliseconds >= options.maxElapsedSeconds * 1000;

    if (!elapsedBudgetReached && round < options.maxRounds) {
      await sleep(
        computeAdaptiveSleepMs({
          baseIntervalSeconds: options.intervalSeconds,
          round,
          seed: `${context.identity}:host-await-loop`
        })
      );
    }
  }

  return {
    mode: "host-await-loop",
    matched: false,
    superseded: false,
    round: options.maxRounds,
    maxRounds: options.maxRounds,
    intervalSeconds: options.intervalSeconds,
    agentId: context.agentId,
    agentName: context.agentName,
    itemKind: null,
    actionHint: "idle_timeout",
    message: null,
    item: null,
    task: null,
    report: null,
    items: [],
    tasks: [],
    reports: [],
    messageCount: 0,
    messages: [],
    matchedRounds,
    acknowledgedMessageIds,
    backlog,
    lastPollAt,
    lastClaimAt,
    startedAt,
    finishedAt: new Date().toISOString(),
    defaults: {
      intervalSeconds: DEFAULT_LOOP_INTERVAL_SECONDS,
      maxRounds: DEFAULT_LOOP_MAX_ROUNDS,
      ackMatched: DEFAULT_HOST_LOOP_ACK_MATCHED
    }
  };
};

const sendStandardHostReport = async (
  context: CliIdentityContext,
  options: {
    content: string;
    result: string;
    type: MessageType;
    correlationId?: string | undefined;
    idempotencyKey?: string | undefined;
    knowledgeUpdateAssessment?: Record<string, unknown> | undefined;
  }
) => {
  const session = await client.getSession(context.sessionId);
  const resolvedIdempotencyKey =
    options.idempotencyKey ??
    buildDerivedIdempotencyKey("cli-report-host", {
      sessionId: context.sessionId,
      fromAgentId: context.agentId,
      toAgentId: session.hostAgentId,
      type: options.type,
      content: options.content,
      result: options.result
    });
  const message = await client.sendMessage({
    sessionId: context.sessionId,
    fromAgentId: context.agentId,
    toAgentId: session.hostAgentId,
    type: options.type,
    payload: {
      content: options.content,
      result: options.result,
      ...(options.knowledgeUpdateAssessment
        ? { knowledgeUpdateAssessment: options.knowledgeUpdateAssessment }
        : {})
    },
    correlationId:
      options.correlationId ??
      `${context.sessionId}:${resolvedIdempotencyKey}`,
    idempotencyKey: resolvedIdempotencyKey
  });

  return {
    hostAgentId: session.hostAgentId,
    message
  };
};

const dispatchCliTaskMessage = async (
  context: CliIdentityContext,
  options: {
    trace?: TraceStepSink | undefined;
    toName: string;
    content: string;
    result: string;
    type: MessageType;
    correlationId?: string | undefined;
    idempotencyKey?: string | undefined;
  }
) => {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const targetMember = await resolveSessionMemberByName(
      context.sessionId,
      options.toName
    );
    const basePayload = buildCliDispatchPayload({
      content: options.content,
      result: options.result
    });
    let payload = basePayload;
    let supersededMessageIds: string[] = [];
    let dispatchMode: "new" | "merged" = "new";
    let resolvedCorrelationId = options.correlationId;

    if (targetMember.role === "worker") {
      const [pendingInbox, claimedInbox] = await Promise.all([
        client.getInboxWithOptions(targetMember.id, {
          pendingOnly: true
        }),
        client.getInboxWithOptions(targetMember.id, {
          claimedOnly: true
        })
      ]);
      options.trace?.step("dispatch_queue_state", {
        toName: targetMember.agentName,
        pendingInboxCount: pendingInbox.length,
        claimedInboxCount: claimedInbox.length
      });
    }

    const resolvedIdempotencyKey =
      options.idempotencyKey ??
      buildDerivedIdempotencyKey("cli-task-dispatch", {
        sessionId: context.sessionId,
        fromAgentId: context.agentId,
        toAgentId: targetMember.id,
        type: options.type,
        payload
      });
    const stableCorrelationId =
      resolvedCorrelationId ??
      `${context.sessionId}:${options.toName}:${resolvedIdempotencyKey}`;

    try {
      const message = await client.sendMessage({
        sessionId: context.sessionId,
        fromAgentId: context.agentId,
        toAgentId: targetMember.id,
        type: options.type,
        payload,
        correlationId: stableCorrelationId,
        idempotencyKey: resolvedIdempotencyKey,
        ...(supersededMessageIds.length > 0
          ? { supersedeMessageIds: supersededMessageIds }
          : {})
      });

      return {
        toAgentId: targetMember.id,
        toName: targetMember.agentName,
        message,
        payload,
        dispatchMode,
        supersededMessageIds,
        correlationId: stableCorrelationId
      };
    } catch (error: unknown) {
      if (
        attempt >= 3 ||
        !isSdkErrorCode(error, errorCodes.messageDispatchConflict)
      ) {
        throw error;
      }
    }
  }

  throw new Error("task-dispatch retry limit exhausted.");
};

const prepareWindowDispatchTasks = async (options: {
  sessionName: string;
  rawTasks: WindowDispatchTaskSpec[];
}): Promise<PreparedWindowDispatchTask[]> => {
  if (options.rawTasks.length === 0) {
    throw new Error("At least one dispatch task is required.");
  }

  const normalizedTasks = normalizeWindowDispatchTasks(options.rawTasks);
  const preparedTasks: PreparedWindowDispatchTask[] = [];

  for (const task of normalizedTasks) {
    const targetProfile = await requireWindowProfile(
      projectRoot,
      options.sessionName,
      task.targetWindowName
    );
    ensureWindowRole(targetProfile, "worker");
    preparedTasks.push({
      targetWindowName: task.targetWindowName,
      targetProfile,
      content: task.content
    });
  }

  return preparedTasks;
};

const executeWindowHostDispatchCommand = async (options: {
  commandName: "dispatch-many";
  traceCommandName: "dispatch-many";
  windowName: string;
  sessionName: string;
  rawTasks: WindowDispatchTaskSpec[];
}) => {
  const trace = createCommandTrace(projectRoot, {
    commandName: options.traceCommandName,
    sessionName: options.sessionName,
    windowName: options.windowName,
    input: {
      sessionName: options.sessionName,
      windowName: options.windowName,
      tasks: options.rawTasks.map((task) => ({
        to: task.targetWindowName
      }))
    }
  });

  try {
    const { profile, context } = await requireLiveWindowContext(
      options.sessionName,
      options.windowName,
      "host"
    );
    trace.step("binding_loaded", buildWindowProfileSummary(profile));

    const rememberedState = await readWindowRuntimeState(
      projectRoot,
      options.sessionName,
      options.windowName
    );
    const currentMessageId = rememberedState?.currentMessageId ?? null;

    if (currentMessageId) {
      const existingJudgement =
        await client.getKnowledgeBuildJudgementBySourceMessage(
          context.sessionId,
          currentMessageId
        );

      if (!existingJudgement) {
        printJson({
          error: {
            code: "KNOWLEDGE_JUDGEMENT_REQUIRED",
            message:
              "The current user message has not yet been judged for knowledge base construction. Worker dispatch is blocked. Please run ai-collab knowledge judge first.",
            hint: {
              command:
                "ai-collab knowledge judge <host-name> --session <session> --source user_message --source-message-id <messageId> --knowledge-build-required <true|false> --target-levels <l1,l2,l3> --source-kind <kind> --reason <reason> --next-action <action>",
              currentMessageId
            }
          }
        });
        process.exitCode = 1;
        return;
      }

      if (
        existingJudgement.knowledgeBuildRequired &&
        !existingJudgement.fulfilledAt
      ) {
        printJson({
          error: {
            code: "KNOWLEDGE_UPDATE_REQUIRED",
            message:
              "Knowledge base judgement requires a knowledge base update, but the update has not been completed. Please run ai-collab knowledge fulfil-judgement first.",
            judgement: existingJudgement
          }
        });
        process.exitCode = 1;
        return;
      }
    }

    const preparedTasks = await prepareWindowDispatchTasks({
      sessionName: options.sessionName,
      rawTasks: options.rawTasks
    });
    trace.step("binding_validated", {
      fromWindow: profile.windowName,
      targets: preparedTasks.map((task) => ({
        toWindow: task.targetWindowName,
        toAgentName: task.targetProfile.agentName
      }))
    });
    const locked = await withLocalLoopLock(
      projectRoot,
      {
        identity: profile.identity,
        flow: "host-cycle",
        takeover: true
      },
      async () =>
        withCliIdentityLease(
          context,
          "host",
          {},
          async () => {
            const dispatchedItems: Array<{
              toWindow: string;
              toAgentId: string;
              toName: string;
              correlationId: string;
              message: MessageRecord;
              payload: unknown;
              dispatchMode: "new" | "merged";
              supersededMessageIds: string[];
            }> = [];

            for (const preparedTask of preparedTasks) {
              const dispatchResult = await dispatchCliTaskMessage(context, {
                trace,
                toName: preparedTask.targetProfile.agentName,
                content: preparedTask.content,
                result: "pending",
                type: DEFAULT_WORKER_TASK_TYPE
              });
              trace.step(
                "message_sent",
                {
                  toWindow: preparedTask.targetWindowName,
                  correlationId: dispatchResult.correlationId
                }
              );
              dispatchedItems.push({
                toWindow: preparedTask.targetWindowName,
                toAgentId: dispatchResult.toAgentId,
                toName: dispatchResult.toName,
                correlationId: dispatchResult.correlationId,
                message: dispatchResult.message,
                payload: dispatchResult.payload,
                dispatchMode: dispatchResult.dispatchMode,
                supersededMessageIds: dispatchResult.supersededMessageIds
              });
            }
            const backlog = await getInboxCountsForContext(context);
            const firstDispatchedItem = dispatchedItems[0] ?? null;

            return {
              commandResultState: "completed" as const,
              commandResultIsFinal: true,
              ignoreIntermediateCommandStateText: true,
              intermediateCommandStateTextIsNotAuthoritative: true,
              runtimeTerminalProgressHints,
              userReplyForbidden: true,
              workflowModel: "message_loop" as const,
              workflowContract: "wait_receive_process_report_wait" as const,
              workflowRole: "host" as const,
              workflowStep: "command_handoff" as const,
              messageKind: null,
              mode: options.commandName,
              matched: false,
              status: "dispatched" as const,
              action: "dispatch_completed" as const,
              identity: context.identity,
              agentId: context.agentId,
              agentName: context.agentName,
              backlog,
              dispatchedCount: dispatchedItems.length,
              dispatchedTargets: dispatchedItems.map((item) => item.toWindow),
              ...(firstDispatchedItem
                ? {
                    dispatched: firstDispatchedItem
                  }
                : {}),
              dispatchedBatch: dispatchedItems,
              turnDisposition: "silent_continue" as const
            };
          }
        )
    );

    const rawResult =
      locked.status === "already_running"
        ? buildAlreadyRunningResult({
            mode: options.commandName,
            identity: profile.identity,
            flow: "host-cycle",
            existing: {
              pid: locked.lock.metadata?.pid ?? null,
              acquiredAt: locked.lock.metadata?.acquiredAt ?? null
            }
          })
        : buildExecuteInternalCommandResult(
            locked.value as Record<string, unknown>,
            {
              commandArgs: [
                "await",
                options.windowName,
                "--session",
                options.sessionName
              ],
              automationState: "host_dispatch_handoff",
              internalInstruction:
                "Do not reply to the user. The task batch has already been dispatched. Continue immediately by entering the host wait command."
            }
          );
    const runtimeState = await updateWindowStateFromResult(
      profile,
      options.commandName,
      rawResult as Record<string, unknown>
    );
    trace.step(
      getWindowWaitTraceEvent(rawResult as Record<string, unknown>),
      rawResult
    );
    trace.step("runtime_state_updated", runtimeState);
    const response = buildWindowCommandOutputs(
      profile,
      options.commandName,
      rawResult as Record<string, unknown>,
      runtimeState,
      {
        commandRunId: trace.commandRunId,
        tracePath: getCommandTraceStorePath(projectRoot)
      }
    );
    trace.finish(response.debug);
    printJson(response.control);
  } catch (error: unknown) {
    trace.fail(error);
    printJson({
      error: renderSdkError(error),
      commandTrace: {
        commandRunId: trace.commandRunId,
        tracePath: getCommandTraceStorePath(projectRoot)
      }
    });
    process.exitCode = 1;
  }
};

const findMessageForAgent = async (
  context: CliIdentityContext,
  messageId: string
): Promise<MessageRecord | null> => {
  const message = await client.getMessageById(messageId);
  return message.toAgentId === context.agentId ? message : null;
};

const resolveHostMessage = async (
  context: CliIdentityContext,
  options: {
    messageId: string;
    action: string;
    summary: string;
    replyContent?: string | undefined;
    replyResult?: string | undefined;
    replyType?: string | undefined;
    correlationId?: string | undefined;
    idempotencyKey?: string | undefined;
  }
) => {
  const sourceMessage = await findMessageForAgent(context, options.messageId);
  if (!sourceMessage) {
    throw new Error(
      `Host task with messageId "${options.messageId}" not found.`
    );
  }

  const action =
    options.action === "failed" ||
    options.action === "delegated" ||
    options.action === "completed"
      ? options.action
      : null;

  if (!action) {
    throw new Error("action only supports completed, failed, delegated.");
  }

  let processedMessage: MessageRecord;
  try {
    processedMessage =
      action === "failed"
        ? await client.failMessage(options.messageId, {
            agentId: context.agentId,
            reason: options.summary,
            ...buildWaitChainAuth(context, "host")
          })
        : await client.completeMessage(options.messageId, {
            agentId: context.agentId,
            ...buildWaitChainAuth(context, "host")
          });
  } catch (error: unknown) {
    if (!isSdkErrorCode(error, errorCodes.messageAlreadyFinished)) {
      throw error;
    }

    const existingMessage = await client.getMessageById(options.messageId);
    if (
      existingMessage.toAgentId !== context.agentId ||
      (existingMessage.processingStatus !== "processed" &&
        existingMessage.processingStatus !== "failed")
    ) {
      throw error;
    }

    processedMessage = existingMessage;
  }

  let replyMessage: MessageRecord | null = null;
  if (options.replyContent) {
    const resolvedReplyType = options.replyType
      ? ensureMessageType(options.replyType)
      : action === "failed"
        ? "error"
        : action === "delegated"
          ? "progress"
          : "result";
    const resolvedReplyResult =
      options.replyResult ??
      (action === "failed"
        ? "failed"
        : action === "delegated"
          ? "pending"
          : "completed");
    const resolvedReplyIdempotencyKey =
      options.idempotencyKey ??
      buildDerivedIdempotencyKey("cli-host-resolve", {
        sessionId: context.sessionId,
        agentId: context.agentId,
        messageId: options.messageId,
        action,
        replyType: resolvedReplyType,
        replyContent: options.replyContent,
        replyResult: resolvedReplyResult
      });
    replyMessage = await client.sendMessage({
      sessionId: context.sessionId,
      fromAgentId: context.agentId,
      toAgentId: sourceMessage.fromAgentId,
      type: resolvedReplyType,
      payload: {
        content: options.replyContent,
        result: resolvedReplyResult
      },
      correlationId:
        options.correlationId ??
        sourceMessage.correlationId ??
        `${context.sessionId}:${resolvedReplyIdempotencyKey}`,
      idempotencyKey: resolvedReplyIdempotencyKey
    });
  }

  return {
    action,
    sourceMessage,
    processedMessage,
    replyMessage
  };
};

const renderSdkError = (error: unknown) => {
  if (
    error &&
    typeof error === "object" &&
    "statusCode" in error &&
    "message" in error
  ) {
    const sdkError = error as AiCollabSdkError;
    return {
      message: sdkError.message,
      statusCode: sdkError.statusCode,
      code: sdkError.code ?? null
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message
    };
  }

  return {
    message: "Unknown CLI error."
  };
};

program
  .name("ai-collab")
  .description("CLI for the local ai-collab collaboration hub")
  .version("0.1.0");

program
  .command("attach")
  .description("Attach the current member to one collaboration session as host, worker, or knowledge_keeper")
  .argument("<name>", "Stable unique member name inside the session")
  .requiredOption("--session <sessionName>", "Explicit collaboration session name")
  .requiredOption("--role <role>", "host, worker, or knowledge_keeper")
  .option("--duty <roleDescription>", "Stable duty for this member (required for worker)")
  .action(
    async (
      name: string,
      options: {
        session: string;
        role: string;
        duty?: string;
      }
    ) => {
      try {
        if (options.role !== "host" && options.role !== "worker" && options.role !== "knowledge_keeper") {
          throw new Error('role only supports "host", "worker", or "knowledge_keeper".');
        }

        const resolvedDuty = options.duty
          || (options.role === "host" ? "session host and orchestration owner" : undefined)
          || (options.role === "knowledge_keeper" ? "project knowledge and user profile maintenance" : undefined);

        if (!resolvedDuty) {
          throw new Error('worker role must provide --duty.');
        }

        const attached = await attachNamedMember({
          sessionName: options.session,
          name,
          role: options.role as "host" | "worker" | "knowledge_keeper",
          duty: resolvedDuty
        });

        printControlJson({
          memberCommand: "attach",
          member: {
            name: attached.profile.agentName,
            sessionName: attached.profile.sessionName,
            role: attached.profile.role,
            roleDescription: attached.profile.roleDescription,
            identity: attached.profile.identity
          },
          session: attached.result.session,
          agent: attached.result.agent,
          reusedExistingSession: attached.result.reusedExistingSession,
          runtimeState: attached.runtimeState,
          resultType: "session_ready",
          status: "ready"
        });
      } catch (error: unknown) {
        printJson({
          error: renderSdkError(error)
        });
        process.exitCode = 1;
      }
    }
  );

program
  .command("reset")
  .description("Reset one attached member locally and remotely")
  .argument("<name>", "Stable unique member name inside the session")
  .requiredOption("--session <sessionName>", "Explicit collaboration session name")
  .action(async (name: string, options: { session: string }) => {
    try {
      const reset = await resetNamedMember({
        sessionName: options.session,
        name
      });

      printControlJson({
        memberCommand: "reset",
        member: {
          name,
          sessionName: options.session,
          identity: buildIdentity(options.session, name)
        },
        localReset: reset.localReset,
        remoteReset: reset.remoteReset,
        resultType: "cleanup_done",
        status: "reset"
      });
    } catch (error: unknown) {
      printJson({
        error: renderSdkError(error)
      });
      process.exitCode = 1;
    }
  });

program
  .command("members")
  .description("List current session members for one attached host member")
  .argument("<name>", "Stable unique host member name inside the session")
  .requiredOption("--session <sessionName>", "Explicit collaboration session name")
  .action(async (name: string, options: { session: string }) => {
    const trace = createCommandTrace(projectRoot, {
      commandName: "members",
      sessionName: options.session,
      windowName: name,
      input: {
        sessionName: options.session,
        name
      }
    });

    try {
      const { profile, context } = await requireLiveWindowContext(
        options.session,
        name,
        "host"
      );
      trace.step("binding_loaded", buildWindowProfileSummary(profile));
      const members = (await client.getMembers(context.sessionId))
        .slice()
        .sort((left, right) => {
          if (left.role !== right.role) {
            return left.role === "host" ? -1 : 1;
          }
          return left.agentName.localeCompare(right.agentName);
        });
      trace.step("binding_validated", {
        memberCount: members.length
      });

      const windowBindings = await client.listWindowBindings(options.session);
      const result = {
        op: "SESSION_MEMBERS",
        sessionName: options.session,
        host: {
          name: profile.agentName,
          role: profile.role,
          duty: profile.roleDescription,
          identity: profile.identity
        },
        members: members.map((member) => {
          const binding = windowBindings.find(
            (b) => b.agentId === member.id
          );
          return {
            ...buildSessionMemberView(options.session, member),
            pendingTasks: binding?.runtimeState?.pendingInboxCount ?? 0,
            claimedTasks: binding?.runtimeState?.claimedInboxCount ?? 0
          };
        })
      };
      trace.finish(result);
      printJson(result);
    } catch (error: unknown) {
      trace.fail(error);
      printJson({
        error: renderSdkError(error),
        commandTrace: {
          commandRunId: trace.commandRunId,
          tracePath: getCommandTraceStorePath(projectRoot)
        }
      });
      process.exitCode = 1;
    }
  });

program
  .command("await")
  .description("Wait for the next actionable item for one attached member")
  .argument("<name>", "Stable unique member name inside the session")
  .requiredOption("--session <sessionName>", "Explicit collaboration session name")
  .option("--continue-seq <sequenceId>", "Internal wait continuation sequence id")
  .option("--continue-step <step>", "Internal wait continuation step number")
  .option("--continue-pass <pass>", "Internal wait continuation pass number")
  .option("--continue-budget <budget>", "Internal wait continuation slice budget")
  .option("--continue-origin <origin>", "Internal wait continuation origin command")
  .action(
    async (
      name: string,
      options: {
        session: string;
        continueSeq?: string;
        continueStep?: string;
        continuePass?: string;
        continueBudget?: string;
        continueOrigin?: string;
      }
    ) => {
      await executeWindowWaitCommand({
        commandName: "await",
        displayCommandName: "await",
        waitAlias: "await",
        windowName: name,
        sessionName: options.session,
        traceInput: {
          sessionName: options.session,
          windowName: name,
          commandAlias: "await"
        },
        continuation: {
          continueSeq: options.continueSeq,
          continueStep: options.continueStep,
          continuePass: options.continuePass,
          continueBudget: options.continueBudget,
          continueOrigin: options.continueOrigin
        }
      });
    }
  );

program
  .command("dispatch-many")
  .description("Dispatch one or more tasks from one host member")
  .argument("<name>", "Stable unique host member name inside the session")
  .requiredOption("--session <sessionName>", "Explicit collaboration session name")
  .requiredOption(
    "--task <taskSpec>",
    "Repeatable. Use <workerName>::<task content> or a JSON object with to/content.",
    parseListOption,
    [] as string[]
  )
  .option(
    "--task-file <taskFileSpec>",
    "Repeatable. Use <workerName>::<filePath>. CLI reads file as task content.",
    parseListOption,
    [] as string[]
  )
  .option("--knowledge-refs <refs>", "Comma-separated knowledge refs for simple text tasks (e.g. l2/current#message-protocol)")
  .action(
    async (
      name: string,
      options: {
        session: string;
        task: string[];
        taskFile: string[];
        knowledgeRefs?: string;
      }
    ) => {
      const rawTasks: WindowDispatchTaskSpec[] = [];

      for (const spec of options.task) {
        const parsed = parseWindowDispatchTaskSpec(spec);
        let content = parsed.content;

        const isAlreadyV1 = (() => {
          try {
            const obj = JSON.parse(content) as Record<string, unknown>;
            return obj.schema === "ai-collab.task.v1";
          } catch {
            return false;
          }
        })();

        if (!isAlreadyV1) {
          const { profile, context } = await requireLiveWindowContext(options.session, name, "host");
          const taskId = getNextTaskId(context.sessionId);
          const wrapped = wrapSimpleTaskAsV1(content, options.knowledgeRefs);
          const withRealId = JSON.parse(wrapped) as Record<string, unknown>;
          withRealId.taskId = taskId;
          content = JSON.stringify(withRealId);
          void profile;
        }

        rawTasks.push({ targetWindowName: parsed.targetWindowName, content });
      }

      for (const spec of options.taskFile) {
        const separatorIndex = spec.indexOf("::");
        if (separatorIndex <= 0) {
          printJson({ error: { code: "INVALID_INPUT", message: "--task-file format must be <workerName>::<filePath>" } });
          process.exitCode = 1;
          return;
        }
        const targetWindowName = spec.slice(0, separatorIndex).trim();
        const filePath = spec.slice(separatorIndex + 2).trim();
        const fileContent = readContentFile(filePath);

        const isAlreadyV1 = (() => {
          try {
            const obj = JSON.parse(fileContent) as Record<string, unknown>;
            return obj.schema === "ai-collab.task.v1";
          } catch {
            return false;
          }
        })();

        if (isAlreadyV1) {
          rawTasks.push({ targetWindowName, content: fileContent });
        } else {
          const { profile, context } = await requireLiveWindowContext(options.session, name, "host");
          const taskId = getNextTaskId(context.sessionId);
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(fileContent) as Record<string, unknown>;
          } catch {
            parsed = { goal: fileContent };
          }
          parsed.schema = "ai-collab.task.v1";
          parsed.taskId = taskId;
          if (!parsed.knowledgeRefs && options.knowledgeRefs) {
            const refs: Array<{ ref: string }> = [];
            for (const rawRef of options.knowledgeRefs.split(",")) {
              const trimmed = rawRef.trim();
              if (trimmed) refs.push({ ref: trimmed });
            }
            if (refs.length > 0) parsed.knowledgeRefs = refs;
          }
          rawTasks.push({ targetWindowName, content: JSON.stringify(parsed) });
          void profile;
        }
      }

      if (rawTasks.length === 0) {
        printJson({ error: { code: "INVALID_INPUT", message: "At least one task is required. Use --task or --task-file." } });
        process.exitCode = 1;
        return;
      }

      await executeWindowHostDispatchCommand({
        commandName: "dispatch-many",
        traceCommandName: "dispatch-many",
        windowName: name,
        sessionName: options.session,
        rawTasks
      });
    }
  );

program
  .command("submit")
  .description("Submit one worker or knowledge_keeper result by attached member name")
  .argument("<name>", "Stable unique worker member name inside the session")
  .requiredOption("--session <sessionName>", "Explicit collaboration session name")
  .option("--content <content>", "Result content text (legacy, use --report-file for structured reports)")
  .option("--report-file <path>", "Read structured worker report from file (ai-collab.worker-report.v1)")
  .option("--result <result>", "Payload result marker")
  .option("--type <type>", `Message type: ${SUPPORTED_MESSAGE_TYPES.join(", ")}`)
  .option("--fail-reason <reason>", "Failure reason for the claimed message")
  .option("--mark-as <state>", "completed or failed", "completed")
  .option("--knowledge-update-assessment <json>", "JSON knowledge update assessment for host review (legacy)")
  .action(
    async (
      name: string,
      options: {
        content?: string;
        reportFile?: string;
        session: string;
        result?: string;
        type?: string;
        failReason?: string;
        markAs: "completed" | "failed";
        knowledgeUpdateAssessment?: string;
      }
    ) => {
      const trace = createCommandTrace(projectRoot, {
        commandName: "submit",
        sessionName: options.session,
        windowName: name,
        input: {
          sessionName: options.session,
          name,
          markAs: options.markAs
        }
      });

      try {
        const { profile, context } = await requireLiveWindowContext(
          options.session,
          name
        );
        if (profile.role !== "worker" && profile.role !== "knowledge_keeper") {
          throw new Error(
            `window="${name}" has role "${profile.role}", only worker or knowledge_keeper can execute submit.`
          );
        }
        trace.step("binding_loaded", buildWindowProfileSummary(profile));
        const rememberedState = await readWindowRuntimeState(
          projectRoot,
          options.session,
          name
        );
        const claimedMessage =
          (await findClaimedRememberedMessage(
            context,
            rememberedState?.currentMessageId
          )) ??
          (await findClaimedMessageForContext(context));

        if (!claimedMessage) {
          throw new Error(
            `name="${name}" has no claimed worker task and cannot execute submit. Please run ai-collab await ${name} --session ${options.session} first.`
          );
        }
        trace.step("binding_validated", {
          messageId: claimedMessage.id,
          correlationId: claimedMessage.correlationId ?? null
        });

        let finalContent: string;
        let finalKnowledgeUpdateAssessment: Record<string, unknown> | undefined;

        if (options.reportFile) {
          const reportRaw = readContentFile(options.reportFile);
          const payloadObj = claimedMessage.payload as Record<string, unknown> | null;
          const inferredTaskId = extractTaskIdFromPayload(
            typeof payloadObj?.content === "string"
              ? payloadObj.content
              : ""
          );

          let report: Record<string, unknown>;
          try {
            report = JSON.parse(reportRaw) as Record<string, unknown>;
          } catch {
            report = { summary: reportRaw };
          }

          report.schema = "ai-collab.worker-report.v1";
          report.taskId = inferredTaskId ?? `TASK-AUTO-${Date.now()}`;
          report.status = options.markAs;

          if (report.knowledgeUpdate && typeof report.knowledgeUpdate === "object") {
            finalKnowledgeUpdateAssessment = report.knowledgeUpdate as Record<string, unknown>;
          }

          finalContent = JSON.stringify(report);
        } else if (options.content) {
          finalContent = options.content;
          if (options.knowledgeUpdateAssessment) {
            finalKnowledgeUpdateAssessment = JSON.parse(options.knowledgeUpdateAssessment) as Record<string, unknown>;
          }
        } else {
          printJson({ error: { code: "INVALID_INPUT", message: "Must provide --content or --report-file." } });
          process.exitCode = 1;
          return;
        }

        const locked = await withLocalLoopLock(
          projectRoot,
          {
            identity: profile.identity,
            flow: "worker-cycle",
            takeover: true
          },
          async () =>
            withCliIdentityLease(
              context,
              profile.role === "knowledge_keeper" ? "knowledge_keeper" : "worker",
              {},
              async () =>
                submitWorkerResult(context, {
                  messageId: claimedMessage.id,
                  content: finalContent,
                  result: options.result,
                  type: options.type
                    ? ensureMessageType(options.type)
                    : undefined,
                  failReason: options.failReason,
                  markAs: options.markAs,
                  role: profile.role === "knowledge_keeper" ? "knowledge_keeper" : "worker",
                  knowledgeUpdateAssessment: finalKnowledgeUpdateAssessment
                }).then(async (submission) => {
                  const remainingInbox = await client.getInboxWithOptions(context.agentId, {
                    pendingOnly: true
                  });
                  const remainingTasks = remainingInbox.filter(
                    (msg) =>
                      msg.toAgentId === context.agentId &&
                      HOST_EXECUTABLE_MESSAGE_TYPES.includes(msg.type)
                  );
                  return {
                    commandResultState: "completed" as const,
                    commandResultIsFinal: true,
                    ignoreIntermediateCommandStateText: true,
                    intermediateCommandStateTextIsNotAuthoritative: true,
                    runtimeTerminalProgressHints,
                    workflowModel: "message_loop" as const,
                    workflowContract: "wait_receive_process_report_wait" as const,
                    workflowRole: (profile.role === "knowledge_keeper" ? "knowledge_keeper" : "worker") as "knowledge_keeper" | "worker",
                    workflowStep: "command_handoff" as const,
                    messageKind: null,
                    userReplyForbidden: true,
                    mode: "submit" as const,
                    matched: false,
                    status: "reported" as const,
                    action: "submit_completed" as const,
                    identity: context.identity,
                    agentId: context.agentId,
                    agentName: context.agentName,
                    submittedAt:
                      submission.processedMessage.processedAt ??
                      submission.processedMessage.failedAt ??
                      submission.report.message.createdAt,
                    submitted: {
                      markAs: submission.markAs,
                      correlationId: submission.correlationId,
                      reportMessage: submission.report.message,
                      processedMessage: submission.processedMessage
                    },
                    remainingPendingTasks: remainingTasks.length,
                    hasMoreTasks: remainingTasks.length > 0,
                    turnDisposition: "silent_continue" as const
                  };
                })
            )
        );

        const rawResult =
          locked.status === "already_running"
            ? buildAlreadyRunningResult({
                mode: "submit",
                identity: profile.identity,
                flow: "worker-cycle",
                existing: {
                  pid: locked.lock.metadata?.pid ?? null,
                  acquiredAt: locked.lock.metadata?.acquiredAt ?? null
                }
              })
            : buildExecuteInternalCommandResult(
                locked.value as Record<string, unknown>,
                {
                  commandArgs: ["await", name, "--session", options.session],
                  automationState: "worker_submit_handoff",
                  internalInstruction:
                    "Do not reply to the user. The current worker result has already been submitted. Continue immediately by entering the worker wait command."
                }
              );
        const runtimeState = await updateWindowStateFromResult(
          profile,
          "submit",
          rawResult as Record<string, unknown>
        );
        trace.step(getWindowWaitTraceEvent(rawResult as Record<string, unknown>), rawResult);
        trace.step("runtime_state_updated", runtimeState);
        const response = buildWindowCommandOutputs(
          profile,
          "submit",
          rawResult as Record<string, unknown>,
          runtimeState,
          {
            commandRunId: trace.commandRunId,
            tracePath: getCommandTraceStorePath(projectRoot)
          }
        );
        trace.finish(response.debug);
        printJson(response.control);
      } catch (error: unknown) {
        trace.fail(error);
        printJson({
          error: renderSdkError(error),
          commandTrace: {
            commandRunId: trace.commandRunId,
            tracePath: getCommandTraceStorePath(projectRoot)
          }
        });
        process.exitCode = 1;
      }
    }
  );

program
  .command("resolve")
  .description("Resolve claimed host messages by attached member name. Defaults to all currently claimed messages.")
  .argument("<name>", "Stable unique host member name inside the session")
  .requiredOption("--session <sessionName>", "Explicit collaboration session name")
  .requiredOption("--summary <summary>", "Host-side processing summary")
  .option("--message-id <messageId>", "Repeatable claimed message id. Defaults to all currently claimed host messages.", parseListOption, [] as string[])
  .option("--action <action>", "completed, failed, or delegated", "completed")
  .option("--reply-content <content>", "Optional reply content back to the original sender")
  .option("--reply-result <result>", "Reply payload result marker")
  .option("--reply-type <type>", `Reply message type: ${SUPPORTED_MESSAGE_TYPES.join(", ")}`)
  .action(
    async (
      name: string,
      options: {
        session: string;
        summary: string;
        messageId: string[];
        action: string;
        replyContent?: string;
        replyResult?: string;
        replyType?: string;
      }
    ) => {
      const trace = createCommandTrace(projectRoot, {
        commandName: "resolve",
        sessionName: options.session,
        windowName: name,
        input: {
          sessionName: options.session,
          name,
          action: options.action
        }
      });

      try {
        const { profile, context } = await requireLiveWindowContext(
          options.session,
          name,
          "host"
        );
        trace.step("binding_loaded", buildWindowProfileSummary(profile));

        const allClaimedMessages = await findClaimedMessagesForContext(context);

        if (allClaimedMessages.length === 0) {
          throw new Error(
            `name="${name}" has no claimed host message and cannot execute resolve. Please run ai-collab await ${name} --session ${options.session} first.`
          );
        }

        const specifiedIds = options.messageId ?? [];
        const claimedMessages =
          specifiedIds.length > 0
            ? allClaimedMessages.filter((m) => specifiedIds.includes(m.id))
            : allClaimedMessages;

        if (specifiedIds.length > 0 && claimedMessages.length === 0) {
          throw new Error(
            `The specified message-id does not belong to the current Host's claimed messages, or has already been resolved.`
          );
        }

        if (specifiedIds.length > 0) {
          const notFound = specifiedIds.filter(
            (id) => !allClaimedMessages.some((m) => m.id === id)
          );
          if (notFound.length > 0) {
            throw new Error(
              `The following message-ids do not belong to the current Host's claimed messages: ${notFound.join(", ")}`
            );
          }
        }

        const locked = await withLocalLoopLock(
          projectRoot,
          {
            identity: profile.identity,
            flow: "host-cycle",
            takeover: true
          },
          async () =>
            withCliIdentityLease(context, "host", {}, async () => {
              const resolved = [] as Array<Awaited<ReturnType<typeof resolveHostMessage>>>;
              const failed = [] as Array<{ messageId: string; error: ReturnType<typeof renderSdkError> }>;

              for (const message of claimedMessages) {
                try {
                  resolved.push(
                    await resolveHostMessage(context, {
                      messageId: message.id,
                      action: options.action,
                      summary: options.summary,
                      replyContent: options.replyContent,
                      replyResult: options.replyResult,
                      replyType: options.replyType
                    })
                  );
                } catch (error: unknown) {
                  failed.push({
                    messageId: message.id,
                    error: renderSdkError(error)
                  });
                }
              }

              const sessionMembers = await client.getMembers(context.sessionId);
              const windowBindings = await client.listWindowBindings(context.sessionName);
              const workerInboxes: Array<{
                agentId: string;
                agentName: string;
                pendingCount: number;
                claimedCount: number;
              }> = [];
              for (const member of sessionMembers) {
                if (member.role === "worker" || member.role === "knowledge_keeper") {
                  const binding = windowBindings.find(
                    (b) => b.agentId === member.id
                  );
                  workerInboxes.push({
                    agentId: member.id,
                    agentName: member.agentName,
                    pendingCount: binding?.runtimeState?.pendingInboxCount ?? 0,
                    claimedCount: binding?.runtimeState?.claimedInboxCount ?? 0
                  });
                }
              }

              const hasBusyWorkers = workerInboxes.some((w) => w.pendingCount > 0 || w.claimedCount > 0);

              return {
                commandResultState: "completed" as const,
                commandResultIsFinal: true,
                ignoreIntermediateCommandStateText: true,
                intermediateCommandStateTextIsNotAuthoritative: true,
                runtimeTerminalProgressHints,
                workflowModel: "message_loop" as const,
                workflowContract: "wait_receive_process_report_wait" as const,
                workflowRole: "host" as const,
                workflowStep: "command_handoff" as const,
                messageKind: null,
                userReplyForbidden: true,
                mode: "resolve" as const,
                matched: false,
                status: failed.length > 0 ? ("partially_resolved" as const) : ("resolved" as const),
                action: "resolve_completed" as const,
                identity: context.identity,
                agentId: context.agentId,
                agentName: context.agentName,
                resolvedCount: resolved.length,
                failedCount: failed.length,
                resolved,
                failed,
                workerInboxes,
                hasBusyWorkers,
                turnDisposition: "host_decision_required" as const
              };
            })
        );

        const rawResult =
          locked.status === "already_running"
            ? buildAlreadyRunningResult({
                mode: "resolve",
                identity: profile.identity,
                flow: "host-cycle",
                existing: {
                  pid: locked.lock.metadata?.pid ?? null,
                  acquiredAt: locked.lock.metadata?.acquiredAt ?? null
                }
              })
            : {
                ...(locked.value as Record<string, unknown>),
                resultType: "host_decision_required" as const,
                audience: "host_ai_only" as const,
                commandAudience: "assistant_internal" as const,
                userVisible: false,
                replyToUserAllowed: false,
                currentTurnMustContinue: true,
                currentTurnMustEndSilently: false,
                mustExecuteNow: false,
                mustEndSilently: false,
                mustNotExplainToUser: true,
                userReplyForbidden: true,
                nextActionRequired: "host_must_decide" as const,
                nextAction: "host_decision_required" as const,
                commandKind: "decision" as const,
                interactionPolicy: "host_must_continue" as const,
                workflowDirective: "host_decision_required" as const,
                doNotAskUser: true,
                silenceRequired: false,
                userVisibleReplyMode: "host_action_required" as const,
                replySuppressed: true,
                userVisibleSummaryAllowed: true,
                turnDisposition: "host_decision_required" as const,
                allowedWaitCommand: "ai-collab await" as const,
                automationState: "host_resolve_completed" as const,
                internalInstruction:
                  `${finalRuntimeResultPreamble}Messages resolved. Apply the three-level dispatch decision: (1) Does the reporting Worker have more ready tasks? → dispatch-many immediately. (2) Does any other Worker have ready tasks with no dependency on unfinished work? → dispatch-many. (3) No Worker has dispatchable tasks and all are idle → await. Do NOT auto-await while any Worker still has pending or claimed tasks. Do NOT wait for all Workers to finish before dispatching to the next available Worker. Check workerInboxes for each Worker's queue status.`
              };
        const runtimeState = await updateWindowStateFromResult(
          profile,
          "resolve",
          rawResult as Record<string, unknown>
        );
        trace.step(getWindowWaitTraceEvent(rawResult as Record<string, unknown>), rawResult);
        trace.step("runtime_state_updated", runtimeState);
        const response = buildWindowCommandOutputs(
          profile,
          "resolve",
          rawResult as Record<string, unknown>,
          runtimeState,
          {
            commandRunId: trace.commandRunId,
            tracePath: getCommandTraceStorePath(projectRoot)
          }
        );
        trace.finish(response.debug);
        printJson(response.control);
      } catch (error: unknown) {
        trace.fail(error);
        printJson({
          error: renderSdkError(error),
          commandTrace: {
            commandRunId: trace.commandRunId,
            tracePath: getCommandTraceStorePath(projectRoot)
          }
        });
        process.exitCode = 1;
      }
    }
  );

const parseCsvOption = (value: string | undefined): string[] => {
  if (!value || !value.trim()) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const knowledgeCommand = program
  .command("knowledge")
  .description("Read or maintain collaboration knowledge documents");

knowledgeCommand
  .command("read")
  .description("Read one knowledge document by member name")
  .argument("<name>", "Stable member name inside the session")
  .requiredOption("--session <sessionName>", "Explicit collaboration session name")
  .option("--ref <ref>", "Knowledge ref, for example L1/session-direction#current-goal")
  .option("--level <level>", "Knowledge level: l1, l2, or l3")
  .option("--slug <slug>", "Knowledge slug")
  .option("--summary-only", "Return summary and metadata without full content")
  .option("--max-chars <count>", "Maximum content characters to return")
  .action(
    async (
      name: string,
      options: {
        session: string;
        ref?: string;
        level?: string;
        slug?: string;
        summaryOnly?: boolean;
        maxChars?: string;
      }
    ) => {
      try {
        const { context } = await requireLiveWindowContext(options.session, name);
        const parsed = options.ref
          ? parseKnowledgeRef(options.ref)
          : {
              level: ensureKnowledgeLevel(options.level),
              slug: options.slug ?? "",
              fragment: null
            };
        if (!parsed.slug) {
          throw new Error("Must provide --ref, or provide both --level and --slug.");
        }

        const document = await client.getKnowledge(parsed.level, parsed.slug, context.sessionId);
        const maxChars = options.maxChars
          ? Number.parseInt(options.maxChars, 10)
          : undefined;
        const content =
          options.summaryOnly || !document
            ? undefined
            : typeof maxChars === "number" && maxChars >= 0
              ? document.content.slice(0, maxChars)
              : document.content;

        printJson({
          op: "KNOWLEDGE_READ",
          ref: options.ref ?? `${parsed.level}/${parsed.slug}`,
          fragment: parsed.fragment,
          document: document
            ? {
                ...document,
                ...(content !== undefined ? { content } : { content: undefined })
              }
            : null
        });
      } catch (error: unknown) {
        printJson({ error: renderSdkError(error) });
        process.exitCode = 1;
      }
    }
  );

knowledgeCommand
  .command("list")
  .description("List knowledge documents by member name")
  .argument("<name>", "Stable member name inside the session")
  .requiredOption("--session <sessionName>", "Explicit collaboration session name")
  .option("--level <level>", "Knowledge level: l1, l2, or l3")
  .option("--tag <tag>", "Filter by tag")
  .option("--query <query>", "Search query")
  .action(
    async (
      name: string,
      options: {
        session: string;
        level?: string;
        tag?: string;
        query?: string;
      }
    ) => {
      try {
        const { context } = await requireLiveWindowContext(options.session, name);
        const items = await client.listKnowledge({
          sessionId: context.sessionId,
          ...(options.level ? { level: ensureKnowledgeLevel(options.level) } : {}),
          ...(options.tag ? { tag: options.tag } : {}),
          ...(options.query ? { query: options.query } : {})
        });
        printJson({
          op: "KNOWLEDGE_LIST",
          items
        });
      } catch (error: unknown) {
        printJson({ error: renderSdkError(error) });
        process.exitCode = 1;
      }
    }
  );

knowledgeCommand
  .command("judge")
  .description("Judge whether user input requires knowledge base updates before dispatching")
  .argument("<name>", "Stable host member name inside the session")
  .requiredOption("--session <sessionName>", "Explicit collaboration session name")
  .requiredOption("--source <source>", "Build source: user_message, user_feedback, host_planning, worker_report, system_idle")
  .option("--source-message-id <id>", "Source message ID that triggered this judgement (auto-inferred if omitted)")
  .option("--knowledge-build", "Knowledge build is required (shorthand for --knowledge-build-required true)")
  .option("--no-knowledge-build", "Knowledge build is not required (shorthand for --knowledge-build-required false)")
  .option("--levels <levels>", "Comma-separated target knowledge levels: l1,l2,l3 (required when --knowledge-build)")
  .option("--source-kind <kind>", "Knowledge source kind (auto-inferred if omitted)")
  .option("--candidate-refs <refs>", "Comma-separated candidate knowledge refs (auto-inferred if omitted)")
  .option("--reason <reason>", "Reason for the judgement (auto-generated if omitted)")
  .option("--next-action <action>", "Next action: none, knowledge_upsert, knowledge_upsert_then_dispatch, dispatch (auto-inferred if omitted)")
  .action(
    async (
      name: string,
      options: {
        session: string;
        source: string;
        sourceMessageId?: string;
        knowledgeBuild?: boolean;
        levels?: string;
        sourceKind?: string;
        candidateRefs?: string;
        reason?: string;
        nextAction?: string;
      }
    ) => {
      try {
        const { profile, context } = await requireLiveWindowContext(
          options.session,
          name,
          "host"
        );

        const validSources = ["user_message", "user_feedback", "host_planning", "worker_report", "system_idle"];
        if (!validSources.includes(options.source)) {
          printJson({ error: { code: "INVALID_INPUT", message: `--source must be one of: ${validSources.join(", ")}.` } });
          process.exitCode = 1;
          return;
        }

        const knowledgeBuildRequired = options.knowledgeBuild ?? false;

        let targetLevels: string[] = [];
        if (options.levels) {
          targetLevels = parseCsvOption(options.levels);
          const validLevels = ["l1", "l2", "l3"];
          for (const level of targetLevels) {
            if (!validLevels.includes(level)) {
              printJson({ error: { code: "INVALID_INPUT", message: `"${level}" in --levels is invalid. Must be one of: l1, l2, l3.` } });
              process.exitCode = 1;
              return;
            }
          }
        }

        if (knowledgeBuildRequired && targetLevels.length === 0) {
          printJson({ error: { code: "INVALID_INPUT", message: "--levels is required when using --knowledge-build." } });
          process.exitCode = 1;
          return;
        }

        const sourceKind = options.sourceKind ?? inferSourceKind(options.source);
        const validSourceKinds = ["manual", "worker_report", "host_update", "system", "user_feedback", "none"];
        if (!validSourceKinds.includes(sourceKind)) {
          printJson({ error: { code: "INVALID_INPUT", message: `--source-kind must be one of: ${validSourceKinds.join(", ")}.` } });
          process.exitCode = 1;
          return;
        }

        let candidateRefs: string[] = [];
        if (options.candidateRefs) {
          candidateRefs = parseCsvOption(options.candidateRefs);
        } else if (knowledgeBuildRequired) {
          candidateRefs = targetLevels.map((level) => `${level}/current`);
        }

        const nextAction = options.nextAction ?? inferNextAction(knowledgeBuildRequired);
        const validNextActions = ["none", "knowledge_upsert", "knowledge_upsert_then_dispatch", "dispatch"];
        if (!validNextActions.includes(nextAction)) {
          printJson({ error: { code: "INVALID_INPUT", message: `--next-action must be one of: ${validNextActions.join(", ")}.` } });
          process.exitCode = 1;
          return;
        }

        let sourceMessageId = options.sourceMessageId;
        if (!sourceMessageId) {
          const rememberedState = await readWindowRuntimeState(
            projectRoot,
            options.session,
            name
          );
          sourceMessageId = rememberedState?.currentMessageId ?? undefined;
        }

        const reason = options.reason ?? `source=${options.source}, levels=${targetLevels.join(",") || "none"}`;

        const judgement = await client.createKnowledgeBuildJudgement({
          sessionId: context.sessionId,
          source: options.source as import("@ai-collab/protocol").KnowledgeBuildSource,
          sourceMessageId,
          hostAgentId: context.agentId,
          knowledgeBuildRequired,
          targetLevels: targetLevels as import("@ai-collab/protocol").KnowledgeLevel[],
          sourceKind: sourceKind as import("@ai-collab/protocol").KnowledgeSourceKind | "none",
          candidateRefs,
          reason,
          nextAction: nextAction as import("@ai-collab/protocol").KnowledgeBuildNextAction
        });

        void profile;

        printJson({
          op: "KNOWLEDGE_BUILD_JUDGEMENT_CREATED",
          judgement
        });
      } catch (error: unknown) {
        printJson({ error: renderSdkError(error) });
        process.exitCode = 1;
      }
    }
  );

knowledgeCommand
  .command("fulfil-judgement")
  .description("Mark a knowledge build judgement as fulfilled after knowledge updates are complete")
  .argument("<name>", "Stable host member name inside the session")
  .requiredOption("--session <sessionName>", "Explicit collaboration session name")
  .requiredOption("--judgement-id <id>", "Knowledge build judgement ID to fulfil")
  .option("--change-ids <ids>", "Comma-separated knowledge change IDs")
  .option("--knowledge-refs <refs>", "Comma-separated knowledge refs (e.g. l1/project-constitution)")
  .action(
    async (
      name: string,
      options: {
        session: string;
        judgementId: string;
        changeIds?: string;
        knowledgeRefs?: string;
      }
    ) => {
      try {
        const { context } = await requireLiveWindowContext(
          options.session,
          name,
          "host"
        );

        const changeIds = parseCsvOption(options.changeIds);
        const knowledgeRefs = parseCsvOption(options.knowledgeRefs);

        const judgement = await client.fulfilKnowledgeBuildJudgement({
          judgementId: options.judgementId,
          hostAgentId: context.agentId,
          changeIds,
          knowledgeRefs
        });

        printJson({
          op: "KNOWLEDGE_BUILD_JUDGEMENT_FULFILLED",
          judgement
        });
      } catch (error: unknown) {
        printJson({ error: renderSdkError(error) });
        process.exitCode = 1;
      }
    }
  );

knowledgeCommand
  .command("read-current")
  .description("Read a current-level knowledge document by level (l1/l2/l3)")
  .argument("<name>", "Stable member name inside the session")
  .requiredOption("--session <sessionName>", "Explicit collaboration session name")
  .requiredOption("--level <level>", "Knowledge level: l1, l2, or l3")
  .option("--anchor <anchor>", "Read only the fragment under ## <anchor> heading")
  .option("--summary-only", "Return summary and metadata without full content")
  .option("--max-chars <count>", "Maximum content characters to return (stdout mode only)")
  .option("--output-file <path>", "Write content to file instead of stdout")
  .action(
    async (
      name: string,
      options: {
        session: string;
        level: string;
        anchor?: string;
        summaryOnly?: boolean;
        maxChars?: string;
        outputFile?: string;
      }
    ) => {
      try {
        const { context } = await requireLiveWindowContext(options.session, name);
        const level = ensureKnowledgeLevel(options.level);
        const document = await client.getKnowledge(level, "current", context.sessionId);

        if (!document) {
          if (options.outputFile) {
            printJson({ error: { code: "NOT_FOUND", message: `${level}/current does not exist` } });
          } else {
            printJson({ op: "KNOWLEDGE_READ_CURRENT", level, slug: "current", document: null });
          }
          process.exitCode = 1;
          return;
        }

        let content = document.content;

        if (options.anchor) {
          const result = resolveKnowledgeRefFragment(content, options.anchor);
          if (!result.found) {
            printJson({
              error: {
                code: "ANCHOR_NOT_FOUND",
                message: `anchor #${options.anchor} not found in ${level}/current`,
                availableAnchors: result.availableAnchors
              }
            });
            process.exitCode = 1;
            return;
          }
          content = result.fragment;
        }

        if (options.outputFile) {
          writeOutputFile(options.outputFile, content);
          printJson({
            op: "KNOWLEDGE_READ_CURRENT",
            level,
            slug: "current",
            outputFile: options.outputFile,
            anchor: options.anchor ?? null,
            contentLength: content.length
          });
        } else {
          const maxChars = options.maxChars
            ? Number.parseInt(options.maxChars, 10)
            : undefined;
          const displayContent =
            options.summaryOnly
              ? undefined
              : typeof maxChars === "number" && maxChars > 0
                ? content.slice(0, maxChars)
                : content;

          printJson({
            op: "KNOWLEDGE_READ_CURRENT",
            level,
            slug: "current",
            anchor: options.anchor ?? null,
            document: {
              ...document,
              ...(displayContent !== undefined ? { content: displayContent } : { content: undefined })
            }
          });
        }
      } catch (error: unknown) {
        printJson({ error: renderSdkError(error) });
        process.exitCode = 1;
      }
    }
  );

knowledgeCommand
  .command("update-current")
  .description("Update a current-level knowledge document by level (l1/l2/l3)")
  .argument("<name>", "Stable member name inside the session")
  .requiredOption("--session <sessionName>", "Explicit collaboration session name")
  .requiredOption("--level <level>", "Knowledge level: l1, l2, or l3")
  .option("--content <content>", "New content for the knowledge document (legacy, use --content-file for long content)")
  .option("--content-file <path>", "Read new content from file")
  .option("--source-kind <kind>", "Knowledge source kind (default: host_update)")
  .action(
    async (
      name: string,
      options: {
        session: string;
        level: string;
        content?: string;
        contentFile?: string;
        sourceKind?: string;
      }
    ) => {
      try {
        const { profile, context } = await requireLiveWindowContext(options.session, name);
        ensureWindowRoleAny(profile, ["host", "knowledge_keeper"]);
        const level = ensureKnowledgeLevel(options.level);
        const sourceKind = ensureKnowledgeSourceKind(options.sourceKind ?? "host_update");

        let content: string;
        if (options.contentFile) {
          content = readContentFile(options.contentFile);
        } else if (options.content) {
          content = options.content;
        } else {
          printJson({ error: { code: "INVALID_INPUT", message: "Must provide --content or --content-file." } });
          process.exitCode = 1;
          return;
        }

        const document = await client.upsertKnowledge({
          level,
          slug: "current",
          content,
          title: level === "l1" ? "L1 Current" : level === "l2" ? "L2 Current" : "L3 Current",
          sourceKind,
          sourceAgentId: context.agentId,
          sessionId: context.sessionId
        });

        printJson({
          op: "KNOWLEDGE_UPDATE_CURRENT",
          level,
          slug: "current",
          document
        });
      } catch (error: unknown) {
        printJson({ error: renderSdkError(error) });
        process.exitCode = 1;
      }
    }
  );

const executeWindowWaitCommand = async (options: {
  commandName: string;
  displayCommandName:
    | "await"
    | "listen"
    | "watch"
    | "standby"
    | "hold"
    | "continue";
  waitAlias: WindowWaitAliasName;
  windowName: string;
  sessionName: string;
  traceInput: Record<string, unknown>;
  continuation?: {
    continueSeq?: string | undefined;
    continueStep?: string | undefined;
    continuePass?: string | undefined;
    continueBudget?: string | undefined;
    continueOrigin?: string | undefined;
  };
}) => {
  const trace = createCommandTrace(projectRoot, {
    commandName: options.commandName,
    sessionName: options.sessionName,
    windowName: options.windowName,
    input: options.traceInput
  });

  try {
    const { profile, context } = await requireLiveWindowContext(
      options.sessionName,
      options.windowName
    );
    trace.step("binding_loaded", buildWindowProfileSummary(profile));
    const intervalSeconds = profile.defaults.intervalSeconds;
    const maxRounds = profile.defaults.maxRounds;
    const slicedWait = sliceWaitRounds({
      intervalSeconds,
      maxRounds
    });
    const continuationState = resolveWindowWaitContinuationState({
      alias: options.waitAlias,
      windowName: options.windowName,
      sessionName: options.sessionName,
      originCommand: options.commandName,
      continueSeq: options.continuation?.continueSeq,
      continueStep: options.continuation?.continueStep,
      continuePass: options.continuation?.continuePass,
      continueBudget: options.continuation?.continueBudget,
      continueOrigin: options.continuation?.continueOrigin
    });

    if (profile.role === "worker" || profile.role === "knowledge_keeper") {
      trace.step("binding_validated", {
        identity: profile.identity,
        role: profile.role,
        waitPolicy: profile.defaults
      });
      trace.step("wait_started", {
        flow: "worker-cycle",
        alias: options.waitAlias,
        sequenceId: continuationState.sequenceId,
        step: continuationState.currentStep,
        pass: continuationState.currentPass
      });
      const locked = await withLocalLoopLock(
        projectRoot,
        {
          identity: profile.identity,
          flow: "worker-cycle",
          takeover: true
        },
        async () =>
          withCliIdentityLease(
            context,
            profile.role === "knowledge_keeper" ? "knowledge_keeper" : "worker",
            {
              intervalSeconds: slicedWait.intervalSeconds,
              maxRounds: slicedWait.maxRounds
            },
            () =>
              runWorkerAwaitTask(context, {
                profile,
                trace,
                intervalSeconds: slicedWait.intervalSeconds,
                maxRounds: slicedWait.maxRounds,
                maxElapsedSeconds: slicedWait.maxElapsedSeconds
              })
          )
      );

      const rawResult =
        locked.status === "already_running"
          ? buildAlreadyRunningResult({
              mode: options.commandName,
              identity: profile.identity,
              flow: "worker-cycle",
              existing: {
                pid: locked.lock.metadata?.pid ?? null,
                acquiredAt: locked.lock.metadata?.acquiredAt ?? null
              }
            })
          : maybeBuildContinuedWaitResult(
              locked.value as Record<string, unknown>,
              continuationState,
              {
                eligibleStatuses: ["wait_timeout"],
                continueStatus: "wait_timeout_continue",
                automationState: "wait_loop_continue",
                internalInstruction:
                  "Do not reply to the user. No worker task arrived in this wait slice. Continue the same wait chain silently."
              }
            );
      const runtimeState = await updateWindowStateFromResult(
        profile,
        options.displayCommandName,
        rawResult as Record<string, unknown>
      );
      trace.step(getWindowWaitTraceEvent(rawResult as Record<string, unknown>), rawResult);
      trace.step("runtime_state_updated", runtimeState);
      const response = buildWindowCommandOutputs(
        profile,
        options.displayCommandName,
        rawResult as Record<string, unknown>,
        runtimeState,
        {
          commandRunId: trace.commandRunId,
          tracePath: getCommandTraceStorePath(projectRoot)
        }
      );
      trace.finish(response.debug);
      printJson(response.control);
      return;
    }

    ensureWindowRole(profile, "host");
    trace.step("binding_validated", {
      identity: profile.identity,
      role: profile.role,
      waitPolicy: profile.defaults
    });
    trace.step("queue_drain_started", {
      flow: "host-cycle",
      alias: options.waitAlias,
      sequenceId: continuationState.sequenceId,
      step: continuationState.currentStep,
      pass: continuationState.currentPass
    });
    const locked = await withLocalLoopLock(
      projectRoot,
      {
        identity: profile.identity,
        flow: "host-cycle",
        takeover: true
      },
      async () =>
        withCliIdentityLease(
          context,
          "host",
          {
            intervalSeconds: slicedWait.intervalSeconds,
            maxRounds: slicedWait.maxRounds
          },
          () =>
            runHostAwaitMessage(context, {
              profile,
              trace,
              intervalSeconds: slicedWait.intervalSeconds,
              maxRounds: slicedWait.maxRounds,
              maxElapsedSeconds: slicedWait.maxElapsedSeconds
            })
        )
    );

    const rawResult =
      locked.status === "already_running"
        ? buildAlreadyRunningResult({
            mode: options.commandName,
            identity: profile.identity,
            flow: "host-cycle",
            existing: {
              pid: locked.lock.metadata?.pid ?? null,
              acquiredAt: locked.lock.metadata?.acquiredAt ?? null
            }
          })
        : maybeBuildContinuedWaitResult(
            locked.value as Record<string, unknown>,
            continuationState,
            {
              eligibleStatuses: ["wait_timeout"],
              continueStatus: "wait_timeout_continue",
              automationState: "host_wait_loop_continue",
              internalInstruction:
                "Do not reply to the user. No host message arrived in this wait slice. Continue the same wait chain silently."
            }
          );
    const runtimeState = await updateWindowStateFromResult(
      profile,
      options.displayCommandName,
      rawResult as Record<string, unknown>
    );
    trace.step(getWindowWaitTraceEvent(rawResult as Record<string, unknown>), rawResult);
    trace.step("runtime_state_updated", runtimeState);
    const response = buildWindowCommandOutputs(
      profile,
      options.displayCommandName,
      rawResult as Record<string, unknown>,
      runtimeState,
      {
        commandRunId: trace.commandRunId,
        tracePath: getCommandTraceStorePath(projectRoot)
      }
    );
    trace.finish(response.debug);
    printJson(response.control);
  } catch (error: unknown) {
    trace.fail(error);
    printJson({
      error: renderSdkError(error),
      commandTrace: {
        commandRunId: trace.commandRunId,
        tracePath: getCommandTraceStorePath(projectRoot)
      }
    });
    process.exitCode = 1;
  }
};

program
  .command("start")
  .description("Start the local ai-collab core service and web dashboard")
  .option("--daemon", "Start the local core as a background process")
  .option("--no-web", "Skip starting the web dashboard dev server")
  .action(async (options: { daemon?: boolean; web?: boolean }) => {
    const runtime = await loadRuntimeModule();
    if (options.daemon) {
      const status = await runtime.startCore(projectRoot);
      console.log(
        JSON.stringify(
          {
            mode: "daemon",
            state: status.state,
            reachable: status.reachable,
            pid: status.metadata?.pid ?? null,
            dashboardUrl: runtime.getDashboardUrl(status.metadata)
          },
          null,
          2
        )
      );
      return;
    }

    const dashboardUrl = "http://127.0.0.1:5173";
    const coreUrl = runtime.getDashboardUrl();

    console.log(
      JSON.stringify(
        {
          mode: "foreground",
          message:
            "Starting ai-collab core + web dashboard. Press Ctrl+C to stop.",
          coreUrl,
          dashboardUrl
        },
        null,
        2
      )
    );

    // Start Vite dev server for the web dashboard
    let viteProcess: ReturnType<typeof spawn> | null = null;
    if (options.web !== false) {
      const webDir = resolve(projectRoot, "apps", "web");
      if (existsSync(join(webDir, "package.json"))) {
        viteProcess = spawn("pnpm", ["run", "dev"], {
          cwd: webDir,
          stdio: "inherit",
          shell: true
        });
        viteProcess.on("error", (err) => {
          console.error(`[web] Failed to start: ${err.message}`);
        });
      } else {
        console.warn(`[web] Skipped: ${webDir} not found`);
      }
    }

    const cleanup = () => {
      if (viteProcess && !viteProcess.killed) {
        viteProcess.kill();
      }
    };
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);

    try {
      await runtime.runCoreForeground(projectRoot);
    } finally {
      cleanup();
    }
  });

program
  .command("stop")
  .description("Stop the local ai-collab core service")
  .action(async () => {
    const runtime = await loadRuntimeModule();
    const status = await runtime.stopCore(projectRoot);
    console.log(
      JSON.stringify(
        {
          state: status.state,
          reachable: status.reachable
        },
        null,
        2
      )
    );
  });

program
  .command("status")
  .description("Show current ai-collab service status")
  .action(async () => {
    const runtime = await loadRuntimeModule();
    const status = await runtime.getCoreStatus(projectRoot);
    console.log(
      JSON.stringify(
        {
          ...status,
          dashboardUrl: runtime.getDashboardUrl(status.metadata)
        },
        null,
        2
      )
    );
  });

program
  .command("doctor")
  .description("Run local environment diagnostics")
  .action(async () => {
    const runtime = await loadRuntimeModule();
    const diagnostics = await runtime.runDoctor(projectRoot);
    console.log(JSON.stringify(diagnostics, null, 2));
  });

program
  .command("logs")
  .description("Print recent core logs")
  .option("-n, --lines <count>", "Number of lines to show", "100")
  .action(async (options: { lines: string }) => {
    const runtime = await loadRuntimeModule();
    const count = Number.parseInt(options.lines, 10);
    console.log(
      runtime.readLogs(projectRoot, Number.isNaN(count) ? 100 : count)
    );
  });

program
  .command("config:init")
  .description("Create the default .ai-collab config for the current project")
  .action(async () => {
    const runtime = await loadRuntimeModule();
    const configPath = runtime.initializeConfig(projectRoot);
    console.log(
      JSON.stringify(
        {
          configPath
        },
        null,
        2
      )
    );
  });

const profileCommand = program
  .command("profile")
  .description("Manage user profile preferences and habits");

profileCommand
  .command("get")
  .description("Get user profile entries")
  .argument("<name>", "Stable member name inside the session")
  .requiredOption("--session <sessionName>", "Explicit collaboration session name")
  .argument("[key]", "Optional profile key")
  .action(async (name: string, key: string | undefined, options: { session: string }) => {
    try {
      const { profile, context } = await requireLiveWindowContext(options.session, name);
      if (profile.role !== "host" && profile.role !== "knowledge_keeper") {
        throw new Error(`profile operation only allows host or knowledge_keeper role, current role is "${profile.role}".`);
      }
      const snapshot = await client.getProfile(key, context.agentId);
      printJson({
        op: "PROFILE_GET",
        entries: snapshot.entries,
        updatedAt: snapshot.updatedAt
      });
    } catch (error: unknown) {
      printJson({ error: renderSdkError(error) });
      process.exitCode = 1;
    }
  });

profileCommand
  .command("set")
  .description("Set a user profile key-value pair")
  .argument("<name>", "Stable member name inside the session")
  .requiredOption("--session <sessionName>", "Explicit collaboration session name")
  .argument("<key>", "Profile key")
  .argument("<value>", "Profile value")
  .action(async (name: string, key: string, value: string, options: { session: string }) => {
    try {
      const { profile, context } = await requireLiveWindowContext(options.session, name);
      if (profile.role !== "host" && profile.role !== "knowledge_keeper") {
        throw new Error(`profile operation only allows host or knowledge_keeper role, current role is "${profile.role}".`);
      }
      const result = await client.setProfile(key, value, context.agentId);
      printJson({
        op: "PROFILE_SET",
        entry: result.entry
      });
    } catch (error: unknown) {
      printJson({ error: renderSdkError(error) });
      process.exitCode = 1;
    }
  });

profileCommand
  .command("delete")
  .description("Delete a user profile entry")
  .argument("<name>", "Stable member name inside the session")
  .requiredOption("--session <sessionName>", "Explicit collaboration session name")
  .argument("<key>", "Profile key to delete")
  .action(async (name: string, key: string, options: { session: string }) => {
    try {
      const { profile, context } = await requireLiveWindowContext(options.session, name);
      if (profile.role !== "host" && profile.role !== "knowledge_keeper") {
        throw new Error(`profile operation only allows host or knowledge_keeper role, current role is "${profile.role}".`);
      }
      const result = await client.deleteProfile(key, context.agentId);
      printJson({
        op: "PROFILE_DELETE",
        deleted: result.deleted
      });
    } catch (error: unknown) {
      printJson({ error: renderSdkError(error) });
      process.exitCode = 1;
    }
  });

await program.parseAsync();

