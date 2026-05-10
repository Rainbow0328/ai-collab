import type {
  Agent,
  AgentQueueStats,
  ConsoleMember,
  ConsoleMemberRole,
  ConsoleMemberStatus,
  ConsoleMessageBrief,
  ConsoleTaskThread,
  ConsoleTaskThreadStatus,
  MessageRecord,
  Progress,
  SessionConsole,
  SessionIdleInfo,
} from "@ai-collab/protocol";

import {
  HOST_TASK_TYPES,
  WORKER_REPORT_TYPES,
  HIDDEN_RECENT_MESSAGE_TYPES,
} from "@ai-collab/protocol";

import type { ConsoleConfig } from "@ai-collab/shared";
import type { KnowledgeService } from "./knowledge-service.js";
import type { MessageService } from "./message-service.js";
import type { ProgressService } from "./progress-service.js";
import type { SessionService } from "./session-service.js";

const hostTaskTypes = new Set(HOST_TASK_TYPES);
const workerReportTypes = new Set(WORKER_REPORT_TYPES);
const hiddenRecentMessageTypes = new Set(HIDDEN_RECENT_MESSAGE_TYPES);

const truncate = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const stringifyPayload = (payload: unknown): string => {
  if (typeof payload === "string") {
    return payload;
  }
  if (payload === null || payload === undefined) {
    return "";
  }

  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
};

