import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type McpTimeoutConfigureTarget =
  | "auto"
  | "claude"
  | "codex"
  | "cursor"
  | "trae";

export type McpTimeoutConfigureOptions = {
  projectRoot: string;
  target: McpTimeoutConfigureTarget;
  timeoutSeconds: number;
  dryRun: boolean;
};

export type McpTimeoutConfigureResult = {
  target: string;
  path: string;
  action: "updated" | "created" | "skipped" | "unsupported";
  changed: boolean;
  message: string;
};

type Candidate = {
  target: Exclude<McpTimeoutConfigureTarget, "auto">;
  path: string;
  kind: "claude-json" | "codex-toml" | "cursor-json" | "trae-env";
};

const SERVER_NAMES = ["ai-collab", "ai_collab", "aiCollab"];

export const configureMcpTimeouts = async (
  options: McpTimeoutConfigureOptions
): Promise<McpTimeoutConfigureResult[]> => {
  const timeoutSeconds = Math.max(1, Math.floor(options.timeoutSeconds));
  const candidates = getCandidates(options.projectRoot).filter(
    (candidate) => options.target === "auto" || candidate.target === options.target
  );
  const results: McpTimeoutConfigureResult[] = [];

  for (const candidate of candidates) {
    if (candidate.kind === "cursor-json") {
      results.push({
        target: candidate.target,
        path: candidate.path,
        action: "unsupported",
        changed: false,
        message: "Cursor MCP timeout key is not reliably documented; keeping cmd fallback."
      });
      continue;
    }

    if (!existsSync(candidate.path) && candidate.kind !== "codex-toml") {
      results.push({
        target: candidate.target,
        path: candidate.path,
        action: "skipped",
        changed: false,
        message: "Config file was not found."
      });
      continue;
    }

    if (candidate.kind === "claude-json") {
      results.push(
        await updateClaudeJson(candidate.path, timeoutSeconds, options.dryRun)
      );
      continue;
    }

    if (candidate.kind === "codex-toml") {
      results.push(
        await updateCodexToml(candidate.path, timeoutSeconds, options.dryRun)
      );
      continue;
    }

    results.push(
      await updateTraeEnv(candidate.path, timeoutSeconds, options.dryRun)
    );
  }

  return dedupeResults(results);
};

const getCandidates = (projectRoot: string): Candidate[] => {
  const home = os.homedir();
  const appData = process.env.APPDATA;
  const localAppData = process.env.LOCALAPPDATA;
  const candidates: Candidate[] = [
    { target: "claude", path: path.join(projectRoot, ".mcp.json"), kind: "claude-json" },
    { target: "claude", path: path.join(home, ".claude.json"), kind: "claude-json" },
    { target: "codex", path: path.join(projectRoot, ".codex", "config.toml"), kind: "codex-toml" },
    { target: "codex", path: path.join(home, ".codex", "config.toml"), kind: "codex-toml" },
    { target: "cursor", path: path.join(projectRoot, ".cursor", "mcp.json"), kind: "cursor-json" },
    { target: "trae", path: path.join(projectRoot, ".env"), kind: "trae-env" }
  ];

  if (appData) {
    candidates.push(
      { target: "claude", path: path.join(appData, "Claude", "claude_desktop_config.json"), kind: "claude-json" },
      { target: "cursor", path: path.join(appData, "Cursor", "User", "mcp.json"), kind: "cursor-json" },
      { target: "trae", path: path.join(appData, "Trae", "User", "settings.json"), kind: "trae-env" }
    );
  }

  if (localAppData) {
    candidates.push(
      { target: "cursor", path: path.join(localAppData, "Programs", "cursor", "resources", "app", "mcp.json"), kind: "cursor-json" },
      { target: "trae", path: path.join(localAppData, "Trae", "User", "settings.json"), kind: "trae-env" }
    );
  }

  return candidates;
};

