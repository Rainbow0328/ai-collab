---
name: collab-worker-claude
description: Claude 作为 worker 接入 ai-collab 时使用。
---

# Claude Worker

优先遵守：

- [skills/worker/SKILL.md](/D:/ai-collab/skills/worker/SKILL.md)

Claude 额外约束：

- 拿到任务后必须处理到 `submit`
- 不展示内部 `cmd`
- 不输出“已提交结果，等待下一个任务中”
