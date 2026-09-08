/*
 * loopmarshal start-agent — one-command IDE launch with pre-injected skills,
 * MCP config, session creation, and first-prompt.
 *
 * Supported IDEs / AI Coding Tools:
 *   claude    — Claude Code (Anthropic)
 *   codex     — Codex CLI (OpenAI)
 *   cursor    — Cursor IDE
 *   trae      — Trae IDE (ByteDance)
 *   opencode  — OpenCode (sst)
 *   gemini    — Gemini CLI (Google)
 *   aider     — Aider (terminal-based AI pair programming)
 *   windsurf  — Windsurf IDE (Codeium)
 *   qoder     — Qoder (AI Coding IDE)
 *   github    — GitHub Copilot CLI
 *   cline     — Cline (VS Code extension, CLI via code)
 *   crusher   — Crusher AI
 *   lov       — Lovable
 *   mimo      — Xiaomi MiMo CLI
 *
 * Usage:
 *   loopmarshal start-agent <ide> --role <host|worker> --duty <description>
 *
 * What it does (in order):
 *   1. Ensure loopmarshal core service is running (auto-start daemon if needed)
 *   2. Determine session name (from --session or project dir basename)
 *   3. Determine member name (from --name or auto-generated)
 *   4. Call loopmarshal API to attach to session
 *   5. Inject Skill files + MCP config into the project's IDE directory
 *   6. Generate first prompt with role/session/duty info
 *   7. Spawn the IDE process with appropriate command-line arguments
 *   8. Output setup guide for IDEs that need manual steps
 */

import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { createLoopMarshalClient, LoopMarshalSdkError } from "@loopmarshal/sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SupportedIde =
  | "claude"
  | "codex"
  | "cursor"
  | "trae"
  | "opencode"
  | "gemini"
  | "aider"
  | "windsurf"
  | "qoder"
  | "github"
  | "cline"
  | "crusher"
  | "lov"
  | "mimo";

export type StartAgentOptions = {
  ide: SupportedIde;
  role: "host" | "worker" | "knowledge_keeper";
  duty: string;
  session?: string | undefined;
  name?: string | undefined;
  timeoutSeconds?: number;
  dryRun?: boolean;
};

export type SetupGuide = {
  ideLabel: string;
  ideFound: boolean;
  mcpAutoInjected: boolean;
  mcpManualGuide: string[];
  skillManualGuide: string[];
  promptManualGuide: string[];
  notes: string[];
  /** 后台管理面板地址 */
  dashboardUrl?: string | null | undefined;
  /** 核心服务是否自动启动 */
  coreAutoStarted?: boolean | undefined;
};

export type StartAgentResult = {
  ide: SupportedIde;
  sessionName: string;
  memberName: string;
  role: "host" | "worker" | "knowledge_keeper";
  duty: string;
  coreAutoStarted: boolean;
  /** 后台管理面板地址 (Web Dashboard URL) */
  dashboardUrl: string | null;
  /** 核心服务 API 地址 */
  coreApiUrl: string | null;
  injectedFiles: string[];
  mcpConfigPath: string | null;
  firstPrompt: string;
  systemPrompt: string | null;
  spawnedPid: number | null;
  warning: string | null;
  setupGuide: SetupGuide;
};

// ---------------------------------------------------------------------------
// IDE metadata registry
// ---------------------------------------------------------------------------

type IdeMeta = {
  /** Display label */
  label: string;
  /** CLI command name to search on PATH */
  command: string;
  /** npm package name for installation */
  npmPackage?: string;
  /** pip package name (for Python-based tools) */
  pipPackage?: string;
  /** Installation instructions (when not found on PATH) */
  installGuide: string[];
  /** Whether this tool supports --append-system-prompt or similar */
  supportsSystemPrompt: boolean;
  /** Whether this tool supports --mcp-config or similar */
  supportsMcpConfigArg: boolean;
  /** Whether this tool accepts a prompt as a positional CLI argument */
  supportsPromptArg: boolean;
};

const IDE_META: Record<SupportedIde, IdeMeta> = {
  claude: {
    label: "Claude Code",
    command: "claude",
    npmPackage: "@anthropic-ai/claude-code",
    installGuide: ["npm install -g @anthropic-ai/claude-code"],
    supportsSystemPrompt: true,
    supportsMcpConfigArg: true,
    supportsPromptArg: true
  },
  codex: {
    label: "Codex CLI",
    command: "codex",
    npmPackage: "@openai/codex",
    installGuide: ["npm install -g @openai/codex"],
    supportsSystemPrompt: false,
    supportsMcpConfigArg: false,
    supportsPromptArg: true
  },
  cursor: {
    label: "Cursor",
    command: "cursor",
    installGuide: ["从 https://cursor.sh 下载安装", "Cursor 会在安装时自动添加到 PATH"],
    supportsSystemPrompt: false,
    supportsMcpConfigArg: false,
    supportsPromptArg: false
  },
  trae: {
    label: "Trae",
    command: "trae",
    installGuide: ["从 https://www.trae.ai 下载安装"],
    supportsSystemPrompt: false,
    supportsMcpConfigArg: false,
    supportsPromptArg: false
  },
  opencode: {
    label: "OpenCode",
    command: "opencode",
    npmPackage: "opencode-ai",
    installGuide: ["npm install -g opencode-ai"],
    supportsSystemPrompt: false,
    supportsMcpConfigArg: false,
    supportsPromptArg: true
  },
  gemini: {
    label: "Gemini CLI",
    command: "gemini",
    npmPackage: "@google/gemini-cli",
    installGuide: ["npm install -g @google/gemini-cli"],
    supportsSystemPrompt: false,
    supportsMcpConfigArg: false,
    supportsPromptArg: true
  },
  aider: {
    label: "Aider",
    command: "aider",
    pipPackage: "aider-chat",
    installGuide: ["pip install aider-chat", "# 或: pipx install aider-chat"],
    supportsSystemPrompt: false,
    supportsMcpConfigArg: false,
    supportsPromptArg: true
  },
  windsurf: {
    label: "Windsurf",
    command: "windsurf",
    installGuide: ["从 https://codeium.com/windsurf 下载安装"],
    supportsSystemPrompt: false,
    supportsMcpConfigArg: false,
    supportsPromptArg: false
  },
  qoder: {
    label: "Qoder",
    command: "qoder",
    installGuide: ["从 Qoder 官网下载安装"],
    supportsSystemPrompt: false,
    supportsMcpConfigArg: false,
    supportsPromptArg: false
  },
  github: {
    label: "GitHub Copilot CLI",
    command: "gh",
    npmPackage: "@github/gh-copilot",
    installGuide: ["npm install -g @github/gh-copilot", "# 或通过 gh extension install"],
    supportsSystemPrompt: false,
    supportsMcpConfigArg: false,
    supportsPromptArg: false
  },
  cline: {
    label: "Cline (VS Code)",
    command: "code",
    installGuide: ["安装 VS Code: https://code.visualstudio.com", "安装 Cline 扩展: code --install-extension saoudrizwan.cline"],
    supportsSystemPrompt: false,
    supportsMcpConfigArg: false,
    supportsPromptArg: false
  },
  crusher: {
    label: "Crusher AI",
    command: "crusher",
    installGuide: ["npm install -g @crusherai/cli", "# 参考官方文档安装"],
    supportsSystemPrompt: false,
    supportsMcpConfigArg: false,
    supportsPromptArg: false
  },
  lov: {
    label: "Lovable",
    command: "lov",
    installGuide: ["npm install -g @lovable/cli", "# 或访问 https://lovable.dev"],
    supportsSystemPrompt: false,
    supportsMcpConfigArg: false,
    supportsPromptArg: false
  },
  mimo: {
    label: "Xiaomi MiMo",
    command: "mimo",
    npmPackage: "@xiaomi/mimo-cli",
    installGuide: ["npm install -g @xiaomi/mimo-cli", "# 或参考小米开发者文档"],
    supportsSystemPrompt: false,
    supportsMcpConfigArg: false,
    supportsPromptArg: true
  }
};

