# ai-collab

> A runtime for stable collaboration of multiple AI agents on the same project

[English README](./README.md) | [中文说明](./README.zh-CN.md)

---

## Why Do You Need It

When you have multiple AI clients like Trae, Cursor, and Claude Desktop working on the same project together, you'll encounter these problems:

- 🤯 Each AI doesn't know what others are doing
- 📋 You need to manually copy-paste tasks and results
- 🔄 Context synchronization relies entirely on human effort
- 🚫 No unified session state management

`ai-collab` solves this exact problem: let one AI act as Host to orchestrate, while other AI agents act as Workers specializing in their respective areas, forming a stable collaboration loop.

#### Use Cases

- **Modular development**: When different modules are developed by different AI tools without an orchestrator, developers have to act as coordinators and repeatedly copy-paste prompts.
- **Frontend-backend separation**: Developing with the same AI can easily cause context explosion. Without an orchestrator, frontend and backend API interfaces often become misaligned. Different AI tools have varying capabilities in frontend vs backend development—this tool enables parallel development.
- **Cost optimization**: Different priced AI tools handle different modules. Use free AI as orchestrator, premium AI as architect—maximize each AI's strengths.
- **Desktop AI orchestration**: Use openclaw or hermes agent as host to schedule work for local desktop AI applications—significantly boosts productivity.

---

## Core Concept

### Role Division

| Role | Recommended AI | Responsibilities |
|------|---------------|------------------|
| **Host** | Trae AI | Task breakdown, distribution, result integration, progress management |
| **Worker** | Cursor / Claude | Focus on executing specific tasks, submitting results |

### Collaboration Loop

```
Host understands requirements
    ↓
Break down tasks → Distribute to appropriate Workers
    ↓
Worker claims task → Executes → Submits results
    ↓
Host receives results → Integrates → Distributes next batch
    ↓
(Repeat until project completion)
```

---

## Quick Start

After downloading the repository locally, here's the fastest way to get started.

### Install Dependencies and Build

```powershell
npm install
npm run build
npm run link:cli
```

This installs the built local `ai-collab` CLI into your environment, so you can use the `ai-collab` command directly afterwards.

### Start Local Runtime

```cmd
ai-collab start
```

### Import Skills in Host IDE/CLI and Worker IDE/CLI

```tex
In the Skills folder of this project, there are skills categorized by host/worker and different IDEs. If none match your tool, use the skills in the general folder. We'll continue updating and expanding coverage.
```

### Rule (Optional)

**This step is optional. Using Skills alone should theoretically support the entire workflow. However, some AI coding tools can occasionally behave erratically, causing unexpected session interruptions or anomalies. Rule provides an additional layer of constraint.**

```tex
In the rule folder of this project, there are separate rules for host and worker. Import them respectively.
```

### Let Host Establish a Collaboration Session

```tex
You are the host for this project. Create and join session demo-school-collab-01. First understand requirements, then break down tasks based on member responsibilities. Distribute parallel tasks together in the same round. Enter wait chain after dispatching. When receiving reports, continue progressing until reaching acceptance criteria.
```

### View Current Session Members

```tex
View current project members
```

### Let Host Start Distributing Tasks

**This step should happen after finalizing the plan with Host and ready to start work. The example shows telling the host to begin—you don't need to be this complex. You can also define the workflow with host before this step based on member roles.**

```
Basic workflow: First distribute tasks to both frontend and backend at the same time, then enter wait chain for worker messages.
When receiving messages from both sides, distribute review tasks to reviewer, and new tasks to frontend/backend accordingly.
Note: When frontend finishes, frontend reviewer handles review and distributes next frontend tasks. Same for backend—don't mix them up.

Now break down tasks in more granular detail, don't distribute one huge task at a time. Start distributing tasks to each worker.
```

### Let Worker Continuously Wait, Execute, and Report

```tex
Enter wait chain
```

### Why Rule Has Highest Priority

Skill is a soft constraint—AI might "forget" or "flexibly handle".
But Rule is a hard law that must not be violated under any circumstances. This is the key to ensuring collaborative stability.

---

## 💡 Best Practices

**Optimal approach: Use openclaw or hermes agent as host to direct all workers**

### For Host

1.  **Load Rule first, then Skill**
    Rule is the foundational constraint—it must be established first.

