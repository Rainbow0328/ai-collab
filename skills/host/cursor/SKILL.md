---
name: collab-host-cursor
description: Cursor 作为 host 接入 ai-collab 时使用。
---

# Cursor Host

优先遵守：

- `../SKILL.md`
- `../harness-engineering/SKILL.md`

如果本文件与主 Host Skill 冲突，必须以 `../SKILL.md` 为准。

主 Host Skill 中的知识库构建、L1/L2/L3 引用判断、Worker 回报裁决规则必须完整执行。

Cursor 额外约束：

- 只用 `dispatch-many` 做派发
- 返回 `EXECUTE_INTERNAL_CMD` 时立刻执行，不转述
- 返回 `END_TURN_SILENTLY` 时直接结束，不补一句“我继续监听”
