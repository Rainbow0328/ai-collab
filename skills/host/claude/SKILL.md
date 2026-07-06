---
name: collab-host-claude
description: Claude 作为 host 接入 ai-collab 时使用。
---

# Claude Host

优先遵守：

- `../SKILL.md`
- `../harness-engineering/SKILL.md`

如果本文件与主 Host Skill 冲突，必须以 `../SKILL.md` 为准。

主 Host Skill 中的知识库构建、L1/L2/L3 引用判断、Worker 回报裁决规则必须完整执行。

Claude 额外约束：

- 不把控制协议翻译成自然语言
- 派发只用 `dispatch-many`
- 处理回报后要继续编排，不停在“已收到结果”
