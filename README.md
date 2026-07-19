# loopmarshal

> 让多个 AI 在同一个项目里稳定协作的运行

[English README](./README-EN.md) | [中文说明](./README.md)

---

## 为什么需要它

当你有 Trae、Cursor、Claude Desktop 多个 AI 客户端共同维护同一个项目的时候，你会遇到这些问题：

- 每个 AI 都不知道别人在做什么
- 你需要手动复制粘贴任务和结果
- 上下文同步全靠你人肉维护
- 没有统一的会话状态管理

`loopmarshal` 解决的就是这个问题：让一个 AI 当 Host 统筹，其他 AI 当 Worker 各司其职，形成稳定的协作闭环。

#### 使用场景

- 分模块开发时,不同模块用不同的AI进行开发时,没有统筹者,需要开发者作为统筹者,并且需要来回复制粘贴提示词
- 前后端分离开发时,如果用同一个AI进行开发,很容易上下文爆炸,并且因为没有统筹者,会导致前后端接口对不齐的情况,有的AI也会出现前后端能力的差距,此时可以用本工具进行前后端工具并行开发工作
- 不同费用的AI负责不同模块的开发,免费AI当做统筹者,贵的AI当架构师,充分发挥各个AI的最大优势
- 可以使用openclaw或者hermes agent作为host对本地的桌面级AI应用进行工作安排,能大幅提高工作效率

---

## 核心思路

### 角色分工

| 角色 | 推荐人选 | 职责 |
|-----|---------|-----|
| **Host** | Trae AI | 架构设计、任务拆分、派发、结果整合、知识裁定 |
| **Worker** | Cursor / Claude | 专注执行具体任务、提交结构化回报 |
| **Knowledge Keeper** | 任意 AI | 受 Host 委托维护知识库与用户习惯 |

### 知识库（L1/L2/L3）

- **L1 — 项目宪章**：长期原则、当前方向、需求约束
- **L2 — 领域规则**：模块边界、协议、状态机、跨模块协作规则
- **L3 — 字段对齐**：字段、接口参数、数据结构、错误码

Host 负责知识裁定和维护策略；如果会话中存在 Knowledge Keeper，则由 Host 委托其维护知识库；如果没有，则由 Host 自行维护。Worker 读取知识库，并在回报中提交候选更新。知识引用使用片段级格式（`l2/current#message-protocol`），精准投递不浪费 token。

### 协作闭环

```
Host 理解需求
    ↓
知识裁定 → 构建/校准 L1/L2/L3
    ↓
拆解任务 → dispatch-many 批量派发给 Worker
    ↓
Worker 领取任务 → 读取知识引用 → 执行 → submit 结构化回报
    ↓
Host resolve 消耗回报 → 裁定知识候选更新 → 继续派发
    ↓
（循环直到项目完成）
```

### 等待链

Worker 通过 `await` 命令进入等待链，自动领取任务、执行、回报、再次等待。超时自动续接不丢消息，静默运行不打扰用户。

---

## 快速开始

当你把仓库下载到本地之后，最快的上手方式如下。

### 安装依赖并构建

```powershell
pnpm install
pnpm run build
pnpm run link:cli
```

这样会把本地构建好的 `loopmarshal` CLI 安装到当前环境里，后续就可以直接使用 `loopmarshal` 命令。

### 启动本地运行

```cmd
loopmarshal start
```

启动后会同时运行后端服务（Fastify, port 42688）和前端管理后台（Vite, port 5173）。公开推荐的启动入口只保留 `loopmarshal start`。

`loopmarshal start` 不会主动启动 MCP stdio server。MCP server 由 AI IDE/CLI 根据配置启动，实际命令是 `loopmarshal mcp serve`。

下一步是在 AI IDE/CLI 中配置 LoopMarshal MCP server，并按业务需要配置 MCP tool timeout。LoopMarshal 单条内部等待链默认持续约 55 分钟；建议把宿主工具的 timeout 配置得更长，具体示例见 [MCP配置与最长等待时间](./MCP配置与最长等待时间.md)。

