/*
 * loopmarshal MCP stdio server
 *
 * Bridges loopmarshal CLI commands into MCP tools over JSON-RPC stdio.
 * For long-running `await` calls, sends progress notifications every 30s
 * to prevent IDE MCP tool timeouts.
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

type JsonRpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
};

type ToolDef = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
};

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

const send = (message: JsonRpcResponse | JsonRpcNotification): void => {
  process.stdout.write(`${JSON.stringify(message)}\n`);
};

const sendResult = (id: number | string, result: unknown): void => {
  send({ jsonrpc: "2.0", id, result });
};

const sendError = (
  id: number | string,
  code: number,
  message: string,
  data?: unknown
): void => {
  send({ jsonrpc: "2.0", id, error: { code, message, data } });
};

const sendProgress = (
  progressToken: string | number,
  message: string,
  progress: number,
  total?: number
): void => {
  send({
    jsonrpc: "2.0",
    method: "notifications/progress",
    params: {
      progressToken,
      progress,
      ...(total !== undefined ? { total } : {}),
      message
    }
  });
};

// ---------------------------------------------------------------------------
// CLI bridge
// ---------------------------------------------------------------------------

const getCliBinPath = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/apps/cli/src/mcp-stdio-server.js → dist/apps/cli/src/index.js
  return join(here, "index.js");
};

const runCliCommand = (
  args: string[],
  options: {
    progressToken?: string | number;
    progressLabel?: string;
    progressIntervalMs?: number;
  } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
  return new Promise((resolve, reject) => {
    const binPath = getCliBinPath();
    const child = spawn(process.execPath, [binPath, ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    // Progress keepalive for long-running commands
    let progressTimer: NodeJS.Timeout | null = null;
    let elapsed = 0;
    const interval = options.progressIntervalMs ?? 30_000;

    if (options.progressToken !== undefined && interval > 0) {
      progressTimer = setInterval(() => {
        elapsed += interval;
        const seconds = Math.floor(elapsed / 1000);
        sendProgress(
          options.progressToken!,
          `${options.progressLabel ?? "Waiting"} (${seconds}s)`,
          elapsed,
          undefined
        );
      }, interval);
    }

    child.on("error", (err) => {
      if (progressTimer) clearInterval(progressTimer);
      reject(err);
    });

    child.on("exit", (code) => {
      if (progressTimer) clearInterval(progressTimer);
      resolve({
        stdout,
        stderr,
        exitCode: code ?? -1
      });
    });
  });
};

const parseCliOutput = (stdout: string): unknown => {
  const trimmed = stdout.trim();
  if (!trimmed) return { status: "ok" };
  try {
    return JSON.parse(trimmed);
  } catch {
    return { raw: trimmed };
  }
};

/**
 * Check whether a parsed CLI result is an `EXECUTE_INTERNAL_CMD` control
 * instruction that expects the caller to re-run a continuation command.
 *
 * In CLI mode the AI model reads this and executes the `cmd` in a terminal.
 * In MCP mode the server must handle this internally — re-run the command
 * and only return the final actionable result to the model.
 */
const isExecuteInternalCmd = (
  parsed: unknown
): parsed is { op: "EXECUTE_INTERNAL_CMD"; cmd: string } => {
  return (
    parsed !== null &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    (parsed as Record<string, unknown>).op === "EXECUTE_INTERNAL_CMD" &&
    typeof (parsed as Record<string, unknown>).cmd === "string"
  );
};

/**
 * Parse a shell-escaped command string (produced by `shellEscape` in the CLI)
 * back into an array of CLI arguments.
 *
 * `shellEscape` either returns the value as-is (for safe chars
 * `[A-Za-z0-9_./:=@-]`) or wraps it in `JSON.stringify` (double quotes with
 * escape sequences). This function reverses that encoding.
 *
 * The first token (`loopmarshal`) is stripped — only the args array is returned.
 */
