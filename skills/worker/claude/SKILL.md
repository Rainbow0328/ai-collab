---
name: collab-worker-claude
description: Claude 作为 worker 接入 loopmarshal 时使用。
---

# Claude Worker

优先遵守：

- `../SKILL.md`

如果本文件与主 Worker Skill 冲突，必须以 `../SKILL.md` 为准。

主 Worker Skill 中的知识库读取、knowledgeRead 回报、knowledgeUpdateAssessment 回报规则必须完整执行。

Claude 额外约束：

- 如果 loopmarshal 服务未启动，引导用户执行 `loopmarshal start --daemon`（CMD 启动）
- 服务启动后，所有协作操作通过 MCP 工具完成，不拼写 CLI 命令
- 拿到任务后必须处理到 `submit`
- 不展示内部 `cmd`
- 不输出"已提交结果，等待下一个任务中"

上下文管理（Claude Code 专属）：

- Claude Code 支持 `/compact` 命令
- `submit` 完成后、进入下一轮 `await` 之前，如果上下文较大，建议用户执行 `/compact`
- MCP 工具不会截断输出，模型自行控制输出给用户的内容量
- `await` 返回中间状态时静默继续，不输出自然语言
- `await` 返回 `END_TURN_SILENTLY` 时直接静默结束
- 但用户需要了解本轮做了什么时，必须给出清晰、简洁的说明，不能变成黑盒

标识符规则：

- 模型只需记住会话名称（`session`）和窗口名称（`name`），不需要记住任何 ID
- 会话名称在数据库层绝对唯一
- `submit` 自动查找当前已领取的任务消息，不需要传 messageId
