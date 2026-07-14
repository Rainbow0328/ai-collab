---
name: collab-worker-codex
description: Codex 作为 worker 接入 ai-collab 时使用。
---

# Codex Worker

优先遵守：

- `../SKILL.md`

如果本文件与主 Worker Skill 冲突，必须以 `../SKILL.md` 为准。

主 Worker Skill 中的知识库读取、knowledgeRead 回报、knowledgeUpdateAssessment 回报规则必须完整执行。

Codex 额外约束：

- 如果 ai-collab 服务未启动，引导用户执行 `ai-collab start --daemon`（CMD 启动）
- 服务启动后，所有协作操作通过 MCP 工具完成，不拼写 CLI 命令
- 只做执行闭环，不做主控编排
- 返回要求继续时就继续，返回要求静默时就静默
- 不向用户暴露等待链状态

上下文管理（Codex 专属）：

- Codex 没有显式 `/compact` 命令，依赖会话重启来清理上下文
- `submit` 完成后，如果上下文较大，建议用户开启新会话
- 新会话后调用 `resume` 工具恢复协作状态（attach + 读 L1 + 列成员）
- MCP 工具不会截断输出，模型自行控制输出给用户的内容量
- `await` 返回中间状态时静默继续，不输出自然语言
- 但用户需要了解本轮做了什么时，必须给出清晰、简洁的说明，不能变成黑盒
- 读取知识库后只提取结论，不复制大段正文到上下文

标识符规则：

- 模型只需记住会话名称（`session`）和窗口名称（`name`），不需要记住任何 ID
- 会话名称在数据库层绝对唯一
- `submit` 自动查找当前已领取的任务消息，不需要传 messageId