JSON 类 MCP 配置可以直接复制这个示例：

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

如果你的 AI IDE/CLI 不支持 `timeout` 字段，就先删除这一行，只保留 `command` 和 `args`。

### 在 Host IDE/CLI 和 Worker IDE/CLI 中导入 Skill

```tex
在本项目的 skills/ 文件夹中，按角色（host/worker）和 IDE（claude/codex/cursor/trae/general）分类。
每个 IDE 子目录里的 SKILL.md 都是可独立安装的一体化文件，已包含主规则和 IDE 差异约束。
安装时只复制当前角色、当前 IDE 对应的一个 SKILL.md；如果没有对应 IDE，使用 general/ 中的通用版本。
```

### Rule(可选)

**这步是可选的,只用Skill理论上来说已经足够支撑整个流程了,但是有的AI编程工具会抽风,导致异常中断会话或者其他情况,所以可以用Rule在进行一次限制**

```tex
在本项目的 rule/ 文件夹中，按角色区分（rule/host/ 和 rule/worker/），分别导入即可。
```

### 用Host建立一个协作会话

```tex
你是本项目的 Host，名称为 trae。请创建并加入会话 demo-collab-01。
```

### Worker加入会话

```tex
你是本项目的 Worker，名称为 cursor。请加入会话 demo-collab-01。
你的职责是：前端开发。
```

### Host查看当前会话成员

```tex
查看 demo-collab-01 当前会话成员。
```

### 让 host 开始分发任务

```
按照刚才沟通并确认的方案，开始协调 Worker 推进这个方案。
```

### 让 worker 持续等待、执行并回报

```tex
进入等待链。
```

### 为什么 Rule 优先级最高

Skill 是软约束，AI 可能会"忘记"或者"灵活处理"。
但 Rule 是硬法律，任何情况下都不能违反。这是保证协作稳定性的关键。

---

## 最佳实践

**最佳的可以用openclaw或者hermes agent当做host,指挥各个worker进行工作**

### 对于 Host

1.  **先加载 Rule，再加载 Skill**
    Rule 是基础约束，必须先建立。

2.  **用明确的会话名称**
    比如 `ecommerce-v2`、`blog-system`，不要用 `test`、`session-1` 这种。

3.  **Worker 职责要稳定**
    `--worker-role` 是长期职责，不是"帮我写个页面"这种单次任务。
    应该是"负责前端 React 组件开发"、"负责后端 API 实现"、"负责代码审查"。

4.  **能并行就并行**
    多个独立任务一次性批量派发，效率最高。

5.  **不要手工拼接参数**
    所有 `--token`、`--continue-*` 等参数都由 CLI 返回，直接执行就行。

### 对于 Worker

1.  **专注执行，不要越权**
    Worker 就是执行任务，不要去做整体规划。

2.  **提交结果要清晰**
    做完什么、改了哪些文件、有什么注意事项，说清楚。

3.  **提交完自动回到等待**
    不要让用户每次都手动输入"进入等待链"。

---

## 命令参考

### 服务管理

```bash
loopmarshal start    # 启动本地 core 服务和 Web 管理后台
loopmarshal stop     # 停止服务
loopmarshal status   # 查看状态
loopmarshal doctor   # 诊断检查
loopmarshal logs     # 查看日志
```

### MCP 接入

```bash
loopmarshal mcp status
```

MCP server 和最长等待时间由用户在 AI IDE/CLI 中手动配置，见 [MCP配置与最长等待时间](./MCP配置与最长等待时间.md)。常见 JSON 配置如下：

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

Codex 常见 TOML 配置如下：

