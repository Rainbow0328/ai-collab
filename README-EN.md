# ai-collab

> A runtime for stable collaboration of multiple AI agents on the same project

[English README](./README-EN.md) | [中文说明](./README.md)

---

## Why Do You Need It

When you have multiple AI clients like Trae, Cursor, and Claude Desktop working on the same project together, you'll encounter these problems:

- Each AI doesn't know what others are doing
- You need to manually copy-paste tasks and results
- Context synchronization relies entirely on human effort
- No unified session state management

`ai-collab` solves this exact problem: let one AI act as Host to orchestrate, while other AI agents act as Workers specializing in their respective areas, forming a stable collaboration loop.

#### Use Cases

- **Modular development**: When different modules are developed by different AI tools without an orchestrator, developers have to act as coordinators and repeatedly copy-paste prompts.
- **Frontend-backend separation**: Developing with the same AI can easily cause context explosion. Without an orchestrator, frontend and backend API interfaces often become misaligned. Different AI tools have varying capabilities in frontend vs backend development -- this tool enables parallel development.
- **Cost optimization**: Different priced AI tools handle different modules. Use free AI as orchestrator, premium AI as architect -- maximize each AI's strengths.
- **Desktop AI orchestration**: Use openclaw or hermes agent as host to schedule work for local desktop AI applications -- significantly boosts productivity.

---

## Core Concept

### Role Division

| Role | Recommended AI | Responsibilities |
|------|---------------|------------------|
| **Host** | Trae AI | Task breakdown, distribution, result integration, knowledge base construction and adjudication |
| **Worker** | Cursor / Claude | Focus on executing specific tasks, submitting structured reports |
| **Knowledge Keeper** | Any AI | Maintains knowledge base and user profiles on Host's delegation |

### Knowledge Base (L1/L2/L3)

- **L1 -- Project Constitution**: Long-term principles, current direction, requirement constraints
- **L2 -- Domain Rules**: Module boundaries, protocols, state machines, cross-module collaboration rules
- **L3 -- Field Alignment**: Fields, interface parameters, data structures, error codes

Host builds and adjudicates the knowledge base. Workers read it and provide candidate updates in their reports. Knowledge references use fragment-level format (`l2/current#message-protocol`) for precise delivery without wasting tokens.

### Collaboration Loop

```
Host understands requirements
    ↓
Knowledge judge → Build/calibrate L1/L2/L3
    ↓
Break down tasks → dispatch-many to Workers
    ↓
Worker claims task → Reads knowledge refs → Executes → submit structured report
    ↓
Host resolve consumes report → Adjudicates knowledge candidate updates → Continues dispatching
    ↓
(Repeat until project completion)
```

### Wait Chain

Workers enter the wait chain via the `await` command, automatically claiming tasks, executing, reporting, and waiting again. Timeout auto-resumes without losing messages. Runs silently without interrupting the user.

---

## Technical Architecture

```
ai-collab/
├── apps/
│   ├── cli/           # CLI entry (23 commands)
│   ├── core/          # Local collaboration service (Fastify HTTP)
│   └── web/           # Web console (React + Vite)
├── packages/
│   ├── protocol/      # Type definitions and protocol (Zod schema)
│   ├── sdk/           # Core HTTP client SDK
│   ├── store/         # SQLite persistence layer
│   └── shared/        # Shared utilities
├── adapters/
│   └── vscode-extension/  # VS Code extension adapter
├── skills/            # AI behavior constraint templates (soft constraints)
│   ├── host/          # Host skills (claude/codex/cursor/trae/general)
│   ├── worker/        # Worker skills (claude/codex/cursor/trae/general)
│   └── knowledge-keeper/
└── rule/              # Enforced rules (hard constraints, highest priority)
```

- **Fully local**: All data stored in local SQLite, never uploaded to cloud
- **Monorepo**: pnpm workspaces, TypeScript, Fastify HTTP server
- **Skill + Rule dual-layer**: Skill is behavioral template (AI may reference), Rule is hard law (must obey)

---

## Quick Start

```powershell
# Clone repository
git clone https://github.com/<owner>/ai-collab.git
cd ai-collab

# Install dependencies and build
pnpm install
pnpm run build
pnpm run link:cli

# Start service (backend + web dashboard)
ai-collab start
```

After startup, both the backend service (Fastify, port 42688) and the web dashboard (Vite, port 5173) will be running. Use `--no-web` to skip the frontend, `--daemon` to run in background.

### In Host IDE (e.g., Trae)

```
You are the host for this project. Your name is trae. Create and join session demo-collab-01.
```

### In Worker IDE (e.g., Cursor)

```
You are a worker for this project. Your name is cursor. Join session demo-collab-01. Your responsibility is frontend development.
```

### Host Views Session Members

```
View current project members
```

