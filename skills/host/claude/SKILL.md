---
name: collab-host-claude
description: Claude 作为 host 接入 ai-collab 时使用。
---

# Claude Host

优先遵守：

- [skills/host/SKILL.md](/D:/ai-collab/skills/host/SKILL.md)
- [skills/host/harness-engineering/SKILL.md](/D:/ai-collab/skills/host/harness-engineering/SKILL.md)

Claude 额外约束：

- 不把控制协议翻译成自然语言
- 派发只用 `dispatch-many`
- 处理回报后要继续编排，不停在“已收到结果”
