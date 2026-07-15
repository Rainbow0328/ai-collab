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
  MessageType,
  Progress,
  SessionConsole,
} from "@loopmarshal/protocol";

import type { KnowledgeService } from "./knowledge-service.js";
import type { MessageService } from "./message-service.js";
import type { ProgressService } from "./progress-service.js";
import type { SessionService } from "./session-service.js";

const OFFLINE_THRESHOLD_MS = 120_000;
const MAX_RECENT_MESSAGES = 50;
const MAX_TASK_THREADS = 100;
const MAX_BRIEF_TEXT_CHARS = 4_000;

const HOST_TASK_TYPES = new Set<MessageType>(["instruction", "task"]);
const WORKER_REPORT_TYPES = new Set<MessageType>(["result", "progress", "error"]);
const HIDDEN_RECENT_MESSAGE_TYPES = new Set<MessageType>(["heartbeat", "ack"]);

const truncate = (value: string): string => {
  if (value.length <= MAX_BRIEF_TEXT_CHARS) {
    return value;
  }

  return `${value.slice(0, MAX_BRIEF_TEXT_CHARS)}...`;
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

const summarizeMessage = (message: MessageRecord): ConsoleMessageBrief => {
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

  return {
    messageId: message.id,
    fromAgentId: message.fromAgentId,
    toAgentId: message.toAgentId ?? null,
    type: message.type,
    content: truncate(content),
    result: result ? truncate(result) : null,
    correlationId: message.correlationId ?? null,
    createdAt: message.createdAt,
  };
};

const isConsoleMemberRole = (role: Agent["role"]): role is ConsoleMemberRole => {
  return role === "host" || role === "worker" || role === "knowledge_keeper";
};

const isOffline = (agent: Agent, nowMs: number): boolean => {
  if (!agent.lastHeartbeatAt) {
    return true;
  }

  const lastHeartbeatMs = new Date(agent.lastHeartbeatAt).getTime();
  if (Number.isNaN(lastHeartbeatMs)) {
    return true;
  }

  return nowMs - lastHeartbeatMs > OFFLINE_THRESHOLD_MS;
};

export class SessionConsoleService {
  public constructor(
    private readonly sessionService: SessionService,
    private readonly messageService: MessageService,
    private readonly progressService: ProgressService,
    private readonly knowledgeService: KnowledgeService
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

    return {
      session,
      members: this.buildMembers(members, messages, queueStats, progressList),
      taskThreads: this.buildTaskThreads(members, messages),
      recentMessages: messages
        .filter((message) => !HIDDEN_RECENT_MESSAGE_TYPES.has(message.type))
        .slice(0, MAX_RECENT_MESSAGES)
        .map(summarizeMessage),
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
        currentTask: currentTask ? summarizeMessage(currentTask) : null,
        latestReport: latestReport ? summarizeMessage(latestReport) : null,
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
    if (isOffline(member, input.nowMs)) {
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
        if (member.role === "worker" || member.role === "knowledge_keeper") {
          return HOST_TASK_TYPES.has(message.type);
        }
        return WORKER_REPORT_TYPES.has(message.type) || HOST_TASK_TYPES.has(message.type);
      }) ?? null
    );
  }

  private findLatestReport(member: Agent, messages: MessageRecord[]): MessageRecord | null {
    return (
      messages.find(
        (message) =>
          message.fromAgentId === member.id &&
          WORKER_REPORT_TYPES.has(message.type)
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
        .filter((member) => member.role === "worker" || member.role === "knowledge_keeper")
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
        HOST_TASK_TYPES.has(message.type)
    );
    const reportMessages = chronologicalMessages.filter(
      (message) =>
        workerById.has(message.fromAgentId) &&
        (!message.toAgentId || hostIds.has(message.toAgentId)) &&
        WORKER_REPORT_TYPES.has(message.type)
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
          hostMessage: summarizeMessage(hostMessage),
          workerReport: workerReport ? summarizeMessage(workerReport) : null,
          status: this.resolveTaskThreadStatus(hostMessage, workerReport),
        };
      })
      .sort((left, right) =>
        right.hostMessage.createdAt.localeCompare(left.hostMessage.createdAt)
      )
      .slice(0, MAX_TASK_THREADS);
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
}
