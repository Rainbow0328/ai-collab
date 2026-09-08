# Contributing to LoopMarshal

Thank you for your interest in contributing! This document covers the basics.

## Prerequisites

- Node.js 20+
- pnpm 10+ (`npm install -g pnpm`)
- Git

## Getting Started

```bash
git clone https://github.com/your-org/loopmarshal.git
cd loopmarshal
pnpm install
pnpm run build
pnpm run link:cli
```

Verify: `loopmarshal --version` should output `0.1.0`.

## Development Workflow

1. Create a branch: `git checkout -b feat/your-feature`
2. Make changes
3. Run checks:
   ```bash
   pnpm run typecheck   # Type checking
   pnpm run build       # Build all packages
   pnpm run test        # Unit tests (89 tests)
   pnpm run smoke       # Smoke tests
   ```
4. Commit with conventional format:
   ```
   feat: add support for new IDE
   fix: resolve MCP config merge issue
   docs: update README
   refactor: simplify spawn logic
   ```
5. Push and open a Pull Request

## Project Structure

```
apps/cli/      — CLI commands + MCP stdio server
apps/core/     — HTTP API server (Fastify + SQLite)
apps/web/      — Web dashboard (React + Vite)
packages/      — Shared libraries (protocol, sdk, store, shared)
skills/        — AI behavior rules (host/worker/keeper × 14 IDEs)
scripts/       — Smoke tests and packaging
```

## Adding Support for a New AI Tool

1. Add the IDE key to `SupportedIde` type in `apps/cli/src/start-agent.ts`
2. Add metadata to `IDE_META` map
3. Add a case in `getInjectSpec()` for Skill + MCP injection
4. Add a case in `buildIdeLaunchConfig()` for IDE launch
5. Add a case in `buildSetupGuide()` for manual config guide
6. Add Skill files under `skills/host/<ide>/`, `skills/worker/<ide>/`, `skills/knowledge_keeper/<ide>/`
7. Add a smoke test if the IDE has a CLI

## Coding Standards

- TypeScript strict mode, no `any`
- ESM modules (`"type": "module"`)
- No `console.log` in library code
- No `shell: true` in `spawn` calls (use `shell: false` to avoid DEP0190)

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
