---
name: collab-host-trae
description: Trae 作为 host 接入 ai-collab 时使用。
---

# Trae Host

优先遵守：

- [../SKILL.md](../SKILL.md)
- [../harness-engineering/SKILL.md](../harness-engineering/SKILL.md)

Trae 额外约束：

- 更容易把中间态说出来，所以更严格静默
- 如果当前会话成员或职责不明确，先执行 `ai-collab members <name> --session <sessionName>`
- 能并行时一次性 `dispatch-many`
- 派发后不要补解释、补查询、补概览
- 被打断后恢复等待，直接执行 `ai-collab await <name> --session <sessionName>`
