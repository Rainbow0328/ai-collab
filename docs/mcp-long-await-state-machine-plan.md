# MCP 长等待入口与服务端状态机改造方案

> 生成日期：2026-07-06  
> 状态：设计中，暂不进入实现  
> 当前结论：保留 cmd 入口作为兼容路径，新增 MCP 长等待入口作为主路径；两类入口必须复用同一套 core 协作逻辑，差异只放在等待策略、返回格式和客户端适配层。

## 一、背景

当前 ai-collab 已经通过 cmd/CLI 形成了可运行的 Host/Worker 协作闭环：

- Host 通过 `dispatch-many` 派发任务。
- Worker 通过 `await` 领取任务。
- Worker 完成后通过 `submit` 回报。
- Host 通过 `await` 等待回报，再通过 `resolve` 消耗回报。
- `submit` / `resolve` / `dispatch-many` 完成后，会返回控制结果，引导 AI IDE 继续执行下一轮 `ai-collab await`。

这个方向已经验证成立，但存在几个现实问题：

1. 许多 AI IDE 的 cmd/shell 工具不适合长时间阻塞等待。
2. 当前 `await` 使用短切片续等，空闲时会不断返回“继续 await”的控制输出。
3. 部分 AI IDE 在完成一个任务后，会直接总结本轮任务，而不是继续进入等待。
4. 仅靠 skill / AGENTS.md 约束模型行为属于软约束，稳定性不足。
5. MCP 客户端中，Claude Code、Codex、Cline、Roo 等已支持或可配置较长 MCP tool timeout，适合承担长等待入口。

因此本轮设计目标是：在不破坏现有 cmd 流程的前提下，新增 MCP 长等待入口，并把流程合法性下沉到服务端状态机中。

## 二、目标

### 2.1 本轮目标

- 新增 MCP 入口，支持 AI IDE 通过 MCP tool 进入协作等待。
- MCP 默认业务等待时间按 1 小时设计。
- cmd/CLI 入口保持现状，暂不改短切片等待机制。
- MCP 和 cmd 共用同一套 core 协作逻辑。
- 服务端新增权威状态机，用于判断当前窗口/成员处于哪个阶段、下一步必须执行什么动作。
- MCP 业务等待超时时，不作为流程结束，而是返回“继续调用 MCP await”的控制结果。
- 新增自动配置脚本，识别主流 AI IDE 的 MCP 配置文件，并确保 ai-collab MCP server 的 tool timeout 至少为 1 小时。

### 2.2 非目标

- 不废弃现有 cmd/CLI。
- 不在本轮优化 cmd 长等待。
- 不复制一套 MCP 专用任务队列。
- 不把 MCP tool 做成通用 cmd 执行器。
- 不依赖模型自觉遵守“完成后继续等待”，必须由服务端状态机兜底。
- 不承诺所有 AI IDE 都能稳定支持 1 小时 MCP tool call；不支持的客户端继续走 cmd fallback。

## 三、目标架构

### 3.1 当前形态

```text
AI IDE
  -> cmd / shell tool
  -> ai-collab CLI
  -> core REST API
  -> message queue / runtime state / lease
```

当前 cmd 入口中的等待续命主要依赖 CLI 返回控制 JSON：

```text
wait_timeout
  -> wait_timeout_continue
  -> EXECUTE_INTERNAL_CMD
  -> ai-collab await ...
```

这个机制能运行，但本质上还是“返回值驱动 AI IDE 继续执行”，属于软流程。

### 3.2 目标形态

```text
支持长 MCP timeout 的 AI IDE
  -> MCP adapter
  -> shared wait / claim / submit core
  -> service-side state machine
  -> message queue / runtime state / lease

不支持长 MCP timeout 的 AI IDE
  -> cmd / CLI adapter
  -> shared wait / claim / submit core
  -> service-side state machine
  -> message queue / runtime state / lease
```

核心原则：

- MCP 和 cmd 是两个入口，不是两套协作系统。
- core 是唯一状态源。
- message queue、claim、submit、resolve、heartbeat、lease、runtime state 只能有一套。
- MCP/cmd 的差异只体现在：
  - 等待时间策略。
  - 返回值格式。
  - 是否允许 continuation payload。
  - 是否需要输出给用户。

## 四、入口策略

### 4.1 MCP 入口

MCP 是新主路径，适用于支持 MCP tool timeout 配置的客户端。

默认策略：

```ts
type McpWaitPolicy = {
  entry: "mcp";
  clientToolTimeoutSeconds: 3600;
  businessWaitSeconds: 3300;
  quiet: true;
  returnOnlyOnEvent: true;
  allowCmdContinuationPayload: false;
};
```

