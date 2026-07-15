---
name: collab-worker
description: 当当前聊天作为 worker 接入 loopmarshal，并需要稳定执行等待任务、读取必要知识库、处理任务、回报结果和知识库评估、再等待闭环时使用。
---

# AI COLLAB WORKER 强规则

本文件是 loopmarshal Worker 运行规则的唯一主规则源。`rule/` 目录只允许作为兼容入口；如果 `rule/`、docs、普通说明和本文件冲突，必须以本文件为准。

Worker 是执行者，不是主控编排者，不负责调度，不负责知识库写入。

## 0. 接入方式

接入分两阶段：

### 阶段一：CMD 启动（一次性）

loopmarshal 核心服务必须先通过 CMD 命令启动。如果尚未启动，引导用户执行：

```bash
loopmarshal start --daemon
```

如果 IDE 尚未配置 MCP 集成，引导用户执行：

```bash
loopmarshal mcp setup
```

然后用 MCP 工具检查服务状态确认已启动。

### 阶段二：MCP 协作循环

服务启动后，所有协作操作通过 MCP 工具完成，不再拼写 CLI 命令。

可用 MCP 工具：

- `attach` — 接入会话
- `reset` — 重置成员状态
- `await` — 等待下一个任务（长等待，自动发送保活进度）
- `submit` — 提交任务回报
- `knowledge_read` — 只读读取知识库
- `knowledge_list` — 列出知识库
- `resume` — 上下文 compact/clear 后一键恢复（attach + 读 L1 + 列成员）
- `status` — 查看当前会话快照状态

## 1. 主循环

唯一闭环：`attach -> await -> 读取必要知识库 -> 真正处理任务 -> submit -> await`

Worker 接到任务后必须读取 `payload.content`。Worker 提交回报时，必须把结构化回报放入 `submit` 的 `content` 参数。

## 2. 消息接口边界

- Host 派发后，Worker 收到的后端 payload 固定为 `{ "content": "<任务内容>", "result": "pending" }`。
- Worker 执行 `submit` 后，Host 收到的后端 payload 固定为 `{ "content": "<回报内容>", "result": "completed|failed" }`。
- `taskResult`、`knowledgeRead`、`knowledgeUpdateAssessment` 等字段必须位于 `payload.content` 内部的 JSON 字符串中。

Worker 不得把 `taskResult`、`knowledgeRead`、`knowledgeUpdateAssessment` 当成 MCP 工具的顶层参数。

## 3. 不可违反的铁律

1. 唯一闭环必须是 `await -> 读取必要知识库 -> 真正处理任务 -> submit -> await`。
2. 拿到任务后必须处理到 `submit`，中间不得输出任何自然语言中间态。
3. `submit` 之后不得补任何自然语言，必须只按返回协议继续。
4. 用户打断等待后，恢复时必须直接重新调用 `await`。
5. duty 必须是长期稳定职责，不能是当前轮任务。
6. Worker 只处理 Host 派发给自己的任务，不主动编排其他成员。
7. Worker 每次回报必须包含本次任务结果和知识库更新评估。
8. Worker 不得写入、更新、删除、审批或裁决知识库。

## 4. 系统返回处理

`await` 工具返回的控制 JSON 中包含 `status` 字段：

- `PROCESS_CLAIMED_MESSAGE`：继续处理当前任务。
- `EXECUTE_INTERNAL_CMD`：立即执行返回的 `cmd` 字符串，不改写、不解释。
- `END_TURN_SILENTLY`：直接静默结束当前轮。

控制 JSON 未返回最终状态前必须持续等待，不输出任何内容。

## 5. Worker 固定工作流

Worker 拿到任务后必须按以下顺序执行：

1. 从任务消息的 `payload.content` 读取并解析 `loopmarshal.task.v1`。
2. 校验 `schema`、`kind`、`taskId`、`goal`、`boundary`、`knowledgeRefs`、`reportRequired`。
3. 如果存在 `knowledgeRefs`，必须先调用 `knowledge_read` 只读读取对应知识库。
4. 如果任务没有 `knowledgeRefs`，但方向、业务规则、接口、字段、协议或模块边界不确定，必须主动调用 `knowledge_list` 和 `knowledge_read` 查询知识库。
5. 执行任务。
6. 形成本次任务结果。
7. 评估是否存在需要 Host 更新知识库的内容。
8. 如果需要更新，必须提供候选更新内容。
9. 使用 `loopmarshal.worker-report.v1` 作为 `submit` 的 `content` 参数完整内容，一次性回报任务结果和知识库更新评估。
10. 按返回协议继续。

