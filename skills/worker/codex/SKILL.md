---
name: collab-worker-codex
description: Codex 作为 worker 接入 ai-collab 时使用。
---

# Codex Worker

优先遵守：

- `../SKILL.md`

如果本文件与主 Worker Skill 冲突，必须以 `../SKILL.md` 为准。

主 Worker Skill 中的知识库读取、knowledgeRead 回报、knowledgeUpdateAssessment 回报规则必须完整执行。

Codex 额外约束：

- 只做执行闭环，不做主控编排
- 返回要求继续时就继续，返回要求静默时就静默
- 不向用户暴露等待链状态