const parseCmdString = (cmd: string): string[] => {
  const tokens: string[] = [];
  let i = 0;

  while (i < cmd.length) {
    // Skip whitespace
    while (i < cmd.length && cmd[i] === " ") i++;
    if (i >= cmd.length) break;

    if (cmd[i] === '"') {
      // JSON-quoted string
      i++; // skip opening quote
      let value = "";
      while (i < cmd.length && cmd[i] !== '"') {
        if (cmd[i] === "\\" && i + 1 < cmd.length) {
          const next = cmd[i + 1];
          if (next === '"') { value += '"'; i += 2; }
          else if (next === "\\") { value += "\\"; i += 2; }
          else if (next === "n") { value += "\n"; i += 2; }
          else if (next === "t") { value += "\t"; i += 2; }
          else if (next === "r") { value += "\r"; i += 2; }
          else { value += next; i += 2; }
        } else {
          value += cmd[i];
          i++;
        }
      }
      i++; // skip closing quote
      tokens.push(value);
    } else {
      // Unquoted token — read until next whitespace
      let value = "";
      while (i < cmd.length && cmd[i] !== " ") {
        value += cmd[i];
        i++;
      }
      tokens.push(value);
    }
  }

  // Strip the leading "loopmarshal" binary name
  if (tokens.length > 0 && tokens[0] === "loopmarshal") {
    return tokens.slice(1);
  }
  return tokens;
};

/**
 * Run multiple CLI commands sequentially and return combined output.
 * Used by the `resume` tool to restore compact session context.
 */
const runMultiCliCommands = async (
  commands: { args: string[]; label: string }[]
): Promise<Record<string, unknown>> => {
  const results: Record<string, unknown> = {};
  for (const cmd of commands) {
    const result = await runCliCommand(cmd.args, {});
    if (result.exitCode !== 0) {
      // Non-fatal: continue with other commands
      results[cmd.label] = { error: result.stderr.trim() || result.stdout.trim() };
    } else {
      results[cmd.label] = parseCliOutput(result.stdout);
    }
  }
  return results;
};

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const str = (description: string) => ({
  type: "string",
  description
});

/**
 * Tools that are only available to the host role.
 * Workers never see these in tools/list and cannot call them.
 */
const HOST_ONLY_TOOLS = new Set(["dispatch_many", "resolve", "knowledge_upsert"]);

/**
 * Resolve the effective role for tool filtering.
 *
 * Priority:
 * 1. Runtime role set by `attach` call (dynamic — covers role changes across sessions)
 * 2. LOOPMARSHAL_ROLE env var (static — set by mcp-setup for pre-connection isolation)
 * 3. undefined (no filtering — all tools exposed)
 */
let runtimeRole: "host" | "worker" | undefined;

const getEffectiveRole = (): "host" | "worker" | undefined => {
  if (runtimeRole) return runtimeRole;
  const envRole = process.env.LOOPMARSHAL_ROLE;
  if (envRole === "host" || envRole === "worker") return envRole;
  return undefined;
};

/**
 * Returns the filtered tool list based on the effective role.
 * When no role is known, all tools are exposed (backward compatible).
 */
const getFilteredTools = (): ToolDef[] => {
  const role = getEffectiveRole();
  if (!role) return tools;
  if (role === "host") return tools; // host has access to everything
  // worker: exclude host-only tools
  return tools.filter((t) => !HOST_ONLY_TOOLS.has(t.name));
};

