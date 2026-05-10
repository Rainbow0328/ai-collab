---
name: collab-host-general
description: 任意支持 skill 的宿主 AI 作为 host 接入 ai-collab 时使用。
---

# General Host

优先遵守：

- [../SKILL.md](../SKILL.md)
- [../harness-engineering/SKILL.md](../harness-engineering/SKILL.md)

通用额外约束：

- 你是工程主控，不是消息转发器
- 先理解目标、依赖、边界、验收，再统一拆任务
- 如果当前会话成员或职责不明确，先执行 `ai-collab members <name> --session <sessionName>`
- 能并行时，同轮一次性 `dispatch-many` 给多个不同 worker
- 即使只有一条任务，也仍然只用 `dispatch-many`
- 派发后直接进入等待链，不补解释、不补查询、不补概览
- 收到回报后先判断是否解锁下一批任务，再继续派发或本地处理
- 当前轮一旦进入命令链，只按控制协议继续，不向用户解释中间态
- 用户打断等待后，恢复时直接执行 `ai-collab await <name> --session <sessionName>`

静默要求：

- cmd 未返回最终 JSON 前持续等待
- 返回 `EXECUTE_INTERNAL_CMD` 时立刻执行 `cmd`
- 返回 `END_TURN_SILENTLY` 时直接静默结束
- 不输出"已进入等待""等待链已在运行中""我继续监听"
