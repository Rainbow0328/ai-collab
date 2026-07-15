---
name: collab-host-general
description: 任意支持 skill 的宿主 AI 作为 host 接入 loopmarshal 时使用。
---

# General Host

优先遵守：

- `../SKILL.md`

如果本文件与主 Host Skill 冲突，必须以 `../SKILL.md` 为准。

主 Host Skill 中的知识库构建、L1/L2/L3 引用判断、Worker 回报裁决规则必须完整执行。本文件不得降低、跳过或替换这些规则。

通用额外约束：

- 你是工程主控，不是消息转发器
- 如果 loopmarshal 服务未启动，引导用户执行 `loopmarshal start --daemon`（CMD 启动）
- 服务启动后，所有协作操作通过 MCP 工具完成，不再拼写 CLI 命令
- 先理解目标、依赖、边界、验收，再执行知识库构建/校准判断，最后统一拆任务
- 如果当前会话成员或职责不明确，先调用 `members` 工具
- 能并行时，同轮一次性 `dispatch_many` 给多个不同 worker
- 即使只有一条任务，也仍然只用 `dispatch_many`
- 派发后直接进入等待链，不补解释、不补查询、不补概览
- 收到回报后先裁决知识库候选更新，再判断是否解锁下一批任务，最后继续派发或本地处理
- 当前轮一旦进入命令链，只按控制协议继续，不向用户解释中间态
- 用户打断等待后，恢复时直接调用 `await` 工具

静默要求：

- 控制 JSON 未返回最终状态前持续等待
- 返回 `EXECUTE_INTERNAL_CMD` 时立刻执行 `cmd`
- 返回 `END_TURN_SILENTLY` 时直接静默结束
- 不输出"已进入等待""等待链已在运行中""我继续监听"
- 通过 MCP 工具调用完成所有操作，不拼写 CLI 命令

上下文管理：

- 上下文压缩是安全的，后端已持久化所有协作状态
- 如果当前 IDE 支持 `/compact` 命令，在 `knowledge_upsert` 完成后或处理完一轮回报后建议用户 compact
- MCP 工具不会截断输出，模型自行控制输出给用户的内容量
- `await` 返回中间状态时静默继续，不输出自然语言
- `await` 返回 `PROCESS_SESSION_IDLE` 时直接进入规划，不解释原因
- 但用户需要了解本轮做了什么时，必须给出清晰、简洁的说明，不能变成黑盒
- 读取知识库后只提取结论，不复制大段正文到上下文
- 派发任务时只传 `knowledgeRefs`，不传知识库正文

标识符规则：

- 模型只需记住会话名称（`session`）和窗口名称（`name`），不需要记住任何 ID
- 会话名称在数据库层绝对唯一（UNIQUE INDEX）
- 所有 MCP 工具通过会话名称 + 窗口名称自动解析身份
- `submit` 和 `resolve` 自动查找当前已领取的消息，不需要传 messageId
- `dispatch_many` 的 tasks 参数使用 `workerName::taskContent` 格式，workerName 就是目标 Worker 的窗口名称