const tools: ToolDef[] = [
  {
    name: "attach",
    description:
      "Attach the current AI IDE as a member to an loopmarshal session. Must be called before any other tool.",
    inputSchema: {
      type: "object",
      properties: {
        name: str("Stable unique member name inside the session"),
        session: str("Collaboration session name"),
        role: str("Member role: host or worker"),
        duty: str("Stable long-term responsibility (not a single task)")
      },
      required: ["name", "session", "role", "duty"]
    }
  },
  {
    name: "reset",
    description: "Reset a member's state in the session (clears claimed messages).",
    inputSchema: {
      type: "object",
      properties: {
        name: str("Member name"),
        session: str("Session name")
      },
      required: ["name", "session"]
    }
  },
  {
    name: "members",
    description: "List all members in the session with their roles and statuses.",
    inputSchema: {
      type: "object",
      properties: {
        name: str("Your member name"),
        session: str("Session name")
      },
      required: ["name", "session"]
    }
  },
  {
    name: "await",
    description:
      "Wait for the next actionable item (task for workers, report for hosts). " +
      "This is a long-running operation — the server sends periodic progress notifications. " +
      "Returns a control JSON with instructions on what to do next.",
    inputSchema: {
      type: "object",
      properties: {
        name: str("Your member name"),
        session: str("Session name")
      },
      required: ["name", "session"]
    }
  },
  {
    name: "dispatch_many",
    description:
      "Host only. Dispatch one or more tasks to workers. Each task must be 'workerName::taskJsonString'.",
    inputSchema: {
      type: "object",
      properties: {
        name: str("Host member name"),
        session: str("Session name"),
        tasks: {
          type: "array",
          description: "Array of 'workerName::taskContent' strings",
          items: { type: "string" }
        }
      },
      required: ["name", "session", "tasks"]
    }
  },
  {
    name: "submit",
    description:
      "Worker only. Submit task result. Content must be a JSON string matching loopmarshal.worker-report.v1 schema. Set result to 'contested' when the task boundary or goal conflicts with knowledge base or user intent, triggering Host re-planning.",
    inputSchema: {
      type: "object",
      properties: {
        name: str("Worker member name"),
        session: str("Session name"),
        content: str("Worker report JSON string (loopmarshal.worker-report.v1)"),
        result: str("Payload result marker: completed, failed, or contested")
      },
      required: ["name", "session", "content"]
    }
  },
  {
    name: "resolve",
    description: "Host only. Resolve the current session round with a summary.",
    inputSchema: {
      type: "object",
      properties: {
        name: str("Host member name"),
        session: str("Session name"),
        summary: str("Resolution summary")
      },
      required: ["name", "session", "summary"]
    }
  },
  {
    name: "knowledge_read",
    description: "Read a knowledge document by reference (e.g. 'l1/session-direction' or 'l2/message-protocol').",
    inputSchema: {
      type: "object",
      properties: {
        name: str("Your member name"),
        session: str("Session name"),
        ref: str("Knowledge reference like 'l1/slug' or 'l2/slug'")
      },
      required: ["name", "session", "ref"]
    }
  },
  {
    name: "knowledge_list",
    description: "List knowledge documents, optionally filtered by level or search query.",
    inputSchema: {
      type: "object",
      properties: {
        name: str("Your member name"),
        session: str("Session name"),
        level: str("Filter by level: l1, l2, or l3"),
        query: str("Search query")
      },
      required: ["name", "session"]
    }
  },
  {
    name: "knowledge_upsert",
    description: "Host only. Create or update a knowledge document.",
    inputSchema: {
      type: "object",
      properties: {
        name: str("Host member name"),
        session: str("Session name"),
        level: str("Knowledge level: l1, l2, or l3"),
        slug: str("Document slug (kebab-case)"),
        title: str("Document title"),
        content: str("Document content (markdown)"),
        summary: str("Optional short summary"),
        changeSummary: str("Optional change summary"),
        sourceKind: str("Source kind: host_update or user_feedback")
      },
      required: ["name", "session", "level", "slug", "title", "content"]
    }
  },
  {
    name: "resume",
    description:
      "Restore session context after context compact. " +
      "Combines attach + read L1 direction + list members into a single compact response. " +
      "Use this when the AI context has been compressed and you need to quickly " +
      "recover your collaboration state without consuming excessive context tokens.",
    inputSchema: {
      type: "object",
      properties: {
        name: str("Your member name"),
        session: str("Session name"),
        role: str("Member role: host or worker"),
        duty: str("Stable long-term responsibility"),
        l1Slug: str("Optional L1 knowledge slug to read for direction recovery (default: session-direction)")
      },
      required: ["name", "session", "role", "duty"]
    }
  },
  {
    name: "status",
    description:
      "Get a compact snapshot of the current session state: members, pending messages, " +
      "and your current runtime state. Use this to check what happened while you were away " +
      "or to decide whether it's a good time to compact context.",
    inputSchema: {
      type: "object",
      properties: {
        name: str("Your member name"),
        session: str("Session name")
      },
      required: ["name", "session"]
    }
  }
];

// ---------------------------------------------------------------------------
// Tool dispatch
// ---------------------------------------------------------------------------

