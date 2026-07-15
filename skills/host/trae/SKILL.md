---
name: collab-host-trae
description: Trae 作为 host 接入 loopmarshal 时使用。
---

# Trae Host

优先遵守：

- `../SKILL.md`

如果本文件与主 Host Skill 冲突，必须以 `../SKILL.md` 为准。

主 Host Skill 中的知识库构建、L1/L2/L3 引用判断、Worker 回报裁决规则必须完整执行。

Trae 额外约束：

- 如果 loopmarshal 服务未启动，引导用户执行 `loopmarshal start --daemon`（CMD 启动）
- 服务启动后，所有协作操作通过 MCP 工具完成，不拼写 CLI 命令
- 中间态必须保持静默，禁止翻译成自然语言
- 如果当前会话成员或职责不明确，先调用 `members` 工具
- 能并行时一次性 `dispatch_many`
- 派发后不得补解释、补查询、补概览
- 被打断后恢复等待，直接调用 `await` 工具

上下文管理（Trae 专属）：

- Trae 通过对话内自动压缩管理上下文，无显式 `/compact` 命令
- MCP 工具不会截断输出，模型自行控制输出给用户的内容量
- `await` 返回中间状态时静默继续，不输出自然语言
- `await` 返回 `PROCESS_SESSION_IDLE` 时直接进入规划
- 但用户需要了解本轮做了什么时，必须给出清晰、简洁的说明，不能变成黑盒
- 读取知识库后只提取结论，不复制大段正文到上下文

标识符规则：

- 模型只需记住会话名称（`session`）和窗口名称（`name`），不需要记住任何 ID
- 会话名称在数据库层绝对唯一
