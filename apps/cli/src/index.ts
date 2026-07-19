#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import path from "node:path";
import fs from "node:fs";
import { Command } from "commander";
import {
  createLoopMarshalClient,
  LoopMarshalSdkError
} from "@loopmarshal/sdk";
import { wrapForDisplay } from "@loopmarshal/shared";
import {
  errorCodes,
  type Agent,
  type KnowledgeLevel,
  knowledgeSourceKinds,
  type KnowledgeSourceKind,
  type MessageRecord,
  type MessageType,
  type WindowBinding
} from "@loopmarshal/protocol";

import {
  clearCliIdentity,
  clearCliIdentitiesForSession,
  requireCliIdentity,
  type CliIdentityContext,
  writeCliIdentity
} from "./context.js";
import {
  printJson,
  buildIdentity,
  loadRuntimeModule,
  requireIdentityOption,
  isTruthyEnvValue,
  pickDefinedFields
} from "./utils/shared-helpers.js";
import {
  getRuntimeStringField,
  getRuntimeRecordField,
  buildWindowDebugResult,
  parseMessagePayloadView,
  extractPayloadRecord,
  buildControlMessageView,
  appendControlMessageViews,
  dedupeControlMessageViews,
  inferClaimedMessageKind
} from "./utils/runtime-helpers.js";
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
const client = createLoopMarshalClient({
  headers: {
    "x-loopmarshal-client": "cli",
    "x-loopmarshal-process": String(process.pid)
  }
});
const cliLeaseOwnerToken = `cli:${process.pid}:${randomUUID()}`;
const runtimeTerminalProgressHints = [
  "running",
  "no output",
  "background"
] as const;
const finalRuntimeResultPreamble =
  "INTERNAL: this JSON is the final completed result of the loopmarshal wait command. Ignore any earlier terminal progress text such as running, no output, background status, or streaming command wrappers. ";


const requireLiveCliIdentity = async (
  identity: string
): Promise<CliIdentityContext> => {
  let context: CliIdentityContext;
  try {
    context = await requireCliIdentity(projectRoot, identity);
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`${error.message} 该绑定可能已自动清理。`);
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
        `identity="${identity}" 的本地绑定已失效，已自动清理：远端会话中已不存在成员 "${context.agentName}"。请重新执行 loopmarshal attach <name> --session <sessionName> --role <host|worker> --duty "<职责>"。`
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
        `identity="${identity}" 的本地绑定已失效，已自动清理：${error.message}。请重新执行 loopmarshal attach <name> --session <sessionName> --role <host|worker> --duty "<职责>"。`
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
      `window="${profile.windowName}" 的角色是 "${profile.role}"，不能执行 ${expectedRole} 命令。`
    );
  }
};

