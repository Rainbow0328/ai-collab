# MCP 协作优化方案验证测试指南

> 分支：`research/await-command-wait-params`（基础分支）  
> 日期：2026-07-06  
> 状态：待验证

本文档描述如何验证两个实验分支的代码改造效果。

---

## 分支总览

| 分支 | 方案 | 核心改造 |
|------|------|---------|
| `research/mcp-progress-keepalive` | MCP Progress Notifications 保活 | 新增 MCP stdio server，长等待期间发送进度通知重置 IDE 超时 |
| `research/ide-hooks-flow-control` | IDE Hooks 确定性流控 | 利用 Claude Code hooks 在生命周期节点强制校验协作状态 |

两个分支均基于 `research/await-command-wait-params` 分支创建，互不依赖，可独立验证。

---

## 前置准备

### 环境要求

- Node.js >= 20
- npm / pnpm
- Claude Code（用于 IDE Hooks 验证）
- 一个可运行的 loopmarshal core server

### 构建项目

```bash
# 切换到对应分支
git checkout research/mcp-progress-keepalive
# 或
git checkout research/ide-hooks-flow-control

# 构建所有 workspace
npm run build
```

### 启动 Core Server

```bash
# 方式一：前台运行（可看到日志）
node dist/apps/core/src/index.js

# 方式二：通过 CLI 后台启动
node dist/apps/cli/src/index.js core:start

# 验证 core server 可达
curl http://127.0.0.1:42688/health
# 期望返回: {"status":"ok"}
```

### 准备测试会话

```bash
# 1. 创建会话并绑定 Host
node dist/apps/cli/src/index.js attach host-1 --session test-session --role host --duty "测试协调"

# 2. 创建会话并绑定 Worker
node dist/apps/cli/src/index.js attach worker-1 --session test-session --role worker --duty "测试执行"

# 3. Host 派发任务给 Worker
node dist/apps/cli/src/index.js dispatch-many host-1 --session test-session --task "worker-1::测试任务内容"
```

---

## 分支一：MCP Progress Notifications 保活验证

> 分支：`research/mcp-progress-keepalive`

### 改造内容

| 文件 | 类型 | 说明 |
|------|------|------|
| `apps/cli/src/mcp-stdio-server.ts` | 新增 | MCP stdio 服务器，JSON-RPC 2.0 over stdio，长等待期间发送 `notifications/progress` |
| `apps/cli/src/index.ts` | 修改 | 新增 `mcp serve` CLI 命令 |
| `apps/core/src/services/collaboration-wait-service.ts` | 修改 | `awaitEvent` 新增 `onProgress` 回调参数 |
| `.mcp.json` | 新增 | Claude Code MCP 配置 |
| `docs/mcp-progress-keepalive.md` | 新增 | 方案文档 |

### 验证步骤

#### 步骤 1：验证 MCP stdio server 基础通信

```bash
# 切换到分支
git checkout research/mcp-progress-keepalive
npm run build

# 手动发送 initialize 请求测试
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | node dist/apps/cli/src/index.js mcp serve --verbose
```

**期望结果**：
- stdout 输出 JSON-RPC 响应，包含 `protocolVersion`、`capabilities`、`serverInfo`
- stderr 输出调试日志（因 `--verbose`）

**验证点**：
- [ ] 响应中 `serverInfo.name` 为 `"loopmarshal-mcp"`
- [ ] 响应中 `protocolVersion` 为 `"2024-11-05"`
- [ ] `capabilities` 包含 `tools` 字段

#### 步骤 2：验证 tools/list 返回工具列表

```bash
# 先启动 core server（另一终端）
node dist/apps/core/src/index.js

# 发送 initialize + tools/list
(
  echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
  echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{"toolsetId":"worker"}}'
) | node dist/apps/cli/src/index.js mcp serve --verbose
```

**期望结果**：
- 第一条响应为 initialize 结果
- 第二条响应包含 `tools` 数组，列出 `ai_collab_await_event`、`ai_collab_submit_and_await_next` 等工具

**验证点**：
- [ ] 工具列表包含 `ai_collab_await_event`
- [ ] 工具列表包含 `ai_collab_submit_and_await_next`
- [ ] 工具列表包含 `ai_collab_get_runtime_state`
- [ ] 每个工具有 `name`、`description`、`inputSchema`

#### 步骤 3：验证短时间工具调用不发送进度通知

```bash
# 发送 heartbeat 工具调用（短时间完成）
(
  echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
  echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"heartbeat","arguments":{}}}'
) | node dist/apps/cli/src/index.js mcp serve --verbose
```

