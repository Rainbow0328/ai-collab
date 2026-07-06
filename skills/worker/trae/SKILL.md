---
name: collab-worker-trae
description: Trae 作为 worker 接入 ai-collab 时使用。
---

# Trae Worker

优先遵守：

- `../SKILL.md`

如果本文件与主 Worker Skill 冲突，必须以 `../SKILL.md` 为准。

主 Worker Skill 中的知识库读取、knowledgeRead 回报、knowledgeUpdateAssessment 回报规则必须完整执行。

Trae 额外约束：

- 不输出等待或提交中间态
- 拿到任务就直接处理，不回计划
- 被打断后恢复等待，直接执行 `ai-collab await <name> --session <sessionName>`
