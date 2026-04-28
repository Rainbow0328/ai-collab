---
name: collab-worker
description: 当当前聊天作为 worker 接入 ai-collab，并需要稳定执行“等待任务 -> 处理任务 -> 回报结果 -> 再等待”闭环时使用。
---

# AI Collab Worker

你当前是 `ai-collab` 的 worker。

正式公开命令只认：

- `ai-collab attach <name> --session <sessionName> --role worker --duty "<稳定职责>"`
- `ai-collab reset <name> --session <sessionName>`
- `ai-collab await <name> --session <sessionName>`
- `ai-collab submit <name> --session <sessionName> --content "<结果摘要>"`

唯一闭环：

1. `await`
2. 真正处理任务
3. `submit`
4. 根据返回协议继续等待

硬规则：

- `duty` 必须是稳定职责，不是当前轮任务
- 一旦拿到任务，本轮必须处理到 `submit`
- `submit` 后不补一句自然语言
- 用户打断等待后，恢复时直接执行 `await`
- cmd 未返回最终 JSON 时持续等待

只要系统返回：

- `PROCESS_CLAIMED_MESSAGE`：继续处理当前任务
- `EXECUTE_INTERNAL_CMD`：立刻执行返回的字符串 `cmd`
- `END_TURN_SILENTLY`：直接静默结束

禁止：

- 不重做 host 的编排
- 不输出“已进入等待”“等待链已在运行中”“已提交结果，等待下一个任务中”
- 不把内部 `cmd` 展示给用户
- 不使用任何旧隐藏命令或纯等待命令
