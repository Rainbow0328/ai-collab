---
name: collab-worker-cursor
description: Cursor 作为 worker 接入 loopmarshal 时使用。
---

# Cursor Worker

优先遵守：

- `../SKILL.md`

如果本文件与主 Worker Skill 冲突，必须以 `../SKILL.md` 为准。

主 Worker Skill 中的知识库读取、knowledgeRead 回报、knowledgeUpdateAssessment 回报规则必须完整执行。

Cursor 额外约束：

- 如果 loopmarshal 服务未启动，引导用户执行 `loopmarshal start --daemon`（CMD 启动）
- 服务启动后，所有协作操作通过 MCP 工具完成，不拼写 CLI 命令
- 内部状态必须保持静默，禁止翻译成自然语言
- 一旦拿到任务，必须继续做到 `submit`
- 一旦返回 `EXECUTE_INTERNAL_CMD`，立刻执行 `cmd`
- 用户打断等待后，恢复时直接调用 `await` 工具

上下文管理（Cursor 专属）：

- Cursor 通过对话内自动压缩管理上下文，无显式 `/compact` 命令
- 当对话变长时，建议用户开启新对话来清理上下文
- 新对话后调用 `resume` 工具恢复协作状态（attach + 读 L1 + 列成员）
- MCP 工具不会截断输出，模型自行控制输出给用户的内容量
- `await` 返回中间状态时静默继续，不输出自然语言
- 但用户需要了解本轮做了什么时，必须给出清晰、简洁的说明，不能变成黑盒
- 读取知识库后只提取结论，不复制大段正文到上下文

标识符规则：

- 模型只需记住会话名称（`session`）和窗口名称（`name`），不需要记住任何 ID
- 会话名称在数据库层绝对唯一
- `submit` 自动查找当前已领取的任务消息，不需要传 messageId
