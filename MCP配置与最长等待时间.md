# MCP 配置与最长等待时间

LoopMarshal 单条内部等待链默认由 33 个 100 秒等待片段组成，最长约 55 分钟。通常不需要在 LoopMarshal 内额外设置等待时间。

为了避免宿主在这条等待链完成前终止 MCP tool call，AI IDE/CLI 的 timeout 应高于 55 分钟。下面使用 24 小时作为宽松的宿主配置示例，不代表 LoopMarshal 单条等待链会固定运行 24 小时。

需要用户配置的是 **AI IDE/CLI 宿主工具自己的 MCP tool call 最长等待时间**。不同工具的单位可能不同，可以按业务需要设置：

| 目标等待时间 | 秒 | 毫秒 |
|---|---:|---:|
| 1 小时 | `3600` | `3600000` |
| 6 小时 | `21600` | `21600000` |
| 24 小时 | `86400` | `86400000` |

## 基本关系

```text
loopmarshal start
  -> 启动本地 core + Web

AI IDE/CLI
  -> 读取自己的 MCP 配置
  -> 启动 loopmarshal mcp serve
  -> 通过 stdio 调用 LoopMarshal MCP 工具
```

`loopmarshal mcp serve` 是给 AI IDE/CLI 调用的 stdio MCP server，不需要用户手动启动。

## 通用 JSON 配置

适用于使用 JSON 配置 MCP 的 AI IDE/CLI。把下面内容复制到对应工具的 MCP 配置文件或设置页：

```json
{
  "mcpServers": {
    "loopmarshal": {
      "command": "loopmarshal",
      "args": ["mcp", "serve"]
    }
  }
}
```

如果该工具支持在 server 上配置毫秒级 timeout，可以使用 24 小时示例：

```json
{
  "mcpServers": {
    "loopmarshal": {
      "command": "loopmarshal",
      "args": ["mcp", "serve"],
      "timeout": 86400000
    }
  }
}
```

## Claude Code / Claude Desktop

常见 JSON 配置：

```json
{
  "mcpServers": {
    "loopmarshal": {
      "command": "loopmarshal",
      "args": ["mcp", "serve"],
      "timeout": 86400000
    }
  }
}
```

说明：

- `timeout` 通常按毫秒处理。
- `86400000` 表示 24 小时。
- 如果只需要 1 小时，改成 `3600000`。
- 如果当前 Claude 版本不识别该字段，以 Claude 当前官方文档和客户端行为为准。

## Codex CLI

Codex 常见 TOML 配置：

```toml
[mcp_servers.loopmarshal]
command = "loopmarshal"
args = ["mcp", "serve"]
tool_timeout_sec = 86400
```

说明：

- `tool_timeout_sec` 单位是秒。
- `86400` 表示 24 小时。
- 如果只需要 1 小时，改成 `3600`。

## Cursor

Cursor 常见 JSON 配置：

```json
{
  "mcpServers": {
    "loopmarshal": {
      "command": "loopmarshal",
      "args": ["mcp", "serve"]
    }
  }
}
```

说明：

- Cursor 的 MCP server entry 可以配置。
- Cursor 的 MCP tool call timeout 字段没有稳定通用写法；不要强行写未知字段。
- 如果当前版本提供 MCP timeout 设置，按 Cursor 设置页或当前官方文档配置；秒填 `86400`，毫秒填 `86400000`。

## Trae

Trae 的 MCP server 配置以当前客户端设置页或配置文件为准，server 命令仍然是：

```bash
loopmarshal mcp serve
```

如果当前 Trae 版本支持通过环境变量调整 MCP 命令等待时间，可以设置：

```env
RUN_MCP_TIMEOUT_MS=86400000
```

说明：

- `RUN_MCP_TIMEOUT_MS` 单位是毫秒。
- `86400000` 表示 24 小时。
- 如果只需要 1 小时，改成 `3600000`。

## OpenCode / Xiaomi Code / CatPaw / 其他 AI IDE

这些工具的 MCP timeout 配置方式可能随版本变化，建议按下面顺序处理：

1. 先配置 MCP server，确认 `loopmarshal mcp serve` 能被宿主拉起。
2. 在该工具的 MCP 设置页或配置文档中查找 `timeout`、`toolTimeout`、`tool_timeout_sec`、`RUN_MCP_TIMEOUT_MS` 等字段。
3. 如果单位是秒，24 小时填 `86400`；如果单位是毫秒，24 小时填 `86400000`。
4. 如果没有公开 timeout 设置，不要写未知字段，先依赖 Progress Notification 和宿主默认超时。

## 当前已验证配置

### Codex

```toml
[mcp_servers.loopmarshal]
command = "loopmarshal"
args = ["mcp", "serve"]
tool_timeout_sec = 86400
```

### Claude

```json
{
  "mcpServers": {
    "loopmarshal": {
      "command": "loopmarshal",
      "args": ["mcp", "serve"],
      "timeout": 86400000
    }
  }
}
```

### JSON 类客户端

```json
{
  "mcpServers": {
    "loopmarshal": {
      "command": "loopmarshal",
      "args": ["mcp", "serve"],
      "timeout": 86400000
    }
  }
}
```

### Trae

```bash
loopmarshal mcp serve
```

## 判断是否配置成功

1. 启动本地服务：

```bash
loopmarshal start
```

2. 在 AI IDE/CLI 中触发 LoopMarshal MCP 工具。
3. 让 worker 进入等待链。
4. 如果等待过程没有被宿主提前中断，说明宿主侧最长等待配置基本生效。

如果宿主提前中断 MCP tool call，优先检查 AI IDE/CLI 的 MCP timeout 配置。
