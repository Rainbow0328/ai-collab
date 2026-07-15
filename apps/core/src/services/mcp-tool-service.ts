import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  AgentPermissionPolicy,
  KnowledgeLevel,
  McpToolDefinition,
  McpToolParameterSchema,
  McpToolsetId,
  MessageType
} from "@loopmarshal/protocol";
import type { WebAgentRuntimeRepository } from "@loopmarshal/store";

import type { ServerServices } from "../server/create-server.js";

type BuiltinToolEntry = {
  definition: McpToolDefinition;
  handler: (
    args: Record<string, unknown>,
    services: ServerServices
  ) => Promise<unknown>;
  allowedRoles: string[];
};

const objectSchema = (
  properties: McpToolParameterSchema["properties"],
  required?: string[]
): McpToolParameterSchema => ({
  type: "object",
  properties,
  ...(required ? { required } : {})
});

const builtinTools: BuiltinToolEntry[] = [
  {
    definition: {
      name: "ai_collab_await_event",
      description: "Wait for the next collaboration event with state-machine continuation guidance.",
      parameters: objectSchema(
        {
          sessionName: { type: "string", description: "Session name bound to this window." },
          windowName: { type: "string", description: "Window/agent name bound to this MCP client." },
          role: {
            type: "string",
            description: "Optional expected role for this window.",
            enum: ["host", "worker", "knowledge_keeper"]
          },
          timeoutSeconds: {
            type: "number",
            description: "Business wait timeout in seconds; clamped below the MCP client timeout."
          },
          continuationToken: { type: "string", description: "Continuation token returned by the previous wait." },
          quiet: { type: "boolean", description: "Suppress user-visible summaries while waiting." },
          returnOnlyOnEvent: { type: "boolean", description: "Return only when work arrives or continuation is required." }
        },
        ["sessionName", "windowName"]
      )
    },
    allowedRoles: ["host", "worker", "knowledge_keeper"],
    handler: async (args, services) =>
      services.collaborationWaitService.awaitEvent({
        sessionName: String(args.sessionName),
        windowName: String(args.windowName),
        ...(args.role ? { role: String(args.role) as never } : {}),
        ...(typeof args.timeoutSeconds === "number"
          ? { timeoutSeconds: args.timeoutSeconds }
          : {}),
        ...(args.continuationToken
          ? { continuationToken: String(args.continuationToken) }
          : {}),
        ...(typeof args.quiet === "boolean" ? { quiet: args.quiet } : {}),
        ...(typeof args.returnOnlyOnEvent === "boolean"
          ? { returnOnlyOnEvent: args.returnOnlyOnEvent }
          : {})
      })
  },
  {
    definition: {
      name: "ai_collab_submit_and_await_next",
      description: "Submit a claimed task result and immediately continue waiting for the next event.",
      parameters: objectSchema(
        {
          sessionName: { type: "string", description: "Session name bound to this window." },
          windowName: { type: "string", description: "Window/agent name bound to this MCP client." },
          taskId: { type: "string", description: "Claimed task message id." },
          status: {
            type: "string",
            description: "Task completion status.",
            enum: ["completed", "failed", "blocked"]
          },
          result: { type: "object", description: "Structured task result." },
          failureReason: { type: "string", description: "Failure or blocked reason." },
          timeoutSeconds: {
            type: "number",
            description: "Business wait timeout in seconds after submission."
          },
          continuationToken: { type: "string", description: "Continuation token returned by the previous wait." }
        },
        ["sessionName", "windowName", "taskId", "status"]
      )
    },
    allowedRoles: ["worker", "knowledge_keeper"],
    handler: async (args, services) =>
      services.collaborationWaitService.submitAndAwaitNext({
        sessionName: String(args.sessionName),
        windowName: String(args.windowName),
        taskId: String(args.taskId),
        status:
          args.status === "failed" || args.status === "blocked"
            ? args.status
            : "completed",
        ...(args.result !== undefined ? { result: args.result } : {}),
        ...(args.failureReason
          ? { failureReason: String(args.failureReason) }
          : {}),
        ...(typeof args.timeoutSeconds === "number"
          ? { timeoutSeconds: args.timeoutSeconds }
          : {}),
        ...(args.continuationToken
          ? { continuationToken: String(args.continuationToken) }
          : {})
      })
  },
  {
    definition: {
      name: "ai_collab_report_and_await_next",
      description: "Resolve a claimed host report/message and immediately continue waiting for the next event.",
      parameters: objectSchema(
        {
          sessionName: { type: "string", description: "Session name bound to this window." },
          windowName: { type: "string", description: "Window/agent name bound to this MCP client." },
          messageId: { type: "string", description: "Claimed report/message id." },
          action: {
            type: "string",
            description: "Resolution action.",
            enum: ["completed", "failed", "delegated"]
          },
          reply: { type: "object", description: "Optional structured reply/result." },
          failureReason: { type: "string", description: "Failure reason." },
          timeoutSeconds: {
            type: "number",
            description: "Business wait timeout in seconds after resolution."
          },
          continuationToken: { type: "string", description: "Continuation token returned by the previous wait." }
        },
        ["sessionName", "windowName", "messageId", "action"]
      )
    },
    allowedRoles: ["host"],
    handler: async (args, services) =>
      services.collaborationWaitService.reportAndAwaitNext({
        sessionName: String(args.sessionName),
        windowName: String(args.windowName),
        messageId: String(args.messageId),
        action: args.action === "failed" || args.action === "delegated"
          ? args.action
          : "completed",
        ...(args.reply !== undefined ? { reply: args.reply } : {}),
        ...(args.failureReason
          ? { failureReason: String(args.failureReason) }
          : {}),
        ...(typeof args.timeoutSeconds === "number"
          ? { timeoutSeconds: args.timeoutSeconds }
          : {}),
        ...(args.continuationToken
          ? { continuationToken: String(args.continuationToken) }
          : {})
      })
  },
  {
    definition: {
      name: "ai_collab_get_runtime_state",
      description: "Read the current collaboration state-machine guidance for this window.",
      parameters: objectSchema(
        {
          sessionName: { type: "string", description: "Session name bound to this window." },
          windowName: { type: "string", description: "Window/agent name bound to this MCP client." }
        },
        ["sessionName", "windowName"]
      )
    },
    allowedRoles: ["host", "worker", "knowledge_keeper"],
    handler: async (args, services) =>
      services.collaborationWaitService.getRuntimeState({
        sessionName: String(args.sessionName),
        windowName: String(args.windowName)
      })
  },
  {
    definition: {
      name: "claim_next",
      description: "Claim the next actionable message from the agent inbox.",
      parameters: objectSchema({
        types: {
          type: "array",
          description: "Message types to claim.",
          items: { type: "string" }
        }
      })
    },
    allowedRoles: ["host", "worker", "knowledge_keeper"],
    handler: async (args, services) => {
      const types = Array.isArray(args.types)
        ? (args.types as MessageType[])
        : undefined;
      return services.messageService.claimNext(String(args.agentId), {
        ...(types ? { types } : {})
      });
    }
  },
  {
    definition: {
      name: "submit_result",
      description: "Complete a claimed message and send a result message.",
      parameters: objectSchema(
        {
          messageId: { type: "string", description: "Claimed message id." },
          content: { type: "string", description: "Result content." }
        },
        ["messageId", "content"]
      )
    },
    allowedRoles: ["worker", "knowledge_keeper"],
    handler: async (args, services) => {
      const completed = services.messageService.completeMessage(
        String(args.messageId),
        String(args.agentId),
        {}
      );
      services.messageService.sendMessage({
        sessionId: String(args.sessionId),
        fromAgentId: String(args.agentId),
        type: "result",
        payload: { content: String(args.content ?? "") }
      });
      return completed;
    }
  },
  {
    definition: {
      name: "fail_task",
      description: "Mark a claimed message as failed.",
      parameters: objectSchema(
        {
          messageId: { type: "string", description: "Claimed message id." },
          reason: { type: "string", description: "Failure reason." }
        },
        ["messageId", "reason"]
      )
    },
    allowedRoles: ["worker", "knowledge_keeper"],
    handler: async (args, services) =>
      services.messageService.failMessage(
        String(args.messageId),
        String(args.agentId),
        String(args.reason ?? ""),
        {}
      )
  },
  {
    definition: {
      name: "send_message",
      description: "Send a message to the session or a specific agent.",
      parameters: objectSchema(
        {
          type: { type: "string", description: "Message type." },
          content: { type: "string", description: "Message content." },
          toAgentId: { type: "string", description: "Target agent id." },
          correlationId: { type: "string", description: "Correlation id." }
        },
        ["type", "content"]
      )
    },
    allowedRoles: ["host", "worker", "knowledge_keeper"],
    handler: async (args, services) =>
      services.messageService.sendMessage({
        sessionId: String(args.sessionId),
        fromAgentId: String(args.agentId),
        type: String(args.type) as MessageType,
        payload: String(args.content ?? ""),
        ...(args.toAgentId ? { toAgentId: String(args.toAgentId) } : {}),
        ...(args.correlationId
          ? { correlationId: String(args.correlationId) }
          : {})
      })
  },
  {
    definition: {
      name: "dispatch_task",
      description: "Dispatch a task message to a worker.",
      parameters: objectSchema(
        {
          content: { type: "string", description: "Task content." },
          toAgentId: { type: "string", description: "Target worker id." },
          correlationId: { type: "string", description: "Correlation id." }
        },
        ["content"]
      )
    },
    allowedRoles: ["host"],
    handler: async (args, services) =>
      services.messageService.sendMessage({
        sessionId: String(args.sessionId),
        fromAgentId: String(args.agentId),
        type: "task",
        payload: String(args.content ?? ""),
        ...(args.toAgentId ? { toAgentId: String(args.toAgentId) } : {}),
        ...(args.correlationId
          ? { correlationId: String(args.correlationId) }
          : {})
      })
  },
  {
    definition: {
      name: "resolve_message",
      description: "Complete a claimed host message.",
      parameters: objectSchema(
        {
          messageId: { type: "string", description: "Claimed message id." },
          summary: { type: "string", description: "Resolution summary." }
        },
        ["messageId", "summary"]
      )
    },
    allowedRoles: ["host"],
    handler: async (args, services) =>
      services.messageService.completeMessage(
        String(args.messageId),
        String(args.agentId),
        {}
      )
  },
  {
    definition: {
      name: "knowledge_read",
      description: "Read a knowledge document.",
      parameters: objectSchema(
        {
          level: {
            type: "string",
            description: "Knowledge level.",
            enum: ["l1", "l2", "l3"]
          },
          slug: { type: "string", description: "Document slug." }
        },
        ["level", "slug"]
      )
    },
    allowedRoles: ["host", "worker", "knowledge_keeper"],
    handler: async (args, services) =>
      services.knowledgeService.get(
        String(args.level) as KnowledgeLevel,
        String(args.slug)
      )
  },
  {
    definition: {
      name: "knowledge_list",
      description: "List knowledge documents.",
      parameters: objectSchema({
        level: {
          type: "string",
          description: "Knowledge level.",
          enum: ["l1", "l2", "l3"]
        },
        query: { type: "string", description: "Search query." }
      })
    },
    allowedRoles: ["host", "worker", "knowledge_keeper"],
    handler: async (args, services) =>
      services.knowledgeService.list({
        ...(args.level ? { level: String(args.level) as KnowledgeLevel } : {}),
        ...(args.query ? { query: String(args.query) } : {})
      })
  },
  {
    definition: {
      name: "knowledge_update",
      description: "Create or update a knowledge document.",
      parameters: objectSchema(
        {
          level: {
            type: "string",
            description: "Knowledge level.",
            enum: ["l1", "l2", "l3"]
          },
          slug: { type: "string", description: "Document slug." },
          title: { type: "string", description: "Document title." },
          content: { type: "string", description: "Markdown content." },
          summary: { type: "string", description: "Short summary." }
        },
        ["level", "slug", "title", "content"]
      )
    },
    allowedRoles: ["knowledge_keeper"],
    handler: async (args, services) =>
      services.knowledgeService.upsert({
        level: String(args.level) as KnowledgeLevel,
        slug: String(args.slug),
        title: String(args.title),
        content: String(args.content),
        ...(args.summary ? { summary: String(args.summary) } : {}),
        sourceKind: "host_update",
        sourceAgentId: String(args.agentId)
      })
  },
  {
    definition: {
      name: "user_preferences_list",
      description: "List global user preferences that apply across projects.",
      parameters: objectSchema({
        category: { type: "string", description: "Optional preference category." },
        query: { type: "string", description: "Optional search query." }
      })
    },
    allowedRoles: ["host", "knowledge_keeper"],
    handler: async (args, services) =>
      services.userPreferencesService.list({
        ...(args.category ? { category: String(args.category) } : {}),
        ...(args.query ? { query: String(args.query) } : {})
      })
  },
  {
    definition: {
      name: "user_preference_update",
      description: "Create or update a global user preference. Use this only for durable user habits that should apply across projects.",
      parameters: objectSchema(
        {
          key: { type: "string", description: "Stable preference key." },
          value: { type: "string", description: "Preference content." },
          category: { type: "string", description: "Optional preference category." }
        },
        ["key", "value"]
      )
    },
    allowedRoles: ["knowledge_keeper"],
    handler: async (args, services) =>
      services.userPreferencesService.upsert({
        key: String(args.key),
        value: String(args.value),
        ...(args.category ? { category: String(args.category) } : {}),
        source: "agent"
      })
  },
  {
    definition: {
      name: "update_insight",
      description: "Update session insight and plan fields.",
      parameters: objectSchema({
        objective: { type: "string", description: "Session objective." },
        projectSummary: { type: "string", description: "Project summary." },
        activePlanSummary: {
          type: "string",
          description: "Active plan summary."
        }
      })
    },
    allowedRoles: ["host"],
    handler: async (args, services) =>
      services.sessionInsightService.updateSessionInsight({
        sessionId: String(args.sessionId),
        updatedByAgentId: String(args.agentId),
        ...(args.objective ? { objective: String(args.objective) } : {}),
        ...(args.projectSummary
          ? { projectSummary: String(args.projectSummary) }
          : {}),
        ...(args.activePlanSummary
          ? { activePlanSummary: String(args.activePlanSummary) }
          : {})
      })
  },
  {
    definition: {
      name: "heartbeat",
      description: "Return a heartbeat timestamp.",
      parameters: objectSchema({})
    },
    allowedRoles: ["host", "worker", "knowledge_keeper"],
    handler: async (args) => ({
      agentId: String(args.agentId),
      heartbeatAt: new Date().toISOString()
    })
  },
  {
    definition: {
      name: "file_read",
      description: "Read a text file allowed by filesystem policy.",
      parameters: objectSchema(
        { path: { type: "string", description: "File path." } },
        ["path"]
      )
    },
    allowedRoles: ["host", "worker", "knowledge_keeper"],
    handler: async (args, services) => {
      const policy = normalizePolicy(
        services.mcpToolService.getAgentPermissionPolicy(String(args.agentId))
      );
      if (!policy.filesystem.read) {
        throw new Error("filesystem.read permission is disabled.");
      }
      const target = resolveAllowedPath(
        String(args.path),
        policy.filesystem,
        process.cwd()
      );
      const fileStat = await stat(target);
      if (!fileStat.isFile()) {
        throw new Error(`Path is not a file: ${target}`);
      }
      return { path: target, content: await readFile(target, "utf8") };
    }
  },
  {
    definition: {
      name: "file_write",
      description: "Write a text file allowed by filesystem policy.",
      parameters: objectSchema(
        {
          path: { type: "string", description: "File path." },
          content: { type: "string", description: "File content." }
        },
        ["path", "content"]
      )
    },
    allowedRoles: ["host", "worker", "knowledge_keeper"],
    handler: async (args, services) => {
      const policy = normalizePolicy(
        services.mcpToolService.getAgentPermissionPolicy(String(args.agentId))
      );
      if (!policy.filesystem.write) {
        throw new Error("filesystem.write permission is disabled.");
      }
      const target = resolveAllowedPath(
        String(args.path),
        policy.filesystem,
        process.cwd()
      );
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, String(args.content ?? ""), "utf8");
      return { path: target, written: true };
    }
  },
  {
    definition: {
      name: "file_list",
      description: "List a directory allowed by filesystem policy.",
      parameters: objectSchema({
        path: { type: "string", description: "Directory path." }
      })
    },
    allowedRoles: ["host", "worker", "knowledge_keeper"],
    handler: async (args, services) => {
      const policy = normalizePolicy(
        services.mcpToolService.getAgentPermissionPolicy(String(args.agentId))
      );
      if (!policy.filesystem.read) {
        throw new Error("filesystem.read permission is disabled.");
      }
      const target = resolveAllowedPath(
        String(args.path ?? "."),
        policy.filesystem,
        process.cwd()
      );
      const dirStat = await stat(target);
      if (!dirStat.isDirectory()) {
        throw new Error(`Path is not a directory: ${target}`);
      }
      const entries = await readdir(target, { withFileTypes: true });
      return entries.map((entry) => ({
        name: entry.name,
        type: entry.isDirectory()
          ? "directory"
          : entry.isFile()
            ? "file"
            : "other"
      }));
    }
  },
  {
    definition: {
      name: "command_run",
      description: "Run an explicitly allowed non-interactive command.",
      parameters: objectSchema(
        {
          command: { type: "string", description: "Executable path/name." },
          args: {
            type: "array",
            description: "Arguments.",
            items: { type: "string" }
          },
          cwd: { type: "string", description: "Working directory." },
          timeoutSeconds: { type: "number", description: "Timeout seconds." }
        },
        ["command"]
      )
    },
    allowedRoles: ["host", "worker", "knowledge_keeper"],
    handler: async (args, services) => {
      const policy = normalizePolicy(
        services.mcpToolService.getAgentPermissionPolicy(String(args.agentId))
      );
      if (!policy.command.enabled) {
        throw new Error("command.enabled permission is disabled.");
      }
      if (policy.command.requireApproval) {
        throw new Error("command.requireApproval is enabled.");
      }
      const command = String(args.command ?? "").trim();
      const commandArgs = Array.isArray(args.args)
        ? args.args.map((item) => String(item))
        : [];
      const prefix = [command, ...commandArgs].join(" ").trim();
      if (
        !policy.command.allowedPrefixes.some(
          (allowed) => prefix === allowed || prefix.startsWith(`${allowed} `)
        )
      ) {
        throw new Error(`Command is not allowed by allowedPrefixes: ${prefix}`);
      }
      const cwd = resolveAllowedPath(
        String(args.cwd ?? policy.command.workingDirectory ?? "."),
        policy.filesystem,
        process.cwd()
      );
      const timeoutSeconds = Math.max(
        1,
        Math.min(Number(args.timeoutSeconds ?? 120), policy.command.timeoutSeconds)
      );
      return runCommand(command, commandArgs, cwd, timeoutSeconds);
    }
  }
];

