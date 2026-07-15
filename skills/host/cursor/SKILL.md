---
name: collab-host-cursor
description: Cursor 作为 host 接入 ai-collab 时使用。
---

# Cursor Host

优先遵守：

- `../SKILL.md`
- `../harness-engineering/SKILL.md`

如果本文件与主 Host Skill 冲突，必须以 `../SKILL.md` 为准。

主 Host Skill 中的知识库构建、L1/L2/L3 引用判断、Worker 回报裁决规则必须完整执行。

Cursor 额外约束：

- 如果 ai-collab 服务未启动，引导用户执行 `ai-collab start --daemon`（CMD 启动）
- 服务启动后，所有协作操作通过 MCP 工具完成，不拼写 CLI 命令
- 只用 `dispatch_many` 做派发
- 返回 `EXECUTE_INTERNAL_CMD` 时立刻执行，不转述
- 返回 `END_TURN_SILENTLY` 时直接结束，不补一句"我继续监听"

上下文管理（Cursor 专属）：

- Cursor 通过对话内自动压缩管理上下文，无显式 `/compact` 命令
- 当对话变长时，建议用户开启新对话来清理上下文
- 新对话后调用 `resume` 工具恢复协作状态（attach + 读 L1 + 列成员）
- MCP 工具不会截断输出，模型自行控制输出给用户的内容量
- `await` 返回中间状态时静默继续，不输出自然语言
- 但用户需要了解本轮做了什么时，必须给出清晰、简洁的说明，不能变成黑盒
- 读取知识库后只提取结论，不复制大段正文到上下文
- 派发任务时只传 `knowledgeRefs`，不传知识库正文

标识符规则：

- 模型只需记住会话名称（`session`）和窗口名称（`name`），不需要记住任何 ID
- 会话名称在数据库层绝对唯一