const firstStringField = (
  payload: unknown,
  keys: string[]
): string | null => {
  const record = asRecord(payload);
  if (!record) {
    return typeof payload === "string" ? payload : null;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return null;
};

const summarizeMessage = (message: MessageRecord, maxBriefTextChars: number): ConsoleMessageBrief => {
  const content =
    firstStringField(message.payload, [
      "content",
      "message",
      "summary",
      "title",
      "description",
      "text",
    ]) ?? stringifyPayload(message.payload);
  const result =
    firstStringField(message.payload, [
      "result",
      "status",
      "reason",
      "error",
    ]) ?? message.failureReason ?? null;

  const payloadRecord = asRecord(message.payload);
  const kind = payloadRecord?.["kind"] ?? null;
  const source = payloadRecord?.["source"] ?? null;
  const level = payloadRecord?.["level"] ?? null;
  const slug = payloadRecord?.["slug"] ?? null;

  return {
    messageId: message.id,
    fromAgentId: message.fromAgentId,
    toAgentId: message.toAgentId ?? null,
    type: message.type,
    content: truncate(content, maxBriefTextChars),
    result: result ? truncate(result, maxBriefTextChars) : null,
    correlationId: message.correlationId ?? null,
    createdAt: message.createdAt,
    kind: typeof kind === "string" ? kind : null,
    source: typeof source === "string" ? source : null,
    level: typeof level === "string" ? level : null,
    slug: typeof slug === "string" ? slug : null,
  };
};

const isConsoleMemberRole = (role: Agent["role"]): role is ConsoleMemberRole => {
  return role === "host" || role === "worker";
};

const isOffline = (agent: Agent, nowMs: number, offlineThresholdSeconds: number): boolean => {
  if (!agent.lastHeartbeatAt) {
    return true;
  }

  const lastHeartbeatMs = new Date(agent.lastHeartbeatAt).getTime();
  if (Number.isNaN(lastHeartbeatMs)) {
    return true;
  }

  return nowMs - lastHeartbeatMs > offlineThresholdSeconds * 1000;
};

export class SessionConsoleService {
  public constructor(
    private readonly sessionService: SessionService,
    private readonly messageService: MessageService,
    private readonly progressService: ProgressService,
    private readonly knowledgeService: KnowledgeService,
    private readonly consoleConfig: ConsoleConfig
  ) {}

  public getSessionConsole(sessionId: string): SessionConsole {
    const session = this.sessionService.getSession(sessionId);
    const members = this.sessionService
      .listMembers(sessionId)
      .filter((member): member is Agent & { role: ConsoleMemberRole } =>
        isConsoleMemberRole(member.role)
      );
    const messages = this.messageService.listMessagesBySession(sessionId);
    const queueStats = this.messageService.getSessionQueueStats(sessionId);
    const progressList = this.progressService.list({ sessionId });
    const knowledgeSnapshot = this.knowledgeService.snapshot();

    const consoleMembers = this.buildMembers(members, messages, queueStats, progressList);
    const consoleTaskThreads = this.buildTaskThreads(members, messages);

    const agentMap = new Map(members.map((m) => [m.id, m]));

    const recentMessages: ConsoleMessageBrief[] = messages
      .filter((message) => !hiddenRecentMessageTypes.has(message.type))
      .slice(0, this.consoleConfig.maxRecentMessages)
      .map((msg) => {
        const brief = summarizeMessage(msg, this.consoleConfig.maxBriefTextChars);
        const fromAgent = agentMap.get(msg.fromAgentId);
        const toAgent = msg.toAgentId ? agentMap.get(msg.toAgentId) : null;
        if (fromAgent) {
          brief.fromAgentName = fromAgent.displayName ?? fromAgent.agentName;
          brief.fromRole = fromAgent.role;
        }
        if (toAgent) {
          brief.toAgentName = toAgent.displayName ?? toAgent.agentName;
          brief.toRole = toAgent.role;
        }
        return brief;
      });

    return {
      session,
      members: consoleMembers,
      taskThreads: consoleTaskThreads,
      recentMessages,
      knowledgeSummary: {
        counts: knowledgeSnapshot.manifest.counts,
        recentChanges: this.knowledgeService.listChanges({ limit: 10 }).map((change) => ({
          level: change.level,
          slug: change.slug,
          kind: change.kind,
          sourceKind: change.sourceKind,
          summary: change.summary,
          createdAt: change.createdAt,
        })),
      },
      idleInfo: this.buildIdleInfo(consoleMembers, messages),
      generatedAt: new Date().toISOString(),
    };
  }

  private buildMembers(
    members: Array<Agent & { role: ConsoleMemberRole }>,
    messages: MessageRecord[],
    queueStats: AgentQueueStats[],
    progressList: Progress[]
  ): ConsoleMember[] {
    const nowMs = Date.now();
    const queueStatsByAgent = new Map(
      queueStats.map((stats) => [stats.agentId, stats])
    );
    const progressByAgent = new Map(
      progressList.map((progress) => [progress.agentId, progress])
    );

    return members.map((member) => {
      const stats = queueStatsByAgent.get(member.id);
      const currentProgress = progressByAgent.get(member.id) ?? null;
      const currentTask = this.findCurrentTask(member, messages);
      const latestReport = this.findLatestReport(member, messages);
      const status = this.resolveMemberStatus(member, {
        claimedCount: stats?.claimed ?? 0,
        currentTask,
        currentProgress,
        nowMs,
      });

      return {
        agentId: member.id,
        agentName: member.agentName,
        displayName: member.displayName,
        role: member.role,
        duty: member.roleDescription,
        status,
        lastHeartbeatAt: member.lastHeartbeatAt ?? null,
        currentTask: currentTask ? summarizeMessage(currentTask, this.consoleConfig.maxBriefTextChars) : null,
        latestReport: latestReport ? summarizeMessage(latestReport, this.consoleConfig.maxBriefTextChars) : null,
        currentProgress,
        pendingCount: stats?.pending ?? 0,
        claimedCount: stats?.claimed ?? 0,
      };
    });
  }

  private resolveMemberStatus(
    member: Agent,
    input: {
      claimedCount: number;
      currentTask: MessageRecord | null;
      currentProgress: Progress | null;
      nowMs: number;
    }
  ): ConsoleMemberStatus {
    if (isOffline(member, input.nowMs, this.consoleConfig.offlineThresholdSeconds)) {
      return "offline";
    }

    if (
      input.claimedCount > 0 ||
      input.currentTask !== null ||
      input.currentProgress?.status === "in_progress"
    ) {
      return "working";
    }

    return "waiting";
  }

  private findCurrentTask(member: Agent, messages: MessageRecord[]): MessageRecord | null {
    return (
      messages.find((message) => {
        if (message.processingStatus !== "claimed") {
          return false;
        }
        if (message.claimedByAgentId !== member.id) {
          return false;
        }
        if (member.role === "worker") {
          return hostTaskTypes.has(message.type);
        }
        return workerReportTypes.has(message.type) || hostTaskTypes.has(message.type);
      }) ?? null
    );
  }

  private findLatestReport(member: Agent, messages: MessageRecord[]): MessageRecord | null {
    return (
      messages.find(
        (message) =>
          message.fromAgentId === member.id &&
          workerReportTypes.has(message.type)
      ) ?? null
    );
  }

  private buildTaskThreads(
    members: Array<Agent & { role: ConsoleMemberRole }>,
    messages: MessageRecord[]
  ): ConsoleTaskThread[] {
    const hostIds = new Set(
      members.filter((member) => member.role === "host").map((member) => member.id)
    );
    const workerById = new Map(
      members
        .filter((member) => member.role === "worker")
        .map((member) => [member.id, member])
    );
    const chronologicalMessages = messages
      .slice()
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    const hostTaskMessages = chronologicalMessages.filter(
      (message) =>
        hostIds.has(message.fromAgentId) &&
        !!message.toAgentId &&
        workerById.has(message.toAgentId) &&
        hostTaskTypes.has(message.type)
    );
    const reportMessages = chronologicalMessages.filter(
      (message) =>
        workerById.has(message.fromAgentId) &&
        (!message.toAgentId || hostIds.has(message.toAgentId)) &&
        workerReportTypes.has(message.type)
    );
    const usedReportIds = new Set<string>();

    return hostTaskMessages
      .map((hostMessage) => {
        const workerId = hostMessage.toAgentId ?? null;
        const worker = workerId ? workerById.get(workerId) ?? null : null;
        const workerReport = this.findThreadReport(
          hostMessage,
          reportMessages,
          usedReportIds
        );
        if (workerReport) {
          usedReportIds.add(workerReport.id);
        }

        return {
          correlationId: hostMessage.correlationId ?? workerReport?.correlationId ?? null,
          workerAgentId: workerId,
          workerName: worker?.agentName ?? null,
          hostMessage: summarizeMessage(hostMessage, this.consoleConfig.maxBriefTextChars),
          workerReport: workerReport ? summarizeMessage(workerReport, this.consoleConfig.maxBriefTextChars) : null,
          status: this.resolveTaskThreadStatus(hostMessage, workerReport),
        };
      })
      .sort((left, right) =>
        right.hostMessage.createdAt.localeCompare(left.hostMessage.createdAt)
      )
      .slice(0, this.consoleConfig.maxTaskThreads);
  }

  private findThreadReport(
    hostMessage: MessageRecord,
    reportMessages: MessageRecord[],
    usedReportIds: Set<string>
  ): MessageRecord | null {
    const workerId = hostMessage.toAgentId;
    if (!workerId) {
      return null;
    }

    const correlatedReports = reportMessages
      .filter(
        (report) =>
          !usedReportIds.has(report.id) &&
          report.fromAgentId === workerId &&
          !!hostMessage.correlationId &&
          report.correlationId === hostMessage.correlationId &&
          report.createdAt >= hostMessage.createdAt
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    if (correlatedReports[0]) {
      return correlatedReports[0];
    }

    return (
      reportMessages.find(
        (report) =>
          !usedReportIds.has(report.id) &&
          report.fromAgentId === workerId &&
          report.createdAt >= hostMessage.createdAt
      ) ?? null
    );
  }

  private resolveTaskThreadStatus(
    hostMessage: MessageRecord,
    workerReport: MessageRecord | null
  ): ConsoleTaskThreadStatus {
    if (
      hostMessage.processingStatus === "failed" ||
      hostMessage.deliveryStatus === "delivery_failed" ||
      workerReport?.type === "error" ||
      workerReport?.processingStatus === "failed"
    ) {
      return "failed";
    }
    if (workerReport) {
      return "reported";
    }
    if (hostMessage.processingStatus === "claimed") {
      return "working";
    }
    return "pending";
  }

  private buildIdleInfo(
    members: ConsoleMember[],
    messages: MessageRecord[]
  ): SessionIdleInfo {
    const workers = members.filter((m) => m.role === "worker");
    const allWorkersWaiting = workers.length > 0 && workers.every((w) => w.status === "waiting");

    const pendingMessageCount = messages.filter(
      (m) => m.processingStatus === "pending"
    ).length;
    const claimedMessageCount = messages.filter(
      (m) => m.processingStatus === "claimed"
    ).length;

    const latestWorkerReports = workers
      .filter((w) => w.latestReport !== null)
      .map((w) => w.latestReport!)
      .slice(0, 5);

    let suggestedHostAction = "none";
    if (allWorkersWaiting && pendingMessageCount === 0 && claimedMessageCount === 0) {
      suggestedHostAction = "all_idle";
    } else if (allWorkersWaiting && pendingMessageCount > 0) {
      suggestedHostAction = "dispatch_pending";
    } else if (allWorkersWaiting && claimedMessageCount > 0) {
      suggestedHostAction = "check_claimed";
    } else if (workers.some((w) => w.status === "working")) {
      suggestedHostAction = "await_workers";
    }

    return {
      allWorkersWaiting,
      pendingMessageCount,
      claimedMessageCount,
      latestWorkerReports,
      suggestedHostAction,
    };
  }
}