const toolsetDefinitions: Record<McpToolsetId, string[]> = {
  worker: [
    "ai_collab_await_event",
    "ai_collab_submit_and_await_next",
    "ai_collab_get_runtime_state",
    "claim_next",
    "submit_result",
    "fail_task",
    "send_message",
    "knowledge_read",
    "knowledge_list",
    "heartbeat"
  ],
  host: [
    "ai_collab_await_event",
    "ai_collab_report_and_await_next",
    "ai_collab_get_runtime_state",
    "claim_next",
    "send_message",
    "knowledge_read",
    "knowledge_list",
    "user_preferences_list",
    "heartbeat",
    "dispatch_task",
    "resolve_message",
    "update_insight"
  ],
  knowledge_keeper: [
    "ai_collab_await_event",
    "ai_collab_submit_and_await_next",
    "ai_collab_get_runtime_state",
    "claim_next",
    "submit_result",
    "fail_task",
    "send_message",
    "knowledge_read",
    "knowledge_list",
    "user_preferences_list",
    "heartbeat",
    "knowledge_update",
    "user_preference_update",
    "file_read",
    "file_write",
    "file_list",
    "command_run"
  ],
  developer: [
    "ai_collab_await_event",
    "ai_collab_submit_and_await_next",
    "ai_collab_get_runtime_state",
    "claim_next",
    "submit_result",
    "fail_task",
    "send_message",
    "knowledge_read",
    "knowledge_list",
    "heartbeat",
    "file_read",
    "file_write",
    "file_list",
    "command_run"
  ]
};