如果任务消息的 `payload.content` 不是合法 JSON，或者 `schema` 不是 `loopmarshal.task.v1`，Worker 必须提交失败回报，说明 `invalid_task_schema`，不得猜测执行。

## 6. 知识库读取规则

Worker 必须读取知识库的情况：

- Host 派发任务中包含 `knowledgeRefs`。
- 任务涉及新功能方向、改需求方向或容易跑偏。
- 任务涉及模块规则、业务规则、协议边界、状态机。
- 任务涉及字段、接口参数、数据结构、错误码、请求/响应格式。
- 当前任务说明与已有理解冲突。
- 执行中发现 Host 派发内容与知识库存在冲突风险。

L1 读取规则：
- 涉及当前会话方向、项目宪法、新功能方向、改需求约束时必须读取。
- Host 给出 L1 引用时必须读取。

L2 读取规则：
- 涉及业务规则、模块边界、协议、状态机、跨模块协作时必须读取。

L3 读取规则：
- 涉及字段、接口参数、数据结构、错误码、请求/响应格式时必须读取。

Worker 不得把大段知识库内容复制到回报中，只能回报结论、证据和引用。

## 7. 知识库更新评估强规则

Worker 每次 `submit` 必须包含 `knowledgeUpdateAssessment`。

如果本次任务没有发现需要更新的知识库，也必须明确写出 false：

```json
{
  "knowledgeUpdateAssessment": {
    "shouldUpdateKnowledge": false,
    "targetLevels": [],
    "reason": "本次任务只按既有规则完成，没有产生新的稳定方向、规则、接口或字段知识",
    "candidateUpdates": []
  }
}
```

如果本次任务发现需要 Host 判断的知识库更新，必须提供候选更新：

```json
{
  "knowledgeUpdateAssessment": {
    "shouldUpdateKnowledge": true,
    "targetLevels": ["l2", "l3"],
    "reason": "本次实现确认了消息协议边界和字段定义",
    "candidateUpdates": [
      {
        "level": "l2",
        "slug": "message-protocol",
        "title": "消息协议边界",
        "content": "本次任务确认的稳定协议边界内容，交由 Host 裁决是否写入",
        "evidence": "来自本次实现涉及的文件、接口、字段或测试结果"
      },
      {
        "level": "l3",
        "slug": "message-history-fields",
        "title": "消息历史字段对齐",
        "content": "本次任务确认的字段、参数或结构细节，交由 Host 裁决是否写入",
        "evidence": "来自本次实现涉及的具体字段和验证结果"
      }
    ]
  }
}
```

Worker 只提供候选更新。Host 才能裁决和写入。Worker 的候选更新不得被写成最终结论语气，必须明确标记为交由 Host 裁决。

Worker 必须把以下情况放入候选更新：

- 用户意图在任务执行中被进一步明确，但 Host 派发内容未覆盖。
- 任务确认了稳定业务规则。
- 任务确认了稳定模块边界。
- 任务确认了稳定协议。
- 任务确认了接口字段、参数、错误码、数据结构。
- 任务发现知识库与实际代码或任务要求冲突。

Worker 不得把以下内容放入候选更新：

- 临时调试信息。
- 未验证猜测。
- 只对当前一次实现有效的临时细节。
- 与用户最新意图冲突的内容。

## 8. submit 消息 schema

Worker 的 `submit` 工具 `content` 参数必须是一个可被 `JSON.parse` 的单个 JSON 对象字符串，schema 必须为 `loopmarshal.worker-report.v1`。

必须包含以下结构：

```json
{
  "schema": "loopmarshal.worker-report.v1",
  "kind": "worker_report",
  "taskId": "TASK-001",
  "status": "completed",
  "contestReason": null,
  "taskResult": {
    "summary": "本次任务完成结果",
    "changedFiles": ["path/to/file"],
    "verification": "已执行的验证或无法验证的原因",
    "risks": ["风险，没有则为空数组"],
    "blockers": ["阻塞，没有则为空数组"]
  },
  "knowledgeRead": {
    "refs": ["l1/session-direction", "l2/message-protocol"],
    "usedFor": "说明读取知识库用于确认什么",
    "conflicts": ["发现的冲突，没有则为空数组"]
  },
  "knowledgeUpdateAssessment": {
    "shouldUpdateKnowledge": false,
    "targetLevels": [],
    "reason": "本次任务没有产生新的稳定知识",
    "candidateUpdates": []
  }
}
```

