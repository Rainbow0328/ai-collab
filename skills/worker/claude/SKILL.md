---
name: collab-worker-claude
description: Claude 作为 worker 接入 ai-collab 时使用。
---

# Claude Worker

优先遵守：

- `../SKILL.md`

如果本文件与主 Worker Skill 冲突，必须以 `../SKILL.md` 为准。

主 Worker Skill 中的知识库读取、knowledgeRead 回报、knowledgeUpdateAssessment 回报规则必须完整执行。

Claude 额外约束：

- 拿到任务后必须处理到 `submit`
- 不展示内部 `cmd`
- 不输出“已提交结果，等待下一个任务中”
