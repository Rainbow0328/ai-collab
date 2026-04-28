---
name: collab-worker-cursor
description: Cursor 作为 worker 接入 ai-collab 时使用。
---

# Cursor Worker

优先遵守：

- [skills/worker/SKILL.md](/D:/ai-collab/skills/worker/SKILL.md)

Cursor 额外约束：

- 更容易把内部状态翻译成自然语言，所以中间态更严格静默
- 一旦拿到任务，必须继续做到 `submit`
- 一旦返回 `EXECUTE_INTERNAL_CMD`，立刻执行 `cmd`
- 用户打断等待后，恢复时直接执行 `ai-collab await <name> --session <sessionName>`