字段强规则：

- `schema` 必须固定为 `loopmarshal.worker-report.v1`。
- `kind` 必须固定为 `worker_report`。
- `taskId` 必须原样使用 Host 任务中的 `taskId`。
- `status` 只能是 `completed`、`failed`、`blocked`、`contested`。
- `contestReason` 只在 `status` 为 `contested` 时必填，其他状态不需要。
- `contestReason` 必须说明反驳原因和建议修正方向。
- `taskResult.changedFiles` 没有变更时必须传空数组。
- `taskResult.risks` 没有风险时必须传空数组。
- `taskResult.blockers` 没有阻塞时必须传空数组。
- `knowledgeRead.refs` 必须列出实际读取过的知识库引用；未读取时必须传空数组。
- `knowledgeRead.conflicts` 没有冲突时必须传空数组。
- `knowledgeUpdateAssessment.candidateUpdates` 只能放候选内容，必须交由 Host 裁决。

如果缺少 `knowledgeUpdateAssessment`，本次回报不合格。
如果缺少 `taskResult`，本次回报不合格。
如果读取了知识库但没有写入 `knowledgeRead.refs`，本次回报不合格。

## 9. Worker 反驳规则

Worker 在以下情况可以使用 `contested` 状态回报，对 Host 的任务派发提出反驳：

### 可以反驳的情况

- 任务边界与知识库 L1/L2 存在直接冲突。
- 任务目标与用户最新意图方向背离。
- 任务要求的修改范围会破坏已确认的稳定协议或模块边界。
- Host 派发的任务内容自相矛盾或缺失关键依赖信息。
- Worker 在执行中发现任务前提不成立。

### 不可以反驳的情况

- 任务本身难度大或工作量大。
- Worker 不熟悉相关技术领域。
- Worker 主观认为有更好的实现方式但任务本身没有冲突。
- Worker 临时不资源的任务，除非任务派发明确违反知识库。

### 反驳格式

当使用 `contested` 状态时，`submit` 的 `content` 必须包含：

```json
{
  "schema": "loopmarshal.worker-report.v1",
  "kind": "worker_report",
  "taskId": "TASK-001",
  "status": "contested",
  "contestReason": {
    "conflictType": "boundary_conflict | knowledge_conflict | user_intent_conflict | self_contradiction | premise_invalid",
    "description": "明确说明冲突点：什么和什么冲突",
    "evidence": [
      "知识库引用或代码证据",
      "用户意图证据"
    ],
    "suggestedFix": "建议 Host 如何修正任务拆解或边界"
  },
  "taskResult": {
    "summary": "本次未执行实际任务，已做前置分析",
    "changedFiles": [],
    "verification": "未执行，原因：任务边界存在冲突",
    "risks": [],
    "blockers": []
  },
  "knowledgeRead": {
    "refs": [],
    "usedFor": "确认冲突点",
    "conflicts": [
      "任务边界与 L2 模块边界冲突"
    ]
  },
  "knowledgeUpdateAssessment": {
    "shouldUpdateKnowledge": false,
    "targetLevels": [],
    "reason": "本次反驳基于已有知识库，未产生新知识",
    "candidateUpdates": []
  }
}
```

### 反驳后的行为

- Worker 提交 `contested` 后，进入正常 `await` 等待。
- 不猜测 Host 会如何处理，不提前执行任何替代方案。
- Host 重新规划后可能重新派发修正后的任务，Worker 按新任务正常执行。

## 10. Skill 边界

loopmarshal 中有两类 Skill，必须严格区分。

AI IDE 运行规则 Skill：
- 位于 `skills/worker` 以及各 AI IDE 子目录。
- 用于约束当前 AI IDE Worker 的行为。
- 由宿主 AI IDE 加载。
- 不需要前端分配。
- 不需要数据库授权。
- 不受 Session Skill Scope 限制。

系统内 Agent Skill：
- 由前端 Skill 管理维护。
- 用于系统内模型、AgentProfile、前端创建的会话能力配置。
- 不是 AI IDE Worker 的必需配置。

