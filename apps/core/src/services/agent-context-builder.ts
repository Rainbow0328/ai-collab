/**
 * AgentContextBuilder — 四层上下文组装器。
 *
 * 每次 Host/Keeper 调用模型前，生成 AgentContextEnvelope：
 *
 *   System Prompt       → 角色职责 + 工具说明
 *   Session Snapshot    → C2 项目目标、已确认架构、决策、约束、计划
 *   Conversation Summary → C1 滚动摘要
 *   Relevant Knowledge  → C3 按需加载的知识片段
 *   Recent Turns        → C1 最近 4～8 轮交互
 *   Current Event       → C0 当前用户输入 / Worker 回报 / 维护任务
 *
 * Token 预算裁剪：
 *   inputBudget = contextWindowTokens - maxOutputTokens - contextReserveTokens
 *   按 BUDGET_RATIOS 分配给各层，超限时按 TRIM_PRIORITY 裁剪。
 *   裁剪后的数据写入 envelope，渲染时使用裁剪后数据。
 */

import type {
  AgentContextEnvelope,
  AgentContextSnapshot,
  ContextTurn,
  KnowledgeSnippet,
  TokenBudgetConfig,
  WebAgentRuntime,
} from "@loopmarshal/protocol";
import { BUDGET_RATIOS, computeInputBudget } from "@loopmarshal/protocol";
import type { SessionInsight, KnowledgeLevel } from "@loopmarshal/protocol";
import type { ServerServices } from "../server/create-server.js";

// ============================================
// token 估算
// 非 ASCII 字符（中文、日文等）更保守：1 字符 ≈ 1 token
// ASCII 字符：4 字符 ≈ 1 token
// ============================================

export function estimateTokens(text: string): number {
  let asciiChars = 0;
  let nonAsciiChars = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) <= 127) {
      asciiChars++;
    } else {
      nonAsciiChars++;
    }
  }
  return Math.ceil(asciiChars / 4 + nonAsciiChars);
}

// ============================================
// 预算分配计算
// ============================================

export type LayerBudgets = {
  systemRoleTools: number;
  sessionSnapshotAndSummary: number;
  relevantKnowledge: number;
  recentTurns: number;
  currentEvent: number;
};

export function computeLayerBudgets(inputBudget: number): LayerBudgets {
  return {
    systemRoleTools: Math.floor(inputBudget * BUDGET_RATIOS.systemRoleTools),
    sessionSnapshotAndSummary: Math.floor(inputBudget * BUDGET_RATIOS.sessionSnapshotAndSummary),
    relevantKnowledge: Math.floor(inputBudget * BUDGET_RATIOS.relevantKnowledge),
    recentTurns: Math.floor(inputBudget * BUDGET_RATIOS.recentTurns),
    currentEvent: Math.floor(inputBudget * BUDGET_RATIOS.currentEvent),
  };
}

// ============================================
// 从模型配置加载 token 预算
// ============================================

function loadTokenBudgetConfig(services: ServerServices, modelConfigId: string): TokenBudgetConfig {
  try {
    const model = services.modelConfigService.getFull(modelConfigId);
    return {
      contextWindowTokens: model.contextWindowTokens ?? 128000,
      maxOutputTokens: model.maxOutputTokens ?? 4096,
      contextReserveTokens: model.contextReserveTokens ?? 1000,
    };
  } catch {
    return {
      contextWindowTokens: 128000,
      maxOutputTokens: 4096,
      contextReserveTokens: 1000,
    };
  }
}

// ============================================
// 角色配置构建
// ============================================

const HOST_ROLE_PROMPT = `You are the session Host running on the core server. Continue working even if the browser is closed.

Your workflow is enforced by code — you cannot skip steps:
1. Receive user input. Determine whether the user has confirmed the architecture and is ready to start work.
2. If not confirmed: communicate with the user to refine requirements and architecture. End this turn and wait for the next user message.
3. If confirmed: design the architecture plan (L1 direction, L2 modules, L3 contracts).
4. Check if a Knowledge Keeper exists in the session.
5. If Keeper exists: dispatch knowledge maintenance task to Keeper. After Keeper reports back, review the knowledge base.
6. If Keeper does NOT exist: maintain knowledge base yourself. You do NOT need to review your own output — skip the review step.
7. Dispatch implementation tasks to workers.

You are the architect and final arbiter.`;

