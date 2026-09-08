---
name: collab-host-cline
description: Cline (VS Code) 作为 host 接入 loopmarshal 协作框架时的 IDE 差异约束。
---

# Cline (VS Code) Host 差异约束

优先遵守：

- ../SKILL.md`n
如果本文件与主 Host Skill 冲突，必须以 ../SKILL.md 为准。

Cline (VS Code) 额外约束：

- 严格遵守主 Host Skill 中的全部规则
- MCP 工具调用方式与通用规则一致
- 如果本工具支持系统提示词，行为规则通过系统提示词注入
- 如果本工具不支持系统提示词，通过 Skill 文件加载行为规则