Then break down tasks based on member capabilities and use `dispatch-many` to distribute.

### Import Skills

In the `skills/` folder, skills are organized by role (host/worker/knowledge-keeper) and by IDE (claude/codex/cursor/trae/general). Use `general/` if no specific match exists.

### Rule (Optional)

**Using Skills alone should support the entire workflow. However, some AI tools can behave erratically, causing unexpected session interruptions. Rule provides an additional constraint layer.**

In the `rule/` folder, there are separate rules for host and worker (`rule/host/` and `rule/worker/`). Import them respectively.

### Why Rule Has Highest Priority

Skill is a soft constraint -- AI might "forget" or "flexibly handle" it.
But Rule is a hard law that must not be violated under any circumstances. This is the key to ensuring collaborative stability.

---

## Best Practices

**Optimal approach: Use openclaw or hermes agent as host to direct all workers**

### For Host

1.  **Load Rule first, then Skill**
    Rule is the foundational constraint -- it must be established first.

2.  **Use clear session names**
    Like `ecommerce-v2` or `blog-system` -- avoid `test` or `session-1`.

3.  **Worker roles should be stable**
    `--worker-role` describes long-term responsibilities, not one-off tasks like "help me write a page".
    Should be something like "Responsible for frontend React component development", "Responsible for backend API implementation", "Responsible for code review".

4.  **Parallelize when possible**
    Distribute multiple independent tasks in a single batch for maximum efficiency.

5.  **Never manually assemble parameters**
    All parameters like `--token`, `--continue-*`, etc. are returned by CLI -- execute them directly.

### For Worker

1.  **Focus on execution, don't overstep authority**
    Workers only execute tasks -- don't try to do overall planning.

2.  **Submit clear results**
    Explain what was done, which files were modified, and any notes.

3.  **Automatically return to wait after submission**
    Don't force users to manually enter "enter wait chain" every time.

---

## Command Reference

### Service Management

```bash
ai-collab start [--no-web] [--daemon]   # Start service (with web dashboard)
ai-collab stop                           # Stop service
ai-collab status                         # Check status
ai-collab doctor                         # Diagnostic check
ai-collab logs                           # View logs
```

### Session & Agent

```bash
ai-collab attach <name> --session <session> --role <host|worker|knowledge_keeper> --duty "<duty>"
ai-collab reset <name> --session <session>
ai-collab members --session <session>
```

### Task Dispatch & Execution

```bash
ai-collab dispatch-many --session <session> --tasks '[...]'
ai-collab await <name> --session <session>
ai-collab submit <name> --session <session> --content "<result>"
ai-collab resolve --session <session> --message-id <id> --action <approve|reject|revise>
```

### Knowledge Base

```bash
ai-collab knowledge read --session <session> --level <l1|l2|l3> --slug <slug>
ai-collab knowledge list --session <session>
ai-collab knowledge judge --session <session> --message-id <id>
ai-collab knowledge fulfil-judgement --session <session> --judgement-id <id>
ai-collab knowledge read-current --session <session>
ai-collab knowledge update-current --session <session>
```

### User Profile

```bash
ai-collab profile get <name> --session <session> [key]
ai-collab profile set <name> --session <session> <key> <value>
ai-collab profile delete <name> --session <session> <key>
```

---

## Data and State

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

## Repository Structure

```text
ai-collab/
├── apps/
│   ├── cli/           # Command line entry
│   ├── core/          # Local collaboration service
│   └── web/           # Web console
│
├── packages/
│   ├── protocol/      # Type definitions and protocol
│   ├── sdk/           # Core HTTP client SDK
│   ├── store/         # SQLite persistence layer
│   └── shared/        # Shared utilities
│
├── skills/            # AI behavior constraint templates (soft constraints)
│   ├── host/
│   ├── worker/
│   └── knowledge-keeper/
│
├── rule/              # Enforced rules (hard constraints, highest priority)
│
└── scripts/           # Smoke tests and packaging scripts
```

---

## Current Status

The project is under active development, but the core workflow is already stable and usable:

- Named session management
- Host / Worker / Knowledge Keeper role separation
- Single task / batch task distribution
- Resumable wait chain (no data loss on timeout)
- SQLite-persisted message flow
- Dual-layer AI behavior constraints: Skill / Rule
- Knowledge base L1/L2/L3 architecture
- Fragment-level knowledge references
- User collaboration profile management
- Web dashboard (session/member/message/knowledge visualization)
- Frontend internationalization (Chinese/English)
- VS Code extension adapter

---

## FAQ

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

When mixed together, AI alternates between global strategic thinking and concrete coding -- easily leading to confusion and errors.

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

## One Final Note

`ai-collab` doesn't aim to replace you with AI -- it simply makes managing multiple AI workers less exhausting.

---

## License

Licensed under the [Apache License 2.0](./LICENSE).
