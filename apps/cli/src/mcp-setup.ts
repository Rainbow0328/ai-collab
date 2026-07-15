/*
 * ai-collab mcp:setup — one-click MCP server configuration for AI IDEs.
 *
 * Writes .mcp.json (Claude), .codex/config.toml (Codex), or .cursor/mcp.json (Cursor)
 * with the ai-collab stdio MCP server entry. Also configures appropriate timeouts.
 */

import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type McpSetupTarget =
  | "auto"
  | "claude"
  | "codex"
  | "cursor"
  | "trae";

export type McpSetupOptions = {
  projectRoot: string;
  target: McpSetupTarget;
  timeoutSeconds: number;
  dryRun: boolean;
  role?: "host" | "worker";
};

export type McpSetupResult = {
  target: string;
  path: string;
  action: "updated" | "created" | "skipped" | "unsupported";
  changed: boolean;
  message: string;
};

// ---------------------------------------------------------------------------
// Resolve the MCP server command and args
// ---------------------------------------------------------------------------

const getMcpServerCommand = (): { command: string; args: string[] } => {
  // In published package: `npx ai-collab mcp:serve`
  // In dev: `node dist/apps/cli/src/index.js mcp:serve`
  // We always use the `ai-collab` binary since it's the package bin.
  return {
    command: "npx",
    args: ["ai-collab", "mcp:serve"]
  };
};

// ---------------------------------------------------------------------------
// Candidates per IDE
// ---------------------------------------------------------------------------

type Candidate = {
  target: Exclude<McpSetupTarget, "auto">;
  path: string;
  kind: "claude-json" | "codex-toml" | "cursor-json";
};

const getCandidates = (projectRoot: string): Candidate[] => {
  const home = os.homedir();
  const candidates: Candidate[] = [
    { target: "claude", path: path.join(projectRoot, ".mcp.json"), kind: "claude-json" },
    { target: "claude", path: path.join(home, ".claude.json"), kind: "claude-json" },
    { target: "codex", path: path.join(projectRoot, ".codex", "config.toml"), kind: "codex-toml" },
    { target: "codex", path: path.join(home, ".codex", "config.toml"), kind: "codex-toml" },
    { target: "cursor", path: path.join(projectRoot, ".cursor", "mcp.json"), kind: "cursor-json" }
  ];

  return candidates;
};

// ---------------------------------------------------------------------------
// Main setup function
// ---------------------------------------------------------------------------

export const setupMcp = async (
  options: McpSetupOptions
): Promise<McpSetupResult[]> => {
  const candidates = getCandidates(options.projectRoot).filter(
    (c) => options.target === "auto" || c.target === options.target
  );

  const results: McpSetupResult[] = [];
  const seenPaths = new Set<string>();

  for (const candidate of candidates) {
    if (seenPaths.has(candidate.path)) continue;
    seenPaths.add(candidate.path);

    // Skip if the parent directory doesn't exist (likely not installed)
    const parentDir = path.dirname(candidate.path);
    if (!existsSync(parentDir) && candidate.kind !== "codex-toml") {
      results.push({
        target: candidate.target,
        path: candidate.path,
        action: "skipped",
        changed: false,
        message: `Directory not found: ${parentDir}`
      });
      continue;
    }

    if (candidate.kind === "claude-json") {
      results.push(await updateClaudeJson(candidate, options.timeoutSeconds, options.dryRun, options.role));
    } else if (candidate.kind === "codex-toml") {
      results.push(await updateCodexToml(candidate, options.timeoutSeconds, options.dryRun, options.role));
    } else if (candidate.kind === "cursor-json") {
      results.push(await updateCursorJson(candidate, options.timeoutSeconds, options.dryRun, options.role));
    }
  }

  return results;
};

// ---------------------------------------------------------------------------
// Claude .mcp.json
// ---------------------------------------------------------------------------