2.  **Use clear session names**
    Like `ecommerce-v2` or `blog-system`—avoid `test` or `session-1`.

3.  **Worker roles should be stable**
    `--worker-role` describes long-term responsibilities, not one-off tasks like "help me write a page".
    Should be something like "Responsible for frontend React component development", "Responsible for backend API implementation", "Responsible for code review".

4.  **Parallelize when possible**
    Distribute multiple independent tasks in a single batch for maximum efficiency.

5.  **Never manually assemble parameters**
    All parameters like `--token`, `--continue-*`, etc. are returned by CLI—execute them directly.

### For Worker

1.  **Focus on execution, don't overstep authority**
    Workers only execute tasks—don't try to do overall planning.

2.  **Submit clear results**
    Explain what was done, which files were modified, and any notes.

3.  **Automatically return to wait after submission**
    Don't force users to manually enter "enter wait chain" every time.

---

## 🔧 Command Reference

### Session Management

```bash
# Start service
ai-collab start

# Check status
ai-collab status

# Delete session
ai-collab session delete --session <name>
```

---

## 📊 Data and State

All data is stored locally, never uploaded to cloud.

| Content | Default Location |
|---------|-----------------|
| Project config | `.ai-collab/config.json` |
| Session/message/task database | `.ai-collab/ai-collab.sqlite` |
| Runtime logs | `log/log.txt` |
| CLI local state (Windows) | `%LOCALAPPDATA%\ai-collab` |

### Environment Variables

| Variable Name | Purpose |
|---------------|---------|
| `AI_COLLAB_LOG_DIR` | Custom log directory |
| `AI_COLLAB_COMMAND_TRACE_FILE` | Custom command trace file |
| `AI_COLLAB_CLI_STATE_DIR` | Custom CLI state directory |
| `AI_COLLAB_TIMEZONE` | Custom timezone display |

---

## 🗂️ Repository Structure

```text
ai-collab/
├── apps/
│   ├── cli/           # Command line entry
│   └── core/          # Local collaboration service
│
├── packages/
│   ├── protocol/      # Type definitions and protocol
│   ├── sdk/           # Core HTTP client SDK
│   ├── store/         # SQLite persistence layer
│   └── shared/        # Shared utilities
│
├── skills/            # AI behavior constraint templates (soft constraints)
│   ├── host/
│   └── worker/
│
├── rule/              # Enforced rules (hard constraints, highest priority)
│   └── ai-collab-强制执行规则.md
│
├── docs/              # Design docs and integration guides
│
└── scripts/           # Smoke tests and packaging scripts
```

---

## 🚧 Current Status

The project is under active development, but the core workflow is already stable and usable:

- ✅ Named session management
- ✅ Host / Worker role separation
- ✅ Single task / batch task distribution
- ✅ Resumable wait chain (no data loss on timeout)
- ✅ SQLite-persisted message flow
- ✅ Dual-layer AI behavior constraints: Skill / Rule
- ✅ Trae-specific optimization rules

---

## ❓ FAQ

### Q: Why not build a fully autonomous agent?

Because current AI can't yet achieve 100% reliable autonomous planning and execution.
`ai-collab` follows a **human-in-the-loop collaborative** approach:
- AI handles execution, integration, communication
- Humans handle final acceptance and direction control

This is more reliable and matches current technological capabilities.

### Q: Why separate Host and Worker roles?

Because clear division of labor creates stability.

- Host focuses on "how to arrange work"
- Worker focuses on "how to get the job done well"

When mixed together, AI alternates between global strategic thinking and concrete coding—easily leading to confusion and errors.

### Q: Why do we need the wait chain?

Because AI takes time to process tasks, and we don't want you to manually poll.

The wait chain automatically:
- Checks for new messages
- Claims and executes tasks when available
- Automatically resumes on timeout without data loss
- Runs silently without interrupting you

### Q: What's the difference between Rule and Skill?

| Dimension | Skill | Rule |
|-----------|-------|------|
| Constraint strength | Soft constraint (AI "may reference") | Hard constraint (AI "must obey") |
| Priority | Low | Highest |
| Purpose | Provides behavioral templates | Defines inviolable boundaries |
| Typical content | "You should do this" | "Absolutely never do that" |

---

## 📝 One Final Note

`ai-collab` doesn't aim to replace you with AI—it simply makes managing multiple AI workers less exhausting.

---

## License

MIT
