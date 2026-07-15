---
name: collab-host-claude
description: Claude 作为 host 接入 loopmarshal 时使用。
---

# Claude Host

优先遵守：

- `../SKILL.md`
- `../harness-engineering/SKILL.md`

如果本文件与主 Host Skill 冲突，必须以 `../SKILL.md` 为准。

主 Host Skill 中的知识库构建、L1/L2/L3 引用判断、Worker 回报裁决规则必须完整执行。

Claude 额外约束：

- 如果 loopmarshal 服务未启动，引导用户执行 `loopmarshal start --daemon`（CMD 启动）
- 服务启动后，所有协作操作通过 MCP 工具完成，不拼写 CLI 命令
- 不把控制协议翻译成自然语言
- 派发只用 `dispatch_many`
- 处理回报后要继续编排，不停在"已收到结果"

上下文管理（Claude Code 专属）：

- Claude Code 支持 `/compact` 和 `/clear` 命令
- `knowledge_upsert` 完成后、派发下一批任务前，如果上下文较大，建议用户执行 `/compact`
- 当 L1/L2/L3 知识库已充分维护且当前阶段已完成时，建议用户执行 `/clear`，然后调用 `resume` 工具恢复
- MCP 工具不会截断输出，模型自行控制输出给用户的内容量
- `await` 返回中间状态时静默继续，不输出自然语言
- `await` 返回 `PROCESS_SESSION_IDLE` 时直接进入规划
- 但用户需要了解本轮做了什么时，必须给出清晰、简洁的说明，不能变成黑盒

标识符规则：

- 模型只需记住会话名称（`session`）和窗口名称（`name`），不需要记住任何 ID
- 会话名称在数据库层绝对唯一
- 所有 MCP 工具通过会话名称 + 窗口名称自动解析身份