export class McpToolService {
  private readonly toolsByName = new Map(
    builtinTools.map((tool) => [tool.definition.name, tool])
  );

  public constructor(
    private readonly webRuntimes?: WebAgentRuntimeRepository,
    private readonly policyOverrides: Map<string, AgentPermissionPolicy> = new Map()
  ) {}

  public setAgentPermissionPolicy(
    agentId: string,
    policy: AgentPermissionPolicy
  ): void {
    this.policyOverrides.set(agentId, policy);
  }

  public getToolsetDefinitions(toolsetId: McpToolsetId): McpToolDefinition[] {
    return (toolsetDefinitions[toolsetId] ?? [])
      .map((name) => this.toolsByName.get(name)?.definition)
      .filter((tool): tool is McpToolDefinition => Boolean(tool));
  }

  public getToolDefinitionsByNames(toolNames: string[]): McpToolDefinition[] {
    return toolNames
      .map((name) => this.toolsByName.get(name)?.definition)
      .filter((tool): tool is McpToolDefinition => Boolean(tool));
  }

  public listAllTools(): McpToolDefinition[] {
    return builtinTools.map((tool) => tool.definition);
  }

  public isToolAllowedForRole(toolName: string, role: string): boolean {
    const entry = this.toolsByName.get(toolName);
    return Boolean(entry?.allowedRoles.includes(role));
  }

