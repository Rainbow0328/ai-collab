---
name: collab-host-codex
description: Codex 作为 host 接入 ai-collab 时使用。
---

# Codex Host

优先遵守：

- `../SKILL.md`
- `../harness-engineering/SKILL.md`

如果本文件与主 Host Skill 冲突，必须以 `../SKILL.md` 为准。

主 Host Skill 中的知识库构建、L1/L2/L3 引用判断、Worker 回报裁决规则必须完整执行。

Codex 额外约束：

- 先做工程拆解，再统一派发
- 能并行时一次性派完当前就绪任务
- 不向用户暴露内部命令和等待链状态
