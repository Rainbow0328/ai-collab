---
name: collab-worker
description: 当当前聊天作为 worker 接入 ai-collab，并需要稳定执行等待任务、读取必要知识库、处理任务、回报结果和知识库评估、再等待闭环时使用。
---

# AI COLLAB WORKER 强规则

本文件是 ai-collab Worker 运行规则的唯一主规则源。`rule/` 目录只允许作为兼容入口；如果 `rule/`、docs、普通说明和本文件冲突，必须以本文件为准。

Worker 是执行者，不是主控编排者，不负责调度，不负责知识库写入。

## 1. 主循环命令

只允许使用以下公开命令：

- `ai-collab attach <name> --session <sessionName> --role worker --duty "<稳定职责>"`
- `ai-collab reset <name> --session <sessionName>`
- `ai-collab await <name> --session <sessionName>`
- `ai-collab submit <name> --session <sessionName> --content "<结构化结果>"`

Worker 只读知识库命令：

- `ai-collab knowledge read <name> --session <sessionName> --ref <l1|l2|l3/slug>`
- `ai-collab knowledge list <name> --session <sessionName> [--level l1|l2|l3] [--query <query>]`

## 2. 消息接口边界

后端真实消息接口的顶层 `payload` 由 CLI 写入。Worker 接到任务时，必须读取 `payload.content`。Worker 提交回报时，必须把结构化回报写入 `submit --content`。

CLI 真实承载规则：

- Host 派发后，Worker 收到的后端 payload 固定为 `{ "content": "<任务内容>", "result": "pending" }`。
- Worker 执行 `submit --content` 后，Host 收到的后端 payload 固定为 `{ "content": "<回报内容>", "result": "completed|failed" }`。
- `taskResult`、`knowledgeRead`、`knowledgeUpdateAssessment` 等字段必须位于 `payload.content` 内部的 JSON 字符串中。

Worker 不得把 `taskResult`、`knowledgeRead`、`knowledgeUpdateAssessment` 当成 CLI 顶层参数。Worker 不得把回报拆成多条消息。

## 3. 不可违反的铁律

1. 唯一闭环必须是 `await -> 读取必要知识库 -> 真正处理任务 -> submit -> await`。
2. 拿到任务后必须处理到 `submit`，中间不得输出任何自然语言中间态。
3. `submit` 之后不得补任何自然语言，必须只按返回协议继续。
4. 用户打断等待后，恢复时必须直接重新执行 `await`。
5. duty 必须是长期稳定职责，不能是当前轮任务。
6. Worker 只处理 Host 派发给自己的任务，不主动编排其他成员。
7. Worker 每次回报必须包含本次任务结果和知识库更新评估。
8. Worker 不得写入、更新、删除、审批或裁决知识库。

## 4. 系统返回处理

- `PROCESS_CLAIMED_MESSAGE`：继续处理当前任务。
- `EXECUTE_INTERNAL_CMD`：立即执行返回的 `cmd` 字符串，不改写、不解释。
- `END_TURN_SILENTLY`：直接静默结束当前轮。

cmd 未返回最终 JSON 前必须持续等待，不输出任何内容。

## 5. Worker 固定工作流

Worker 拿到任务后必须按以下顺序执行：

1. 从任务消息的 `payload.content` 读取并解析 `ai-collab.task.v1`。
2. 校验 `schema`、`kind`、`taskId`、`goal`、`boundary`、`knowledgeRefs`、`reportRequired`。
3. 如果存在 `knowledgeRefs`，必须先只读读取对应知识库。
4. 如果任务没有 `knowledgeRefs`，但方向、业务规则、接口、字段、协议或模块边界不确定，必须主动只读查询知识库。
5. 执行任务。
6. 形成本次任务结果。
7. 评估是否存在需要 Host 更新知识库的内容。
8. 如果需要更新，必须提供候选更新内容。
9. 使用 `ai-collab.worker-report.v1` 作为 `submit --content` 的完整内容，一次性回报任务结果和知识库更新评估。
10. 按返回协议继续。

如果任务消息的 `payload.content` 不是合法 JSON，或者 `schema` 不是 `ai-collab.task.v1`，Worker 必须提交失败回报，说明 `invalid_task_schema`，不得猜测执行。

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

Worker 的 `submit --content` 必须是一个可被 `JSON.parse` 的单个 JSON 对象字符串，schema 必须为 `ai-collab.worker-report.v1`。

必须包含以下结构：

```json
{
  "schema": "ai-collab.worker-report.v1",
  "kind": "worker_report",
  "taskId": "TASK-001",
  "status": "completed",
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

- `schema` 必须固定为 `ai-collab.worker-report.v1`。
- `kind` 必须固定为 `worker_report`。
- `taskId` 必须原样使用 Host 任务中的 `taskId`。
- `status` 只能是 `completed`、`failed`、`blocked`。
- `taskResult.changedFiles` 没有变更时必须传空数组。
- `taskResult.risks` 没有风险时必须传空数组。
- `taskResult.blockers` 没有阻塞时必须传空数组。
- `knowledgeRead.refs` 必须列出实际读取过的知识库引用；未读取时必须传空数组。
- `knowledgeRead.conflicts` 没有冲突时必须传空数组。
- `knowledgeUpdateAssessment.candidateUpdates` 只能放候选内容，必须交由 Host 裁决。

如果缺少 `knowledgeUpdateAssessment`，本次回报不合格。

如果缺少 `taskResult`，本次回报不合格。

如果读取了知识库但没有写入 `knowledgeRead.refs`，本次回报不合格。

命令示例：

```bash
ai-collab submit worker-a --session demo --content '{"schema":"ai-collab.worker-report.v1","kind":"worker_report","taskId":"TASK-001","status":"completed","taskResult":{"summary":"已完成消息历史展示修复","changedFiles":["apps/web/src/components/console/TaskThreadList.tsx"],"verification":"npm run build passed","risks":[],"blockers":[]},"knowledgeRead":{"refs":["l1/session-direction","l2/frontend-console"],"usedFor":"确认控制台展示边界","conflicts":[]},"knowledgeUpdateAssessment":{"shouldUpdateKnowledge":false,"targetLevels":[],"reason":"没有产生新的稳定规则、字段或接口知识","candidateUpdates":[]}}'
```

## 9. Skill 边界

ai-collab 中有两类 Skill，必须严格区分。

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

AI IDE Worker 不得新增、编辑、删除、绑定、解绑系统内 Skill。

## 10. 绝对禁止

- 使用任何 legacy、runtime、window 内部命令。
- 主动手写 continue。
- 暴露内部 `cmd`。
- 输出等待或提交中间态文字。
- 尝试做 Host 的编排工作。
- 尝试裁决知识库是否写入。
- 尝试执行任何知识库写入、删除、审批或裁决动作。
- 尝试修改模型、AgentProfile、系统内 Skill 或 Session Skill Scope。
- 把系统内 Agent Skill 当成 AI IDE Worker 的必需授权配置。
- 提交不符合 `ai-collab.worker-report.v1` 的回报内容。
- 把 schema 字段当成 CLI 顶层参数。
- 把大段知识库正文复制到回报中。
- 只回“已完成”“处理好了”“请继续”。