const handleToolCall = async (
  toolName: string,
  args: Record<string, unknown>,
  progressToken?: string | number
): Promise<unknown> => {
  const buildArgs = (): string[] => {
    switch (toolName) {
      case "attach":
        return [
          "attach",
          String(args.name),
          "--session", String(args.session),
          "--role", String(args.role),
          "--duty", String(args.duty)
        ];
      case "reset":
        return ["reset", String(args.name), "--session", String(args.session)];
      case "members":
        return ["members", String(args.name), "--session", String(args.session)];
      case "await":
        return ["await", String(args.name), "--session", String(args.session)];
      case "dispatch_many": {
        const tasks = (args.tasks as string[]) ?? [];
        const cliArgs = ["dispatch-many", String(args.name), "--session", String(args.session)];
        for (const task of tasks) {
          cliArgs.push("--task", task);
        }
        return cliArgs;
      }
      case "submit":
        return [
          "submit", String(args.name),
          "--session", String(args.session),
          "--content", String(args.content),
          ...(args.result ? ["--result", String(args.result)] : [])
        ];
      case "resolve":
        return [
          "resolve", String(args.name),
          "--session", String(args.session),
          "--summary", String(args.summary)
        ];
      case "knowledge_read":
        return [
          "knowledge", "read", String(args.name),
          "--session", String(args.session),
          "--ref", String(args.ref)
        ];
      case "knowledge_list": {
        const cliArgs = [
          "knowledge", "list", String(args.name),
          "--session", String(args.session)
        ];
        if (args.level) cliArgs.push("--level", String(args.level));
        if (args.query) cliArgs.push("--query", String(args.query));
        return cliArgs;
      }
      case "knowledge_upsert": {
        const cliArgs = [
          "knowledge", "upsert", String(args.name),
          "--session", String(args.session),
          "--level", String(args.level),
          "--slug", String(args.slug),
          "--title", String(args.title),
          "--content", String(args.content)
        ];
        if (args.summary) cliArgs.push("--summary", String(args.summary));
        if (args.changeSummary) cliArgs.push("--change-summary", String(args.changeSummary));
        if (args.sourceKind) cliArgs.push("--source-kind", String(args.sourceKind));
        return cliArgs;
      }
      case "resume":
        // resume is handled separately — it runs multiple CLI commands
        return [];
      case "status":
        // status is handled separately — it runs multiple CLI commands
        return [];
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  };

  // Handle composite tools that run multiple CLI commands
  if (toolName === "resume") {
    const l1Slug = (args.l1Slug as string) || "session-direction";
    const commands = [
      {
        args: [
          "attach",
          String(args.name),
          "--session", String(args.session),
          "--role", String(args.role),
          "--duty", String(args.duty)
        ],
        label: "attach"
      },
      {
        args: [
          "knowledge", "read", String(args.name),
          "--session", String(args.session),
          "--ref", `l1/${l1Slug}`
        ],
        label: "l1_direction"
      },
      {
        args: [
          "members", String(args.name),
          "--session", String(args.session)
        ],
        label: "members"
      }
    ];
    return runMultiCliCommands(commands);
  }

  if (toolName === "status") {
    const commands = [
      {
        args: [
          "members", String(args.name),
          "--session", String(args.session)
        ],
        label: "members"
      },
      {
        args: [
          "knowledge", "list", String(args.name),
          "--session", String(args.session),
          "--level", "l1"
        ],
        label: "knowledge_l1"
      }
    ];
    return runMultiCliCommands(commands);
  }

  const cliArgs = buildArgs();
  const isLongRunning = toolName === "await";

  // -----------------------------------------------------------------------
  // await: long-running loop with internal EXECUTE_INTERNAL_CMD handling
  // -----------------------------------------------------------------------
  //
  // The CLI `await` command uses a wait-slice mechanism: each invocation
  // waits for a short period, then either:
  //   - Returns a final result (PROCESS_CLAIMED_MESSAGE, END_TURN_SILENTLY, etc.)
  //   - Returns EXECUTE_INTERNAL_CMD with a `cmd` to continue waiting
  //
  // In CLI mode, the AI model reads the cmd and re-executes it in a terminal.
  // In MCP mode, the server must handle this loop internally — re-running
  // the continuation command and only returning the final result to the
  // model. Progress notifications are sent every 30s across all iterations.

  if (isLongRunning) {
    const MAX_ITERATIONS = 1000; // safety limit
    let currentArgs = cliArgs;
    let iterations = 0;

    // External progress timer — runs continuously across all wait slices
    let progressTimer: NodeJS.Timeout | null = null;
    let totalElapsed = 0;
    const progressIntervalMs = 30_000;

    if (progressToken !== undefined) {
      progressTimer = setInterval(() => {
        totalElapsed += progressIntervalMs;
        const seconds = Math.floor(totalElapsed / 1000);
        sendProgress(
          progressToken,
          `Waiting for next actionable item (${seconds}s)`,
          totalElapsed,
          undefined
        );
      }, progressIntervalMs);
    }

    try {
      while (iterations < MAX_ITERATIONS) {
        // Run CLI without internal progress — progress is managed externally
        const result = await runCliCommand(currentArgs, {});

        if (result.exitCode !== 0) {
          const errorOutput = result.stderr.trim() || result.stdout.trim();
          throw new Error(
            `loopmarshal ${toolName} failed (exit ${result.exitCode}): ${errorOutput}`
          );
        }

        const parsed = parseCliOutput(result.stdout);

        // If the CLI returned a continue command, extract the args and loop
        if (isExecuteInternalCmd(parsed)) {
          currentArgs = parseCmdString(parsed.cmd);
          iterations++;
          continue;
        }

        // Final result — return to the model
        return parsed;
      }

      throw new Error(
        `loopmarshal await exceeded maximum continuation iterations (${MAX_ITERATIONS})`
      );
    } finally {
      if (progressTimer) clearInterval(progressTimer);
    }
  }

  // -----------------------------------------------------------------------
  // Non-await tools: single CLI call
  // -----------------------------------------------------------------------

  const result = await runCliCommand(cliArgs, {});

  if (result.exitCode !== 0) {
    const errorOutput = result.stderr.trim() || result.stdout.trim();
    throw new Error(`loopmarshal ${toolName} failed (exit ${result.exitCode}): ${errorOutput}`);
  }

  return parseCliOutput(result.stdout);
};

// ---------------------------------------------------------------------------
// JSON-RPC handler
// ---------------------------------------------------------------------------

const handleMessage = async (message: JsonRpcRequest): Promise<void> => {
  const { id, method, params = {} } = message;

  try {
    switch (method) {
      case "initialize": {
        sendResult(id, {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: { listChanged: false },
            logging: {}
          },
          serverInfo: {
            name: "loopmarshal",
            version: "0.1.0"
          }
        });
        break;
      }

      case "notifications/initialized": {
        // No response needed for notifications
        break;
      }

      case "tools/list": {
        sendResult(id, { tools: getFilteredTools() });
        break;
      }

      case "tools/call": {
        const toolName = params.name as string;
        const toolArgs = (params.arguments as Record<string, unknown>) ?? {};
        const meta = params._meta as { progressToken?: string | number } | undefined;
        const progressToken = meta?.progressToken;

        // --- Role-based guard (Scheme C) ---
        // If the effective role is worker, reject host-only tool calls.
        // This is a runtime guard that works even if the IDE doesn't support
        // listChanged (dynamic tool filtering).
        const effectiveRole = getEffectiveRole();
        if (effectiveRole === "worker" && HOST_ONLY_TOOLS.has(toolName)) {
          sendResult(id, {
            content: [{
              type: "text",
              text: `Error: Tool "${toolName}" is host-only and cannot be used by a worker. Available tools exclude: ${Array.from(HOST_ONLY_TOOLS).join(", ")}.`
            }],
            isError: true
          });
          break;
        }

        // --- Track runtime role from attach/resume calls ---
        // When the model calls attach with role=host/worker, we update the
        // runtime role so subsequent tools/list and tools/call are filtered.
        if ((toolName === "attach" || toolName === "resume") && toolArgs.role) {
          const claimedRole = String(toolArgs.role);
          if (claimedRole === "host" || claimedRole === "worker") {
            runtimeRole = claimedRole;
          }
        }

        try {
          const result = await handleToolCall(toolName, toolArgs, progressToken);
          sendResult(id, {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2)
              }
            ]
          });
        } catch (toolError: unknown) {
          const errorMessage =
            toolError instanceof Error ? toolError.message : String(toolError);
          sendResult(id, {
            content: [{ type: "text", text: `Error: ${errorMessage}` }],
            isError: true
          });
        }
        break;
      }

      case "ping": {
        sendResult(id, {});
        break;
      }

      default: {
        sendError(id, -32601, `Method not found: ${method}`);
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    sendError(id, -32603, `Internal error: ${message}`);
  }
};