```toml
[mcp_servers.loopmarshal]
command = "npx"
args = ["loopmarshal", "mcp", "serve"]
tool_timeout_sec = 86400
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

## 数据与状态

所有数据都存在本地，不上云端。

| 内容 | 默认位置 |
|------|---------|
| 项目配置 | `.loopmarshal/config.json` |
| 会话/消息/任务数据库 | `.loopmarshal/loopmarshal.sqlite` |
| 运行日志 | `log/log.txt` |
| CLI 本地状态（Windows） | `%LOCALAPPDATA%\loopmarshal` |

### 环境变量

| 变量名 | 作用 |
|-------|------|
| `LOOPMARSHAL_LOG_DIR` | 自定义日志目录 |
| `LOOPMARSHAL_COMMAND_TRACE_FILE` | 自定义命令 trace 文件 |
| `LOOPMARSHAL_CLI_STATE_DIR` | 自定义 CLI 状态目录 |
| `LOOPMARSHAL_TIMEZONE` | 自定义时区显示 |

---

## 仓库结构

```text
loopmarshal/
├── apps/
│   ├── cli/           # 命令行入口（23 个命令）
│   ├── core/          # 本地协作服务（Fastify HTTP 服务）
│   └── web/           # Web 管理后台（React + Vite）
│
├── packages/
│   ├── protocol/      # 类型定义与协议（Zod schema）
│   ├── sdk/           # Core HTTP 客户端 SDK
│   ├── store/         # SQLite 持久化层
│   └── shared/        # 公共工具与配置
│
├── adapters/
│   └── vscode-extension/  # VS Code 扩展适配器
│
├── skills/            # AI 行为约束模板（软约束）
│   ├── host/          # Host 技能（claude/codex/cursor/trae/general）
│   └── worker/        # Worker 技能（claude/codex/cursor/trae/general）
│
├── rule/              # 强制执行规则（硬约束，优先级最高）
│   ├── host/
│   └── worker/
│
├── docs/              # 设计文档与联调指南
│
└── scripts/           # 烟测与打包脚本
```

---

## 当前状态

项目还在持续开发中，但核心流程已经稳定可用：

- 命名会话管理
- Host / Worker / Knowledge Keeper 三角色分离
- 单任务 / 批量任务派发
- 可续接等待链（超时不丢）
- SQLite 持久化消息流转
- Skill / Rule 双层 AI 行为约束
- 知识库 L1/L2/L3 架构
- 片段级知识引用
- 用户协作习惯管理
- Web 管理后台（会话/成员/消息/知识库可视化）
- 前端国际化（中文/英文）
- VS Code 扩展适配器

---

## 常见问题

### Q: 为什么不做成全自动 Agent？

因为当前的 AI 还做不到 100% 可靠的自主规划和执行。
`loopmarshal` 走的是"**人机协同**"路线：
- AI 负责执行、整合、通信
- 人负责最终验收、方向把控

这样更可靠，也更符合当前的技术水平。

### Q: 为什么一定要分 Host 和 Worker？

因为分工明确才能稳定。

- Host 专注"怎么安排工作"
- Worker 专注"怎么把活干好"

如果混在一起，AI 一会儿要思考全局，一会儿要写具体代码，很容易混乱出错。

### Q: 为什么需要等待链？

因为 AI 处理任务需要时间，而且我们不想让你手动轮询。

等待链会自动：
- 检查有没有新消息
- 有任务就领取执行
- 超时自动续接，不会丢
- 静默运行，不打扰你

### Q: Rule 和 Skill 有什么区别？

| 维度 | Skill | Rule |
|------|-------|------|
| 约束强度 | 软约束（AI"可以参考"） | 硬约束（AI"必须遵守"） |
| 优先级 | 低 | 最高 |
| 作用 | 提供行为模板 | 划出不可逾越的边界 |
| 典型内容 | "你应该这样做" | "绝对不能那样做" |

---

## 最后一句

`loopmarshal` 不是让 AI 取代你，而是让你同时指挥多个 AI 干活的时候，不用那么累。

---

## License

Licensed under the [Apache License 2.0](./LICENSE).

