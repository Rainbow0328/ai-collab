# LoopMarshal — Multi-Agent AI Coding Orchestration Framework

> **One command to orchestrate multiple AI coding agents.** Support 14 AI tools (Claude Code, Cursor, Codex, etc.) with MCP protocol, knowledge base, and web dashboard. Local-first, zero cloud dependency.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue.svg)](https://www.typescriptlang.org)

**English** | [中文](./README.md)

---

## Overview

LoopMarshal is a **multi-agent AI coding orchestration framework**. With a single command, you can launch and orchestrate multiple AI coding agents — Claude Code, Cursor, Codex CLI, Trae, Gemini CLI, Aider, and 10 more — to work together on the same project. One AI agent acts as the **Host** to orchestrate, while others act as **Workers** to execute tasks.

**It solves a core problem**: when you use multiple AI coding agents on the same project, agents don't know what others are doing, tasks and results are manually copy-pasted, and context can't be synchronized. LoopMarshal uses **MCP protocol** for automatic agent-to-agent communication, forming a stable collaboration loop.

**Keywords**: multi-agent orchestration · multi-agent framework · AI coding collaboration · MCP protocol · LLM agent coordination · agent-to-agent communication · AI coding tools · local-first · knowledge base · prompt engineering · AI workflow automation · multi-LLM orchestration

---

## Why LoopMarshal?

When using multiple AI coding assistants on the same project:

- ❌ Each AI doesn't know what others are doing
- ❌ Manual copy-paste of tasks and results
- ❌ No unified session state management
- ❌ Frontend-backend interface mismatches

LoopMarshal solves this: one AI as **Host** orchestrates, others as **Workers** execute, communicating automatically via **MCP protocol**.

### Use Cases

- **Parallel module development**: Different AI agents handle different modules in parallel
- **Frontend-backend separation**: Separate AI for frontend and backend, Host ensures interface consistency
- **Cost optimization**: Free AI as Host, paid AI for architecture — maximize AI cost-effectiveness
- **Large-scale refactoring**: Host decomposes tasks, multiple Workers handle different modules

---

## Key Features

| Feature | Description |
|---------|-------------|
| **One-command launch** | `start-agent` auto-injects Skills + MCP config + launches IDE + generates first prompt |
| **14 AI tools** | Claude Code, Codex, Cursor, Trae, OpenCode, Gemini, Aider, Windsurf, Qoder, GitHub Copilot, Cline, Crusher, Lovable, Xiaomi MiMo |
| **Three roles** | Host (orchestrator), Worker (executor), Knowledge Keeper (knowledge base maintainer) |
| **MCP protocol** | AI agents communicate via MCP tools — no manual copy-paste |
| **3-tier knowledge base** | L1 project direction, L2 domain rules, L3 field alignment — fragment-level references |
| **Wait chain** | Workers auto-cycle: await → claim → execute → submit → await. Auto-reconnect on timeout |
| **Web dashboard** | Real-time monitoring of sessions, members, messages, and knowledge base |
| **Local-first** | All data stored locally in SQLite — zero cloud dependency |

---

## Installation

### Prerequisites

- **Node.js** 20+
- **pnpm** 10+ (`npm install -g pnpm`)
- At least one supported AI coding tool (Claude Code, Cursor, Codex, etc.)

### Install from Source

```powershell
# Clone
gh repo clone your-org/loopmarshal
cd loopmarshal

# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Register loopmarshal CLI globally
pnpm run link:cli

# Verify
loopmarshal --version
# Output: 0.1.0
```

After installation, the `loopmarshal` command is available from any directory.

---

## Quick Start

### One-Command Launch (Recommended)

In your project directory:

```powershell
# Launch Host
loopmarshal start-agent claude --role host --duty "Architecture and task decomposition"

# In another terminal, launch Worker (same session name)
loopmarshal start-agent cursor --role worker --duty "Frontend development" --session <session-name-from-above>

# Optional: Launch Knowledge Keeper
loopmarshal start-agent codex --role knowledge_keeper --duty "Knowledge maintenance" --session <session-name>
```

`start-agent` automatically:
1. ✅ Checks if core service is running — auto-starts if not
2. ✅ Resolves session name
3. ✅ Attaches to session via API
4. ✅ Injects Skill files to IDE config directory
5. ✅ Injects MCP config file
6. ✅ Generates first prompt (role/session/duty/dashboard URL)
7. ✅ Launches IDE process

After launch, open `http://127.0.0.1:42688` in your browser to view the dashboard.

> 💡 **Tip**: Run with `--dry-run` first to preview configuration without launching: `loopmarshal start-agent claude --role host --duty "test" --dry-run`

**Host can also start new Workers directly** (MCP tool call, no manual terminal):

```
start_worker(ide="claude", duty="Backend API development")
```

### Manual Configuration (Optional)

If you prefer manual setup or your tool isn't in the 14 supported IDEs:

```powershell
# Start core service
loopmarshal start

# Configure MCP in your IDE (JSON format)
```

---

## Role Architecture

| Role | Responsibility | Recommended AI |
|------|---------------|----------------|
| **Host** | Architecture, task decomposition, dispatch, verdict, knowledge strategy | Strong AI (Claude Code, Trae) |
| **Worker** | Execute specific tasks, submit structured reports | Domain-specific AI (Cursor for frontend, Codex for backend) |
| **Knowledge Keeper** | Maintain L1/L2/L3 knowledge docs and user preferences | Any AI (addable from Web dashboard) |

### Collaboration Loop

```
Host understands requirements → calibrates knowledge → decomposes tasks → dispatch_many
    ↓
Worker claims task → reads knowledge refs → executes → submits structured report
    ↓
Host resolves report → verdicts knowledge updates → continues dispatch or closes
    ↓
(loop until project complete)
```

---

## Knowledge Base (L1/L2/L3)

| Level | Content | Example |
|-------|---------|---------|
| **L1 — Project Direction** | Long-term principles, current goals, requirements | "E-commerce system, React + Node.js" |
| **L2 — Domain Rules** | Module boundaries, protocols, state machines | "Auth module: POST /api/register, bcrypt" |
| **L3 — Field Alignment** | Fields, API params, data structures, error codes | "register: email(string), password(string, ≥8)" |

---

## Commands

```bash
# Service management
loopmarshal start              # Start core service + web dashboard
loopmarshal stop               # Stop service
loopmarshal status             # Check status
loopmarshal doctor             # Diagnostics

# One-command launch
loopmarshal start-agent <ide> --role <host|worker|knowledge_keeper> --duty "<duty>"

# Session & agent
loopmarshal attach <name> --session <session> --role <role> --duty "<duty>"
loopmarshal members <hostName> --session <session>

# Task dispatch
loopmarshal dispatch-many <hostName> --task "<workerName>::<task>"
loopmarshal await <name>
loopmarshal submit <name> --content "<result>"
loopmarshal resolve <hostName> --summary "<summary>"

# Knowledge base
loopmarshal knowledge read <name> --ref "L1/session-direction#current-goal"
loopmarshal knowledge list <name> [--level l1|l2|l3]
loopmarshal knowledge upsert <name> --level <level> --slug <slug> --title "<title>" --content "<content>"
```

---

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `LOOPMARSHAL_HOST` | Core service host | `127.0.0.1` |
| `LOOPMARSHAL_PORT` | Core service port | `42688` |
| `LOOPMARSHAL_WEB_PORT` | Web frontend port | `5173` |
| `LOOPMARSHAL_SKILLS_DIR` | Skills directory path | Auto-search |
| `LOOPMARSHAL_MCP_COMMAND` | MCP server command | `npx` |
| `LOOPMARSHAL_CLI_PATH` | CLI binary path | Auto-resolved |

---

## FAQ

### How is this different from AutoGen / CrewAI / LangGraph?

AutoGen, CrewAI, and LangGraph are **code frameworks** that require Python code to define agents. LoopMarshal is a **runtime orchestrator** — no code needed, just use the `start-agent` command to launch existing AI coding tools (Claude Code, Cursor, etc.) and let them collaborate via MCP protocol. Ideal for developers who want to use existing AI IDE tools without writing orchestration code.

### How is this different from function calling?

Function calling is tool invocation within a single LLM. LoopMarshal is **inter-process agent communication** — each AI agent is an independent process (Claude Code process, Cursor process) that communicates via MCP protocol message queues. Each agent has its own context window and LLM.

### Why not fully autonomous agents?

Current LLMs can't reliably do 100% autonomous planning and execution. LoopMarshal takes a "human-AI collaboration" approach: AI agents handle execution and communication, humans handle final verification and direction.

### Why separate Host and Worker agents?

Clear separation enables stability. Host focuses on "how to arrange work," Worker focuses on "how to do the job well." Mixing roles leads to confusion and errors.

### What AI tools are supported?

14 tools: Claude Code, Codex CLI, Cursor, Trae, OpenCode, Gemini CLI, Aider, Windsurf, Qoder, GitHub Copilot CLI, Cline, Crusher AI, Lovable, Xiaomi MiMo.

### What LLMs are supported?

LoopMarshal is LLM-agnostic — each AI agent uses its own IDE's model config. Claude Code uses Claude, Codex uses GPT, Gemini CLI uses Gemini, Trae can switch to DeepSeek. Different agents can use different LLMs in the same collaboration session.

---

## License

Licensed under the [Apache License 2.0](./LICENSE).