  public async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    agentId: string,
    sessionId: string,
    services: ServerServices
  ): Promise<{ success: boolean; result: unknown; error?: string }> {
    const entry = this.toolsByName.get(toolName);
    if (entry) {
      const role = this.webRuntimes?.findByAgentId(agentId)?.role;
      if (role && !entry.allowedRoles.includes(role)) {
        return {
          success: false,
          result: null,
          error: `Tool '${toolName}' is not allowed for role '${role}'.`
        };
      }

      const permissionError = this.checkPermission(toolName, agentId);
      if (permissionError) {
        return { success: false, result: null, error: permissionError };
      }

      try {
        const result = await entry.handler(
          { ...args, agentId, sessionId },
          services
        );
        return { success: true, result };
      } catch (error: unknown) {
        return {
          success: false,
          result: null,
          error: error instanceof Error ? error.message : "Unknown error"
        };
      }
    }

    const externalMcpService = services.externalMcpService;
    if (!externalMcpService) {
      return {
        success: false,
        result: null,
        error: `Tool '${toolName}' not found.`
      };
    }
    return externalMcpService.callToolByName(toolName, args);
  }

  public getAgentPermissionPolicy(agentId: string): AgentPermissionPolicy {
    const override = this.policyOverrides.get(agentId);
    if (override) {
      return override;
    }
    const runtime = this.webRuntimes?.findByAgentId(agentId);
    return getDefaultPermissionPolicy(runtime?.role ?? null);
  }

  private checkPermission(toolName: string, agentId: string): string | null {
    const policy = normalizePolicy(this.getAgentPermissionPolicy(agentId));
    if (
      ["knowledge_read", "knowledge_list"].includes(toolName) &&
      !policy.knowledge.read
    ) {
      return `Tool '${toolName}' denied: knowledge.read permission is disabled.`;
    }
    if (toolName === "knowledge_update" && !policy.knowledge.write) {
      return `Tool '${toolName}' denied: knowledge.write permission is disabled.`;
    }
    if (toolName === "claim_next" && !policy.messages.claim) {
      return `Tool '${toolName}' denied: messages.claim permission is disabled.`;
    }
    if (
      [
        "submit_result",
        "fail_task",
        "resolve_message",
        "ai_collab_submit_and_await_next",
        "ai_collab_report_and_await_next"
      ].includes(toolName) &&
      !policy.messages.complete
    ) {
      return `Tool '${toolName}' denied: messages.complete permission is disabled.`;
    }
    if (toolName === "send_message" && !policy.messages.send) {
      return `Tool '${toolName}' denied: messages.send permission is disabled.`;
    }
    if (toolName === "dispatch_task" && !policy.messages.dispatchTask) {
      return `Tool '${toolName}' denied: messages.dispatchTask permission is disabled.`;
    }
    if (["file_read", "file_list"].includes(toolName) && !policy.filesystem.read) {
      return `Tool '${toolName}' denied: filesystem.read permission is disabled.`;
    }
    if (toolName === "file_write" && !policy.filesystem.write) {
      return `Tool '${toolName}' denied: filesystem.write permission is disabled.`;
    }
    if (toolName === "command_run" && !policy.command.enabled) {
      return `Tool '${toolName}' denied: command.enabled permission is disabled.`;
    }
    return null;
  }
}

