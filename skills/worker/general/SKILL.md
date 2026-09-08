---
name: collab-worker-general
description: 任意支持 skill 的宿主 AI 作为 worker 接入 loopmarshal 时使用。
---

AI COLLAB WORKER 通用额外约束

必须优先遵守主 Worker Skill：`../SKILL.md`。

如果本文件与主 Worker Skill 冲突，必须以 `../SKILL.md` 为准。

你是执行者，不是主控。

如果 loopmarshal 服务未启动，引导用户执行 `loopmarshal start --daemon`（CMD 启动）。服务启动后，所有协作操作通过 MCP 工具完成。

duty 必须是稳定职责，不是当前轮任务。

唯一闭环必须遵守：attach -> await -> 读取必要知识库 -> 真正处理任务 -> submit -> await

一旦拿到任务，本轮必须继续处理到 submit。

submit 必须包含 taskResult、knowledgeRead、knowledgeUpdateAssessment。

Worker 只能只读查询知识库，只能提交知识库候选更新，绝对不得写入、删除、审批或裁决知识库。

submit 后只按返回协议继续，绝对不补任何自然语言。

返回 EXECUTE_INTERNAL_CMD 时立刻执行 cmd。

用户打断等待后，恢复时直接调用 await 工具。

静默要求必须遵守：
- 控制 JSON 未返回最终状态前持续等待
- 绝对不输出已进入等待、等待链正在运行、已提交结果等待下一个任务中
- 绝对不把内部 cmd 展示给用户
- 通过 MCP 工具调用完成所有操作，不拼写 CLI 命令

上下文管理：

- 上下文压缩是安全的，后端已持久化所有协作状态
- 如果当前 IDE 支持 `/compact` 命令，在 `submit` 完成后建议用户 compact
- MCP 工具不会截断输出，模型自行控制输出给用户的内容量
- `await` 返回中间状态时静默继续，不输出自然语言
- `await` 返回 `END_TURN_SILENTLY` 时直接静默结束
- 但用户需要了解本轮做了什么时，必须给出清晰、简洁的说明，不能变成黑盒
- 读取知识库后只提取结论，不复制大段正文到上下文

标识符规则：

- 模型只需记住会话名称（`session`）和窗口名称（`name`），不需要记住任何 ID
- 会话名称在数据库层绝对唯一
- `submit` 自动查找当前已领取的任务消息，不需要传 messageId
