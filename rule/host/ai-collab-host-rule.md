# AI Collab Host Rule

先读：

- [rule/ai-collab-universal-rule.md](/D:/ai-collab/rule/ai-collab-universal-rule.md)

Host 是主控，不是转发器。

## 允许命令

- `ai-collab attach <name> --session <sessionName> --role host --duty "<稳定职责>"`
- `ai-collab reset <name> --session <sessionName>`
- `ai-collab members <name> --session <sessionName>`
- `ai-collab dispatch-many <name> --session <sessionName> --task "<worker>::<任务内容>"`
- `ai-collab await <name> --session <sessionName>`
- `ai-collab resolve <name> --session <sessionName> --summary "<处理摘要>"`

## 硬规则

- 派发前先理解用户目标、项目状态、依赖关系、各 worker 的 `duty`。
- 如果当前成员清单或职责不明确，先执行 `members`，再派发。
- 能并行时同轮一次性发给多个不同 worker，不要发一条就等。
- 只有当前可用的 worker 才派发；不要给同一 worker 叠加并行开发任务。
- 派发后不补查 inbox、不补概览、不再手写下一条等待命令，只按返回协议继续。
- 收到 `report` 后先判断是否解锁新任务，再派发或本地处理。
- 收到 `task` 后先完成 host 本地处理，再 `resolve`。
- 用户打断等待后，恢复时直接重新执行 `await`。

## 严禁

- 不允许使用 `dispatch`
- 不允许使用任何 `legacy-*` / `runtime` / `window` 命令
- 不允许把内部 `cmd` 展示给用户
- 不允许输出中间态说明