type NormalizedPolicy = {
  knowledge: { read: boolean; write: boolean; delete: boolean };
  messages: {
    read: boolean;
    send: boolean;
    claim: boolean;
    complete: boolean;
    dispatchTask: boolean;
  };
  filesystem: {
    read: boolean;
    write: boolean;
    allowedPaths: string[];
    deniedPaths: string[];
  };
  command: {
    enabled: boolean;
    background: boolean;
    requireApproval: boolean;
    allowedPrefixes: string[];
    workingDirectory: string | null;
    timeoutSeconds: number;
  };
};

function getDefaultPermissionPolicy(
  role: string | null | undefined
): AgentPermissionPolicy {
  const base: AgentPermissionPolicy = {
    knowledge: { read: true, write: false, delete: false },
    messages: {
      read: true,
      send: true,
      claim: true,
      complete: true,
      dispatchTask: false
    },
    filesystem: {
      read: false,
      write: false,
      allowedPaths: [],
      deniedPaths: []
    },
    command: {
      enabled: false,
      background: false,
      requireApproval: true,
      allowedPrefixes: [],
      workingDirectory: null,
      timeoutSeconds: 120
    }
  };

  if (role === "host") {
    return {
      ...base,
      messages: { ...base.messages, dispatchTask: true }
    };
  }
  if (role === "knowledge_keeper") {
    return {
      ...base,
      knowledge: { read: true, write: true, delete: false }
    };
  }
  return base;
}

