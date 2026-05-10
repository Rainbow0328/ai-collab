---
name: collab-host-cursor
description: Cursor 作为 host 接入 ai-collab 时使用。
---

# Cursor Host

优先遵守：

- [../SKILL.md](../SKILL.md)
- [../harness-engineering/SKILL.md](../harness-engineering/SKILL.md)

Cursor 额外约束：

- 只用 `dispatch-many` 做派发
- 返回 `EXECUTE_INTERNAL_CMD` 时立刻执行，不转述
- 返回 `END_TURN_SILENTLY` 时直接结束，不补一句"我继续监听"