**期望结果**：
- 只有一条 tools/call 响应，无 `notifications/progress` 消息

**验证点**：
- [ ] stdout 中只有 2 条 JSON-RPC 消息（initialize 响应 + tools/call 响应）
- [ ] 没有 `notifications/progress` 消息（heartbeat 不是长等待工具）

#### 步骤 4：验证长等待工具调用发送进度通知

这是核心验证步骤。需要模拟一个长时间阻塞的工具调用。

```bash
# 确保 core server 已启动，且已有测试会话
# Worker 执行 await_event，此时没有任务，会进入长等待
# 设置较短的业务超时便于测试

(
  echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
  echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"ai_collab_await_event","arguments":{"sessionName":"test-session","windowName":"worker-1","role":"worker","timeoutSeconds":120},"_meta":{"progressToken":"test-token-001"}}}'
) | node dist/apps/cli/src/index.js mcp serve --verbose --progress-interval 10
```

**期望结果**：
- 在等待期间（约每 10 秒），stdout 输出 `notifications/progress` 通知
- 通知不包含 `id` 字段（是 notification 不是 request）
- 最终输出 tools/call 响应（`wait_timeout_continue` 状态）

**验证点**：
- [ ] 进度通知的 `method` 为 `"notifications/progress"`
- [ ] 进度通知没有 `id` 字段
- [ ] 进度通知的 `params.progressToken` 为 `"test-token-001"`
- [ ] 进度通知的 `params.progress` 递增（1, 2, 3...）
- [ ] 进度通知的 `params.message` 包含已等待时间
- [ ] 最终 tools/call 响应包含 `status: "wait_timeout_continue"`

#### 步骤 5：验证进度通知不污染 LLM 上下文

此步骤需要在实际 AI IDE 中验证。

```bash
# 1. 确保 .mcp.json 已配置（分支已包含）
cat .mcp.json
# 应包含 loopmarshal MCP server 配置

# 2. 在 Claude Code 中打开本项目
# 3. 让 AI 调用 ai_collab_await_event 工具
# 4. 观察对话历史中是否出现进度通知内容
```

**验证点**：
- [ ] AI 的对话历史中不包含进度通知的文本
- [ ] AI 的 token 消耗不因进度通知而增加
- [ ] 工具调用不被 IDE 超时杀死

#### 步骤 6：验证 onProgress 回调（可选，需代码集成）

此步骤验证 `CollaborationWaitService` 新增的 `onProgress` 回调。

```bash
# 运行已有的 MCP tool service 测试
cd apps/core && npx vitest run --dir src
```

**验证点**：
- [ ] 现有测试全部通过（`onProgress` 是可选参数，不影响现有逻辑）
- [ ] TypeScript 类型检查通过：`npm run typecheck`

---

## 分支二：IDE Hooks 确定性流控验证

> 分支：`research/ide-hooks-flow-control`

### 改造内容

| 文件 | 类型 | 说明 |
|------|------|------|
| `.claude/hooks/collab-flow-control.mjs` | 新增 | Hook 处理脚本，处理 PreToolUse / PostToolUse / Stop 事件 |
| `.claude/settings.json` | 新增 | Claude Code hook 注册配置 |
| `apps/core/src/server/create-server.ts` | 修改 | 新增 `GET /api/hooks/collaboration-state` 轻量级端点 |
| `docs/ide-hooks-flow-control.md` | 新增 | 方案文档 |

### 验证步骤

#### 步骤 1：验证轻量级状态查询端点

```bash
# 切换到分支
git checkout research/ide-hooks-flow-control
npm run build

# 启动 core server
node dist/apps/core/src/index.js

# 查询无会话状态（应返回 idle）
curl "http://127.0.0.1:42688/api/hooks/collaboration-state"
```

**期望结果**：
```json
{
  "success": true,
  "data": {
    "state": "idle",
    "status": "no_session",
    "userVisibleResponseAllowed": true,
    "requiredAction": null,
    "requiredTool": null
  }
}
```

**验证点**：
- [ ] 无 sessionName/windowName 参数时返回 `state: "idle"`
- [ ] 响应时间 < 50ms（轻量级端点）

#### 步骤 2：验证带会话参数的状态查询

```bash
# 确保已创建测试会话（见前置准备）
# Worker 进入等待状态后查询

# 在一个终端启动 worker await
node dist/apps/cli/src/index.js await worker-1 --session test-session &

# 等待几秒后查询状态
curl "http://127.0.0.1:42688/api/hooks/collaboration-state?sessionName=test-session&windowName=worker-1"
```