说明：

- 客户端 MCP tool timeout 建议配置为 3600 秒。
- ai-collab 业务等待建议默认 3300 秒或 3500 秒，不直接等满客户端超时。
- 业务等待超时后，MCP tool 主动返回 `wait_timeout_continue`，要求继续调用下一轮 MCP await。
- 等待期间不向模型输出空转日志。
- 只有任务、回报、会话完成、用户确认需求、错误等有意义事件才返回可处理结果。

### 4.2 cmd 入口

cmd/CLI 保持现状，继续服务于：

- Cursor 等无法稳定配置 MCP 长 timeout 的客户端。
- Trae 等长 MCP timeout 行为需要实测的客户端。
- 人类调试。
- 旧流程兼容。

默认策略：

```ts
type CmdWaitPolicy = {
  entry: "cmd";
  keepCurrentSliceBehavior: true;
  allowCmdContinuationPayload: true;
  quiet: false; // 保持当前表现，后续再优化
};
```

本轮不改：

- `DEFAULT_WINDOW_WAIT_SLICE_ELAPSED_SECONDS`。
- 当前 `wait_timeout_continue` 的 cmd continuation 机制。
- `EXECUTE_INTERNAL_CMD` 控制格式。

## 五、MCP 工具设计

### 5.1 必要工具

首批建议提供以下 MCP tools：

```ts
ai_collab_await_event(input)
ai_collab_submit_and_await_next(input)
ai_collab_report_and_await_next(input)
ai_collab_get_runtime_state(input)
```

其中最关键的是 `submit_and_await_next` 和 `report_and_await_next`，它们把“提交结果/消耗消息”和“继续等待”合并为一个原子动作，减少 AI IDE 在中间总结退出的机会。

### 5.2 `ai_collab_await_event`

用途：让当前窗口进入长等待，直到领取到任务/消息、会话要求停止、业务等待超时或发生错误。

输入：

```ts
type AwaitEventInput = {
  sessionName: string;
  windowName: string;
  role: "host" | "worker" | "knowledge_keeper";
  timeoutSeconds?: number; // 默认 3300 或 3500，不能超过服务端允许值
  continuationToken?: string;
  quiet?: boolean; // 默认 true
  returnOnlyOnEvent?: boolean; // 默认 true
};
```

领取到任务时返回：

```json
{
  "status": "task_assigned",
  "state": "in_progress",
  "taskId": "msg_123",
  "messageKind": "task",
  "instruction": "执行具体任务...",
  "payload": {},
  "nextActionAfterCompletion": "submit_and_await_next",
  "requiredToolAfterCompletion": "ai_collab_submit_and_await_next",
  "userVisibleResponseAllowed": false
}
```

领取到 Host 侧消息或 Worker 回报时返回：

```json
{
  "status": "message_assigned",
  "state": "in_progress",
  "messageId": "msg_456",
  "messageKind": "report",
  "instruction": "审查并处理该回报...",
  "payload": {},
  "nextActionAfterCompletion": "report_and_await_next",
  "requiredToolAfterCompletion": "ai_collab_report_and_await_next",
  "userVisibleResponseAllowed": false
}
```

业务等待超时时返回：

```json
{
  "status": "wait_timeout_continue",
  "state": "waiting_continue_required",
  "requiredAction": "call_tool",
  "requiredTool": "ai_collab_await_event",
  "arguments": {
    "sessionName": "demo",
    "windowName": "worker-1",
    "role": "worker",
    "continuationToken": "wait_abc_002",
    "timeoutSeconds": 3300,
    "quiet": true,
    "returnOnlyOnEvent": true
  },
  "userVisibleResponseAllowed": false,
  "messageToAgent": "Do not summarize. Call requiredTool with arguments exactly."
}
```

会话结束时返回：

```json
{
  "status": "session_complete",
  "state": "session_complete",
  "userVisibleResponseAllowed": true,
  "summaryInstruction": "Summarize completed work briefly."
}
```

### 5.3 `ai_collab_submit_and_await_next`

用途：Worker 完成任务后，一次 MCP 调用内完成提交并进入下一轮等待。

输入：

```ts
type SubmitAndAwaitNextInput = {
  sessionName: string;
  windowName: string;
  taskId: string;
  status: "completed" | "failed" | "blocked";
  result?: unknown;
  failureReason?: string;
  timeoutSeconds?: number;
  quiet?: boolean;
};
```

行为：

```text
校验当前状态是 in_progress
  -> 提交结果
  -> 标记当前任务 processed
  -> 更新窗口状态为 waiting
  -> 进入 ai_collab_await_event 的同一套等待逻辑
```

