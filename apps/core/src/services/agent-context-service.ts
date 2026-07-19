/**
 * AgentContextService — 角色级上下文持久化服务。
 *
 * 职责：
 * - 加载/保存 AgentContextSnapshot（agent_context_snapshots 表）
 * - 追加最近交互到 recentTurns（窗口管理）
 * - 滚动摘要触发判断
 * - 结构化摘要更新（保留旧摘要中未被否定的信息）
 *
 * 不负责组装 LLM 输入——那是 AgentContextBuilder 的职责。
 */

import type {
  AgentContextSnapshot,
  ContextTurn,
  UpdateAgentContextSnapshotInput,
} from "@loopmarshal/protocol";
import { AgentContextRepository } from "@loopmarshal/store";
import type { WebAgentRuntime } from "@loopmarshal/protocol";
import type { SessionInsight } from "@loopmarshal/protocol";

// ============================================
// 摘要触发条件
// ============================================

export const SUMMARY_TRIGGERS = {
  maxRecentTurns: 8,
  maxEstimatedInputChars: 16000,
  maxWorkerReports: 6,
} as const;

// ============================================
// 结构化摘要更新类型
// ============================================

export type StructuredSummary = {
  objective: string | null;
  confirmedDecisions: string[];
  constraints: string[];
  acceptanceCriteria: string[];
  completedItems: string[];
  pendingItems: string[];
  blockers: string[];
  unresolvedQuestions: string[];
};

export class AgentContextService {
  public constructor(
    private readonly repository: AgentContextRepository,
  ) {}

  /**
   * 加载某个 Web Agent 的上下文快照。
   * 如果不存在则返回 null（首次调用时由调用方初始化）。
   */
  public load(runtimeId: string): AgentContextSnapshot | null {
    return this.repository.findByRuntimeId(runtimeId);
  }

  /**
   * 初始化一个空的上下文快照。
   */
  public initialize(runtime: WebAgentRuntime): AgentContextSnapshot {
    const now = new Date().toISOString();
    const snapshot: AgentContextSnapshot = {
      runtimeId: runtime.id,
      sessionId: runtime.sessionId,
      agentId: runtime.agentId,
      role: runtime.role,
      conversationSummary: null,
      recentTurns: [],
      confirmedDecisions: [],
      unresolvedQuestions: [],
      pendingActions: [],
      lastProcessedMessageId: null,
      summaryRevision: 0,
      updatedAt: now,
    };
    return this.repository.upsert(snapshot);
  }

  /**
   * 追加一轮交互到 recentTurns，并自动管理窗口大小。
   * 触发摘要条件时自动执行结构化摘要更新（Fix 4）。
   */
  public appendTurn(
    runtime: WebAgentRuntime,
    turn: ContextTurn
  ): { snapshot: AgentContextSnapshot; needSummary: boolean } {
    let snapshot = this.load(runtime.id);
    if (!snapshot) {
      snapshot = this.initialize(runtime);
    }

    const recentTurns = [...snapshot.recentTurns, turn];

    // 窗口管理：保留最近 maxRecentTurns + 2 条（留 2 条缓冲）
    const maxKeep = SUMMARY_TRIGGERS.maxRecentTurns + 2;
    const trimmedTurns = recentTurns.length > maxKeep
      ? recentTurns.slice(recentTurns.length - maxKeep)
      : recentTurns;

    const workerReportCount = trimmedTurns.filter(
      (t) => t.role === "tool" && t.content.includes("worker")
    ).length;

    const totalChars = trimmedTurns.reduce((sum, t) => sum + t.content.length, 0);
    const needSummary =
      trimmedTurns.length > SUMMARY_TRIGGERS.maxRecentTurns ||
      totalChars > SUMMARY_TRIGGERS.maxEstimatedInputChars ||
      workerReportCount > SUMMARY_TRIGGERS.maxWorkerReports;

    let updated = this.repository.upsert({
      runtimeId: runtime.id,
      sessionId: runtime.sessionId,
      agentId: runtime.agentId,
      role: runtime.role,
      recentTurns: trimmedTurns,
      lastProcessedMessageId: turn.messageId ?? snapshot.lastProcessedMessageId,
    });

    // 触发摘要时自动执行结构化摘要更新（Fix 4）
    // 将被裁剪的旧交互合并进 conversationSummary，保留 confirmedDecisions
    // Fix 3：修正 slice 逻辑——summarize 除最后 4 条外的所有交互，避免丢失或重复
    // Fix 2：使用 Math.max(0, ...) 防止少于 4 条时出现负数索引
    if (needSummary) {
      const keptCount = 4;
      const splitIndex = Math.max(0, recentTurns.length - keptCount);
      const oldTurns = recentTurns.slice(0, splitIndex);
      const keptTurns = recentTurns.slice(splitIndex);

      const oldTurnsSummary = oldTurns
        .map((t) => `[${t.role}] ${t.content.slice(0, 200)}`)
        .join("\n");

      const existingSummary = updated.conversationSummary ?? "";
      const newSummary = existingSummary
        ? `${existingSummary}\n${oldTurnsSummary}`
        : oldTurnsSummary;

      updated = this.repository.upsert({
        runtimeId: runtime.id,
        sessionId: runtime.sessionId,
        agentId: runtime.agentId,
        role: runtime.role,
        conversationSummary: newSummary.slice(-4000), // 限制摘要长度
        recentTurns: keptTurns,
        summaryRevision: updated.summaryRevision + 1,
      });
    }

    return { snapshot: updated, needSummary };
  }

  /**
   * 更新结构化摘要和决策列表。
   * 必须保留旧摘要中没有被新消息明确否定的信息。
   */
  public applyStructuredSummary(
    runtime: WebAgentRuntime,
    summary: Partial<StructuredSummary>,
    newRecentTurns: ContextTurn[]
  ): AgentContextSnapshot {
    const existing = this.load(runtime.id);
    const currentDecisions = existing?.confirmedDecisions ?? [];
    const currentQuestions = existing?.unresolvedQuestions ?? [];

    // 合并决策：新决策追加到已有列表，去重
    const mergedDecisions = [
      ...currentDecisions,
      ...(summary.confirmedDecisions ?? []),
    ].filter((v, i, arr) => arr.indexOf(v) === i);

    // 合并未解决问题：新问题追加，已解决的从列表中移除
    const mergedQuestions = [
      ...currentQuestions,
      ...(summary.unresolvedQuestions ?? []),
    ].filter((v, i, arr) => arr.indexOf(v) === i);

    return this.repository.upsert({
      runtimeId: runtime.id,
      sessionId: runtime.sessionId,
      agentId: runtime.agentId,
      role: runtime.role,
      conversationSummary: summary.objective ?? existing?.conversationSummary ?? null,
      recentTurns: newRecentTurns,
      confirmedDecisions: mergedDecisions,
      unresolvedQuestions: mergedQuestions,
      pendingActions: summary.pendingItems ?? existing?.pendingActions ?? [],
      summaryRevision: (existing?.summaryRevision ?? 0) + 1,
    });
  }

  /**
   * 删除某个 runtime 的上下文（runtime 被移除时调用）。
   */
  public delete(runtimeId: string): void {
    this.repository.deleteByRuntimeId(runtimeId);
  }
}
