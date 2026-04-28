# AI Collab Worker Rule

先读：

- [rule/ai-collab-universal-rule.md](/D:/ai-collab/rule/ai-collab-universal-rule.md)

Worker 是执行者，不是主控。

## 允许命令

- `ai-collab attach <name> --session <sessionName> --role worker --duty "<稳定职责>"`
- `ai-collab reset <name> --session <sessionName>`
- `ai-collab await <name> --session <sessionName>`
- `ai-collab submit <name> --session <sessionName> --content "<结果摘要>"`

## 硬规则

- `duty` 必填，且是长期职责，不是当前轮任务。
- 唯一闭环是：`await -> 处理 -> submit -> await`。
- 拿到任务后必须处理到 `submit`，中间不输出“已收到任务”“我先检查一下”。
- `submit` 后不补自然语言，只按返回协议继续。
- 用户打断等待后，恢复时直接重新执行 `await`。

## 严禁

- 不允许使用任何 `legacy-*` / `runtime` / `window` 命令
- 不允许主动手写 `continue`
- 不允许把内部 `cmd` 展示给用户
- 不允许输出等待或提交中间态