如果提交后等到下一条任务，则返回 `task_assigned`。

如果业务等待超时，则返回 `wait_timeout_continue`。

如果会话完成，则返回 `session_complete`。

### 5.4 `ai_collab_report_and_await_next`

用途：Host 处理已领取的 worker report 或 host message 后，原子完成 resolve 并进入下一轮等待。

输入：

```ts
type ReportAndAwaitNextInput = {
  sessionName: string;
  windowName: string;
  messageId: string;
  action: "completed" | "failed" | "delegated";
  reply?: unknown;
  failureReason?: string;
  timeoutSeconds?: number;
  quiet?: boolean;
};
```

行为：

```text
校验当前状态是 in_progress
  -> resolve 当前消息
  -> 更新窗口状态为 waiting
  -> 进入 ai_collab_await_event 的同一套等待逻辑
```

### 5.5 `ai_collab_get_runtime_state`

用途：AI IDE 断线、总结退出、MCP 调用失败或用户手动恢复时，查询服务端权威状态和下一步动作。

返回示例：

```json
{
  "state": "waiting_continue_required",
  "requiredAction": "call_tool",
  "requiredTool": "ai_collab_await_event",
  "arguments": {
    "sessionName": "demo",
    "windowName": "worker-1",
    "role": "worker",
    "continuationToken": "wait_abc_002"
  },
  "userVisibleResponseAllowed": false
}
```

## 六、服务端状态机设计

### 6.1 为什么需要状态机

当前 CLI 返回值已经包含大量控制字段：

- `nextActionRequired`
- `automationState`
- `turnDisposition`
- `userVisibleSummaryAllowed`
- `currentTurnMustExecuteNextCommand`
- `EXECUTE_INTERNAL_CMD`

这些字段可以引导模型，但不能保证模型一定遵守。

服务端状态机的作用是：把“流程有没有合法完成、下一步必须执行什么”从模型自觉行为中拿出来，放到服务端判断。

### 6.2 状态枚举

建议先定义最小状态集合：

```ts
type CollaborationRunState =
  | "idle"
  | "waiting"
  | "waiting_continue_required"
  | "assigned"
  | "in_progress"
  | "submit_pending_continue"
  | "resolve_pending_continue"
  | "stale"
  | "blocked_requires_user"
  | "session_complete";
```

### 6.3 状态字段

每个窗口/成员应记录：

```ts
type CollaborationRunRecord = {
  sessionName: string;
  windowName: string;
  role: "host" | "worker" | "knowledge_keeper";
  state: CollaborationRunState;
  currentMessageId: string | null;
  currentCorrelationId: string | null;
  currentMessageKind: "task" | "report" | null;
  requiredAction: string | null;
  requiredTool: string | null;
  continuationToken: string | null;
  userVisibleResponseAllowed: boolean;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  lastHeartbeatAt: string | null;
  updatedAt: string;
};
```

现有 `WindowRuntimeState` 已经具备一部分字段：

- `activeFlow`
- `currentMessageId`
- `currentCorrelationId`
- `currentMessageKind`
- `waitChainId`
- `waitChainStatus`
- `lastStatus`
- `lastAutomationState`
- `lastTurnDisposition`

但它更像运行态快照。目标状态机需要再补足：

- `state`
- `requiredAction`
- `requiredTool`
- `continuationToken`
- `userVisibleResponseAllowed`
- `leaseExpiresAt`

### 6.4 核心状态转移

```text
idle
  -> waiting

waiting
  -> assigned
  -> waiting_continue_required
  -> session_complete
  -> blocked_requires_user

waiting_continue_required
  -> waiting
  -> stale

assigned
  -> in_progress

in_progress
  -> submit_pending_continue
  -> resolve_pending_continue
  -> stale
  -> blocked_requires_user

submit_pending_continue
  -> waiting

resolve_pending_continue
  -> waiting

stale
  -> waiting
  -> assigned
  -> blocked_requires_user

session_complete
  -> idle
```

### 6.5 状态机约束

服务端应校验：

- 当前是 `waiting_continue_required` 时，下一步只能继续调用 await。
- 当前是 `in_progress` 且角色是 worker 时，下一步只能 submit / submit_and_await_next。
- 当前是 `in_progress` 且角色是 host 时，下一步只能 resolve / report_and_await_next / dispatch 后继续等待。
- 当前是 `session_complete` 或 `blocked_requires_user` 时，才允许用户可见总结。
- 如果 AI IDE 直接总结但未调用下一步工具，服务端状态不变，下次恢复时继续返回 required tool。

## 七、共享 core 边界

