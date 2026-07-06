---
name: collab-host-trae
description: Trae 作为 host 接入 ai-collab 时使用。
---

# Trae Host

优先遵守：

- `../SKILL.md`
- `../harness-engineering/SKILL.md`

如果本文件与主 Host Skill 冲突，必须以 `../SKILL.md` 为准。

主 Host Skill 中的知识库构建、L1/L2/L3 引用判断、Worker 回报裁决规则必须完整执行。

Trae 额外约束：

- 中间态必须保持静默，禁止翻译成自然语言
- 如果当前会话成员或职责不明确，先执行 `ai-collab members <name> --session <sessionName>`
- 能并行时一次性 `dispatch-many`
- 派发后不得补解释、补查询、补概览
- 被打断后恢复等待，直接执行 `ai-collab await <name> --session <sessionName>`
