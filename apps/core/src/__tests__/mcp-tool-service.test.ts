import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { AgentPermissionPolicy } from "@ai-collab/protocol";
import { McpToolService } from "../services/mcp-tool-service.js";

function createPolicy(input: Partial<AgentPermissionPolicy> = {}): AgentPermissionPolicy {
  return {
    knowledge: { read: true, write: false, delete: false, ...input.knowledge },
    messages: {
      read: true,
      send: true,
      dispatchTask: false,
      claim: true,
      complete: true,
      ...input.messages
    },
    filesystem: {
      read: false,
      write: false,
      allowedPaths: [],
      deniedPaths: [],
      ...input.filesystem
    },
    command: {
      enabled: false,
      background: false,
      allowedPrefixes: [],
      workingDirectory: null,
      timeoutSeconds: 30,
      requireApproval: true,
      ...input.command
    }
  };
}

function createHarness() {
  const service = new McpToolService();
  return { service };
}

describe("McpToolService local operations", () => {
  it("uses default restrictive permissions when the agent has no policy override", async () => {
    const { service } = createHarness();

    const result = await service.executeTool(
      "file_read",
      { path: "package.json" },
      "agent-without-policy",
      "session-1",
      { mcpToolService: service } as never
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("filesystem.read permission is disabled");
  });

  it("enforces allowed paths for file read and write", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "ai-collab-mcp-"));
    const previousCwd = process.cwd();
    process.chdir(tempRoot);
    try {
      const { service } = createHarness();
      service.setAgentPermissionPolicy(
        "keeper-agent",
        createPolicy({
          filesystem: {
            read: true,
            write: true,
            allowedPaths: ["workspace"],
            deniedPaths: ["workspace/blocked"]
          }
        })
      );

      const writeResult = await service.executeTool(
        "file_write",
        { path: "workspace/notes.md", content: "hello" },
        "keeper-agent",
        "session-1",
        { mcpToolService: service } as never
      );
      expect(writeResult.success).toBe(true);
      await expect(readFile(path.join(tempRoot, "workspace", "notes.md"), "utf8")).resolves.toBe("hello");

      const deniedResult = await service.executeTool(
        "file_read",
        { path: "../outside.md" },
        "keeper-agent",
        "session-1",
        { mcpToolService: service } as never
      );
      expect(deniedResult.success).toBe(false);
      expect(deniedResult.error).toContain("outside allowedPaths");
    } finally {
      process.chdir(previousCwd);
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("runs only explicitly allowed commands without approval requirement", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "ai-collab-cmd-"));
    const previousCwd = process.cwd();
    process.chdir(tempRoot);
    try {
      const { service } = createHarness();
      service.setAgentPermissionPolicy(
        "cmd-agent",
        createPolicy({
          filesystem: { read: true, write: false, allowedPaths: ["."], deniedPaths: [] },
          command: {
            enabled: true,
            requireApproval: false,
            allowedPrefixes: [process.execPath],
            workingDirectory: ".",
            timeoutSeconds: 10
          }
        })
      );

      const allowed = await service.executeTool(
        "command_run",
        { command: process.execPath, args: ["--version"] },
        "cmd-agent",
        "session-1",
        { mcpToolService: service } as never
      );
      expect(allowed.success).toBe(true);
      expect(String((allowed.result as { stdout: string }).stdout)).toContain("v");

      const denied = await service.executeTool(
        "command_run",
        { command: "not-allowed-command" },
        "cmd-agent",
        "session-1",
        { mcpToolService: service } as never
      );
      expect(denied.success).toBe(false);
      expect(denied.error).toContain("not allowed");
    } finally {
      process.chdir(previousCwd);
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