// ---------------------------------------------------------------------------
// Core service health check and lifecycle binding
// ---------------------------------------------------------------------------

const CORE_HOST = "127.0.0.1";
const CORE_PORT = 42688;
const CORE_BASE_URL = `http://${CORE_HOST}:${CORE_PORT}`;
const HEALTH_CHECK_TIMEOUT_MS = 3_000;
const HEARTBEAT_INTERVAL_MS = 15_000;

const checkCoreHealth = async (): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
    const response = await fetch(`${CORE_BASE_URL}/health`, {
      signal: controller.signal
    });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
};

const registerWithCore = async (): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
    const response = await fetch(`${CORE_BASE_URL}/api/mcp-stdio/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pid: process.pid,
        ideLabel: process.env.LOOPMARSHAL_IDE_LABEL ?? null
      }),
      signal: controller.signal
    });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
};

const unregisterFromCore = async (): Promise<void> => {
  try {
    await fetch(`${CORE_BASE_URL}/api/mcp-stdio/unregister`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pid: process.pid })
    });
  } catch {
    // Best-effort: core may already be down
  }
};

const sendHeartbeat = async (): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
    const response = await fetch(`${CORE_BASE_URL}/api/mcp-stdio/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pid: process.pid }),
      signal: controller.signal
    });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
};

