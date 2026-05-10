# ai-collab

> 让多个 AI 在同一个项目里稳定协作的运行

[English README](./README-EN.md) | [中文说明](./README.md)

---

## 为什么需要它

当你有 Trae、Cursor、Claude Desktop 多个 AI 客户端共同维护同一个项目的时候，你会遇到这些问题：

- 每个 AI 都不知道别人在做什么
- 你需要手动复制粘贴任务和结果
- 上下文同步全靠你人肉维护
- 没有统一的会话状态管理

`ai-collab` 解决的就是这个问题：让一个 AI 当 Host 统筹，其他 AI 当 Worker 各司其职，形成稳定的协作闭环。

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
| **Host** | Trae AI | 任务拆分、派发、结果整合、知识库构建与裁定 |
| **Worker** | Cursor / Claude | 专注执行具体任务、提交结构化回报 |
| **Knowledge Keeper** | 任意 AI | 受 Host 委托维护知识库与用户习惯 |

### 知识库（L1/L2/L3）

- **L1 — 项目宪章**：长期原则、当前方向、需求约束
- **L2 — 领域规则**：模块边界、协议、状态机、跨模块协作规则
- **L3 — 字段对齐**：字段、接口参数、数据结构、错误码

Host 构建和裁定知识库，Worker 读取并在回报中提交候选更新。知识引用使用片段级格式（`l2/current#message-protocol`），精准投递不浪费 token。

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

这样会把本地构建好的 `ai-collab` CLI 安装到当前环境里，后续就可以直接使用 `ai-collab` 命令。

### 启动本地运行

```cmd
ai-collab start
```

启动后会同时运行后端服务（Fastify, port 42688）和前端管理后台（Vite, port 5173）。用 `--no-web` 可跳过前端，`--daemon` 可后台运行。

### 在 Host IDE/CLI 和 Worker IDE/CLI 中导入 Skill

```tex
在本项目的 skills/ 文件夹中，按角色（host/worker/knowledge-keeper）和 IDE（claude/codex/cursor/trae/general）分类。
如果没有对应 IDE 的 skill，使用 general/ 中的通用版本。
```

### Rule(可选)

**这步是可选的,只用Skill理论上来说已经足够支撑整个流程了,但是有的AI编程工具会抽风,导致异常中断会话或者其他情况,所以可以用Rule在进行一次限制**

```tex
在本项目的 rule/ 文件夹中，按角色区分（rule/host/ 和 rule/worker/），分别导入即可。
```

### 用Host建立一个协作会话

```tex
你是当前项目 host。你的名字是trae,创建并加入会话为demo-collab-01
```

### Worker加入会话

```tex
你是当前项目的worker,你得名字是cursor,加入会话demo-collab-01,你的职责是前端开发
```

### Host查看当前会话成员

```tex
查看当前项目成员
```

### 让 host 开始分发任务

**这部分要在和host定完方案后,可以开始工作了,这边我的示例是定完方案后,让host开始工作,其实也不用那么麻烦,也可以在这步之前和host根据成员规定工作流程,我的这个提示词有点冗余**

```
基本流程是,第一次先同时给前端和后端分发任务,然后你进入等待worker的消息,接收到前后端的消息时,再给审查者派发审查任务, 以及给前后端派发新的任务,但是这个是前端结束,前端审查,前端派发任务,后端同理,不要搞混,现在你要将任务查分的细一点,不要一次分发一个大任务,要细化,现在对各个worker开始分发任务
```

### 让 worker 持续等待、执行并回报

```tex
进入等代链
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
ai-collab start [--no-web] [--daemon]   # 启动服务（含前端）
ai-collab stop                           # 停止服务
ai-collab status                         # 查看状态
ai-collab doctor                         # 诊断检查
ai-collab logs                           # 查看日志
```

### 会话与 Agent

```bash
ai-collab attach <name> --session <session> --role <host|worker|knowledge_keeper> --duty "<职责>"
ai-collab reset <name> --session <session>
ai-collab members --session <session>
```

### 任务派发与执行

```bash
ai-collab dispatch-many --session <session> --tasks '[...]'
ai-collab await <name> --session <session>
ai-collab submit <name> --session <session> --content "<结果>"
ai-collab resolve --session <session> --message-id <id> --action <approve|reject|revise>
```

### 知识库

```bash
ai-collab knowledge read --session <session> --level <l1|l2|l3> --slug <slug>
ai-collab knowledge list --session <session>
ai-collab knowledge judge --session <session> --message-id <id>
ai-collab knowledge fulfil-judgement --session <session> --judgement-id <id>
ai-collab knowledge read-current --session <session>
ai-collab knowledge update-current --session <session>
```

### 用户习惯

```bash
ai-collab profile get <name> --session <session> [key]
ai-collab profile set <name> --session <session> <key> <value>
ai-collab profile delete <name> --session <session> <key>
```

---

## 数据与状态

所有数据都存在本地，不上云端。

| 内容 | 默认位置 |
|------|---------|
| 项目配置 | `.ai-collab/config.json` |
| 会话/消息/任务数据库 | `.ai-collab/ai-collab.sqlite` |
| 运行日志 | `log/log.txt` |
| CLI 本地状态（Windows） | `%LOCALAPPDATA%\ai-collab` |

### 环境变量

| 变量名 | 作用 |
|-------|------|
| `AI_COLLAB_LOG_DIR` | 自定义日志目录 |
| `AI_COLLAB_COMMAND_TRACE_FILE` | 自定义命令 trace 文件 |
| `AI_COLLAB_CLI_STATE_DIR` | 自定义 CLI 状态目录 |
| `AI_COLLAB_TIMEZONE` | 自定义时区显示 |

---

## 仓库结构

```text
ai-collab/
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
│   ├── worker/        # Worker 技能（claude/codex/cursor/trae/general）
│   └── knowledge-keeper/  # 知识管理员技能
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
`ai-collab` 走的是"**人机协同**"路线：
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

`ai-collab` 不是让 AI 取代你，而是让你同时指挥多个 AI 干活的时候，不用那么累。

---

## License

Licensed under the [Apache License 2.0](./LICENSE).