const ensureWindowRoleAny = (
  profile: WindowProfile,
  allowedRoles: Array<"host" | "worker" | "knowledge_keeper">
): void => {
  if (!allowedRoles.includes(profile.role as "host" | "worker" | "knowledge_keeper")) {
    throw new Error(
      `window="${profile.windowName}" 的角色是 "${profile.role}"，需要 ${allowedRoles.join(" 或 ")} 角色才能执行此命令。`
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
  const runtimeState = await persistWindowRuntimeState(profile, {
    activeFlow: options.role === "host" ? "host-cycle" : "worker-cycle",
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
    role: profile.role === "host" ? "host" : profile.role === "knowledge_keeper" ? "knowledge_keeper" : "worker",
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
    state: existing?.state ?? null,
    requiredAction: existing?.requiredAction ?? null,
    requiredTool: existing?.requiredTool ?? null,
    continuationToken: existing?.continuationToken ?? null,
    userVisibleResponseAllowed: existing?.userVisibleResponseAllowed ?? null,
    leaseExpiresAt: existing?.leaseExpiresAt ?? null,
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



const inferRuntimeRole = (result: Record<string, unknown>) => {
  const workflowRole = getRuntimeStringField(result, "workflowRole");
  if (workflowRole === "host" || workflowRole === "worker") {
    return workflowRole;
  }

  const mode = getRuntimeStringField(result, "mode");
  if (mode?.startsWith("host")) {
    return "host";
  }
  if (mode?.startsWith("worker")) {
    return "worker";
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
      op: "PROCESS_CLAIMED_MESSAGE",
      role: inferRuntimeRole(debugResult),
      kind: messageKind,
      status,
      message: claimedMessage,
      ...(claimedMessages.length > 1 ? { messages: claimedMessages } : {})
    };
  }

  if (
    status === "all_workers_waiting" ||
    workflowStep === "session_idle_detected" ||
    nextActionRequired === "continue_host_planning"
  ) {
    return {
      op: "PROCESS_SESSION_IDLE",
      role: "host",
      status: status ?? "all_workers_waiting",
      message: {
        content:
          "所有 worker 当前都处于等待/空闲状态，Host 不能继续等待。请继续规划、派发下一轮、检查知识库更新，或向用户汇报收口。"
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
  throw new Error("knowledge level 必须是 l1、l2 或 l3。");
};

const ensureKnowledgeSourceKind = (
  value: string | undefined
): KnowledgeSourceKind => {
  const normalized = value ?? "host_update";
  if ((knowledgeSourceKinds as readonly string[]).includes(normalized)) {
    return normalized as KnowledgeSourceKind;
  }
  throw new Error(
    `knowledge source-kind 必须是 ${knowledgeSourceKinds.join("、")} 之一。`
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
    throw new Error(`知识库引用 "${ref}" 无效，应形如 L1/session-direction 或 l2/cli-flow#section。`);
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
      "批量派发任务不能为空。请使用 --task \"<workerWindow>::<任务内容>\"。"
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
        `无法解析批量派发任务 JSON：${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    throw new Error(
      "批量派发任务 JSON 必须包含 to/windowName/workerWindow 之一，以及 content。"
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
    "批量派发任务格式无效。请使用 --task \"<workerWindow>::<任务内容>\"，或传入包含 to 和 content 的 JSON。"
  );
};

const buildMergedDispatchTaskContent = (contents: string[]) => {
  if (contents.length === 1) {
    return contents[0]!;
  }

  return contents
    .map((content, index) => `任务 ${index + 1}\n${content}`)
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
  role: "worker" | "observer",
  roleDescription: string | undefined,
  optionName: string
): string | undefined => {
  const normalized = roleDescription?.trim();
  if (role !== "worker") {
    return normalized || undefined;
  }

  if (!normalized) {
    throw new Error(
      `当前 worker 加入必须提供角色说明。请通过 ${optionName} \"<说明>\" 告诉系统这个 worker 是干什么用的。`
    );
  }

  return normalized;
};

const ensureMessageType = (value: string): MessageType => {
  if (SUPPORTED_MESSAGE_TYPES.includes(value as MessageType)) {
    return value as MessageType;
  }

  throw new Error(
    `不支持的消息类型 "${value}"，可选值：${SUPPORTED_MESSAGE_TYPES.join(", ")}`
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
): error is LoopMarshalSdkError => {
  return error instanceof LoopMarshalSdkError && error.code === code;
};

const isWaitChainControlError = (error: unknown): error is LoopMarshalSdkError => {
  return (
    error instanceof LoopMarshalSdkError &&
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
  const parts = ["loopmarshal", "runtime", subcommand];

  for (const [flag, value] of options) {
    appendCommandOption(parts, flag, value);
  }

  return parts.join(" ");
};

const buildLoopMarshalTerminalCommand = (args: string[]) => {
  return ["loopmarshal", ...args.map(shellEscape)].join(" ");
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
      throw new Error("continue token 版本或 alias 无效。");
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
      throw new Error("continue token 已过期。");
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
    throw new Error("continue token 版本或 alias 无效。");
  }

  const windowName =
    typeof parsed.windowName === "string" ? parsed.windowName : null;
  const sessionName =
    typeof parsed.sessionName === "string" ? parsed.sessionName : null;
  if (windowName !== expectedWindowName || sessionName !== expectedSessionName) {
    throw new Error("continue token 与当前 window/session 不匹配。");
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
    throw new Error("continue token 缺少必要字段。");
  }

  if (Date.parse(expiresAt) <= Date.now()) {
    throw new Error("continue token 已过期。");
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
    ? ["loopmarshal", ...nextCommandArgs.map(shellEscape)].join(" ")
    : null;
  const nextTerminalCommand = nextCommandArgs
    ? buildLoopMarshalTerminalCommand(nextCommandArgs)
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
  const terminalCommand = buildLoopMarshalTerminalCommand(options.commandArgs);
  const nextCommand = ["loopmarshal", ...options.commandArgs.map(shellEscape)].join(
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
  flow: "host" | "worker";
  intervalSeconds?: number | undefined;
  maxRounds?: number | undefined;
}) => {
  const estimatedRuntimeSeconds =
    (options.intervalSeconds ?? DEFAULT_LOOP_INTERVAL_SECONDS) *
    (options.maxRounds ?? DEFAULT_LOOP_MAX_ROUNDS);
  const minimumSeconds = options.flow === "host" ? 180 : 120;
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
  flow: "host" | "worker"
) => {
  return {
    identity: context.identity,
    flow,
    ownerToken: cliLeaseOwnerToken
  };
};

const withCliIdentityLease = async <T>(
  context: CliIdentityContext,
  flow: "host" | "worker",
  options: {
    intervalSeconds?: number | undefined;
    maxRounds?: number | undefined;
  },
  task: () => Promise<T>
): Promise<T> => {
  await client.acquireIdentityLease({
    identity: context.identity,
    flow,
    ownerToken: cliLeaseOwnerToken,
    leaseSeconds: computeLeaseSeconds({
      flow,
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
        flow,
        ownerToken: cliLeaseOwnerToken
      });
    } catch {
      // Lease expiry on the core side prevents permanent lock retention.
    }
  }
};

const renewCliIdentityLease = async (
  context: CliIdentityContext,
  flow: "host" | "worker",
  options: {
    intervalSeconds?: number | undefined;
    maxRounds?: number | undefined;
  }
): Promise<boolean> => {
  try {
    await client.acquireIdentityLease({
      identity: context.identity,
      flow,
      ownerToken: cliLeaseOwnerToken,
      leaseSeconds: computeLeaseSeconds({
        flow,
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
      `${finalRuntimeResultPreamble}Do not reply to the user. Do not summarize this result. A wait chain for this identity is already running. Stop here silently. Do not execute Start-Sleep, sleep, timeout, ping, or any other pure wait command. Only the loopmarshal wait chain is allowed.`,
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
    throw new Error(`${name} 必须是大于 0 的整数。`);
  }
  return parsed;
};

const resolveContinueAfterMatch = (
  continueAfterMatch: boolean | undefined,
  maxMatches: number
) => {
  if (!continueAfterMatch && maxMatches > 1) {
    throw new Error(
      "max-matches 大于 1 时，必须同时开启 --continue-after-match。"
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

type HostLoopItemKind = "task" | "report" | null;

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
    | "idle_timeout";
  message: MessageRecord | null;
  item: RuntimeMessageSummary | null;
  task: RuntimeMessageSummary | null;
  report: RuntimeMessageSummary | null;
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
  const allWorkersWaiting =
    workers.length > 0 &&
    !hasQueuedMessages &&
    workerStates.every((worker) => worker.waitingOrIdle);

  return {
    allWorkersWaiting,
    workerCount: workers.length,
    hasQueuedMessages,
    workerStates,
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
    workflowRole: "worker" as const,
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
    allowedWaitCommand: "loopmarshal await" as const,
    automationState: loopResult.matched
      ? ("resume_claimed_task" as const)
      : loopResult.superseded
        ? ("wait_chain_superseded" as const)
        : ("wait_loop_active" as const),
    internalInstruction: loopResult.matched
      ? `${finalRuntimeResultPreamble}Do not reply to the user. This command has already claimed a worker task, so the current turn must continue immediately into task processing. After finishing, report with loopmarshal submit. Do not insert Start-Sleep, sleep, timeout, ping, or any pure wait command.`
      : loopResult.superseded
        ? `${finalRuntimeResultPreamble}Do not reply to the user. This wait chain has been superseded by a newer wait command from the same window. Stop here silently and let the newer wait chain continue. Do not execute Start-Sleep, sleep, timeout, ping, or any other pure wait command.`
        : `${finalRuntimeResultPreamble}Do not reply to the user. No task arrived in this round. If collaboration is still active, continue waiting silently. Do not execute Start-Sleep, sleep, timeout, ping, or any other pure wait command. Only loopmarshal await is allowed for waiting.`,
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
    markAs: "completed" | "failed" | "contested";
  }
) => {
  const markAs = options.markAs;
  const resolvedType =
    options.type ??
    (markAs === "failed" ? ("error" as const) : ("result" as const));
  const resolvedResult =
    options.result ??
    (markAs === "failed"
      ? "failed"
      : markAs === "contested"
        ? "contested"
        : "completed");
  const sourceMessage = await client.getMessageById(options.messageId);
  const resolvedCorrelationId =
    options.correlationId ?? sourceMessage.correlationId ?? undefined;
  const report = await sendStandardHostReport(context, {
    content: options.content,
    result: resolvedResult,
    type: resolvedType,
    correlationId: resolvedCorrelationId,
    idempotencyKey: options.idempotencyKey
  });
  let processedMessage: MessageRecord;

  try {
    processedMessage =
      markAs === "failed"
        ? await client.failMessage(options.messageId, {
            agentId: context.agentId,
            ...(options.failReason ? { reason: options.failReason } : {}),
            ...buildWaitChainAuth(context, "worker")
          })
        : await client.completeMessage(options.messageId, {
            agentId: context.agentId,
            ...buildWaitChainAuth(context, "worker")
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
        : ("review_claimed_report_now" as const)
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
        : ("review_received_report" as const)
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
    allowedWaitCommand: "loopmarshal await" as const,
    automationState: loopResult.matched
      ? loopResult.itemKind === "task"
        ? ("host_execute_local" as const)
        : ("host_report_received" as const)
      : allWorkersWaiting
        ? ("host_session_idle_detected" as const)
      : loopResult.superseded
        ? ("host_wait_chain_superseded" as const)
        : ("host_wait_loop_active" as const),
    internalInstruction: loopResult.matched
      ? loopResult.itemKind === "task"
        ? `${finalRuntimeResultPreamble}Do not reply to the user. This command has already claimed a host task, so the current turn must continue immediately into host-side processing. After finishing, resolve it with loopmarshal resolve. Do not insert Start-Sleep, sleep, timeout, ping, or any pure wait command.`
        : `${finalRuntimeResultPreamble}Do not reply to the user. This command has already claimed the worker report, so the current turn must continue immediately into report review. After finishing the review, resolve it with loopmarshal resolve. Do not insert Start-Sleep, sleep, timeout, ping, or any pure wait command.`
      : loopResult.superseded
        ? `${finalRuntimeResultPreamble}Do not reply to the user. This wait chain has been superseded by a newer wait command from the same window. Stop here silently and let the newer wait chain continue. Do not execute Start-Sleep, sleep, timeout, ping, or any other pure wait command.`
        : allWorkersWaiting
          ? `${finalRuntimeResultPreamble}All workers in this session are waiting or idle and there are no pending or claimed messages. Do not continue the wait loop. Continue host planning now: check whether the user intent has been satisfied, decide whether knowledge needs to be updated, dispatch the next tasks if work remains, or report closure to the user.`
        : `${finalRuntimeResultPreamble}Do not reply to the user. No host message arrived in this round. If collaboration is still active, continue waiting silently. Do not execute Start-Sleep, sleep, timeout, ping, or any other pure wait command. Only loopmarshal await is allowed for waiting.`,
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
    throw new Error(`未找到名称为 "${agentName}" 的协作成员。`);
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
  const claimedInbox = await client.getInboxWithOptions(context.agentId, {
    claimedOnly: true
  });

  return (
    claimedInbox.find((message) => {
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
    }) ?? null
  );
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
    const leaseStillOwned = await renewCliIdentityLease(context, "worker", {
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
      "host-report-await-loop 已收口为原子 claim 模式，不支持 --no-ack-matched。"
    );
  }
  if (options.includeAcknowledged) {
    throw new Error(
      "host-report-await-loop 已收口为原子 claim 模式，不支持 --include-acknowledged。"
    );
  }
  if (options.excludeMessageIds.length > 0) {
    throw new Error(
      "host-report-await-loop 已收口为原子 claim 模式，不支持 --exclude-message-id。"
    );
  }
  if (options.type && !HOST_REPORT_MESSAGE_TYPES.includes(options.type)) {
    throw new Error(
      `host-report-await-loop 仅支持 host 回报消息类型：${HOST_REPORT_MESSAGE_TYPES.join(", ")}。`
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
        `from-name "${options.fromName}" 与 from-agent-id "${expectedFromAgentId}" 不一致。`
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
      "host-await-loop 已收口为原子 claim 模式，不支持 --no-ack-matched。"
    );
  }
  if (options.includeAcknowledged) {
    throw new Error(
      "host-await-loop 已收口为原子 claim 模式，不支持 --include-acknowledged。"
    );
  }
  if (options.excludeMessageIds.length > 0) {
    throw new Error(
      "host-await-loop 已收口为原子 claim 模式，不支持 --exclude-message-id。"
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
        `from-name "${options.fromName}" 与 from-agent-id "${expectedFromAgentId}" 不一致。`
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

  for (let round = 1; round <= options.maxRounds; round += 1) {
    const leaseStillOwned = await renewCliIdentityLease(context, "host", {
      intervalSeconds: options.intervalSeconds,
      maxRounds: options.maxRounds
    });
    if (!leaseStillOwned) {
      return buildSupersededResult(Math.max(round - 1, 0));
    }

    let claimedTask: MessageRecord | null;
    try {
      claimedTask =
        (await findClaimedMessageForContext(context, {
          types: HOST_EXECUTABLE_MESSAGE_TYPES
        })) ??
        (await client.claimNext(context.agentId, {
          types: HOST_EXECUTABLE_MESSAGE_TYPES,
          ...buildWaitChainAuth(context, "host")
        }));
    } catch (error: unknown) {
      if (isWaitChainControlError(error)) {
        return buildSupersededResult(round);
      }
      throw error;
    }

    lastPollAt = new Date().toISOString();
    backlog = await getInboxCountsForContext(context);

    if (claimedTask && !excludedIds.has(claimedTask.id)) {
      matchedRounds.push(round);
      lastClaimAt = lastPollAt;
      if (options.profile) {
        await recordWindowWaitHeartbeat({
          profile: options.profile,
          context,
          flow: "host",
          commandName: "await",
          status: "message_claimed",
          workflowStep: "message_received",
          automationState: "host_execute_local",
          turnDisposition: "silent_handoff",
          message: claimedTask,
          messageKind: "task",
          markClaimed: true,
          inboxCounts: backlog
        });
      }
      options.trace?.step("wait_claimed", {
        flow: "host-cycle",
        round,
        matched: true,
        messageId: claimedTask.id,
        messageKind: "task",
        backlog
      });
      const task = summarizeMessage(claimedTask);

      return {
        mode: "host-await-loop",
        matched: true,
        superseded: false,
        round,
        maxRounds: options.maxRounds,
        intervalSeconds: options.intervalSeconds,
        agentId: context.agentId,
        agentName: context.agentName,
        itemKind: "task",
        actionHint: "execute_locally",
        message: claimedTask,
        item: task,
        task,
        report: null,
        messageCount: 1,
        messages: [claimedTask],
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
    }

    let claimedReportResult: {
      message: MessageRecord | null;
      acknowledgedMessageIds: string[];
    };
    try {
      claimedReportResult =
        options.ackMatched &&
        !options.includeAcknowledged &&
        (!options.type || HOST_REPORT_MESSAGE_TYPES.includes(options.type))
          ? await claimOrReuseHostReport(context, {
              fromAgentId: expectedFromAgentId,
              correlationId: options.correlationId,
              type: options.type
            })
          : {
              message: null,
              acknowledgedMessageIds: []
            };
    } catch (error: unknown) {
      if (isWaitChainControlError(error)) {
        return buildSupersededResult(round);
      }
      throw error;
    }
    const matchedReport =
      claimedReportResult.message &&
      !excludedIds.has(claimedReportResult.message.id)
        ? claimedReportResult.message
        : null;

    if (!matchedReport) {
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
    }

    if (matchedReport) {
      excludedIds.add(matchedReport.id);
      acknowledgedMessageIds.push(...claimedReportResult.acknowledgedMessageIds);
      matchedRounds.push(round);
      lastClaimAt = lastPollAt;
      if (options.profile) {
        await recordWindowWaitHeartbeat({
          profile: options.profile,
          context,
          flow: "host",
          commandName: "await",
          status: "message_claimed",
          workflowStep: "message_received",
          automationState: "host_report_received",
          turnDisposition: "silent_handoff",
          message: matchedReport,
          messageKind: "report",
          markClaimed: true,
          inboxCounts: backlog
        });
      }
      options.trace?.step("wait_claimed", {
        flow: "host-cycle",
        round,
        matched: true,
        messageId: matchedReport.id,
        messageKind: "report",
        backlog
      });
      const report = summarizeMessage(matchedReport);

      return {
        mode: "host-await-loop",
        matched: true,
        superseded: false,
        round,
        maxRounds: options.maxRounds,
        intervalSeconds: options.intervalSeconds,
        agentId: context.agentId,
        agentName: context.agentName,
        itemKind: "report",
        actionHint: "review_report",
        message: matchedReport,
        item: report,
        task: null,
        report,
        messageCount: 1,
        messages: [matchedReport],
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
      result: options.result
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
      const pendingTasks = pendingInbox.filter(
        (message) =>
          message.toAgentId === targetMember.id &&
          HOST_EXECUTABLE_MESSAGE_TYPES.includes(message.type)
      );
      options.trace?.step("dispatch_queue_state", {
        toName: targetMember.agentName,
        pendingInboxCount: pendingInbox.length,
        claimedInboxCount: claimedInbox.length,
        pendingExecutableCount: pendingTasks.length
      });

      if (pendingTasks.length > 0) {
        payload = mergeCliDispatchPayloads(pendingTasks, basePayload);
        supersededMessageIds = pendingTasks.map((message) => message.id);
        resolvedCorrelationId =
          options.correlationId ?? pendingTasks[0]?.correlationId ?? undefined;
        dispatchMode = "merged";
      }
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

  throw new Error("task-dispatch 重试次数已耗尽。");
};

const prepareWindowDispatchTasks = async (options: {
  sessionName: string;
  rawTasks: WindowDispatchTaskSpec[];
}): Promise<PreparedWindowDispatchTask[]> => {
  if (options.rawTasks.length === 0) {
    throw new Error("至少需要一条派发任务。");
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
                dispatchResult.dispatchMode === "merged"
                  ? "message_merged"
                  : "message_sent",
                {
                  toWindow: preparedTask.targetWindowName,
                  correlationId: dispatchResult.correlationId,
                  dispatchMode: dispatchResult.dispatchMode,
                  supersededMessageIds: dispatchResult.supersededMessageIds
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

    if (locked.status !== "already_running") {
      const dispatchedResult = locked.value as Record<string, unknown>;
      const runtimeState = await updateWindowStateFromResult(
        profile,
        options.commandName,
        dispatchedResult
      );
      trace.step("runtime_state_updated", runtimeState);
      trace.finish({
        status: "dispatched",
        nextAction: "await"
      });

      await executeWindowWaitCommand({
        commandName: "await",
        displayCommandName: "await",
        waitAlias: "await",
        windowName: options.windowName,
        sessionName: options.sessionName,
        traceInput: {
          sessionName: options.sessionName,
          windowName: options.windowName,
          commandAlias: "await",
          originCommand: options.commandName
        },
        followContinuations: true,
        continuation: {
          continueOrigin: options.commandName
        }
      });
      return;
    }
    const rawResult = buildAlreadyRunningResult({
      mode: options.commandName,
      identity: profile.identity,
      flow: "host-cycle",
      existing: {
        pid: locked.lock.metadata?.pid ?? null,
        acquiredAt: locked.lock.metadata?.acquiredAt ?? null
      }
    });
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
      `未找到 messageId 为 "${options.messageId}" 的 host 任务。`
    );
  }

  const action =
    options.action === "failed" ||
    options.action === "delegated" ||
    options.action === "completed"
      ? options.action
      : null;

  if (!action) {
    throw new Error("action 仅支持 completed、failed、delegated。");
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
    const sdkError = error as LoopMarshalSdkError;
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
  .name("loopmarshal")
  .description("CLI for the local loopmarshal collaboration hub")
  .version("0.1.0");

program
  .command("attach")
  .description("Attach the current member to one collaboration session as host, worker, or knowledge_keeper")
  .argument("<name>", "Stable unique member name inside the session")
  .requiredOption("--session <sessionName>", "Explicit collaboration session name")
  .requiredOption("--role <role>", "host, worker, or knowledge_keeper")
  .requiredOption("--duty <roleDescription>", "Stable duty for this member")
  .action(
    async (
      name: string,
      options: {
        session: string;
        role: "host" | "worker" | "knowledge_keeper";
        duty: string;
      }
    ) => {
      try {
        if (options.role !== "host" && options.role !== "worker" && options.role !== "knowledge_keeper") {
          throw new Error('role 仅支持 "host"、"worker" 或 "knowledge_keeper"。');
        }

        const attached = await attachNamedMember({
          sessionName: options.session,
          name,
          role: options.role,
          duty: options.duty
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

      const result = {
        op: "SESSION_MEMBERS",
        sessionName: options.session,
        host: {
          name: profile.agentName,
          role: profile.role,
          duty: profile.roleDescription,
          identity: profile.identity
        },
        members: members.map((member) =>
          buildSessionMemberView(options.session, member)
        )
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
        followContinuations: true,
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
  .action(
    async (
      name: string,
      options: {
        session: string;
        task: string[];
      }
    ) => {
      await executeWindowHostDispatchCommand({
        commandName: "dispatch-many",
        traceCommandName: "dispatch-many",
        windowName: name,
        sessionName: options.session,
        rawTasks: options.task.map((task) => parseWindowDispatchTaskSpec(task))
      });
    }
  );

program
  .command("submit")
  .description("Submit one worker result by attached member name")
  .argument("<name>", "Stable unique worker member name inside the session")
  .requiredOption("--session <sessionName>", "Explicit collaboration session name")
  .requiredOption("--content <content>", "Result content text")
  .option("--result <result>", "Payload result marker")
  .option("--type <type>", `Message type: ${SUPPORTED_MESSAGE_TYPES.join(", ")}`)
  .option("--fail-reason <reason>", "Failure reason for the claimed message")
  .option("--mark-as <state>", "completed, failed, or contested", "completed")
  .action(
    async (
      name: string,
      options: {
        content: string;
        session: string;
        result?: string;
        type?: string;
        failReason?: string;
        markAs: "completed" | "failed" | "contested";
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
          name,
          "worker"
        );
        trace.step("binding_loaded", buildWindowProfileSummary(profile));
        const rememberedState = await readWindowRuntimeState(
          projectRoot,
          options.session,
          name
        );
        const claimedMessage =
          (rememberedState?.currentMessageId
            ? await findMessageForAgent(context, rememberedState.currentMessageId)
            : null) ??
          (await findClaimedMessageForContext(context));

        if (!claimedMessage) {
          throw new Error(
            `name="${name}" 当前没有已领取的 worker 任务，不能执行 submit。请先执行 loopmarshal await ${name} --session ${options.session}。`
          );
        }
        trace.step("binding_validated", {
          messageId: claimedMessage.id,
          correlationId: claimedMessage.correlationId ?? null
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
              "worker",
              {},
              async () =>
                submitWorkerResult(context, {
                  messageId: claimedMessage.id,
                  content: options.content,
                  result: options.result,
                  type: options.type
                    ? ensureMessageType(options.type)
                    : undefined,
                  failReason: options.failReason,
                  markAs: options.markAs
                }).then((submission) => ({
                  commandResultState: "completed" as const,
                  commandResultIsFinal: true,
                  ignoreIntermediateCommandStateText: true,
                  intermediateCommandStateTextIsNotAuthoritative: true,
                  runtimeTerminalProgressHints,
                  workflowModel: "message_loop" as const,
                  workflowContract: "wait_receive_process_report_wait" as const,
                  workflowRole: "worker" as const,
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
                  turnDisposition: "silent_continue" as const
                }))
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
  .description("Resolve one claimed host message by attached member name")
  .argument("<name>", "Stable unique host member name inside the session")
  .requiredOption("--session <sessionName>", "Explicit collaboration session name")
  .requiredOption("--summary <summary>", "Host-side processing summary")
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
        const rememberedState = await readWindowRuntimeState(
          projectRoot,
          options.session,
          name
        );
        const claimedMessage =
          (rememberedState?.currentMessageId
            ? await findMessageForAgent(context, rememberedState.currentMessageId)
            : null) ??
          (await findClaimedMessageForContext(context, {
            types: HOST_RESOLVABLE_MESSAGE_TYPES
          }));

        if (!claimedMessage) {
          throw new Error(
            `name="${name}" 当前没有已领取的 host 消息，不能执行 resolve。请先执行 loopmarshal await ${name} --session ${options.session}。`
          );
        }

        const locked = await withLocalLoopLock(
          projectRoot,
          {
            identity: profile.identity,
            flow: "host-cycle",
            takeover: true
          },
          async () =>
            withCliIdentityLease(context, "host", {}, async () =>
              resolveHostMessage(context, {
                messageId: claimedMessage.id,
                action: options.action,
                summary: options.summary,
                replyContent: options.replyContent,
                replyResult: options.replyResult,
                replyType: options.replyType
              }).then((resolution) => ({
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
                status: "resolved" as const,
                action: "resolve_completed" as const,
                identity: context.identity,
                agentId: context.agentId,
                agentName: context.agentName,
                resolved: resolution,
                turnDisposition: "silent_continue" as const
              }))
            )
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
            : buildExecuteInternalCommandResult(
                locked.value as Record<string, unknown>,
                {
                  commandArgs: ["await", name, "--session", options.session],
                  automationState: "host_resolve_handoff",
                  internalInstruction:
                    "Do not reply to the user. The current host message has already been resolved. Continue immediately by entering the host wait command."
                }
              );
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
        await requireLiveWindowContext(options.session, name);
        const parsed = options.ref
          ? parseKnowledgeRef(options.ref)
          : {
              level: ensureKnowledgeLevel(options.level),
              slug: options.slug ?? "",
              fragment: null
            };
        if (!parsed.slug) {
          throw new Error("必须提供 --ref，或同时提供 --level 与 --slug。");
        }

        const document = await client.getKnowledge(parsed.level, parsed.slug);
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
        await requireLiveWindowContext(options.session, name);
        const items = await client.listKnowledge({
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
  .command("upsert")
  .description("Create or update one knowledge document as host or knowledge_keeper")
  .argument("<name>", "Stable member name inside the session (host or knowledge_keeper)")
  .requiredOption("--session <sessionName>", "Explicit collaboration session name")
  .requiredOption("--level <level>", "Knowledge level: l1, l2, or l3")
  .requiredOption("--slug <slug>", "Knowledge slug")
  .requiredOption("--title <title>", "Knowledge title")
  .requiredOption("--content <content>", "Knowledge content")
  .option("--summary <summary>", "Knowledge summary")
  .option("--tags <tags>", "Comma-separated tags")
  .option("--change-summary <summary>", "Change summary")
  .option(
    "--source-kind <kind>",
    "Knowledge change source: host_update, user_feedback, worker_report, manual, or system"
  )
  .action(
    async (
      name: string,
      options: {
        session: string;
        level: string;
        slug: string;
        title: string;
        content: string;
        summary?: string;
        tags?: string;
        changeSummary?: string;
        sourceKind?: string;
      }
    ) => {
      try {
        const { profile, context } = await requireLiveWindowContext(
          options.session,
          name
        );
        ensureWindowRoleAny(profile, ["host", "knowledge_keeper"]);
        const document = await client.upsertKnowledge({
          level: ensureKnowledgeLevel(options.level),
          slug: options.slug,
          title: options.title,
          content: options.content,
          ...(options.summary !== undefined ? { summary: options.summary } : {}),
          tags: parseTagsOption(options.tags),
          ownerAgentId: context.agentId,
          sourceKind: ensureKnowledgeSourceKind(options.sourceKind),
          sourceAgentId: context.agentId,
          ...(options.changeSummary !== undefined
            ? { changeSummary: options.changeSummary }
            : {})
        });
        printJson({
          op: "KNOWLEDGE_UPSERTED",
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
  followContinuations?: boolean;
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

    if (profile.role === "worker") {
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
            "worker",
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
      trace.finish(response.debug);
    if (
        options.followContinuations &&
        getRuntimeStringField(rawResult as Record<string, unknown>, "resultType") === "execute_cmd" &&
        continuationState.canContinue
      ) {
        return executeWindowWaitCommand({
          ...options,
          waitAlias: continuationState.nextAlias,
          continuation: {
            continueSeq: continuationState.sequenceId,
            continueStep: String(continuationState.nextStep),
            continuePass: String(continuationState.nextPass),
            continueBudget: String(continuationState.totalSlices),
            continueOrigin: continuationState.originCommand
          }
        });
      }
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
    if (
      options.followContinuations &&
      getRuntimeStringField(rawResult as Record<string, unknown>, "resultType") === "execute_cmd" &&
      continuationState.canContinue
    ) {
      return executeWindowWaitCommand({
        ...options,
        waitAlias: continuationState.nextAlias,
        continuation: {
          continueSeq: continuationState.sequenceId,
          continueStep: String(continuationState.nextStep),
          continuePass: String(continuationState.nextPass),
          continueBudget: String(continuationState.totalSlices),
          continueOrigin: continuationState.originCommand
        }
      });
    }
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
  .description("Start the local loopmarshal core service and web dashboard")
  .action(async () => {
    const runtime = await loadRuntimeModule();
    const webDir = path.resolve(projectRoot, "apps", "web");
    const startWeb = fs.existsSync(path.join(webDir, "package.json"));

    console.log(
      JSON.stringify(
        {
          mode: "foreground",
          message: "Starting loopmarshal core in the foreground. Press Ctrl+C to stop.",
          dashboardUrl: runtime.getDashboardUrl(),
          webDashboardUrl: startWeb ? "http://localhost:5173" : null,
          webDir: startWeb ? webDir : null
        },
        null,
        2
      )
    );
    await runtime.runCoreForeground(projectRoot, startWeb ? webDir : undefined);
  });

program
  .command("stop")
  .description("Stop the local loopmarshal core service")
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
  .description("Show current loopmarshal service status")
  .action(async () => {
    const runtime = await loadRuntimeModule();
    const status = await runtime.getCoreStatus(projectRoot);
    const mcpServers = status.reachable
      ? await runtime.getRegisteredMcpServers(
          status.metadata?.host,
          status.metadata?.port
        )
      : [];
    console.log(
      JSON.stringify(
        {
          ...status,
          mcpServers,
          dashboardUrl: runtime.getDashboardUrl(status.metadata)
        },
        null,
        2
      )
    );
  });

const mcpCommand = program
  .command("mcp")
  .description("Manage LoopMarshal MCP integration");

mcpCommand
  .command("status")
  .description("Show status of MCP stdio servers connected to the core")
  .action(async () => {
    const runtime = await loadRuntimeModule();
    const status = await runtime.getCoreStatus(projectRoot);
    if (!status.reachable) {
      console.log(
        JSON.stringify(
          {
            error: "loopmarshal core is not running. Start it with 'loopmarshal start'."
          },
          null,
          2
        )
      );
      return;
    }
    const servers = await runtime.getRegisteredMcpServers(
      status.metadata?.host,
      status.metadata?.port
    );
    console.log(
      JSON.stringify(
        {
          core: {
            state: status.state,
            pid: status.metadata?.pid ?? null
          },
          mcpServers: servers,
          mcpServerCount: servers.length
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
  .description("Create the default .loopmarshal config for the current project")
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

mcpCommand
  .command("serve")
  .description("Start the loopmarshal MCP stdio server (for IDE MCP integration)")
  .action(async () => {
    // The MCP server module self-starts on import.
    await import("./mcp-stdio-server.js");
  });

await program.parseAsync();