const KEEPER_ROLE_PROMPT = `You are the Knowledge Keeper running on the core server. Continue working even if the browser is closed.

Your workflow is enforced by code — you cannot skip steps:
1. Understand the Host's architecture intent from the received task
2. Plan which L1/L2/L3 knowledge documents to create or update
3. Execute knowledge_update for each planned document
4. Self-check: verify the written knowledge matches the architecture intent
5. Report back to Host: refs, summaries, uncertainties, conflicts

You do NOT make architecture decisions. You only sediment the Host's architecture intent into the knowledge base.
You do NOT dispatch implementation tasks. That is the Host's responsibility.`;

function buildRoleConfiguration(
  runtime: WebAgentRuntime,
  tools: { name: string; description: string }[],
  skillContents: string | null
): string {
  const basePrompt = runtime.role === "host" ? HOST_ROLE_PROMPT : KEEPER_ROLE_PROMPT;
  const parts = [
    basePrompt,
    `# Identity\nYour role is ${runtime.role}.`,
    "# Runtime\nYou are running on the core server. Continue working even if the browser is closed.",
  ];
  if (runtime.customDuty) {
    parts.push(`# Custom Duty\n${runtime.customDuty}`);
  }
  // 注入 customSkillIds 对应的 Skill 内容（Fix 1：真实加载）
  if (skillContents) {
    parts.push(`# Custom Skills\n${skillContents}`);
  }
  parts.push(`# Tools\n${tools.map((t) => `- ${t.name}: ${t.description}`).join("\n")}`);
  return parts.join("\n\n");
}

// ============================================
// 加载自定义 Skill 内容（Fix 1：真实加载）
// 通过 workflowDefinitionService 读取 Skill 定义，注入到 system prompt
// ============================================

function loadCustomSkills(services: ServerServices, skillIds: string[]): string | null {
  if (!skillIds || skillIds.length === 0) return null;
  const skillParts: string[] = [];
  for (const skillId of skillIds) {
    try {
      const workflow = services.workflowDefinitionService.get(skillId);
      if (workflow && workflow.enabled) {
        const parts: string[] = [`## ${workflow.name}`];
        if (workflow.description) {
          parts.push(workflow.description);
        }
        // 提取 custom 节点的 config 作为 Skill 指令
        for (const node of workflow.nodes) {
          if (node.kind === "custom" && node.config) {
            const instruction = (node.config as Record<string, unknown>).instruction;
            if (typeof instruction === "string" && instruction.trim()) {
              parts.push(instruction.trim());
            }
          }
        }
        if (parts.length > 1) {
          skillParts.push(parts.join("\n\n"));
        }
      }
    } catch {
      // Skill 加载失败时跳过该 Skill
    }
  }
  return skillParts.length > 0 ? skillParts.join("\n\n") : null;
}

// 注：Session Snapshot 的预算裁剪在 renderContextEnvelope 中内联执行，
// 不再使用独立的 buildSessionSnapshotText 函数（已删除避免死代码）。

// ============================================
// 最近交互构建（C1）—— 返回裁剪后的 turns
// ============================================

function trimRecentTurns(
  turns: ContextTurn[],
  budget: number
): ContextTurn[] {
  if (turns.length === 0) return [];

  // 从最近开始向前填充，直到预算用完
  const kept: ContextTurn[] = [];
  let usedTokens = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i]!;
    const turnTokens = estimateTokens(turn.content);
    if (usedTokens + turnTokens > budget && kept.length >= 4) break;
    kept.unshift(turn);
    usedTokens += turnTokens;
  }

  return kept;
}

// ============================================
// 知识片段构建（C3）—— 返回裁剪后的 snippets
// ============================================

function trimKnowledgeSnippets(
  snippets: KnowledgeSnippet[],
  budget: number
): KnowledgeSnippet[] {
  if (snippets.length === 0) return [];

  const kept: KnowledgeSnippet[] = [];
  let usedTokens = 0;
  for (const snippet of snippets) {
    const entryTokens = estimateTokens(snippet.content);
    if (usedTokens + entryTokens > budget) break;
    kept.push(snippet);
    usedTokens += entryTokens;
  }

  return kept;
}

// ============================================
// 相关知识检索（C3）
// 根据当前事件关键词查询知识库
// ============================================