let heartbeatTimer: NodeJS.Timeout | null = null;
let coreAlive = true;

const startHeartbeat = (): void => {
  heartbeatTimer = setInterval(async () => {
    const ok = await sendHeartbeat();
    if (!ok && coreAlive) {
      coreAlive = false;
      process.stderr.write(
        "loopmarshal core service is no longer reachable. Shutting down MCP server.\n"
      );
      void gracefulShutdown();
    }
  }, HEARTBEAT_INTERVAL_MS);
};

const gracefulShutdown = async (): Promise<void> => {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  await unregisterFromCore();
  process.exit(0);
};

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

const main = async (): Promise<void> => {
  // Use raw mode to avoid mangling stdin
  if (process.stdin.isTTY) {
    process.stderr.write(
      "loopmarshal MCP server must be launched by an MCP client (stdio mode).\n"
    );
    process.exit(1);
  }

  // --- Lifecycle binding: check core service before starting ---
  const coreHealthy = await checkCoreHealth();
  if (!coreHealthy) {
    process.stderr.write(
      "loopmarshal core service is not running. Start it with `loopmarshal start --daemon` first.\n"
    );
    process.exit(1);
  }

  // --- Register this MCP server with the core ---
  const registered = await registerWithCore();
  if (!registered) {
    process.stderr.write(
      "Failed to register with loopmarshal core service. Shutting down.\n"
    );
    process.exit(1);
  }

  // --- Start heartbeat to detect core service death ---
  startHeartbeat();

  // --- Cleanup on exit ---
  process.on("SIGTERM", () => {
    void gracefulShutdown();
  });
  process.on("SIGINT", () => {
    void gracefulShutdown();
  });

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  // Buffer for incomplete lines is handled by readline
  rl.on("line", (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const message = JSON.parse(trimmed) as JsonRpcRequest;

      // Notifications don't have an id
      if (message.id === undefined || message.id === null) {
        // Handle notification without response
        if (message.method === "notifications/initialized") {
          // Client has finished initializing — nothing to do
        }
        return;
      }

      void handleMessage(message);
    } catch {
      // Ignore malformed JSON
    }
  });

  rl.on("close", () => {
    void gracefulShutdown();
  });

  process.stderr.write("loopmarshal MCP stdio server ready\n");
};

main();