// ---------------------------------------------------------------------------
// IDE executable resolution
// ---------------------------------------------------------------------------

const resolveIdeExecutable = (ide: SupportedIde): { command: string; args: string[] } => {
  const meta = IDE_META[ide];
  return { command: meta.command, args: [] };
};

const isCommandAvailable = (command: string): boolean => {
  try {
    // Use spawnSync without shell to avoid DEP0190 deprecation warning
    // On Windows, "where" is a built-in command that works without shell
    const isWin = process.platform === "win32";
    const cmd = isWin ? "where" : "which";
    const result = spawnSync(cmd, [command], {
      windowsHide: true,
      encoding: "utf-8",
      shell: false,
    });
    return result.status === 0 && result.stdout.trim().length > 0;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// IDE-specific file injection
// ---------------------------------------------------------------------------

type InjectSpec = {
  targetDir: string;
  files: Array<{ source: string; target: string }>;
  mcpConfigPath: string | null;
  mcpConfigGenerator: ((mcpServerCmd: { command: string; args: string[] }, timeoutSeconds: number, role: string, ideLabel: string) => string) | null;
};

const getMcpServerCommand = (): { command: string; args: string[] } => {
  // 优先使用环境变量指定的 MCP server 命令
  const envCommand = process.env.LOOPMARSHAL_MCP_COMMAND;
  const envArgs = process.env.LOOPMARSHAL_MCP_ARGS;
  if (envCommand) {
    return {
      command: envCommand,
      args: envArgs ? envArgs.split(/\s+/).filter(Boolean) : ["mcp", "serve"],
    };
  }
  return {
    command: "npx",
    args: ["loopmarshal", "mcp", "serve"]
  };
};

// ---------------------------------------------------------------------------
// MCP config auto-injection: resolve global config paths via HOME env vars,
// read existing config, merge loopmarshal entry, write back.
// ---------------------------------------------------------------------------

/**
 * Resolve the user's home directory.
 * Priority: USERPROFILE (Windows) → HOME (Unix) → os.homedir() fallback.
 */
const getUserHome = (): string => {
  return process.env.USERPROFILE || process.env.HOME || homedir();
};

/**
 * Get the global MCP config path for an IDE.
 * Returns null if the IDE doesn't support global MCP config files.
 *
 * Priority: env var → known global path → null
 */
const getGlobalMcpConfigPath = (ide: SupportedIde): string | null => {
  const home = getUserHome();

  switch (ide) {
    case "claude":
      // Claude Code: ~/.claude/mcp.json (global) or .claude/mcp.json (project)
      return join(home, ".claude", "mcp.json");

    case "codex":
      // Codex CLI: ~/.codex/config.toml (global)
      return join(home, ".codex", "config.toml");

    case "cursor":
      // Cursor: ~/.cursor/mcp.json (global)
      return join(home, ".cursor", "mcp.json");

    case "opencode":
      return join(home, ".opencode", "mcp.json");

    case "gemini":
      return join(home, ".gemini", "settings.json");

    case "aider":
      return join(home, ".aider", "mcp.json");

    case "cline":
      // Cline (VS Code): global settings via VS Code user settings
      return join(home, ".cline", "mcp.json");

    case "mimo":
      return join(home, ".mimo", "mcp.json");

    default:
      // IDEs that require GUI-based MCP config (trae, windsurf, qoder, etc.)
      return null;
  }
};

/**
 * Merge loopmarshal MCP config into an existing JSON config file.
 * Preserves all other existing MCP servers.
 */
const mergeJsonMcpConfig = (
  existingContent: string,
  loopmarshalEntry: { command: string; args: string[]; env: Record<string, string>; timeout?: number }
): string => {
  let config: Record<string, unknown>;
  try {
    config = JSON.parse(existingContent);
  } catch {
    // File exists but invalid JSON → start fresh
    config = {};
  }

  if (!config.mcpServers || typeof config.mcpServers !== "object") {
    config.mcpServers = {};
  }

  // Merge: preserve existing servers, add/update loopmarshal
  (config.mcpServers as Record<string, unknown>).loopmarshal = loopmarshalEntry;

  return JSON.stringify(config, null, 2) + "\n";
};

/**
 * Merge loopmarshal MCP config into an existing TOML config file (Codex).
 * Preserves all other existing sections.
 */
const mergeTomlMcpConfig = (
  existingContent: string,
  loopmarshalEntry: { command: string; args: string[]; env: Record<string, string>; timeout?: number }
): string => {
  // For TOML, we replace or append the [mcp_servers.loopmarshal] section.
  // This is a simple approach: remove existing loopmarshal section, then append new one.
  const lines = existingContent.split("\n");
  const result: string[] = [];
  let skipSection = false;

  for (const line of lines) {
    if (line.trim().startsWith("[mcp_servers.loopmarshal")) {
      skipSection = true;
      continue;
    }
    if (skipSection && line.trim().startsWith("[")) {
      skipSection = false;
    }
    if (!skipSection) {
      result.push(line);
    }
  }

  // Append the new loopmarshal section
  const tomlSection = [
    `[mcp_servers.loopmarshal]`,
    `command = "${loopmarshalEntry.command}"`,
    `args = ["${loopmarshalEntry.args.join('", "')}"]`,
    ...(loopmarshalEntry.timeout ? [`tool_timeout_sec = ${loopmarshalEntry.timeout}`] : []),
    `[mcp_servers.loopmarshal.env]`,
    ...Object.entries(loopmarshalEntry.env).map(([k, v]) => `${k} = "${v}"`),
  ].join("\n");

  // Ensure there's a newline before the new section
  const existing = result.join("\n").trimEnd();
  return existing + "\n\n" + tomlSection + "\n";
};

/**
 * Inject MCP config into a config file (project-level or global).
 * Reads existing content, merges loopmarshal entry, writes back.
 * Returns the path if successfully written, null otherwise.
 */
const injectMcpConfig = async (
  configPath: string,
  ide: SupportedIde,
  isToml: boolean,
  loopmarshalEntry: { command: string; args: string[]; env: Record<string, string>; timeout?: number }
): Promise<boolean> => {
  const dir = dirname(configPath);
  await mkdir(dir, { recursive: true });

  let existingContent = "";
  try {
    existingContent = readFileSync(configPath, "utf-8");
  } catch {
    // File doesn't exist → will create new
    existingContent = "";
  }

  const newContent = isToml
    ? mergeTomlMcpConfig(existingContent, loopmarshalEntry)
    : mergeJsonMcpConfig(existingContent, loopmarshalEntry);

  await writeFile(configPath, newContent, "utf-8");
  return true;
};

const getInjectSpec = (ide: SupportedIde, role: "host" | "worker" | "knowledge_keeper"): InjectSpec => {
  const mcpServer = getMcpServerCommand();

  switch (ide) {
    // ── Claude Code ──────────────────────────────────────────────
    case "claude":
      return {
        targetDir: ".claude/skills",
        files: [
          { source: `${role}/SKILL.md`, target: "SKILL.md" },
          { source: `${role}/claude/SKILL.md`, target: `SKILL-${role}.md` }
        ],
        mcpConfigPath: ".claude/mcp.json",
        mcpConfigGenerator: (_cmd, timeoutSeconds, _role, _ideLabel) => {
          const config = {
            mcpServers: {
              loopmarshal: {
                command: mcpServer.command,
                args: mcpServer.args,
                timeout: timeoutSeconds * 1000,
                env: {
                  LOOPMARSHAL_ROLE: role,
                  LOOPMARSHAL_IDE_LABEL: "claude",
                  CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT: "1"
                }
              }
            }
          };
          return `${JSON.stringify(config, null, 2)}\n`;
        }
      };

    // ── Codex CLI ────────────────────────────────────────────────
    case "codex":
      return {
        targetDir: ".codex/skills",
        files: [
          { source: `${role}/SKILL.md`, target: "SKILL.md" },
          { source: `${role}/codex/SKILL.md`, target: `SKILL-${role}.md` }
        ],
        mcpConfigPath: ".codex/config.toml",
        mcpConfigGenerator: (_cmd, timeoutSeconds, _role, _ideLabel) => {
          return [
            `[mcp_servers.loopmarshal]`,
            `command = "${mcpServer.command}"`,
            `args = ["${mcpServer.args.join('", "')}"]`,
            `tool_timeout_sec = ${timeoutSeconds}`,
            `[mcp_servers.loopmarshal.env]`,
            `LOOPMARSHAL_ROLE = "${role}"`,
            `LOOPMARSHAL_IDE_LABEL = "codex"`
          ].join("\n") + "\n";
        }
      };

    // ── Cursor ──────────────────────────────────────────────────
    case "cursor":
      return {
        targetDir: ".cursor/rules",
        files: [
          { source: `${role}/SKILL.md`, target: `loopmarshal-${role}.md` },
          { source: `${role}/cursor/SKILL.md`, target: `loopmarshal-${role}-cursor.md` }
        ],
        mcpConfigPath: ".cursor/mcp.json",
        mcpConfigGenerator: (_cmd, _timeout, _role, _ideLabel) => {
          const config = {
            mcpServers: {
              loopmarshal: {
                command: mcpServer.command,
                args: mcpServer.args,
                env: { LOOPMARSHAL_ROLE: role, LOOPMARSHAL_IDE_LABEL: "cursor" }
              }
            }
          };
          return `${JSON.stringify(config, null, 2)}\n`;
        }
      };

    // ── Trae ────────────────────────────────────────────────────
    case "trae":
      return {
        targetDir: ".trae/skills/loopmarshal",
        files: [
          { source: `${role}/SKILL.md`, target: "SKILL.md" },
          { source: `${role}/trae/SKILL.md`, target: `SKILL-${role}.md` }
        ],
        mcpConfigPath: null,
        mcpConfigGenerator: null
      };

    // ── OpenCode ────────────────────────────────────────────────
    case "opencode":
      return {
        targetDir: ".opencode/skills",
        files: [
          { source: `${role}/SKILL.md`, target: "SKILL.md" }
        ],
        mcpConfigPath: ".opencode/mcp.json",
        mcpConfigGenerator: (_cmd, timeoutSeconds, _role, _ideLabel) => {
          const config = {
            mcpServers: {
              loopmarshal: {
                command: mcpServer.command,
                args: mcpServer.args,
                timeout: timeoutSeconds * 1000,
                env: { LOOPMARSHAL_ROLE: role, LOOPMARSHAL_IDE_LABEL: "opencode" }
              }
            }
          };
          return `${JSON.stringify(config, null, 2)}\n`;
        }
      };

    // ── Gemini CLI ──────────────────────────────────────────────
    case "gemini":
      return {
        targetDir: ".gemini/skills",
        files: [
          { source: `${role}/SKILL.md`, target: "SKILL.md" }
        ],
        // Gemini CLI uses .gemini/settings.json for MCP config
        mcpConfigPath: ".gemini/settings.json",
        mcpConfigGenerator: (_cmd, _timeout, _role, _ideLabel) => {
          const config = {
            mcpServers: {
              loopmarshal: {
                command: mcpServer.command,
                args: mcpServer.args,
                env: { LOOPMARSHAL_ROLE: role, LOOPMARSHAL_IDE_LABEL: "gemini" }
              }
            }
          };
          return `${JSON.stringify(config, null, 2)}\n`;
        }
      };

    // ── Aider ───────────────────────────────────────────────────
    case "aider":
      return {
        targetDir: ".aider",
        files: [
          { source: `${role}/SKILL.md`, target: "loopmarshal-skill.md" }
        ],
        // Aider supports MCP via .aider/mcp.json (requires aider >= 0.60)
        mcpConfigPath: ".aider/mcp.json",
        mcpConfigGenerator: (_cmd, _timeout, _role, _ideLabel) => {
          const config = {
            mcpServers: {
              loopmarshal: {
                command: mcpServer.command,
                args: mcpServer.args,
                env: { LOOPMARSHAL_ROLE: role, LOOPMARSHAL_IDE_LABEL: "aider" }
              }
            }
          };
          return `${JSON.stringify(config, null, 2)}\n`;
        }
      };

    // ── Windsurf ────────────────────────────────────────────────
    case "windsurf":
      return {
        targetDir: ".windsurf/rules",
        files: [
          { source: `${role}/SKILL.md`, target: `loopmarshal-${role}.md` }
        ],
        // Windsurf uses .codeium / mcp config via global settings
        mcpConfigPath: null,
        mcpConfigGenerator: null
      };

    // ── Qoder ──────────────────────────────────────────────────
    case "qoder":
      return {
        targetDir: ".qoder/skills",
        files: [
          { source: `${role}/SKILL.md`, target: "SKILL.md" }
        ],
        mcpConfigPath: null,
        mcpConfigGenerator: null
      };

    // ── GitHub Copilot CLI ─────────────────────────────────────
    case "github":
      return {
        targetDir: ".github/skills",
        files: [
          { source: `${role}/SKILL.md`, target: "loopmarshal-skill.md" }
        ],
        // GitHub Copilot uses .vscode/settings.json for MCP config
        mcpConfigPath: ".vscode/settings.json",
        mcpConfigGenerator: (_cmd, _timeout, _role, _ideLabel) => {
          const config = {
            "github.copilot.advanced": {
              "mcp.servers": {
                loopmarshal: {
                  command: mcpServer.command,
                  args: mcpServer.args,
                  env: { LOOPMARSHAL_ROLE: role, LOOPMARSHAL_IDE_LABEL: "github" }
                }
              }
            }
          };
          return `${JSON.stringify(config, null, 2)}\n`;
        }
      };

    // ── Cline (VS Code) ────────────────────────────────────────
    case "cline":
      return {
        targetDir: ".cline/rules",
        files: [
          { source: `${role}/SKILL.md`, target: `loopmarshal-${role}.md` }
        ],
        // Cline uses .vscode/settings.json for MCP
        mcpConfigPath: ".cline/mcp.json",
        mcpConfigGenerator: (_cmd, _timeout, _role, _ideLabel) => {
          const config = {
            mcpServers: {
              loopmarshal: {
                command: mcpServer.command,
                args: mcpServer.args,
                env: { LOOPMARSHAL_ROLE: role, LOOPMARSHAL_IDE_LABEL: "cline" }
              }
            }
          };
          return `${JSON.stringify(config, null, 2)}\n`;
        }
      };

    // ── Crusher AI ──────────────────────────────────────────────
    case "crusher":
      return {
        targetDir: ".crusher/skills",
        files: [
          { source: `${role}/SKILL.md`, target: "SKILL.md" }
        ],
        mcpConfigPath: null,
        mcpConfigGenerator: null
      };

    // ── Lovable ─────────────────────────────────────────────────
    case "lov":
      return {
        targetDir: ".lovable",
        files: [
          { source: `${role}/SKILL.md`, target: "loopmarshal-skill.md" }
        ],
        mcpConfigPath: null,
        mcpConfigGenerator: null
      };

    // ── Xiaomi MiMo ─────────────────────────────────────────────
    case "mimo":
      return {
        targetDir: ".mimo/skills",
        files: [
          { source: `${role}/SKILL.md`, target: "SKILL.md" }
        ],
        mcpConfigPath: ".mimo/mcp.json",
        mcpConfigGenerator: (_cmd, _timeout, _role, _ideLabel) => {
          const config = {
            mcpServers: {
              loopmarshal: {
                command: mcpServer.command,
                args: mcpServer.args,
                env: { LOOPMARSHAL_ROLE: role, LOOPMARSHAL_IDE_LABEL: "mimo" }
              }
            }
          };
          return `${JSON.stringify(config, null, 2)}\n`;
        }
      };
  }
};

// ---------------------------------------------------------------------------
// Setup guide generation
// ---------------------------------------------------------------------------

const buildSetupGuide = (
  ide: SupportedIde,
  options: {
    ideFound: boolean;
    mcpAutoInjected: boolean;
    mcpConfigPath: string | null;
    firstPrompt: string;
    role: "host" | "worker" | "knowledge_keeper";
    sessionName: string;
    memberName: string;
    duty: string;
    dashboardUrl?: string | null;
    coreAutoStarted?: boolean;
  }
): SetupGuide => {
  const { ideFound, mcpAutoInjected, firstPrompt, role, sessionName } = options;
  const mcpServer = getMcpServerCommand();
  const meta = IDE_META[ide];
  const ideLabel = meta.label;

  const mcpManualGuide: string[] = [];
  const skillManualGuide: string[] = [];
  const promptManualGuide: string[] = [];
  const notes: string[] = [];

  // ── MCP 配置指引 ──────────────────────────────────────────
  if (!mcpAutoInjected) {
    const envLines = [
      `       LOOPMARSHAL_ROLE=${role}`,
      `       LOOPMARSHAL_IDE_LABEL=${ide}`
    ];
    const jsonConfig = [
      `{`,
      `  "mcpServers": {`,
      `    "loopmarshal": {`,
      `      "command": "${mcpServer.command}",`,
      `      "args": ${JSON.stringify(mcpServer.args).replace(/"/g, '"').replace(/,/g, ', ')},`,
      `      "env": {`,
      `        "LOOPMARSHAL_ROLE": "${role}",`,
      `        "LOOPMARSHAL_IDE_LABEL": "${ide}"`,
      `      }`,
      `    }`,
      `  }`,
      `}`
    ].join("\n");

    switch (ide) {
      case "claude":
        mcpManualGuide.push(
          `Claude Code 的 MCP 配置文件位于: .claude/mcp.json`,
          `请手动创建该文件，内容如下:`,
          ``,
          jsonConfig
        );
        break;

      case "codex":
        mcpManualGuide.push(
          `Codex 的 MCP 配置文件位于: .codex/config.toml`,
          `请手动编辑该文件，添加以下内容:`,
          ``,
          `[mcp_servers.loopmarshal]`,
          `command = "${mcpServer.command}"`,
          `args = ["${mcpServer.args.join('", "')}"]`,
          `[mcp_servers.loopmarshal.env]`,
          `LOOPMARSHAL_ROLE = "${role}"`,
          `LOOPMARSHAL_IDE_LABEL = "codex"`
        );
        break;

      case "cursor":
        mcpManualGuide.push(
          `Cursor 的 MCP 配置文件位于: .cursor/mcp.json`,
          `请手动创建该文件，内容如下:`,
          ``,
          jsonConfig
        );
        break;

      case "trae":
        mcpManualGuide.push(
          `Trae 不支持通过配置文件自动注入 MCP Server，需要手动配置:`,
          ``,
          `步骤:`,
          `  1. 打开 Trae IDE`,
          `  2. 进入 设置 → MCP (Settings → MCP)`,
          `  3. 点击 "Add MCP Server" / "添加 MCP 服务"`,
          `  4. 填写以下信息:`,
          `     - 名称 (Name): loopmarshal`,
          `     - 命令 (Command): ${mcpServer.command}`,
          `     - 参数 (Args): ${JSON.stringify(mcpServer.args)}`,
          `     - 环境变量 (Env):`,
          ...envLines,
          `  5. 保存并启用该 MCP Server`,
          ``,
          `或者，如果 Trae 支持项目级配置文件，`,
          `请在项目根目录创建 .trae/mcp.json，内容如下:`,
          ``,
          jsonConfig
        );
        break;

      case "opencode":
        mcpManualGuide.push(
          `OpenCode 的 MCP 配置文件位于: .opencode/mcp.json`,
          `请手动创建该文件，内容如下:`,
          ``,
          jsonConfig
        );
        break;

      case "gemini":
        mcpManualGuide.push(
          `Gemini CLI 的 MCP 配置文件位于: .gemini/settings.json`,
          `请手动创建或编辑该文件，添加以下内容:`,
          ``,
          jsonConfig
        );
        break;

      case "aider":
        mcpManualGuide.push(
          `Aider 的 MCP 配置文件位于: .aider/mcp.json`,
          `请手动创建该文件，内容如下:`,
          ``,
          jsonConfig,
          ``,
          `注意: MCP 支持需要 aider >= 0.60 版本。`,
          `如果您的 aider 版本较低，请通过以下命令更新:`,
          `  pip install --upgrade aider-chat`
        );
        break;

      case "windsurf":
        mcpManualGuide.push(
          `Windsurf 的 MCP 配置需要通过 IDE 设置面板完成:`,
          ``,
          `步骤:`,
          `  1. 打开 Windsurf IDE`,
          `  2. 进入 Settings → MCP Servers`,
          `  3. 点击 "Add Server"`,
          `  4. 填写:`,
          `     - 名称: loopmarshal`,
          `     - 命令: ${mcpServer.command}`,
          `     - 参数: ${JSON.stringify(mcpServer.args)}`,
          `     - 环境变量:`,
          ...envLines,
          `  5. 保存并启用`,
          ``,
          `Windsurf 的规则文件已注入到 .windsurf/rules/ 目录，会自动加载。`
        );
        break;

      case "qoder":
        mcpManualGuide.push(
          `Qoder 的 MCP 配置需要通过 IDE 设置面板完成:`,
          ``,
          `步骤:`,
          `  1. 打开 Qoder IDE`,
          `  2. 进入 设置 → MCP Servers`,
          `  3. 添加新的 MCP Server:`,
          `     - 名称: loopmarshal`,
          `     - 命令: ${mcpServer.command}`,
          `     - 参数: ${JSON.stringify(mcpServer.args)}`,
          `     - 环境变量:`,
          ...envLines,
          `  4. 保存并启用`
        );
        break;

      case "github":
        mcpManualGuide.push(
          `GitHub Copilot CLI 的 MCP 配置位于: .vscode/settings.json`,
          `请手动编辑该文件，添加以下内容:`,
          ``,
          `{`,
          `  "github.copilot.advanced": {`,
          `    "mcp.servers": {`,
          `      "loopmarshal": {`,
          `        "command": "${mcpServer.command}",`,
          `        "args": ${JSON.stringify(mcpServer.args)},`,
          `        "env": {`,
          `          "LOOPMARSHAL_ROLE": "${role}",`,
          `          "LOOPMARSHAL_IDE_LABEL": "github"`,
          `        }`,
          `      }`,
          `    }`,
          `  }`,
          `}`
        );
        break;

      case "cline":
        mcpManualGuide.push(
          `Cline 的 MCP 配置文件位于: .cline/mcp.json`,
          `请手动创建该文件，内容如下:`,
          ``,
          jsonConfig,
          ``,
          `或者通过 VS Code 中 Cline 扩展的设置面板添加 MCP Server。`
        );
        break;

      case "crusher":
        mcpManualGuide.push(
          `Crusher AI 的 MCP 配置需要通过其设置面板完成:`,
          ``,
          `步骤:`,
          `  1. 打开 Crusher AI`,
          `  2. 进入 Settings → MCP / Tool Settings`,
          `  3. 添加 MCP Server:`,
          `     - 名称: loopmarshal`,
          `     - 命令: ${mcpServer.command}`,
          `     - 参数: ${JSON.stringify(mcpServer.args)}`,
          `     - 环境变量:`,
          ...envLines,
          `  4. 保存并启用`
        );
        break;

      case "lov":
        mcpManualGuide.push(
          `Lovable 的 MCP 配置需要通过其平台设置完成:`,
          ``,
          `步骤:`,
          `  1. 打开 Lovable 平台`,
          `  2. 进入 Settings → Integrations / MCP`,
          `  3. 添加 MCP Server:`,
          `     - 名称: loopmarshal`,
          `     - 命令: ${mcpServer.command}`,
          `     - 参数: ${JSON.stringify(mcpServer.args)}`,
          `     - 环境变量:`,
          ...envLines,
          `  4. 保存并启用`
        );
        break;

      case "mimo":
        mcpManualGuide.push(
          `MiMo CLI 的 MCP 配置文件位于: .mimo/mcp.json`,
          `请手动创建该文件，内容如下:`,
          ``,
          jsonConfig
        );
        break;
    }
  }

  // ── 首条消息指引 ──────────────────────────────────────────
  if (!ideFound) {
    promptManualGuide.push(
      `${meta.label} 未在 PATH 中找到。请安装:`,
      ``,
      ...meta.installGuide.map((line) => `  ${line}`),
      ``,
      `安装后重新执行本命令，或手动启动 ${meta.label} 后发送以下消息:`,
      ``,
      firstPrompt
    );
  } else if (!meta.supportsPromptArg && !meta.supportsSystemPrompt) {
    promptManualGuide.push(
      `${meta.label} 不支持通过命令行传入首条消息。`,
      `请打开 ${meta.label} 后，在对话框中手动发送以下消息:`,
      ``,
      firstPrompt
    );
  }

  // ── 备注 ──────────────────────────────────────────────────
  if (ide === "trae") {
    notes.push(
      `Skill 文件已注入到 .trae/skills/loopmarshal/ 目录。`,
      `如果 Trae 不自动加载该目录，请手动将 SKILL.md 内容复制到 Trae 的 Rules 或系统提示词中。`
    );
  }

  if (role === "worker") {
    notes.push(
      `你是 Worker 角色。请确保 Host 已加入会话 "${sessionName}"。`,
      `如果没有 Host，请在另一个窗口执行:`,
      `  loopmarshal start-agent <ide> --role host --duty "<职责>" --session ${sessionName}`
    );
  }

  return {
    ideLabel,
    ideFound,
    mcpAutoInjected,
    mcpManualGuide,
    skillManualGuide,
    promptManualGuide,
    notes,
    dashboardUrl: options.dashboardUrl,
    coreAutoStarted: options.coreAutoStarted
  };
};

// ---------------------------------------------------------------------------
// First prompt & system prompt generation
// ---------------------------------------------------------------------------

const generateFirstPrompt = (options: {
  sessionName: string;
  memberName: string;
  role: "host" | "worker" | "knowledge_keeper";
  duty: string;
  dashboardUrl?: string | null;
  coreApiUrl?: string | null;
}): string => {
  const { sessionName, memberName, role, duty, dashboardUrl, coreApiUrl } = options;

  const baseInfo = [
    `你已接入 loopmarshal 协作框架。`,
    ``,
    `会话名称: ${sessionName}`,
    `你的窗口名: ${memberName}`,
    `你的角色: ${role}`,
    `你的职责: ${duty}`,
    ``,
    ...(dashboardUrl ? [`后台管理面板: ${dashboardUrl}`] : []),
    ...(coreApiUrl ? [`核心 API 地址: ${coreApiUrl}`] : []),
    ``,
    `你已通过 API 自动加入会话，无需再调用 attach 工具。`,
    `行为规则已通过 Skill 文件安装到你的 IDE 目录中，请遵守。`,
    ``,
    `立即执行以下步骤:`
  ];

  if (role === "host") {
    baseInfo.push(
      `1. 构建知识库（L1 会话方向）`,
      `2. 拆解任务，用 dispatch_many 派发给 workers`,
      `3. 调用 await 等待 worker 回报`,
      `4. 裁决回报，更新知识库，继续派发或 resolve`,
      ``,
      `你还可以使用 start_worker 工具启动新的 AI Worker：`,
      `  start_worker(ide="claude", duty="前端开发") — 自动继承当前会话和目录`,
      `支持的 IDE: claude, codex, cursor, trae, opencode, gemini, aider, windsurf, qoder, github, cline, crusher, lov, mimo`,
      ``,
      `如果 MCP 工具不可用，说明 loopmarshal 服务未启动，请引导用户执行: loopmarshal start --daemon`
    );
  } else if (role === "knowledge_keeper") {
    baseInfo.push(
      `1. 调用 await 等待 Host 的知识库维护委托`,
      `2. 收到维护委托后，读取现有知识库，执行更新`,
      `3. 调用 submit 回报维护结果`,
      `4. 继续 await 等待下一个维护任务`,
      ``,
      `如果 MCP 工具不可用，说明 loopmarshal 服务未启动，请引导用户执行: loopmarshal start --daemon`
    );
  } else {
    baseInfo.push(
      `1. 调用 await 等待任务分配`,
      `2. 收到任务后处理，然后 submit 回报`,
      `3. 继续 await 等待下一个任务`,
      ``,
      `如果 MCP 工具不可用，说明 loopmarshal 服务未启动，请引导用户执行: loopmarshal start --daemon`
    );
  }

  return baseInfo.join("\n");
};

const generateSystemPrompt = (options: {
  role: "host" | "worker" | "knowledge_keeper";
  sessionName: string;
  memberName: string;
  duty: string;
  dashboardUrl?: string | null;
  coreApiUrl?: string | null;
}): string | null => {
  const { role, sessionName, memberName, duty, dashboardUrl, coreApiUrl } = options;

  const coreRules =
    role === "host"
      ? [
          `你是 loopmarshal 协作框架的 Host 角色。`,
          `铁律:`,
          `1. 派发任务必须用 dispatch_many，即使只有一条`,
          `2. 派发后直接 await 等待，不补解释`,
          `3. 收到回报后先裁决知识库候选更新，再继续`,
          `4. 不把控制协议翻译成自然语言`,
          `5. 不暴露内部 cmd`,
          `6. 不把用户原话直接转发给 Worker`,
          `7. 不让 Worker 写入知识库`,
          ``,
          `你拥有 start_worker 工具，可以按需启动新的 AI Worker 加入当前会话。`,
          `启动的 Worker 会自动继承当前会话名称和工作目录。`
        ]
      : role === "knowledge_keeper"
      ? [
          `你是 loopmarshal 协作框架的 Knowledge Keeper 角色。`,
          `铁律:`,
          `1. 只能写入知识库文档，不能写入业务代码`,
          `2. 不能裁决 Worker 的知识库候选更新`,
          `3. 不能派发任务给 Worker`,
          `4. 收到 Host 委托后必须先读取现有知识库，再执行更新`,
          `5. 每次更新后必须向 Host 回报更新摘要`,
          `6. 不得将用户原话不加判断直接写入知识库`,
          `7. 不得将临时实现细节写入 L1/L2`,
          `8. 不暴露内部 cmd`
        ]
      : [
          `你是 loopmarshal 协作框架的 Worker 角色。`,
          `铁律:`,
          `1. 唯一闭环: await -> 处理任务 -> submit -> await`,
          `2. 拿到任务后必须处理到 submit，中间不输出自然语言`,
          `3. submit 后不补自然语言，按返回协议继续`,
          `4. 不做 Host 的编排工作`,
          `5. 不裁决或写入知识库`,
          `6. 每次回报必须包含 knowledgeUpdateAssessment`,
          `7. 不暴露内部 cmd`
        ];

  coreRules.push(
    ``,
    `会话: ${sessionName} | 窗口名: ${memberName} | 职责: ${duty}`,
    ...(dashboardUrl ? [`后台管理面板: ${dashboardUrl}`] : []),
    ...(coreApiUrl ? [`核心 API 地址: ${coreApiUrl}`] : []),
    `详细行为规则已通过 Skill 文件加载，请遵守。`
  );

  return coreRules.join("\n");
};

// ---------------------------------------------------------------------------
// IDE launch
// ---------------------------------------------------------------------------

type IdeLaunchConfig = {
  command: string;
  args: string[];
  detached: boolean;
};

const buildIdeLaunchConfig = (
  ide: SupportedIde,
  options: {
    systemPrompt: string | null;
    firstPrompt: string;
    mcpConfigPath: string | null;
  }
): IdeLaunchConfig | null => {
  const { systemPrompt, firstPrompt, mcpConfigPath } = options;
  const meta = IDE_META[ide];

  // 所有 IDE 都在新终端窗口中启动（detached），不阻塞当前终端
  // 用户可以在同一终端连续执行多个 start-agent 命令
  switch (ide) {
    case "claude": {
      const args: string[] = [];
      if (systemPrompt && meta.supportsSystemPrompt) {
        args.push("--append-system-prompt", systemPrompt);
      }
      if (mcpConfigPath && meta.supportsMcpConfigArg) {
        args.push("--mcp-config", mcpConfigPath);
      }
      args.push(firstPrompt);
      return { command: "claude", args, detached: true };
    }

    case "codex":
    case "opencode":
    case "gemini":
    case "aider":
    case "mimo": {
      // These CLI tools accept a prompt as positional argument
      const cmd = meta.command;
      const args: string[] = [firstPrompt];
      return { command: cmd, args, detached: true };
    }

    case "trae": {
      const args = ["chat", "--mode", "agent", firstPrompt];
      return { command: "trae", args, detached: true };
    }

    case "cursor":
    case "windsurf":
    case "qoder":
    case "crusher":
    case "lov": {
      // GUI-based IDEs: just open the project directory
      const args = ["."];
      return { command: meta.command, args, detached: true };
    }

    case "github": {
      // GitHub Copilot CLI uses: gh copilot "prompt"
      const args = ["copilot", firstPrompt];
      return { command: "gh", args, detached: true };
    }

    case "cline": {
      // Cline is a VS Code extension, launch VS Code
      const args = ["."];
      return { command: "code", args, detached: true };
    }

    default:
      return null;
  }
};

// ---------------------------------------------------------------------------
// Setup guide formatting (for terminal output)
// ---------------------------------------------------------------------------

const formatSetupGuide = (guide: SetupGuide): string => {
  const lines: string[] = [];
  const ideIcon = guide.ideFound ? "[已找到]" : "[未找到]";

  lines.push("");
  lines.push("══════════════════════════════════════════════════");
  lines.push(`  ${guide.ideLabel.toUpperCase()} ${ideIcon} 设置指引`);
  lines.push("══════════════════════════════════════════════════");
  lines.push("");

  // 核心服务状态
  if (guide.coreAutoStarted) {
    lines.push("✅ 核心服务: 已自动后台启动");
  } else {
    lines.push("✅ 核心服务: 已在运行");
  }
  if (guide.dashboardUrl) {
    lines.push(`   后台管理面板: ${guide.dashboardUrl}`);
    lines.push(`   在浏览器中打开上述地址可查看会话状态、成员列表、消息流和知识库`);
  }
  lines.push("");

  if (guide.mcpAutoInjected) {
    lines.push("MCP 配置: 已自动注入");
  } else if (guide.mcpManualGuide.length > 0) {
    lines.push("MCP 配置: 需要手动设置");
    lines.push("");
    guide.mcpManualGuide.forEach((line) => lines.push(`   ${line}`));
    lines.push("");
  }

  if (guide.promptManualGuide.length > 0) {
    lines.push("首条消息: 需要手动发送");
    lines.push("");
    guide.promptManualGuide.forEach((line) => lines.push(`   ${line}`));
    lines.push("");
  }

  if (guide.skillManualGuide.length > 0) {
    guide.skillManualGuide.forEach((line) => lines.push(`   ${line}`));
    lines.push("");
  }

  if (guide.notes.length > 0) {
    lines.push("备注:");
    guide.notes.forEach((line) => lines.push(`   ${line}`));
    lines.push("");
  }

  return lines.join("\n");
};

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export const startAgent = async (options: StartAgentOptions): Promise<StartAgentResult> => {
  const projectRoot = process.cwd();

  // 1. Determine session name and member name
  const sessionName = options.session || basename(projectRoot).toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const memberName = options.name || `${options.ide}-${options.role}`;

  const result: StartAgentResult = {
    ide: options.ide,
    sessionName,
    memberName,
    role: options.role,
    duty: options.duty,
    coreAutoStarted: false,
    dashboardUrl: null,
    coreApiUrl: null,
    injectedFiles: [],
    mcpConfigPath: null,
    firstPrompt: "",
    systemPrompt: null,
    spawnedPid: null,
    warning: null,
    setupGuide: {
      ideLabel: IDE_META[options.ide].label,
      ideFound: false,
      mcpAutoInjected: false,
      mcpManualGuide: [],
      skillManualGuide: [],
      promptManualGuide: [],
      notes: []
    }
  };

  // 2. Ensure core service is running (auto-start if needed)
  const { isCoreReachable, startCore, getDashboardUrl } = await import("./runtime.js");
  let coreRunning = await isCoreReachable();

  if (!coreRunning && !options.dryRun) {
    try {
      const coreStatus = await startCore(projectRoot);
      coreRunning = await isCoreReachable();
      result.coreAutoStarted = true;
      if (coreStatus.metadata) {
        result.dashboardUrl = getDashboardUrl(coreStatus.metadata);
        result.coreApiUrl = `http://${coreStatus.metadata.host}:${coreStatus.metadata.port}`;
      }
    } catch (error: unknown) {
      result.warning = `无法自动启动 loopmarshal 核心服务: ${error instanceof Error ? error.message : String(error)}`;
    }
  } else if (coreRunning) {
    // 服务已在运行，获取其 metadata
    const { getCoreStatus } = await import("./runtime.js");
    const coreStatus = await getCoreStatus(projectRoot);
    if (coreStatus.metadata) {
      result.dashboardUrl = getDashboardUrl(coreStatus.metadata);
      result.coreApiUrl = `http://${coreStatus.metadata.host}:${coreStatus.metadata.port}`;
    } else {
      // metadata 不可用但仍能访问，用默认值
      const { defaultHost, defaultPort } = await import("./runtime.js");
      result.dashboardUrl = getDashboardUrl(null);
      result.coreApiUrl = `http://${defaultHost}:${defaultPort}`;
    }
  }

  if (coreRunning) {
    const client = createLoopMarshalClient({
      headers: {
        "x-loopmarshal-client": "cli",
        "x-loopmarshal-process": String(process.pid)
      }
    });

    // 3. Attach to session
    try {
      if (options.role === "worker") {
        try {
          await client.getSessionByName(sessionName);
        } catch {
          await client.createSession({
            sessionName,
            agentName: `${sessionName}-placeholder-host`,
            displayName: `${sessionName}-placeholder-host`,
            platform: "generic",
            roleDescription: "placeholder",
            capabilities: [],
            connectionMode: "extension"
          });
        }
      }

      await client.attachNamedSession(sessionName, {
        agentName: memberName,
        role: options.role,
        roleDescription: options.duty
      });
    } catch (error: unknown) {
      if (error instanceof LoopMarshalSdkError) {
        result.warning = `会话加入失败: ${error.message}`;
      } else {
        result.warning = `会话加入失败: ${String(error)}`;
      }
    }

    // 4. Warn if worker but no host
    if (options.role === "worker") {
      try {
        const session = await client.getSessionByName(sessionName);
        const members = await client.getMembers(session.id);
        const hasHost = members.some((m) => m.role === "host");
        if (!hasHost) {
          const hostWarning =
            `当前会话 "${sessionName}" 尚无 Host 成员。` +
            `请在另一个窗口执行: loopmarshal start-agent <ide> --role host --duty "<职责>" --session ${sessionName}`;
          result.warning = result.warning
            ? `${result.warning}\n${hostWarning}`
            : hostWarning;
        }
      } catch {
        // Best-effort
      }
    }
  } else if (options.dryRun) {
    result.warning = "核心服务未运行 (dry-run 模式，跳过自动启动)。";
  }

  // 5. Inject Skill files + MCP config
  if (!options.dryRun) {
    const skillsSourceDir = resolveSkillsDir();
    const injectSpec = getInjectSpec(options.ide, options.role);
    const timeoutSeconds = options.timeoutSeconds ?? 3600;

    const targetDir = join(projectRoot, injectSpec.targetDir);
    await mkdir(targetDir, { recursive: true });

    for (const fileSpec of injectSpec.files) {
      const sourcePath = join(skillsSourceDir, fileSpec.source);
      const targetPath = join(targetDir, fileSpec.target);
      if (existsSync(sourcePath)) {
        await copyFile(sourcePath, targetPath);
        result.injectedFiles.push(join(injectSpec.targetDir, fileSpec.target));
      }
    }

    // MCP 配置注入
    if (!options.dryRun) {
      const mcpServer = getMcpServerCommand();
      const role = options.role;
      const ideLabel = options.ide;

      // 构建 loopmarshal MCP 条目
      const loopmarshalEntry: { command: string; args: string[]; env: Record<string, string>; timeout?: number } = {
        command: mcpServer.command,
        args: mcpServer.args,
        env: { LOOPMARSHAL_ROLE: role, LOOPMARSHAL_IDE_LABEL: ideLabel },
        timeout: timeoutSeconds * 1000,
      };

      // Claude Code 特殊环境变量
      if (ideLabel === "claude") {
        loopmarshalEntry.env.CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT = "1";
      }

      // 注入策略：优先项目级；不支持项目级则 fallback 到全局级
      if (injectSpec.mcpConfigPath) {
        // 项目级 MCP 配置（合并方式，保留已有配置）
        const isToml = injectSpec.mcpConfigPath.endsWith(".toml");
        const projectMcpPath = join(projectRoot, injectSpec.mcpConfigPath);
        await injectMcpConfig(projectMcpPath, options.ide, isToml, loopmarshalEntry);
        result.mcpConfigPath = injectSpec.mcpConfigPath;
      } else {
        // 不支持项目级 → fallback 到全局级（通过 HOME 环境变量查找）
        const globalMcpPath = getGlobalMcpConfigPath(options.ide);
        if (globalMcpPath) {
          const globalIsToml = globalMcpPath.endsWith(".toml");
          await injectMcpConfig(globalMcpPath, options.ide, globalIsToml, loopmarshalEntry);
          result.mcpConfigPath = globalMcpPath;
          result.setupGuide.notes.push(`MCP 配置已注入全局路径: ${globalMcpPath}`);
        }
      }
    }
  }

  // 6. Generate first prompt and system prompt
  result.firstPrompt = generateFirstPrompt({
    sessionName,
    memberName,
    role: options.role,
    duty: options.duty,
    dashboardUrl: result.dashboardUrl,
    coreApiUrl: result.coreApiUrl
  });
  result.systemPrompt = generateSystemPrompt({
    role: options.role,
    sessionName,
    memberName,
    duty: options.duty,
    dashboardUrl: result.dashboardUrl,
    coreApiUrl: result.coreApiUrl
  });

  // 7. Launch IDE
  if (!options.dryRun) {
    const exec = resolveIdeExecutable(options.ide);
    const ideFound = isCommandAvailable(exec.command);
    result.setupGuide.ideFound = ideFound;

    if (ideFound) {
      const launchConfig = buildIdeLaunchConfig(options.ide, {
        systemPrompt: result.systemPrompt,
        firstPrompt: result.firstPrompt,
        mcpConfigPath: result.mcpConfigPath
          ? join(projectRoot, result.mcpConfigPath)
          : null
      });

      if (launchConfig) {
        // 在新终端窗口中启动 IDE/CLI 工具，不阻塞当前终端
        const isWindows = process.platform === "win32";
        const isMac = process.platform === "darwin";

        if (isWindows) {
          // Windows: 写一个临时 .cmd 批处理文件，在新窗口中执行
          // 用 spawn + detached + unref 确保不阻塞当前进程
          // 批处理文件在执行完后自动删除自身
          const { writeFileSync } = await import("node:fs");
          const { tmpdir } = await import("node:os");
          const batchPath = join(tmpdir(), `loopmarshal-start-${Date.now()}.cmd`);
          const escapedArgs = launchConfig.args.map(a => {
            return a.includes(" ") ? `"${a.replace(/"/g, '""')}"` : a;
          });
          const batchContent = [
            `@echo off`,
            `cd /d "${projectRoot}"`,
            `title LoopMarshal - ${options.ide}`,
            `echo LoopMarshal starting ${IDE_META[options.ide].label}...`,
            `${launchConfig.command} ${escapedArgs.join(" ")}`,
            `echo.`,
            `echo LoopMarshal agent has exited. You can close this window.`,
            `del "%~f0"`,
          ].join("\r\n");
          writeFileSync(batchPath, batchContent, "utf-8");

          // 用 spawn + detached 打开新窗口，unref 确保不阻塞
          const child = spawn("cmd.exe", ["/c", "start", batchPath], {
            cwd: projectRoot,
            stdio: "ignore",
            shell: false,
            detached: true,
          });
          result.spawnedPid = child.pid ?? null;
          child.unref();
        } else if (isMac) {
          // macOS: 使用 osascript 在新 Terminal.app 窗口启动
          const escapedArgs = launchConfig.args.map(a => `'${a.replace(/'/g, "'\\''")}'`);
          const macCmd = `cd "${projectRoot}" && ${launchConfig.command} ${escapedArgs.join(" ")}`;
          const child = spawn("osascript", ["-e", `tell application "Terminal" to do script "${macCmd.replace(/"/g, '\\"')}"`], {
            cwd: projectRoot,
            stdio: "ignore",
            detached: true,
          });
          result.spawnedPid = child.pid ?? null;
          child.unref();
        } else {
          // Linux: 尝试常见的终端模拟器
          const escapedArgs = launchConfig.args.map(a => `'${a.replace(/'/g, "'\\''")}'`);
          const linuxCmd = `cd "${projectRoot}" && ${launchConfig.command} ${escapedArgs.join(" ")}`;
          const terminals = [
            { cmd: "gnome-terminal", args: ["--", "bash", "-c", linuxCmd] },
            { cmd: "konsole", args: ["-e", "bash", "-c", linuxCmd] },
            { cmd: "xterm", args: ["-e", "bash", "-c", linuxCmd] },
          ];
          const available = terminals.find(t => isCommandAvailable(t.cmd));
          if (available) {
            const child = spawn(available.cmd, available.args, {
              cwd: projectRoot,
              stdio: "ignore",
              detached: true,
            });
            result.spawnedPid = child.pid ?? null;
            child.unref();
          } else {
            // Fallback: 直接 spawn（不新开窗口）
            const child = spawn(launchConfig.command, launchConfig.args, {
              cwd: projectRoot,
              stdio: "ignore",
              detached: true,
            });
            result.spawnedPid = child.pid ?? null;
            child.unref();
          }
        }
      }
    }
  } else {
    const exec = resolveIdeExecutable(options.ide);
    result.setupGuide.ideFound = isCommandAvailable(exec.command);
  }

  // 8. Build setup guide
  result.setupGuide = buildSetupGuide(options.ide, {
    ideFound: result.setupGuide.ideFound,
    mcpAutoInjected: result.mcpConfigPath !== null,
    mcpConfigPath: result.mcpConfigPath,
    firstPrompt: result.firstPrompt,
    role: options.role,
    sessionName,
    memberName,
    duty: options.duty,
    dashboardUrl: result.dashboardUrl,
    coreAutoStarted: result.coreAutoStarted
  });

  return result;
};

// ---------------------------------------------------------------------------
// Skills directory resolution
// ---------------------------------------------------------------------------

let _skillsDir: string | null = null;

const resolveSkillsDir = (): string => {
  if (_skillsDir) return _skillsDir;

  // 1. 优先使用环境变量指定的 skills 目录
  const envSkillsDir = process.env.LOOPMARSHAL_SKILLS_DIR;
  if (envSkillsDir && existsSync(join(envSkillsDir, "host", "SKILL.md"))) {
    _skillsDir = envSkillsDir;
    return envSkillsDir;
  }

  // 2. 从当前编译文件位置向上搜索 skills 目录（monorepo 开发模式）
  const thisDir = dirname(fileURLToPath(import.meta.url));
  let current = thisDir;
  for (let i = 0; i < 10; i++) {
    const candidate = join(current, "skills");
    if (existsSync(join(candidate, "host", "SKILL.md")) && existsSync(join(candidate, "knowledge_keeper", "SKILL.md"))) {
      _skillsDir = candidate;
      return candidate;
    }
    current = dirname(current);
  }

  // 3. 从 cwd 搜索（发布包模式或用户在项目根目录执行）
  const fromCwd = join(process.cwd(), "skills");
  if (existsSync(join(fromCwd, "host", "SKILL.md")) && existsSync(join(fromCwd, "knowledge_keeper", "SKILL.md"))) {
    _skillsDir = fromCwd;
    return fromCwd;
  }

  throw new Error(
    "Could not find skills source directory. " +
    `Looked by walking up from: ${thisDir}, and from cwd: ${fromCwd}.` +
    (envSkillsDir ? ` Also checked LOOPMARSHAL_SKILLS_DIR=${envSkillsDir}.` : "")
  );
};

export { formatSetupGuide };