const updateClaudeJson = async (
  candidate: Candidate,
  timeoutSeconds: number,
  dryRun: boolean,
  role?: "host" | "worker"
): Promise<McpSetupResult> => {
  const { command, args } = getMcpServerCommand();
  const timeoutMs = timeoutSeconds * 1000;
  const exists = existsSync(candidate.path);

  const data = exists
    ? (JSON.parse(await readFile(candidate.path, "utf8")) as Record<string, unknown>)
    : {};

  if (!data.mcpServers || typeof data.mcpServers !== "object") {
    data.mcpServers = {};
  }

  const servers = data.mcpServers as Record<string, unknown>;
  const serverName = "ai-collab";
  const desiredServer: Record<string, unknown> = {
    command,
    args,
    timeout: timeoutMs
  };
  if (role) {
    desiredServer.env = { AI_COLLAB_ROLE: role };
  }

  const existing = servers[serverName];
  const needsUpdate =
    !existing ||
    JSON.stringify(existing) !== JSON.stringify(desiredServer);

  if (!needsUpdate) {
    return {
      target: candidate.target,
      path: candidate.path,
      action: "skipped",
      changed: false,
      message: `ai-collab MCP server already configured with timeout ${timeoutMs}ms.`
    };
  }

  servers[serverName] = desiredServer;

  if (!dryRun) {
    await backupIfExists(candidate.path);
    await mkdir(path.dirname(candidate.path), { recursive: true });
    await writeFile(candidate.path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }

  return {
    target: candidate.target,
    path: candidate.path,
    action: exists ? "updated" : "created",
    changed: true,
    message: `Configured ai-collab MCP server with timeout ${timeoutMs}ms.`
  };
};

// ---------------------------------------------------------------------------
// Codex config.toml
// ---------------------------------------------------------------------------

const updateCodexToml = async (
  candidate: Candidate,
  timeoutSeconds: number,
  dryRun: boolean,
  role?: "host" | "worker"
): Promise<McpSetupResult> => {
  const { command, args } = getMcpServerCommand();
  const exists = existsSync(candidate.path);
  const content = exists ? await readFile(candidate.path, "utf8") : "";

  const header = "[mcp_servers.ai-collab]";
  const commandLine = `command = "${command}"`;
  const argsLine = `args = ["${args.join('", "')}"]`;
  const timeoutLine = `tool_timeout_sec = ${timeoutSeconds}`;
  const lines = [header, commandLine, argsLine, timeoutLine];
  if (role) {
    lines.push(`[mcp_servers.ai-collab.env]`, `AI_COLLAB_ROLE = "${role}"`);
  }
  const desiredBlock = lines.join("\n");

  // Check if the block already exists and matches
  const blockStart = content.indexOf(header);
  if (blockStart >= 0) {
    // Find the end of the block (next [section] or end of file)
    let blockEnd = content.length;
    const afterHeader = content.slice(blockStart + header.length);
    const nextSectionMatch = afterHeader.indexOf("\n[");
    if (nextSectionMatch >= 0) {
      blockEnd = blockStart + header.length + nextSectionMatch;
    }

    const currentBlock = content.slice(blockStart, blockEnd).trim();
    if (currentBlock === desiredBlock) {
      return {
        target: candidate.target,
        path: candidate.path,
        action: "skipped",
        changed: false,
        message: `ai-collab MCP server already configured with timeout ${timeoutSeconds}s.`
      };
    }

    // Replace the existing block
    const next = content.slice(0, blockStart) + desiredBlock + content.slice(blockEnd);
    if (!dryRun) {
      await backupIfExists(candidate.path);
      await mkdir(path.dirname(candidate.path), { recursive: true });
      await writeFile(candidate.path, next, "utf8");
    }

    return {
      target: candidate.target,
      path: candidate.path,
      action: "updated",
      changed: true,
      message: `Updated ai-collab MCP server config with timeout ${timeoutSeconds}s.`
    };
  }

  // Append new block
  const suffix = content && !content.endsWith("\n") ? "\n" : "";
  const next = `${content}${suffix}\n${desiredBlock}\n`;

  if (!dryRun) {
    await backupIfExists(candidate.path);
    await mkdir(path.dirname(candidate.path), { recursive: true });
    await writeFile(candidate.path, next, "utf8");
  }

  return {
    target: candidate.target,
    path: candidate.path,
    action: exists ? "updated" : "created",
    changed: true,
    message: `Configured ai-collab MCP server with timeout ${timeoutSeconds}s.`
  };
};

// ---------------------------------------------------------------------------
// Cursor mcp.json
// ---------------------------------------------------------------------------

const updateCursorJson = async (
  candidate: Candidate,
  timeoutSeconds: number,
  dryRun: boolean,
  role?: "host" | "worker"
): Promise<McpSetupResult> => {
  const { command, args } = getMcpServerCommand();
  const exists = existsSync(candidate.path);

  const data = exists
    ? (JSON.parse(await readFile(candidate.path, "utf8")) as Record<string, unknown>)
    : {};

  if (!data.mcpServers || typeof data.mcpServers !== "object") {
    data.mcpServers = {};
  }

  const servers = data.mcpServers as Record<string, unknown>;
  const serverName = "ai-collab";
  const desiredServer: Record<string, unknown> = {
    command,
    args
  };
  if (role) {
    desiredServer.env = { AI_COLLAB_ROLE: role };
  }

  const existing = servers[serverName];
  const needsUpdate =
    !existing ||
    JSON.stringify(existing) !== JSON.stringify(desiredServer);

  if (!needsUpdate) {
    return {
      target: candidate.target,
      path: candidate.path,
      action: "skipped",
      changed: false,
      message: `ai-collab MCP server already configured.`
    };
  }

  servers[serverName] = desiredServer;

  if (!dryRun) {
    await backupIfExists(candidate.path);
    await mkdir(path.dirname(candidate.path), { recursive: true });
    await writeFile(candidate.path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }

  return {
    target: candidate.target,
    path: candidate.path,
    action: exists ? "updated" : "created",
    changed: true,
    message: `Configured ai-collab MCP server (note: Cursor does not support explicit timeout config).`
  };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const backupIfExists = async (filePath: string): Promise<void> => {
  if (!existsSync(filePath)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await copyFile(filePath, `${filePath}.bak-${stamp}`);
};