### 7.1 不应复制的逻辑

MCP adapter 不能复制以下逻辑：

- 查询 session/member。
- claim message。
- submit result。
- fail task。
- dispatch task。
- resolve message。
- heartbeat。
- lease。
- runtime state 更新。
- backlog 统计。
- idle/session complete 判断。

这些必须下沉或复用现有 core service。

### 7.2 建议抽象

后续实现时可以抽出共享等待引擎：

```ts
type WaitEngineInput = {
  entry: "mcp" | "cmd";
  sessionName: string;
  windowName: string;
  role: "host" | "worker" | "knowledge_keeper";
  timeoutSeconds: number;
  sliceSeconds?: number;
  continuationToken?: string;
  quiet: boolean;
};

type WaitEngineResult =
  | WaitTaskAssigned
  | WaitMessageAssigned
  | WaitTimeoutContinue
  | WaitSessionComplete
  | WaitBlockedRequiresUser
  | WaitSuperseded
  | WaitError;
```

adapter 只负责把 `WaitEngineResult` 渲染成各自格式：

```text
MCP adapter -> structured tool result
cmd adapter -> 当前 control/debug JSON
```

## 八、自动 MCP timeout 配置脚本

### 8.1 目标

新增一个自动配置命令或脚本，用于：

1. 识别当前机器上安装/使用的 AI IDE。
2. 查找对应 MCP 配置文件。
3. 检查 ai-collab MCP server 是否存在。
4. 检查 MCP tool timeout 是否为 1 小时。
5. 不存在则新增；存在但低于 1 小时则更新。
6. 输出变更摘要和备份路径。

建议命令：

```text
ai-collab mcp:configure-timeout --target auto --timeout 3600
```

或脚本：

```text
node scripts/configure-mcp-timeout.js --target auto --timeout 3600
```

### 8.2 支持目标

首批建议支持：

| 客户端 | 配置位置 | 超时字段 |
|---|---|---|
| Claude Code | `.mcp.json` 或 Claude 配置目录 | per-server `timeout`，单位毫秒 |
| Codex | `~/.codex/config.toml` 或项目 `.codex/config.toml` | `tool_timeout_sec`，单位秒 |
| Cline | `cline_mcp_settings.json` | per-server `timeout`，单位秒 |
| Roo Code | MCP settings JSON | per-server `timeout`，单位秒 |
| Gemini CLI | `settings.json` | `mcpServers.<name>.timeout`，单位毫秒 |
| Trae | MCP server 配置 | `RUN_MCP_TIMEOUT_MS`，单位毫秒，需实测 |

Cursor 暂不作为长 MCP timeout 主路径；如果检测到 Cursor，只输出提示，不强行写未知字段。

### 8.3 自动检测逻辑

建议检测顺序：

```text
1. 显式参数 --target
2. 当前项目目录中的配置文件
3. 用户 HOME 下常见配置目录
4. 环境变量中可识别的 IDE 标识
5. PATH 中的 CLI 可执行文件
```

### 8.4 写入原则

- 写入前创建备份。
- 只修改 ai-collab MCP server 对应配置。
- 如果已有 timeout 且大于等于目标值，不修改。
- 如果已有 timeout 小于目标值，更新到目标值。
- 如果 server 不存在，根据目标客户端写入推荐配置。
- 对未知客户端只输出手工配置建议。

### 8.5 示例配置

Claude Code：

```json
{
  "mcpServers": {
    "ai-collab": {
      "command": "node",
      "args": ["path/to/ai-collab-mcp.js"],
      "timeout": 3600000
    }
  }
}
```

Codex：

```toml
[mcp_servers.ai_collab]
command = "node"
args = ["path/to/ai-collab-mcp.js"]
startup_timeout_sec = 60
tool_timeout_sec = 3600
```

Trae stdio：

```json
{
  "env": {
    "RUN_MCP_TIMEOUT_MS": "3600000"
  }
}
```

## 九、返回值兼容策略

### 9.1 MCP 返回值

MCP 返回结构化任务信封，重点字段：

```ts
type McpControlEnvelope = {
  status: string;
  state: CollaborationRunState;
  requiredAction?: string;
  requiredTool?: string;
  arguments?: Record<string, unknown>;
  userVisibleResponseAllowed: boolean;
  messageToAgent?: string;
};
```

MCP 不返回 `EXECUTE_INTERNAL_CMD`。

### 9.2 cmd 返回值

cmd 继续使用当前控制格式：

```json
{
  "op": "EXECUTE_INTERNAL_CMD",
  "cmd": "ai-collab await worker-1 --session demo"
}
```

本轮不改 cmd 输出语义。

