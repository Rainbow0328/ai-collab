# LoopMarshal — 多 Agent 协同开发框架 | Multi-Agent AI Coding Orchestration

> **一个命令让多个 AI Agent 协同开发同一个项目。** 支持 Claude Code、Cursor、Codex 等 14 种 AI 编程工具，基于 MCP 协议实现 Agent 间自动通信，内置三级知识库和 Web 管理面板。

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue.svg)](https://www.typescriptlang.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

**中文** | [English](./README-EN.md)

---

## 概述

LoopMarshal 是一个**多 Agent 协同开发框架**（Multi-Agent AI Coding Orchestration Framework）。它让你用一条命令同时编排多个 AI Agent——Claude Code、Cursor、Codex CLI、Trae、Gemini CLI、Aider 等 14 种 AI 编程工具——在同一个项目中分工协作。

**它解决的核心问题**：当你同时用多个 AI Coding Agent 开发同一个项目时，Agent 之间不知道彼此在做什么，任务和结果靠手动复制粘贴，上下文无法同步。LoopMarshal 通过 **MCP 协议** 让 Agent 之间自动通信，一个 AI 当 **Host** 统筹全局，其他 AI 当 **Worker** 各司其职。

**关键词**：multi-agent orchestration · 多 Agent 协同 · AI 编程协作 · MCP 协议 · LLM agent coordination · AI coding tools · agent-to-agent communication · local-first · knowledge base · prompt engineering · AI workflow automation

---

## 为什么需要它

当你同时使用 Trae、Cursor、Claude Code 多个 AI Coding Agent 维护同一个项目时：

- ❌ 每个 AI Agent 不知道别人在做什么
- ❌ 手动复制粘贴任务和结果
- ❌ 上下文同步全靠人肉维护
- ❌ 前后端接口对不齐，反复返工

LoopMarshal 解决这些问题：一个 AI Agent 当 **Host** 统筹，其他 AI Agent 当 **Worker** 执行，通过 **MCP 协议**自动通信，形成稳定的 Agent 协作闭环。

### 使用场景

- **分模块并行开发**：不同模块用不同 AI Agent 并行开发，Host 统筹任务拆解和接口对齐
- **前后端分离开发**：前端和后端各用一个 AI Agent，避免 context window 爆炸，Host 确保接口一致
- **混合成本优化**：免费 AI Agent 当 Host 统筹，付费 AI Agent 当架构师，最大化 LLM 能力性价比
- **大规模重构**：Host 拆解重构任务，多个 Worker Agent 并行处理不同模块
- **多 LLM 协同**：不同 Agent 使用不同 LLM（GPT-4、Claude、Gemini、DeepSeek），发挥各自优势

---

## 核心特性

| 特性 | 说明 |
|------|------|
| **一键启动** | `start-agent` 命令自动注入 Skill + MCP 配置 + 启动 IDE + 生成首条提示词 |
| **MCP 自动配置** | 自动注入项目级 MCP 配置（支持则用项目级，不支持则 fallback 全局级），合并写入不覆盖 |
| **14 种 AI Agent** | Claude Code、Codex、Cursor、Trae、OpenCode、Gemini、Aider、Windsurf、Qoder、GitHub Copilot、Cline、Crusher、Lovable、Xiaomi MiMo |
| **三角色分工** | Host 统筹编排、Worker 执行任务、Knowledge Keeper 维护知识库 |
| **Agent 间 MCP 通信** | AI Agent 之间通过 MCP 工具自动通信，无需手动复制粘贴 |
| **三级知识库** | L1 项目方向、L2 领域规则、L3 字段对齐，片段级引用精准投递 |
| **等待链** | Worker Agent 自动等待→领取→执行→回报→再等待，超时续接不丢消息 |
| **Web 管理后台** | 会话/成员/消息/知识库可视化，浏览器实时监控 Agent 协作状态 |
| **本地优先** | 所有数据存本地 SQLite，不上云，零隐私泄露 |

---

## 安装

### 环境要求

- **Node.js** 20 或更高版本
- **pnpm** 10+（`npm install -g pnpm`）
- 至少安装一种支持的 AI 编程工具（如 Claude Code、Cursor、Codex 等）

### 从源码安装

```powershell
# 1. 克隆仓库
git clone https://github.com/your-org/loopmarshal.git
cd loopmarshal

# 2. 安装依赖
pnpm install

# 3. 构建全部包
pnpm run build

# 4. 将 loopmarshal 命令注册到全局 PATH
pnpm run link:cli

# 5. 验证安装
loopmarshal --version
# 输出: 0.1.0
```

安装完成后，`loopmarshal` 命令即可在任意目录使用。

---

## 快速开始

### 一条命令启动多 Agent 协作（推荐）

在你要协作的项目目录下执行：

```powershell
# 启动 Host Agent（统筹全局）
loopmarshal start-agent claude --role host --duty "架构设计与任务拆解"

# 在另一个终端启动 Worker Agent（执行任务）
loopmarshal start-agent cursor --role worker --duty "前端开发" --session <上一步输出的会话名>

# 可选：启动知识库维护者 Agent
loopmarshal start-agent codex --role knowledge_keeper --duty "知识库维护" --session <会话名>
```

执行后 `start-agent` 会自动完成以下全部操作：

1. ✅ 检测核心服务是否运行——未运行则自动后台启动
2. ✅ 解析会话名（从 `--session` 或项目目录名）
3. ✅ 调用 API 加入会话（attach）
4. ✅ 注入 Skill 行为规则文件到 IDE 配置目录
5. ✅ 注入 MCP 配置文件
6. ✅ 生成首条提示词（含角色/会话/职责/管理面板地址）
7. ✅ 启动 IDE 进程

启动后打开浏览器访问 `http://127.0.0.1:42688` 查看管理面板，可以实时看到 Agent 会话成员、消息流和知识库。

> 💡 **提示**：先执行 `loopmarshal start-agent claude --role host --duty "测试" --dry-run` 可以预览配置而不实际启动，用于验证参数是否正确。

**Host 还可以直接启动新 Worker Agent**（通过 MCP 工具调用，无需手动开终端）：

```
start_worker(ide="claude", duty="后端 API 开发")
```

### 手动配置（可选）

如果你不想用 `start-agent`，或你的 AI 工具不在 14 种支持列表中，可以手动配置：

```powershell
# 1. 启动核心服务（后端 + Web 面板）
loopmarshal start

# 2. 在 AI 工具中配置 MCP Server
#    创建配置文件，内容如下（JSON 格式）：

```json
{
  "mcpServers": {
    "loopmarshal": {
      "command": "npx",
      "args": ["loopmarshal", "mcp", "serve"],
      "timeout": 86400000
    }
  }
}
```

Codex TOML 格式：

```toml
[mcp_servers.loopmarshal]
command = "npx"
args = ["loopmarshal", "mcp", "serve"]
tool_timeout_sec = 86400
```

然后手动导入 Skill 文件到 IDE 配置目录（见下表）。

### Skill 文件与 MCP 配置自动注入

`start-agent` 会自动完成两类注入：

**1. Skill 文件注入**（项目级）：

| IDE | Skill 注入目录 | 格式 |
|-----|--------------|------|
| Claude Code | `.claude/skills/` | 主规则 + IDE 差异约束 |
| Codex CLI | `.codex/skills/` | 主规则 + IDE 差异约束 |
| Cursor | `.cursor/rules/` | 主规则 + IDE 差异约束 |
| Trae | `.trae/skills/loopmarshal/` | 主规则 + IDE 差异约束 |
| 其他 IDE | `.<ide>/skills/` | 主规则 |

**2. MCP 配置注入**（项目级优先，不支持则 fallback 全局级）：

`start-agent` 的 MCP 注入策略：**如果该 IDE 支持项目级 MCP 配置文件，就写入项目级；如果不支持（如 Trae、Windsurf），则通过 `HOME`/`USERPROFILE` 环境变量查找全局配置路径并写入。**

| IDE | 项目级 MCP 路径 | 全局 MCP 路径（fallback） | 格式 |
|-----|----------------|--------------------------|------|
| Claude Code | `.claude/mcp.json` | `~/.claude/mcp.json` | JSON |
| Codex CLI | `.codex/config.toml` | `~/.codex/config.toml` | TOML |
| Cursor | `.cursor/mcp.json` | `~/.cursor/mcp.json` | JSON |
| OpenCode | `.opencode/mcp.json` | `~/.opencode/mcp.json` | JSON |
| Gemini CLI | `.gemini/settings.json` | `~/.gemini/settings.json` | JSON |
| Aider | `.aider/mcp.json` | `~/.aider/mcp.json` | JSON |
| Cline | `.cline/mcp.json` | `~/.cline/mcp.json` | JSON |
| MiMo | `.mimo/mcp.json` | `~/.mimo/mcp.json` | JSON |
| Trae | — | — | 需在 IDE 设置面板手动配置 |
| Windsurf | — | — | 需在 IDE 设置面板手动配置 |
| Qoder | — | — | 需在 IDE 设置面板手动配置 |

**合并写入，不覆盖**：如果 MCP 配置文件已存在，`start-agent` 会读取原有内容，合并 `loopmarshal` 条目，保留所有已有的 MCP server 配置。不会覆盖或删除用户的其他 MCP 配置。

---

## Agent 角色分工

| 角色 | 职责 | 推荐人选 |
|------|------|---------|
| **Host** | 架构设计、任务拆解、批量派发、回报裁决、知识库维护策略 | 能力较强的 AI Agent（Claude Code、Trae） |
| **Worker** | 专注执行具体任务、提交结构化回报（含知识库候选更新） | 擅长特定领域的 AI Agent（Cursor 写前端、Codex 写后端） |
| **Knowledge Keeper** | 受 Host 委托维护知识库 L1/L2/L3 文档和用户偏好 | 任意 AI Agent（可在 Web 管理后台添加） |

### 协作闭环

```
Host 理解需求 → 知识库校准 → 拆解任务 → dispatch_many 批量派发
    ↓
Worker 领取任务 → 读取知识引用 → 执行 → submit 结构化回报
    ↓
Host resolve 消费回报 → 裁决知识候选 → 继续派发或收口
    ↓
（循环直到项目完成）
```

### 等待链

Worker Agent 通过 `await` 进入等待链：自动领取任务 → 执行 → 回报 → 再次等待。超时自动续接不丢消息，静默运行不打扰用户。

---

## 知识库（L1/L2/L3）

| 层级 | 内容 | 示例 |
|------|------|------|
| **L1 — 项目方向** | 长期原则、当前目标、需求约束 | "本项目是电商系统，React + Node.js" |
| **L2 — 领域规则** | 模块边界、协议、状态机、跨模块协作规则 | "认证模块：POST /api/register, bcrypt 加密" |
| **L3 — 字段对齐** | 字段、接口参数、数据结构、错误码 | "register 接口：email(string), password(string, ≥8)" |

- Host 负责知识库维护策略和裁决
- 如果存在 Knowledge Keeper，Host 委托其执行知识库更新
- Worker 读取知识库并在回报中提交候选更新
- 知识引用使用片段级格式（`l2/auth-module#password-encryption`），精准投递不浪费 token

---

## 命令参考

### 服务管理

```bash
loopmarshal start           # 启动核心服务 + Web 管理后台
loopmarshal stop            # 停止服务
loopmarshal status          # 查看服务状态
loopmarshal doctor          # 环境诊断
loopmarshal logs            # 查看日志
```

### 一键启动

```bash
loopmarshal start-agent <ide> --role <host|worker|knowledge_keeper> --duty "<职责>"
  [--session <会话名>] [--name <成员名>] [--timeout <秒>] [--dry-run]
```

### 会话与 Agent

```bash
loopmarshal attach <name> --session <session> --role <host|worker|knowledge_keeper> --duty "<职责>"
loopmarshal reset <name> --session <session>
loopmarshal members <hostName> --session <session>
```

### 任务派发与执行

```bash
loopmarshal dispatch-many <hostName> --session <session> --task "<workerName>::<任务内容>"
loopmarshal await <name> --session <session>
loopmarshal submit <name> --session <session> --content "<结果>"
loopmarshal resolve <hostName> --session <session> --summary "<处理摘要>" --action <completed|failed|delegated>
```

### 知识库

```bash
loopmarshal knowledge read <name> --session <session> --ref "L1/session-direction#current-goal"
loopmarshal knowledge list <name> --session <session> [--level <l1|l2|l3>] [--query <query>]
loopmarshal knowledge upsert <name> --session <session> --level <l1|l2|l3> --slug <slug> --title "<标题>" --content "<内容>"
```

---

## Web 管理后台

启动后访问 `http://127.0.0.1:42688` 查看管理面板：

- 会话列表与详情
- Host / Worker / Keeper 成员管理
- 实时消息流（WebSocket 推送）
- 任务线程状态
- 知识库浏览（L1/L2/L3）
- 模型配置管理
- MCP Server 管理
- 知识库维护者添加与删除

---

## 环境变量

| 变量名 | 作用 | 默认值 |
|--------|------|--------|
| `LOOPMARSHAL_HOST` | 核心服务 host | `127.0.0.1` |
| `LOOPMARSHAL_PORT` | 核心服务端口 | `42688` |
| `LOOPMARSHAL_WEB_PORT` | Web 前端端口 | `5173` |
| `LOOPMARSHAL_POWERSHELL_PATH` | PowerShell 路径（Windows） | System32 默认 |
| `LOOPMARSHAL_SKILLS_DIR` | Skills 目录路径 | 自动搜索 |
| `LOOPMARSHAL_MCP_COMMAND` | MCP server 启动命令 | `npx` |
| `LOOPMARSHAL_MCP_ARGS` | MCP server 启动参数 | `loopmarshal mcp serve` |
| `LOOPMARSHAL_CLI_PATH` | CLI 二进制路径 | 自动推导 |
| `LOOPMARSHAL_DATABASE_PATH` | 数据库文件路径 | `%LOCALAPPDATA%\loopmarshal\loopmarshal.sqlite`（Windows） |
| `LOOPMARSHAL_LOG_DIR` | 日志目录 | 项目目录 `.loopmarshal/runtime/` |
| `LOOPMARSHAL_TIMEZONE` | 时区显示 | 系统时区 |

---

## 仓库结构

```text
loopmarshal/
├── apps/
│   ├── cli/                    # 命令行入口（start-agent、attach、await 等）
│   ├── core/                   # 本地协作服务（Fastify HTTP + MCP）
│   └── web/                    # Web 管理后台（React + Vite）
│
├── packages/
│   ├── protocol/              # 类型定义与 Zod schema
│   ├── sdk/                    # HTTP 客户端 SDK
│   ├── store/                  # SQLite 持久化层
│   └── shared/                 # 公共工具与配置
│
├── adapters/
│   └── vscode-extension/      # VS Code 扩展适配器
│
├── skills/                     # AI 行为约束（主规则 + IDE 差异）
│   ├── host/                   # Host 技能（14 IDE + general）
│   ├── worker/                 # Worker 技能（14 IDE + general）
│   └── knowledge_keeper/      # Keeper 技能（14 IDE + general）
│
├── docs/                       # 设计文档
└── scripts/                    # 冒烟测试与打包
```

---

## 数据与隐私

所有数据存本地，不上云：

| 内容 | 位置 |
|------|------|
| **共享数据库**（会话/消息/任务/知识库） | `%LOCALAPPDATA%\loopmarshal\loopmarshal.sqlite`（Windows）<br>`~/.local/share/loopmarshal/loopmarshal.sqlite`（Linux）<br>`~/Library/Application Support/loopmarshal/loopmarshal.sqlite`（macOS） |
| 项目运行时配置 | `<项目目录>/.loopmarshal/config.json` |
| 运行元数据 | `<项目目录>/.loopmarshal/runtime/core.json` |
| 运行日志 | `<项目目录>/.loopmarshal/runtime/core.log` |

---

## 常见问题

### Q: 这和 AutoGen / CrewAI / LangGraph 有什么区别？

AutoGen、CrewAI、LangGraph 是**纯代码框架**，需要写 Python 代码定义 Agent。LoopMarshal 是**运行时编排器**，不写代码，直接用 `start-agent` 命令启动已有的 AI 编程工具（Claude Code、Cursor 等），通过 MCP 协议让它们自动协作。适合不想写编排代码、想直接用现有 AI IDE 工具的开发者。

### Q: 这和让 AI 用 function calling 调用其他 AI 有什么区别？

Function calling 是单个 LLM 内部的工具调用。LoopMarshal 是**跨进程的 Agent 间通信**——每个 AI Agent 是独立的进程（Claude Code 进程、Cursor 进程），通过 MCP 协议的消息队列通信，每个 Agent 有自己的 context window 和 LLM。

### Q: 为什么不做成全自动 Agent？

当前 LLM 还做不到 100% 可靠的自主规划和执行。LoopMarshal 走"人机协同"路线：AI Agent 负责执行和通信，人负责最终验收和方向把控。

### Q: 为什么分 Host 和 Worker Agent？

分工明确才能稳定。Host 专注"怎么安排工作"，Worker 专注"怎么把活干好"。如果混在一起，AI 一会儿思考全局、一会儿写代码，容易混乱出错。

### Q: start-agent 支持哪些 AI 编程工具？

14 种：Claude Code、Codex CLI、Cursor、Trae、OpenCode、Gemini CLI、Aider、Windsurf、Qoder、GitHub Copilot CLI、Cline、Crusher AI、Lovable、Xiaomi MiMo。

### Q: Knowledge Keeper 是什么？

Knowledge Keeper 是受 Host 委托的知识库维护者 Agent。它负责维护 L1/L2/L3 知识库文档和用户偏好，不写业务代码，不派发任务，只维护知识库。可以在 Web 管理后台添加，也可以通过 `start-agent --role knowledge_keeper` 启动。

### Q: 支持哪些 LLM？

LoopMarshal 本身不绑定 LLM——每个 AI Agent 使用自己 IDE 的模型配置。Claude Code 用 Claude，Codex 用 GPT，Gemini CLI 用 Gemini，Trae 可以切换 DeepSeek 等。不同 Agent 可以用不同 LLM 协同工作。

---

## License

Licensed under the [Apache License 2.0](./LICENSE).
