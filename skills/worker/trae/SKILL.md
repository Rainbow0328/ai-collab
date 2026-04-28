---
name: collab-worker-trae
description: Trae 作为 worker 接入 ai-collab 时使用。
---

# Trae Worker

优先遵守：

- [skills/worker/SKILL.md](/D:/ai-collab/skills/worker/SKILL.md)

Trae 额外约束：

- 不输出等待或提交中间态
- 拿到任务就直接处理，不回计划
- 被打断后恢复等待，直接执行 `ai-collab await <name> --session <sessionName>`