### 9.3 共享结果

底层 wait engine 应返回中立结构：

```ts
type SharedWaitResult = {
  status: string;
  state: CollaborationRunState;
  message?: unknown;
  requiredAction?: string;
  requiredTool?: string;
  continuationToken?: string;
  userVisibleResponseAllowed: boolean;
};
```

再由 adapter 分别转换为 MCP 或 cmd 返回。

## 十、客户端行为约束

### 10.1 AGENTS.md / skill 规则

仍然需要规则层约束，但它不是唯一保证。

建议写入：

```text
When ai_collab_await_event returns status=task_assigned or message_assigned,
execute the assigned work immediately.

When the work is complete, do not summarize to the user.
Call ai_collab_submit_and_await_next or ai_collab_report_and_await_next immediately.

When the tool returns wait_timeout_continue, do not summarize.
Call the requiredTool with arguments exactly.

Only produce a user-visible summary when userVisibleResponseAllowed=true.
```

### 10.2 权限层约束

支持时应优先通过客户端权限配置限制：

- 等待协作事件必须使用 MCP tool。
- 普通 shell/cmd 只用于项目命令、测试、构建等。
- 不允许用 `sleep` / `timeout` / `ping` 等纯等待命令模拟续命。

## 十一、实施阶段建议

### 阶段 0：设计确认

- 确认 MCP/cmd 双入口边界。
- 确认状态枚举和 required action 语义。
- 确认 MCP 默认 1 小时客户端 timeout、业务等待 3300/3500 秒。
- 确认自动配置脚本首批支持客户端。

### 阶段 1：抽 shared wait engine

- 从 CLI 等待逻辑中抽出可复用 wait/claim 核心。
- cmd adapter 仍保持当前行为。
- 不引入 MCP 行为变更。

### 阶段 2：新增服务端状态机

- 增加状态记录。
- 增加状态转移校验。
- 将 `requiredAction` / `requiredTool` 写入服务端状态。
- 保持 CLI 兼容。

### 阶段 3：新增 MCP adapter

- 新增 `ai_collab_await_event`。
- 新增 `ai_collab_submit_and_await_next`。
- 新增 `ai_collab_report_and_await_next`。
- 新增 `ai_collab_get_runtime_state`。
- MCP 默认按长等待策略返回。

### 阶段 4：新增自动配置脚本

- 检测 Claude Code / Codex / Cline / Roo / Gemini / Trae。
- 自动写入或更新 timeout。
- 输出备份和修改摘要。
- 对 Cursor 输出 fallback 建议。

### 阶段 5：兼容性测试

按客户端测试：

- Claude Code：30 分钟、60 分钟。
- Codex：30 分钟、60 分钟。
- Cline/Roo：30 分钟、60 分钟。
- Trae：10 分钟、30 分钟、60 分钟实测。
- Cursor：确认 fallback 路径。

## 十二、风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 客户端 MCP timeout 小于业务等待时间 | tool call 被客户端强杀，无法返回继续等待控制结果 | 自动配置脚本校验 timeout；业务等待小于客户端 timeout |
| AI IDE 忽略 `wait_timeout_continue` | 直接总结或停止 | 服务端状态机保留 `waiting_continue_required`，恢复时继续要求调用 await |
| MCP 和 cmd 逻辑分叉 | 后续维护成本升高 | 抽 shared wait engine，adapter 只做格式转换 |
| 长等待期间无 heartbeat | 服务端误判 stale | MCP wait 内部定期刷新 heartbeat/lease |
| 远程 MCP idle timeout | 长时间无 progress 被断开 | 支持 progress notification 或配置 idle timeout；stdio 优先 |
| 自动配置误改用户文件 | 用户配置损坏 | 修改前备份，只修改 ai-collab server 节点 |

## 十三、当前结论

当前项目的 cmd 版本已经验证了整体协作方向，且已有 runtime state、lease、claim/submit/resolve 等基础设施。下一步不是推翻现有设计，而是：

1. 保留 cmd 作为兼容入口。
2. 新增 MCP 作为长等待主入口。
3. 抽出共享 wait/claim/submit core。
4. 将“下一步必须做什么”下沉为服务端状态机。
5. 为支持的 AI IDE 自动配置 MCP tool timeout 为 1 小时。

最终目标是：

```text
同一套协作状态与任务逻辑
  + MCP 长等待入口
  + cmd 兼容入口
  + 服务端状态机硬兜底
  + 自动配置脚本降低客户端配置成本
```

这样既能支持 Claude Code / Codex 等 MCP 长等待客户端，也能继续兼容不支持长 MCP timeout 的 AI IDE。