**期望结果**：
```json
{
  "success": true,
  "data": {
    "state": "waiting",
    "status": "mcp_waiting",
    "requiredAction": "await_event",
    "requiredTool": "ai_collab_await_event",
    "userVisibleResponseAllowed": false
  }
}
```

**验证点**：
- [ ] 返回 `state: "waiting"` 或 `waiting_continue_required`
- [ ] 返回 `userVisibleResponseAllowed: false`
- [ ] 返回 `requiredTool` 字段

#### 步骤 3：验证 Hook 脚本基础功能

```bash
# 设置环境变量
export LOOPMARSHAL_CORE_URL="http://127.0.0.1:42688"
export LOOPMARSHAL_SESSION_NAME="test-session"
export LOOPMARSHAL_WINDOW_NAME="worker-1"
export LOOPMARSHAL_HOOK_DEBUG=1

# 模拟 PreToolUse 事件（调用非协作工具，应放行）
echo '{"tool_name":"Read","tool_input":{"file_path":"test.txt"},"hook_event_name":"PreToolUse"}' | node .claude/hooks/collab-flow-control.mjs
echo "Exit code: $?"
```

**期望结果**：
- Exit code 0（放行）
- stderr 输出调试日志

**验证点**：
- [ ] 非 ai_collab 工具调用，exit code 0
- [ ] 调试日志输出在 stderr

#### 步骤 4：验证 PreToolUse 流控 — 阻止错误工具调用

```bash
# 确保 worker 处于 waiting_continue_required 状态
# （worker await 超时后会进入此状态）

# 模拟在 waiting_continue_required 状态下调用错误工具
echo '{"tool_name":"ai_collab_submit_and_await_next","tool_input":{"sessionName":"test-session","windowName":"worker-1","taskId":"fake","status":"completed"},"hook_event_name":"PreToolUse"}' | node .claude/hooks/collab-flow-control.mjs
echo "Exit code: $?"
```

**期望结果**：
- Exit code 2（阻止）
- stderr 输出阻止原因，说明必须调用 `ai_collab_await_event`

**验证点**：
- [ ] Exit code 2
- [ ] stderr 包含 `"waiting_continue_required"`
- [ ] stderr 包含 `"ai_collab_await_event"`

#### 步骤 5：验证 Stop hook — 阻止 AI 在协作流程中停止

```bash
# 确保 worker 处于 waiting 或 in_progress 状态

# 模拟 Stop 事件
echo '{"hook_event_name":"Stop"}' | node .claude/hooks/collab-flow-control.mjs
echo "Exit code: $?"
```

**期望结果**：
- 当状态为 `waiting_continue_required` 时：exit code 2，stderr 要求继续调用 await
- 当状态为 `in_progress` 时：exit code 2，stderr 要求先提交任务
- 当状态为 `idle` 时：exit code 0（允许停止）

**验证点**：
- [ ] `waiting_continue_required` 状态下 Stop 被阻止（exit code 2）
- [ ] `in_progress` 状态下 Stop 被阻止（exit code 2）
- [ ] `idle` 状态下 Stop 被允许（exit code 0）
- [ ] 阻止原因在 stderr 中输出

#### 步骤 6：验证 PostToolUse 注入续等指令

```bash
# 模拟工具返回 wait_timeout_continue
echo '{"tool_name":"ai_collab_await_event","tool_result":"{\"state\":\"waiting_continue_required\",\"status\":\"wait_timeout_continue\",\"requiredTool\":\"ai_collab_await_event\",\"arguments\":{\"sessionName\":\"test-session\",\"windowName\":\"worker-1\"}}","hook_event_name":"PostToolUse"}' | node .claude/hooks/collab-flow-control.mjs
echo "Exit code: $?"
```

**期望结果**：
- Exit code 0（放行）
- stdout 输出 JSON，包含 `additionalContext` 字段
- `additionalContext` 包含续等指令

**验证点**：
- [ ] Exit code 0
- [ ] stdout 输出合法 JSON
- [ ] JSON 包含 `additionalContext` 字段
- [ ] `additionalContext` 包含 `"Do NOT summarize"` 或 `"不要总结"` 等指令
- [ ] `additionalContext` 包含 requiredTool 和 arguments

#### 步骤 7：验证 Fail-open 容错

```bash
# 模拟 core server 不可达
export LOOPMARSHAL_CORE_URL="http://127.0.0.1:99999"

# 模拟 Stop 事件
echo '{"hook_event_name":"Stop"}' | node .claude/hooks/collab-flow-control.mjs
echo "Exit code: $?"
```

**期望结果**：
- Exit code 0（fail-open，允许操作）