function normalizePolicy(policy: AgentPermissionPolicy): NormalizedPolicy {
  return {
    knowledge: {
      read: policy.knowledge?.read ?? true,
      write: policy.knowledge?.write ?? false,
      delete: policy.knowledge?.delete ?? false
    },
    messages: {
      read: policy.messages?.read ?? true,
      send: policy.messages?.send ?? true,
      claim: policy.messages?.claim ?? true,
      complete: policy.messages?.complete ?? true,
      dispatchTask: policy.messages?.dispatchTask ?? false
    },
    filesystem: {
      read: policy.filesystem?.read ?? false,
      write: policy.filesystem?.write ?? false,
      allowedPaths: policy.filesystem?.allowedPaths ?? [],
      deniedPaths: policy.filesystem?.deniedPaths ?? []
    },
    command: {
      enabled: policy.command?.enabled ?? false,
      background: policy.command?.background ?? false,
      requireApproval: policy.command?.requireApproval ?? true,
      allowedPrefixes: policy.command?.allowedPrefixes ?? [],
      workingDirectory: policy.command?.workingDirectory ?? null,
      timeoutSeconds: policy.command?.timeoutSeconds ?? 120
    }
  };
}

function resolveAllowedPath(
  inputPath: string,
  policy: NormalizedPolicy["filesystem"],
  workspaceRoot: string
): string {
  if (!inputPath || inputPath.includes("\0")) {
    throw new Error("Invalid path.");
  }
  const target = path.resolve(workspaceRoot, inputPath);
  const allowedRoots = policy.allowedPaths.map((item) =>
    path.resolve(workspaceRoot, item)
  );
  if (
    allowedRoots.length === 0 ||
    !allowedRoots.some((root) => isPathInside(target, root))
  ) {
    throw new Error(`Path is outside allowedPaths: ${target}`);
  }
  const deniedRoots = policy.deniedPaths.map((item) =>
    path.resolve(workspaceRoot, item)
  );
  if (deniedRoots.some((root) => isPathInside(target, root))) {
    throw new Error(`Path is inside deniedPaths: ${target}`);
  }
  return target;
}

function isPathInside(target: string, root: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutSeconds: number
): Promise<{
  command: string;
  args: string[];
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Command timed out after ${timeoutSeconds}s.`));
    }, timeoutSeconds * 1000);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({
        command,
        args,
        cwd,
        exitCode,
        stdout: stdout.slice(0, 100_000),
        stderr: stderr.slice(0, 100_000)
      });
    });
  });
}