function retrieveRelevantKnowledge(
  services: ServerServices,
  currentEvent: string,
  maxSnippets: number = 10
): KnowledgeSnippet[] {
  const snippets: KnowledgeSnippet[] = [];
  try {
    // 使用 list() 获取知识文档列表（不含 content），然后按需加载完整文档
    const docs = services.knowledgeService.list();
    if (!docs || docs.length === 0) return [];

    // 从当前事件中提取关键词（简单分词）
    const keywords = currentEvent
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2);

    // 按关键词匹配知识文档，最多加载 maxSnippets 个
    for (const doc of docs) {
      if (snippets.length >= maxSnippets) break;

      // 检查文档标题和 slug 是否包含关键词
      const docText = `${doc.level}/${doc.slug} ${doc.title ?? ""}`.toLowerCase();
      const matches = keywords.some((kw) => docText.includes(kw));

      if (matches) {
        try {
          const fullDoc = services.knowledgeService.get(
            doc.level as KnowledgeLevel,
            doc.slug
          );
          if (fullDoc) {
            snippets.push({
              ref: `${doc.level}/${doc.slug}`,
              title: fullDoc.title ?? doc.title ?? doc.slug,
              summary: fullDoc.summary ?? null,
              content: fullDoc.content,
            });
          }
        } catch {
          // 读取单个文档失败时跳过
        }
      }
    }
  } catch {
    // knowledgeService 不存在或读取失败时返回空
  }
  return snippets;
}

// ============================================
// 主构建函数
// ============================================

export type BuildContextInput = {
  runtime: WebAgentRuntime;
  services: ServerServices;
  currentEvent: string;
  tools: { name: string; description: string }[];
  insight: SessionInsight | null;
  contextSnapshot: AgentContextSnapshot | null;
  relevantKnowledge?: KnowledgeSnippet[];
  tokenBudgetConfig?: TokenBudgetConfig;
  /** 是否自动检索相关知识（默认 true） */
  autoRetrieveKnowledge?: boolean;
};

export function buildContextEnvelope(input: BuildContextInput): AgentContextEnvelope {
  const {
    runtime,
    services,
    currentEvent,
    tools,
    insight,
    contextSnapshot,
    autoRetrieveKnowledge = true,
  } = input;

  // Token 预算——优先从模型配置加载（Fix 5）
  const budgetConfig: TokenBudgetConfig = input.tokenBudgetConfig ?? loadTokenBudgetConfig(services, runtime.modelConfigId);
  const inputBudget = computeInputBudget(budgetConfig);
  const layerBudgets = computeLayerBudgets(inputBudget);

  // C3 角色配置——加载自定义 Skill 内容后注入（Fix 1）
  const skillContents = loadCustomSkills(services, runtime.customSkillIds ?? []);
  const roleConfiguration = buildRoleConfiguration(runtime, tools, skillContents);

  // C3 相关知识——自动检索或使用传入的（Fix 6）
  let relevantKnowledge = input.relevantKnowledge ?? [];
  if (relevantKnowledge.length === 0 && autoRetrieveKnowledge) {
    relevantKnowledge = retrieveRelevantKnowledge(services, currentEvent);
  }

  // 预算裁剪——裁剪后的数据写入 envelope（Fix 3）
  const trimmedRecentTurns = trimRecentTurns(
    contextSnapshot?.recentTurns ?? [],
    layerBudgets.recentTurns
  );
  const trimmedKnowledge = trimKnowledgeSnippets(
    relevantKnowledge,
    layerBudgets.relevantKnowledge
  );

  // C3 用户偏好
  let userPreferences: string[] = [];
  try {
    const prefs = services.userPreferencesService.list().slice(0, 50);
    userPreferences = prefs.map((p) => {
      const category = p.category ? `[${p.category}] ` : "";
      const truncatedValue = p.value.length > 200 ? `${p.value.slice(0, 197)}...` : p.value;
      return `${category}${p.key}: ${truncatedValue}`;
    });
  } catch {
    // userPreferencesService 不存在时跳过
  }

  return {
    currentEvent,
    // 写入裁剪后的数据，不是原始完整数据（Fix 3）
    recentTurns: trimmedRecentTurns,
    sessionSnapshot: {
      objective: insight?.objective ?? null,
      activePlanSummary: insight?.activePlanSummary ?? null,
      confirmedDecisions: contextSnapshot?.confirmedDecisions ?? [],
      constraints: insight?.constraints ?? [],
      acceptanceCriteria: insight?.acceptanceCriteria ?? [],
      completedItems: insight?.completedItems ?? [],
      pendingItems: insight?.pendingItems ?? [],
      blockers: insight?.blockers ?? [],
      unresolvedQuestions: contextSnapshot?.unresolvedQuestions ?? [],
      conversationSummary: contextSnapshot?.conversationSummary ?? null,
    },
    // 写入裁剪后的知识片段（Fix 3）
    relevantKnowledge: trimmedKnowledge,
    userPreferences,
    roleConfiguration,
    tokenBudget: {
      contextWindowTokens: budgetConfig.contextWindowTokens,
      maxOutputTokens: budgetConfig.maxOutputTokens,
      inputBudget,
    },
  };
}

