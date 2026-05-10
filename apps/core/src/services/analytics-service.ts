import type { AgentAnalytics, MessageTrace, SessionTimeline } from "@ai-collab/protocol";
import type { AgentRepository, MessageRepository, MessageTraceRepository } from "@ai-collab/store";

export class AnalyticsService {
  public constructor(
    private readonly traceRepo: MessageTraceRepository,
    private readonly messageRepo: MessageRepository,
    private readonly agentRepo: AgentRepository
  ) {}

  public buildSessionTimeline(sessionId: string, sessionName: string): SessionTimeline {
    const traces = this.traceRepo.listBySessionId(sessionId);
    const agentAnalytics = this.computeAgentAnalytics(sessionId, traces);
    return { sessionId, sessionName, traces, agentAnalytics };
  }

  private computeAgentAnalytics(
    sessionId: string,
    traces: MessageTrace[]
  ): AgentAnalytics[] {
    const agents = this.agentRepo.listBySessionId(sessionId);
    const messages = this.messageRepo.listBySessionId(sessionId);

    return agents.map((agent) => {
      const agentTraces = traces.filter((t) => t.agentId === agent.id);
      const agentMessages = messages.filter(
        (m) => m.fromAgentId === agent.id || m.toAgentId === agent.id
      );

      const dispatched = agentMessages.filter(
        (m) => m.fromAgentId === agent.id && m.type === "task"
      );
      const completed = agentMessages.filter(
        (m) => m.type === "task" && m.processingStatus === "processed"
      );
      const failed = agentMessages.filter(
        (m) => m.type === "task" && m.processingStatus === "failed"
      );

      let avgProcessingSeconds: number | null = null;
      const processTimes: number[] = [];
      for (const msg of agentMessages) {
        if (msg.processedAt && msg.claimedAt) {
          const duration =
            (new Date(msg.processedAt).getTime() -
              new Date(msg.claimedAt).getTime()) /
            1000;
          if (duration > 0) processTimes.push(duration);
        }
      }
      if (processTimes.length > 0) {
        avgProcessingSeconds =
          processTimes.reduce((a, b) => a + b, 0) / processTimes.length;
      }

      const lastTrace = agentTraces.length > 0
        ? agentTraces[agentTraces.length - 1]
        : null;

      return {
        agentId: agent.id,
        agentName: agent.agentName,
        role: agent.role,
        totalDispatched: dispatched.length,
        totalCompleted: completed.length,
        totalFailed: failed.length,
        avgProcessingSeconds,
        lastActiveAt: lastTrace?.createdAt ?? null,
        status: agent.status
      };
    });
  }
}