**验证点**：
- [ ] Core server 不可达时，exit code 0
- [ ] 不阻塞 IDE 正常使用

#### 步骤 8：在 Claude Code 中实际验证

```bash
# 1. 确保 .claude/settings.json 已配置（分支已包含）
cat .claude/settings.json

# 2. 设置环境变量（在 Claude Code 启动前）
export LOOPMARSHAL_SESSION_NAME="test-session"
export LOOPMARSHAL_WINDOW_NAME="worker-1"

# 3. 启动 Claude Code
claude

# 4. 在 Claude Code 中执行协作流程：
#    - 调用 ai_collab_await_event 等待任务
#    - 观察是否在 wait_timeout_continue 后自动续等
#    - 尝试让 AI 总结停止，观察是否被 hook 阻止
```

**验证点**：
- [ ] AI 在 `wait_timeout_continue` 后不总结，自动续等
- [ ] AI 尝试停止时被 hook 阻止，收到续等指令
- [ ] AI 完成任务后正常提交，不被阻止
- [ ] 会话完成后 AI 可以正常停止

---

## 对比验证

### 上下文污染对比

在两个分支中分别执行相同的协作流程（等待 2 分钟），对比 LLM 上下文消耗：

| 指标 | 基础分支（轮询续等） | Progress 保活 | IDE Hooks |
|------|---------------------|-------------|-----------|
| 轮询期间上下文增长 | 每次续等返回控制 JSON | 零增长（通知不进上下文） | 零增长（仅按需注入） |
| 2 分钟内 token 消耗 | 高（约 N×控制JSON大小） | 低（仅最终结果） | 低（仅续等指令） |

### 流程合规对比

| 场景 | 基础分支（软约束） | IDE Hooks（硬约束） |
|------|-------------------|-------------------|
| AI 在等待超时后总结退出 | 可能发生 | 被阻止（Stop hook） |
| AI 拿到任务后不提交就停止 | 可能发生 | 被阻止（Stop hook） |
| AI 在等待状态调用错误工具 | 可能发生 | 被阻止（PreToolUse hook） |

---

## 常见问题

### Q: MCP stdio server 启动后没有输出？

A: MCP stdio server 通过 stdin/stdout 通信，不会主动输出。需要发送 JSON-RPC 请求才能看到响应。使用 `--verbose` 参数可以在 stderr 看到调试日志。

### Q: Hook 脚本不触发？

A: 检查以下几点：
1. `.claude/settings.json` 是否被 Claude Code 正确加载
2. Hook 命令路径是否正确（相对项目根目录）
3. 环境变量 `LOOPMARSHAL_SESSION_NAME` 和 `LOOPMARSHAL_WINDOW_NAME` 是否已设置
4. Core server 是否可达（`curl http://127.0.0.1:42688/health`）

### Q: 进度通知间隔应该设置多少？

A: 默认 30 秒。建议设置为 IDE MCP 超时的 1/3。例如 IDE 超时 120 秒，间隔设为 30-40 秒。可通过 `--progress-interval` 参数调整。

### Q: 两个方案能否叠加使用？

A: 可以。Progress 保活在传输层重置 IDE 超时，IDE Hooks 在生命周期层强制流程合规，两者互不冲突。叠加使用时：
- Progress 保活确保长等待不被 IDE 超时杀死
- IDE Hooks 确保 AI 在任何情况下都遵守协作流程

---

## 验证结果记录模板

### 分支一：MCP Progress Notifications 保活

| 验证项 | 结果 | 备注 |
|--------|------|------|
| initialize 响应正确 | ☐ | |
| tools/list 返回工具列表 | ☐ | |
| 短时间工具不发送进度通知 | ☐ | |
| 长等待期间发送进度通知 | ☐ | |
| 进度通知无 id 字段 | ☐ | |
| 进度通知包含 progressToken | ☐ | |
| 进度通知不污染 LLM 上下文 | ☐ | |
| onProgress 回调不影响现有测试 | ☐ | |

### 分支二：IDE Hooks 确定性流控

| 验证项 | 结果 | 备注 |
|--------|------|------|
| 轻量级端点返回 idle | ☐ | |
| 带会话参数返回正确状态 | ☐ | |
| 非协作工具调用放行 | ☐ | |
| waiting_continue_required 阻止错误工具 | ☐ | |
| in_progress 阻止跳过任务 | ☐ | |
| Stop 阻止协作中停止 | ☐ | |
| Stop 允许 idle 时停止 | ☐ | |
| PostToolUse 注入续等指令 | ☐ | |
| Core 不可达时 fail-open | ☐ | |
| Claude Code 实际流程合规 | ☐ | |