/**
 * 将 AgentContextEnvelope 渲染为最终发送给 LLM 的 system prompt 和 user content。
 *
 * 输入顺序：
 *   System Prompt（角色配置 + 用户偏好）
 *   Session Snapshot（会话快照）
 *   Conversation Summary（滚动摘要）
 *   Relevant Knowledge（知识片段）
 *   Recent Turns（最近交互）
 *   Current Event（当前事件，放在 user content）
 *
 * 渲染时直接使用 envelope 中已裁剪的数据。
 */
export function renderContextEnvelope(envelope: AgentContextEnvelope): {
  systemPrompt: string;
  userContent: string;
} {
  const inputBudget = envelope.tokenBudget.inputBudget;

  // 角色配置——优先保留，但极小窗口下也要裁剪
  let roleText = envelope.roleConfiguration;
  const roleTokens = estimateTokens(roleText);
  if (roleTokens > inputBudget * 0.5) {
    // Role config exceeds half the budget — trim it
    const maxRoleChars = Math.floor(inputBudget * 0.4 * 3);
    roleText = roleText.slice(0, maxRoleChars) + "\n...(truncated)";
  }
  const roleActualTokens = estimateTokens(roleText);
  const remainingBudget = Math.max(0, inputBudget - roleActualTokens);

  // 分配剩余预算给各层
  const snapBudget = Math.floor(remainingBudget * 0.30);
  const knowledgeBudget = Math.floor(remainingBudget * 0.25);
  const prefBudget = Math.floor(remainingBudget * 0.10);
  const turnsBudget = Math.floor(remainingBudget * 0.20);
  const eventBudget = Math.floor(remainingBudget * 0.15);

  const systemParts: string[] = [roleText];

  // 会话快照——按预算裁剪，最小值不超过预算
  const snap = envelope.sessionSnapshot;
  const snapParts: string[] = [];
  if (snap.objective) snapParts.push(`## Objective\n${snap.objective}`);
  if (snap.activePlanSummary) snapParts.push(`## Confirmed Architecture\n${snap.activePlanSummary}`);
  if (snap.confirmedDecisions.length > 0) {
    snapParts.push(`## Confirmed Decisions\n${snap.confirmedDecisions.map((d) => `- ${d}`).join("\n")}`);
  }
  if (snap.constraints.length > 0) {
    snapParts.push(`## Constraints\n${snap.constraints.map((c) => `- ${c}`).join("\n")}`);
  }
  if (snap.acceptanceCriteria.length > 0) {
    snapParts.push(`## Acceptance Criteria\n${snap.acceptanceCriteria.map((c) => `- ${c}`).join("\n")}`);
  }
  if (snap.completedItems.length > 0) {
    snapParts.push(`## Completed Items\n${snap.completedItems.map((c) => `- ${c}`).join("\n")}`);
  }
  if (snap.pendingItems.length > 0) {
    snapParts.push(`## Pending Items\n${snap.pendingItems.map((c) => `- ${c}`).join("\n")}`);
  }
  if (snap.blockers.length > 0) {
    snapParts.push(`## Blockers\n${snap.blockers.map((c) => `- ${c}`).join("\n")}`);
  }
  if (snap.unresolvedQuestions.length > 0) {
    snapParts.push(`## Unresolved Questions\n${snap.unresolvedQuestions.map((q) => `- ${q}`).join("\n")}`);
  }
  if (snap.conversationSummary) {
    snapParts.push(`## Conversation Summary\n${snap.conversationSummary}`);
  }
  if (snapParts.length > 0) {
    let snapText = `# Session Snapshot\n${snapParts.join("\n\n")}`;
    if (estimateTokens(snapText) > snapBudget) {
      // 最小值不超过预算的 80%
      const minSnapChars = Math.min(500, Math.floor(snapBudget * 0.8 * 3));
      const maxSnapChars = Math.max(snapBudget * 3, minSnapChars);
      snapText = snapText.slice(0, maxSnapChars) + "\n...(truncated)";
    }
    systemParts.push(snapText);
  }

  // 相关知识——按预算裁剪
  if (envelope.relevantKnowledge.length > 0) {
    const keptKnowledge: typeof envelope.relevantKnowledge = [];
    let knowledgeUsedTokens = 0;
    for (const k of envelope.relevantKnowledge) {
      const entry = `## ${k.ref}\n**Title**: ${k.title}\n${k.summary ? `**Summary**: ${k.summary}\n` : ""}\n${k.content}`;
      const entryTokens = estimateTokens(entry);
      if (knowledgeUsedTokens + entryTokens > knowledgeBudget) break;
      keptKnowledge.push(k);
      knowledgeUsedTokens += entryTokens;
    }
    if (keptKnowledge.length > 0) {
      const knowledgeText = keptKnowledge
        .map((k) => `## ${k.ref}\n**Title**: ${k.title}\n${k.summary ? `**Summary**: ${k.summary}\n` : ""}\n${k.content}`)
        .join("\n\n");
      systemParts.push(`# Relevant Knowledge\n${knowledgeText}`);
    }
  }

  // 用户偏好——按预算裁剪，最小条数不超过预算
  if (envelope.userPreferences.length > 0) {
    const keptPrefs: string[] = [];
    let prefUsedTokens = 0;
    const minPrefs = Math.min(5, envelope.userPreferences.length);
    for (const p of envelope.userPreferences) {
      const entryTokens = estimateTokens(p);
      // Allow at least minPrefs, but stop if exceeding budget even for minimums
      if (prefUsedTokens + entryTokens > prefBudget && keptPrefs.length >= minPrefs) break;
      keptPrefs.push(p);
      prefUsedTokens += entryTokens;
    }
    systemParts.push(`# Global User Preferences\n${keptPrefs.map((p) => `- ${p}`).join("\n")}`);
  }

  // 最近交互——按预算裁剪，最小轮数不超过预算
  if (envelope.recentTurns.length > 0) {
    const keptTurns: typeof envelope.recentTurns = [];
    let turnsUsedTokens = 0;
    const minTurns = Math.min(4, envelope.recentTurns.length);
    for (let i = envelope.recentTurns.length - 1; i >= 0; i--) {
      const turn = envelope.recentTurns[i]!;
      const turnTokens = estimateTokens(turn.content);
      if (turnsUsedTokens + turnTokens > turnsBudget && keptTurns.length >= minTurns) break;
      keptTurns.unshift(turn);
      turnsUsedTokens += turnTokens;
    }
    systemParts.push(
      `# Recent Turns\n${keptTurns.map((t) => `**${t.role}**: ${t.content}`).join("\n\n")}`
    );
  }

  const systemPrompt = systemParts.join("\n\n---\n\n");

  // Current Event——按预算裁剪，最小值不超过预算
  let currentEventText = envelope.currentEvent;
  const eventTokens = estimateTokens(currentEventText);
  if (eventTokens > eventBudget) {
    const minEventChars = Math.min(200, Math.floor(eventBudget * 0.8 * 3));
    const maxChars = Math.max(eventBudget * 3, minEventChars);
    currentEventText = currentEventText.slice(0, maxChars) + "\n...(truncated)";
  }
  const userContent = `# Current Event\n${currentEventText}`;

  // 最终硬上限检查：如果总 token 仍超预算，按优先级裁剪 systemPrompt
  // 裁剪优先级：知识 → 偏好 → 最近交互 → 会话快照 → 角色配置
  let finalSystemPrompt = systemPrompt;
  const separator = "\n\n---\n\n";
  let totalTokens = estimateTokens(finalSystemPrompt) + estimateTokens(userContent);
  if (totalTokens > inputBudget) {
    const sections = finalSystemPrompt.split(separator);
    // 从后向前移除非核心段落（保留角色配置 = sections[0]）
    while (sections.length > 1 && totalTokens > inputBudget) {
      sections.pop(); // 移除最后一个段落
      finalSystemPrompt = sections.join(separator);
      totalTokens = estimateTokens(finalSystemPrompt) + estimateTokens(userContent);
    }
    // 如果角色配置本身仍超预算，截断
    if (totalTokens > inputBudget) {
      const maxRoleChars = Math.floor((inputBudget - estimateTokens(userContent)) * 3);
      finalSystemPrompt = finalSystemPrompt.slice(0, Math.max(maxRoleChars, 100));
    }
  }

  return { systemPrompt: finalSystemPrompt, userContent };
}
