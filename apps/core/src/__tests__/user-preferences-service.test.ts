import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { McpToolService } from "../services/mcp-tool-service.js";
import { UserPreferencesService } from "../services/user-preferences-service.js";

describe("UserPreferencesService", () => {
  it("stores global preferences outside project knowledge and supports search", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "loopmarshal-prefs-"));
    try {
      const filePath = path.join(tempRoot, "user-preferences.json");
      const service = new UserPreferencesService(filePath);

      const preference = service.upsert({
        key: "coding.summary",
        value: "Prefer concise Chinese implementation summaries.",
        category: "coding",
        source: "manual"
      });

      expect(preference.key).toBe("coding.summary");
      expect(service.getManifest()).toMatchObject({
        rootPath: filePath,
        count: 1
      });
      expect(service.list({ query: "Chinese" })).toHaveLength(1);
      await expect(readFile(filePath, "utf8")).resolves.toContain("coding.summary");
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("recovers from a corrupt preferences file", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "loopmarshal-prefs-"));
    try {
      const filePath = path.join(tempRoot, "user-preferences.json");
      await writeFile(filePath, "{broken", "utf8");

      const service = new UserPreferencesService(filePath);

      expect(service.list()).toEqual([]);
      expect(service.getManifest().count).toBe(0);
      const entries = await import("node:fs/promises").then((fs) => fs.readdir(tempRoot));
      expect(entries.some((entry) => entry.startsWith("user-preferences.json.corrupt."))).toBe(true);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("imports explicit preference sections from legacy session knowledge", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "loopmarshal-prefs-"));
    try {
      const filePath = path.join(tempRoot, "user-preferences.json");
      const knowledgeRoot = path.join(tempRoot, ".knowledge");
      const legacyDir = path.join(knowledgeRoot, "session-1", "l2");
      const currentKnowledgeDir = path.join(knowledgeRoot, "l2");
      await mkdir(legacyDir, { recursive: true });
      await mkdir(currentKnowledgeDir, { recursive: true });
      await writeFile(
        path.join(legacyDir, "current.json"),
        JSON.stringify({
          title: "Legacy L2",
          slug: "current",
          content: [
            "# Project Notes",
            "",
            "This section should stay project knowledge.",
            "",
            "## reset-schema-admin-rule",
            "",
            "Current user preference for admin database work:",
            "",
            "- Prefer direct schema rebuilds during this empty-database test cycle.",
            "- Do not prioritize compatibility migrations right now."
          ].join("\n")
        }),
        "utf8"
      );
      await writeFile(
        path.join(currentKnowledgeDir, "current.json"),
        JSON.stringify({
          title: "New Layout Current",
          content: "Current user preference in the new layout should not be imported as legacy."
        }),
        "utf8"
      );

      const service = new UserPreferencesService(filePath);
      const firstImport = service.importFromLegacyKnowledgeRoot(knowledgeRoot);
      const secondImport = service.importFromLegacyKnowledgeRoot(knowledgeRoot);

      expect(firstImport).toMatchObject({
        scannedFiles: 1,
        imported: 1,
        skipped: 0
      });
      expect(secondImport).toMatchObject({
        scannedFiles: 1,
        imported: 0,
        skipped: 1
      });
      expect(service.list()).toEqual([
        expect.objectContaining({
          category: "legacy-knowledge",
          source: "system",
          value: expect.stringContaining("Prefer direct schema rebuilds")
        })
      ]);
      expect(service.list({ query: "用户习惯" })).toHaveLength(1);
      expect(service.list({ query: "历史知识库" })).toHaveLength(1);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

describe("McpToolService user preference tools", () => {
  it("lets the host read preferences and only the knowledge keeper update them", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "loopmarshal-prefs-"));
    try {
      const userPreferencesService = new UserPreferencesService(
        path.join(tempRoot, "user-preferences.json")
      );
      const service = new McpToolService({
        findByAgentId: (agentId: string) =>
          agentId === "keeper-agent"
            ? { role: "knowledge_keeper" }
            : { role: "host" }
      } as never);
      const services = {
        mcpToolService: service,
        userPreferencesService
      } as never;

      const denied = await service.executeTool(
        "user_preference_update",
        { key: "coding.detail", value: "Use direct progress reports." },
        "host-agent",
        "session-1",
        services
      );
      expect(denied.success).toBe(false);
      expect(denied.error).toContain("not allowed");

      const updated = await service.executeTool(
        "user_preference_update",
        { key: "coding.detail", value: "Use direct progress reports.", category: "coding" },
        "keeper-agent",
        "session-1",
        services
      );
      expect(updated.success).toBe(true);

      const listed = await service.executeTool(
        "user_preferences_list",
        { query: "progress" },
        "host-agent",
        "session-1",
        services
      );
      expect(listed.success).toBe(true);
      expect(listed.result).toEqual([
        expect.objectContaining({
          key: "coding.detail",
          source: "agent"
        })
      ]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