const updateClaudeJson = async (
  filePath: string,
  timeoutSeconds: number,
  dryRun: boolean
): Promise<McpTimeoutConfigureResult> => {
  const timeoutMs = timeoutSeconds * 1000;
  const exists = existsSync(filePath);
  const data = exists
    ? JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>
    : {};
  const servers = getServerContainer(data);
  const serverName = findServerName(servers);
  if (!serverName) {
    return {
      target: "claude",
      path: filePath,
      action: exists ? "skipped" : "created",
      changed: false,
      message: "No ai-collab MCP server entry found; timeout was not injected into an unknown server."
    };
  }

  const server = servers[serverName] as Record<string, unknown>;
  const current = Number(server.timeout);
  if (current === timeoutMs) {
    return {
      target: "claude",
      path: filePath,
      action: "skipped",
      changed: false,
      message: `Timeout already equals ${timeoutMs}ms.`
    };
  }

  server.timeout = timeoutMs;
  if (!dryRun) {
    await backupIfExists(filePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }

  return {
    target: "claude",
    path: filePath,
    action: exists ? "updated" : "created",
    changed: true,
    message: `Set ai-collab MCP timeout to ${timeoutMs}ms.`
  };
};

const updateCodexToml = async (
  filePath: string,
  timeoutSeconds: number,
  dryRun: boolean
): Promise<McpTimeoutConfigureResult> => {
  const exists = existsSync(filePath);
  const content = exists ? await readFile(filePath, "utf8") : "";
  const next = setCodexServerTimeout(content, timeoutSeconds);
  if (next === content) {
    return {
      target: "codex",
      path: filePath,
      action: "skipped",
      changed: false,
      message: `tool_timeout_sec already equals ${timeoutSeconds}.`
    };
  }

  if (!dryRun) {
    await backupIfExists(filePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, next, "utf8");
  }

  return {
    target: "codex",
    path: filePath,
    action: exists ? "updated" : "created",
    changed: true,
    message: `Set [mcp_servers.ai-collab].tool_timeout_sec to ${timeoutSeconds}.`
  };
};

const updateTraeEnv = async (
  filePath: string,
  timeoutSeconds: number,
  dryRun: boolean
): Promise<McpTimeoutConfigureResult> => {
  const timeoutMs = timeoutSeconds * 1000;
  const exists = existsSync(filePath);
  const content = exists ? await readFile(filePath, "utf8") : "";
  const lines = content ? content.split(/\r?\n/) : [];
  const key = "RUN_MCP_TIMEOUT_MS";
  const index = lines.findIndex((line) => line.trimStart().startsWith(`${key}=`));
  if (index >= 0 && lines[index]?.trim() === `${key}=${timeoutMs}`) {
    return {
      target: "trae",
      path: filePath,
      action: "skipped",
      changed: false,
      message: `${key} already equals ${timeoutMs}.`
    };
  }

  if (index >= 0) {
    lines[index] = `${key}=${timeoutMs}`;
  } else {
    lines.push(`${key}=${timeoutMs}`);
  }
  const next = `${lines.filter((line, i) => line !== "" || i < lines.length - 1).join("\n")}\n`;

  if (!dryRun) {
    await backupIfExists(filePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, next, "utf8");
  }

  return {
    target: "trae",
    path: filePath,
    action: exists ? "updated" : "created",
    changed: true,
    message: `Set ${key} to ${timeoutMs}.`
  };
};

const getServerContainer = (
  data: Record<string, unknown>
): Record<string, unknown> => {
  if (!data.mcpServers || typeof data.mcpServers !== "object") {
    data.mcpServers = {};
  }
  return data.mcpServers as Record<string, unknown>;
};

const findServerName = (servers: Record<string, unknown>): string | null => {
  for (const name of SERVER_NAMES) {
    if (servers[name] && typeof servers[name] === "object") {
      return name;
    }
  }
  return null;
};

const setCodexServerTimeout = (content: string, timeoutSeconds: number): string => {
  const header = "[mcp_servers.ai-collab]";
  if (!content.trim()) {
    return `${header}\ntool_timeout_sec = ${timeoutSeconds}\n`;
  }

  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === header);
  if (start < 0) {
    const suffix = content.endsWith("\n") ? "" : "\n";
    return `${content}${suffix}\n${header}\ntool_timeout_sec = ${timeoutSeconds}\n`;
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const trimmed = lines[index]?.trim() ?? "";
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      end = index;
      break;
    }
  }

  const timeoutLine = `tool_timeout_sec = ${timeoutSeconds}`;
  for (let index = start + 1; index < end; index += 1) {
    if ((lines[index] ?? "").trimStart().startsWith("tool_timeout_sec")) {
      if ((lines[index] ?? "").trim() === timeoutLine) {
        return content;
      }
      lines[index] = timeoutLine;
      return `${lines.join("\n").replace(/\n*$/, "")}\n`;
    }
  }

  lines.splice(start + 1, 0, timeoutLine);
  return `${lines.join("\n").replace(/\n*$/, "")}\n`;
};

const backupIfExists = async (filePath: string): Promise<void> => {
  if (!existsSync(filePath)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await copyFile(filePath, `${filePath}.bak-${stamp}`);
};

const dedupeResults = (
  results: McpTimeoutConfigureResult[]
): McpTimeoutConfigureResult[] => {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = `${result.target}:${result.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
