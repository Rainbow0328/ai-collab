# Changelog

## [0.1.0] — 2026-09-07

### Added

- Multi-Agent AI coding orchestration framework with 14 IDE support
- `start-agent` one-command launch (Skill injection + MCP config + IDE spawn + session attach)
- Three-role system: Host, Worker, Knowledge Keeper
- MCP protocol-based inter-agent communication
- Three-level knowledge base (L1 project direction, L2 domain rules, L3 field alignment)
- Wait chain: auto claim → execute → submit → re-await with timeout recovery
- Web dashboard (React + Vite) at `http://127.0.0.1:42688`
- Local-first SQLite storage (shared across all projects via user data directory)
- MCP config auto-injection: project-level first, global-level fallback
- Merge-write MCP config (preserves existing server configurations)
- Cross-platform new terminal window launch (Windows/macOS/Linux)
- 14 AI tools: Claude Code, Codex, Cursor, Trae, OpenCode, Gemini, Aider, Windsurf, Qoder, GitHub Copilot, Cline, Crusher, Lovable, Xiaomi MiMo

### Technical

- Monorepo with pnpm workspaces (apps/cli, apps/core, apps/web, packages/*)
- TypeScript 5.9+ strict mode, zero `any` types
- Fastify HTTP server + node:sqlite DatabaseSync
- 89 unit tests + 20+ smoke test scripts
- Apache License 2.0
