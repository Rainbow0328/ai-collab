# LoopMarshal 开发环境

## 安装与构建

```bash
pnpm install
pnpm run build
pnpm run link:cli
```

`pnpm run link:cli` 会把本地构建出的 `loopmarshal` CLI 链接到当前环境。

## 启动

```bash
loopmarshal start
```

这是项目统一的本地启动入口。启动后会运行：

- Core: http://127.0.0.1:42688
- Web: http://localhost:5173

## MCP 配置

MCP stdio server 由 AI IDE/CLI 根据配置启动，实际命令为 `loopmarshal mcp serve`。不要手动把它当作本地服务启动入口。

MCP server 和宿主侧最长等待时间需要按 AI IDE/CLI 手动设置。LoopMarshal 单条内部等待链默认持续约 55 分钟，宿主 timeout 应配置得更长，详细说明见 [MCP配置与最长等待时间](./MCP配置与最长等待时间.md)。

## 常用开发命令

| 命令 | 说明 |
|---|---|
| `pnpm run build` | 构建所有 workspace |
| `pnpm run typecheck` | TypeScript 类型检查 |
| `pnpm run test` | 运行测试 |
| `pnpm run smoke:cli:loop` | 运行 CLI 协作闭环烟测 |
| `pnpm run pack:user` | 生成用户发布包 |

## 端口

| 服务 | 地址 |
|---|---|
| Web | http://localhost:5173 |
| Core HTTP | http://127.0.0.1:42688 |
| Core WebSocket | ws://127.0.0.1:42688 |