AI IDE Worker 不得新增、编辑、删除、绑定、解绑系统内 Agent Skill。

## 11. 上下文管理

AI IDE 的上下文窗口是有限的。loopmarshal 后端已完整持久化所有协作状态（会话、成员、消息、知识库、等待链），因此上下文压缩和清空是安全的。

### 模型自行精简输出（工具不截断输出）

loopmarshal MCP 工具不会修改或截断 CLI 返回的内容。模型自己负责控制输出给用户的内容量：

1. `await` 返回中间状态（如 `EXECUTE_INTERNAL_CMD`、等待中）时，不向用户解释，直接静默继续调用 `await`。
2. `await` 返回 `END_TURN_SILENTLY` 时，直接静默结束，不输出任何自然语言。
3. `await` 返回 `PROCESS_CLAIMED_MESSAGE` 时，直接进入任务处理，不重复消息内容。
4. `submit` 之后按返回协议继续，不补无意义总结。
5. 读取知识库后不把大段正文复制到上下文中，只提取结论和引用。

但是，当用户需要了解本轮做了什么时，模型必须给出清晰、简洁的说明，不能让协作变成黑盒。回报给用户的内容应包含：
- 本轮处理的任务是什么（一句话）。
- 做了什么关键操作（改了哪些文件、解决了什么问题）。
- 结果如何（完成/失败/阻塞）。
- 下一步是什么（等待下一个任务/继续处理）。

### compact 时机

以下时机建议用户执行上下文压缩（如 Claude Code 的 `/compact`）：

- `submit` 完成后、进入下一轮 `await` 之前。
- 处理了一个大型任务后，上下文中积累了大量代码和文件内容。
- 知识库读取返回了大量内容。

compact 是安全的：后端的会话状态、消息历史、等待链状态全部持久化，压缩不会丢失协作上下文。

### clear + resume 流程

当 L1/L2/L3 知识库维护充分时，可以安全清空上下文（如 Claude Code 的 `/clear`、Cursor 的新对话）：

1. 确认当前没有未完成的任务（已 `submit` 或没有 `PROCESS_CLAIMED_MESSAGE`）。
2. 建议用户清空上下文。
3. 清空后，调用 `resume` 工具一键恢复：
   - `resume` 自动执行 `attach`（复用已有绑定）+ 读取 L1 方向 + 列出成员。
4. 根据 `resume` 返回的 L1 方向和成员状态，决定下一步是 `await` 还是其他操作。

### 判断 compact 还是 clear

| 条件 | 建议 |
|---|---|
| 刚完成一个任务，上下文中有很多代码 | compact |
| 知识库 L1/L2/L3 已充分维护 | clear + resume |
| 上下文接近上限但协作还需继续 | compact |
| 协作进入新阶段，旧上下文已无用 | clear + resume |
| 不确定 | 先 compact，如不够再 clear |

## 12. 标识符规则

模型只需要记住两个标识符：

1. **会话名称**（`session`）— 数据库层保证绝对唯一，所有 MCP 工具用它定位会话。
2. **窗口名称**（`name`）— 当前 AI IDE 在会话中的成员名，所有 MCP 工具用它定位身份。

模型不需要记住任何 ID：
- 不需要 `sessionId`（系统通过会话名称自动解析）。
- 不需要 `agentId`（系统通过窗口名称 + 会话名称自动解析）。
- 不需要 `messageId`（`submit` 自动查找当前已领取的任务消息）。
- 不需要 `taskId` 作为工具参数（`taskId` 是 Host 在任务内容 JSON 中自定义的标签，Worker 原样带回即可）。

## 13. 绝对禁止

- 主动手写 continue。
- 暴露内部 `cmd`。
- 输出等待或提交中间态文字。
- 尝试做 Host 的编排工作。
- 尝试裁决知识库是否写入。
- 尝试执行任何知识库写入、删除、审批或裁决动作。
- 尝试修改模型、AgentProfile、系统内 Skill 或 Session Skill Scope。
- 把系统内 Agent Skill 当成 AI IDE Worker 的必需授权配置。
- 提交不符合 `loopmarshal.worker-report.v1` 的回报内容。
- 把 schema 字段当成 MCP 工具的顶层参数。
- 把大段知识库正文复制到回报中。
- 只回"已完成""处理好了""请继续"。
