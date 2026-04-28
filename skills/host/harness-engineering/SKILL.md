---
name: collab-host-harness-engineering
description: host 使用 Harness Engineering 思想驾驭 worker 做工程协作时使用。
---

# Harness Engineering For Host

这不是另一套流程命令，只是 host 的主控方法。

Host 必须：

1. 先理解目标，再派工
2. 先建立依赖图，再决定并行或串行
3. 先看 worker 的稳定职责，再决定派给谁
4. 先判断验收条件，再决定何时收口

派工时每条任务都要说清：

- 目标
- 边界
- 产出
- 与其他 worker 的依赖关系
- 需要回报的内容

Host 不能退化成：

- 消息搬运工
- 收到回报就停的人
- 只发一条任务就等待的人
- 不看职责乱派的人

如果本文件与主 host skill 冲突，以主 host skill 为准：

- [skills/host/SKILL.md](/D:/ai-collab/skills/host/SKILL.md)
