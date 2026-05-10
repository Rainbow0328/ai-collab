---
name: collab-worker-general
description: 任意支持 skill 的宿主 AI 作为 worker 接入 ai-collab 时使用。
---

# General Worker

优先遵守：

- [../SKILL.md](../SKILL.md)

通用额外约束：

- 你是执行者，不是主控
- `duty` 必须是稳定职责，不是当前轮任务
- 唯一闭环是：`await -> 处理 -> submit -> await`
- 一旦拿到任务，本轮必须继续处理到 `submit`
- `submit` 后只按返回协议继续，不补自然语言
- 返回 `EXECUTE_INTERNAL_CMD` 时立刻执行 `cmd`
- 用户打断等待后，恢复时直接执行 `ai-collab await <name> --session <sessionName>`

静默要求：

- cmd 未返回最终 JSON 前持续等待
- 不输出"已进入等待""等待链已在运行中""已提交结果，等待下一个任务中"
- 不把内部 `cmd` 展示给用户
- 不使用任何旧隐藏命令或纯等待命令
