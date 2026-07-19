/**
 * Agent 上下文类型定义。
 *
 * 四层上下文模型：
 * - C0 当前事件：当前用户输入 / Worker 回报 / 知识维护任务
 * - C1 短期上下文：最近 4～8 个有效交互（不含过期工具调用过程）
 * - C2 会话快照：项目目标、已确认架构、决策、约束、当前计划、完成/待完成/阻塞
 * - C3 按需长期上下文：相关知识片段、用户偏好、角色职责
 *
 * 最终模型输入顺序：
 *   System Prompt
 *   Role Configuration
 *   Session Snapshot
 *   Conversation Summary
 *   Relevant Knowledge
 *   Recent Turns
 *   Current Event
 */

// ============================================
// 上下文单条交互记录
// ============================================

export type ContextTurnRole = "user" | "assistant" | "tool" | "system";

export type ContextTurn = {
  role: ContextTurnRole;
  content: string;
  /** 该交互所属的 messageId（可选，用于追溯） */
  messageId?: string;
  /** 该交互的 timestamp（ISO 8601） */
  timestamp?: string;
  /** 是否是重要交互（用户确认决策、架构变更等不应被裁剪） */
  important?: boolean;
};

// ============================================
// 角色上下文快照（持久化到 agent_context_snapshots 表）
// ============================================

export type AgentContextSnapshot = {
  runtimeId: string;
  sessionId: string;
  agentId: string;
  role: string;

  /** 滚动摘要：前序对话的结构化总结 */
  conversationSummary: string | null;

  /** 最近 4～8 轮有效交互 */
  recentTurns: ContextTurn[];

  /** 已确认的决策（用户明确同意或 Host 确定的） */
  confirmedDecisions: string[];

  /** 未解决的问题（需要后续处理或用户回答的） */
  unresolvedQuestions: string[];

  /** 待执行操作 */
  pendingActions: string[];

  /** 最后处理的消息 ID */
  lastProcessedMessageId: string | null;

  /** 摘要版本号（每次摘要更新递增） */
  summaryRevision: number;

  updatedAt: string;
};

export type UpdateAgentContextSnapshotInput = {
  runtimeId: string;
  sessionId: string;
  agentId: string;
  role: string;
  conversationSummary?: string | null;
  recentTurns?: ContextTurn[];
  confirmedDecisions?: string[];
  unresolvedQuestions?: string[];
  pendingActions?: string[];
  lastProcessedMessageId?: string | null;
  summaryRevision?: number;
};

// ============================================
// 知识片段（按需加载的长期上下文 C3）
// ============================================

export type KnowledgeSnippet = {
  ref: string;
  title: string;
  summary: string | null;
  content: string;
};

// ============================================
// 四层上下文信封（每次 LLM 调用前组装）
// ============================================

export type AgentContextEnvelope = {
  /** C0 当前事件 */
  currentEvent: string;

  /** C1 短期上下文：最近交互 */
  recentTurns: ContextTurn[];

  /** C2 会话快照 */
  sessionSnapshot: {
    objective: string | null;
    activePlanSummary: string | null;
    confirmedDecisions: string[];
    constraints: string[];
    acceptanceCriteria: string[];
    completedItems: string[];
    pendingItems: string[];
    blockers: string[];
    unresolvedQuestions: string[];
    conversationSummary: string | null;
  };

  /** C3 按需长期上下文 */
  relevantKnowledge: KnowledgeSnippet[];
  userPreferences: string[];
  roleConfiguration: string;

  /** token 预算信息 */
  tokenBudget: {
    contextWindowTokens: number;
    maxOutputTokens: number;
    inputBudget: number;
  };
};

// ============================================
// token 预算配置
// ============================================

export type TokenBudgetConfig = {
  contextWindowTokens: number;
  maxOutputTokens: number;
  contextReserveTokens: number;
};

/**
 * 计算输入 token 预算。
 * inputBudget = contextWindowTokens - maxOutputTokens - contextReserveTokens
 */
export function computeInputBudget(config: TokenBudgetConfig): number {
  return Math.max(
    0,
    config.contextWindowTokens - config.maxOutputTokens - config.contextReserveTokens
  );
}

/**
 * 预算分配比例。
 * 总 inputBudget 按以下比例分配给各层上下文。
 */
export const BUDGET_RATIOS = {
  systemRoleTools: 0.15,
  sessionSnapshotAndSummary: 0.25,
  relevantKnowledge: 0.25,
  recentTurns: 0.15,
  currentEvent: 0.20,
} as const;

/**
 * 裁剪优先级（数字越小越先被裁掉）。
 */
export const TRIM_PRIORITY = {
  oldToolResults: 1,
  lowRelevanceKnowledge: 2,
  mergeOldTurnsIntoSummary: 3,
  keepRecentTurns: 4,
  neverTrim: 5, // 当前事件、已确认约束、待解决问题
} as const;
