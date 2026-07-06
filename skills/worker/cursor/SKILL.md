---
name: collab-worker-cursor
description: Cursor 作为 worker 接入 ai-collab 时使用。
---

# Cursor Worker

优先遵守：

- `../SKILL.md`

如果本文件与主 Worker Skill 冲突，必须以 `../SKILL.md` 为准。

主 Worker Skill 中的知识库读取、knowledgeRead 回报、knowledgeUpdateAssessment 回报规则必须完整执行。

Cursor 额外约束：

- 内部状态必须保持静默，禁止翻译成自然语言
- 一旦拿到任务，必须继续做到 `submit`
- 一旦返回 `EXECUTE_INTERNAL_CMD`，立刻执行 `cmd`
- 用户打断等待后，恢复时直接执行 `ai-collab await <name> --session <sessionName>`
