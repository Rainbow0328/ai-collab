import { randomUUID } from "node:crypto";
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import type { SQLInputValue } from "node:sqlite";
import type { SkillDefinition, ScanSkillsResult, SessionSkillScope, AgentRole } from "@ai-collab/protocol";
import { coreErrors } from "../errors.js";
import type { SkillRepository } from "@ai-collab/store";

export class SkillService {
  public constructor(private readonly repository: SkillRepository) {}

  public create(input: { name: string; description?: string | null; path: string; roleScope?: string | null }): SkillDefinition {
    const existing = this.repository.findByName(input.name);
    if (existing) {
      throw coreErrors.duplicateSessionName(input.name);
    }

    const now = new Date().toISOString();
    const skill: SkillDefinition = {
      id: randomUUID(),
      name: input.name,
      description: input.description ?? null,
      path: input.path,
      roleScope: (input.roleScope as AgentRole) ?? null,
      source: "manual",
      enabled: true,
      createdAt: now,
      updatedAt: now
    };

    this.repository.insert(skill);
    return skill;
  }

  public get(id: string): SkillDefinition {
    const skill = this.repository.findById(id);
    if (!skill) {
      throw coreErrors.agentNotFound(id);
    }
    return skill;
  }

  public list(): SkillDefinition[] {
    return this.repository.listAll();
  }

  public update(id: string, input: { name?: string; description?: string | null; roleScope?: string | null; enabled?: boolean }): SkillDefinition {
    const existing = this.repository.findById(id);
    if (!existing) {
      throw coreErrors.agentNotFound(id);
    }

    if (input.name && input.name !== existing.name) {
      const nameConflict = this.repository.findByName(input.name);
      if (nameConflict && nameConflict.id !== id) {
        throw coreErrors.duplicateSessionName(input.name);
      }
    }

    const updates: Record<string, SQLInputValue> = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.roleScope !== undefined) updates.roleScope = input.roleScope;
    if (input.enabled !== undefined) updates.enabled = input.enabled ? 1 : 0;

    this.repository.update(id, updates);
    return this.repository.findById(id)!;
  }

  public delete(id: string): { deleted: boolean } {
    const existing = this.repository.findById(id);
    if (!existing) {
      throw coreErrors.agentNotFound(id);
    }
    this.repository.deleteById(id);
    return { deleted: true };
  }

  public scanDirectory(directoryPath: string): ScanSkillsResult {
    if (!existsSync(directoryPath)) {
      throw coreErrors.invalidInput(`Directory "${directoryPath}" does not exist.`);
    }

    const existingSkills = this.repository.listAll();
    const existingByName = new Map(existingSkills.map((s) => [s.name, s]));
    const existingByPath = new Map(existingSkills.map((s) => [s.path, s]));

    let scanned = 0;
    let added = 0;
    let updated = 0;
    const skills: SkillDefinition[] = [];

    const now = new Date().toISOString();

    try {
      const entries = readdirSync(directoryPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillDir = join(directoryPath, entry.name);
        const skillName = entry.name;

        scanned++;

        const existingByName = existingSkills.find((s) => s.name === skillName);
        const existingByPath = existingSkills.find((s) => s.path === skillDir);

        if (existingByName) {
          skills.push(existingByName);
          continue;
        }

        if (existingByPath) {
          skills.push(existingByPath);
          continue;
        }

        const description = this.readSkillDescription(skillDir);

        const skill: SkillDefinition = {
          id: randomUUID(),
          name: skillName,
          description,
          path: skillDir,
          roleScope: null,
          source: "local_scan",
          enabled: true,
          createdAt: now,
          updatedAt: now
        };

        this.repository.insert(skill);
        skills.push(skill);
        added++;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw coreErrors.invalidInput(`Failed to scan directory: ${message}`);
    }

    return { scanned, added, updated, skills };
  }

  public getSessionSkills(sessionId: string): SessionSkillScope[] {
    return this.repository.getSessionSkills(sessionId);
  }

  public setSessionSkills(sessionId: string, skillIds: string[]): SessionSkillScope[] {
    this.repository.setSessionSkills(sessionId, skillIds);
    return this.repository.getSessionSkills(sessionId);
  }

  public deleteSessionSkills(sessionId: string): void {
    this.repository.deleteSessionSkills(sessionId);
  }

  public listAvailableSessionSkills(sessionId: string): SkillDefinition[] {
    return this.repository.listDefinitionsBySessionId(sessionId);
  }

  private readSkillDescription(skillDir: string): string | null {
    const readmePath = join(skillDir, "README.md");
    if (existsSync(readmePath)) {
      try {
        const content = readFileSync(readmePath, "utf-8");
        const firstLine = content.split("\n")[0]?.replace(/^#\s*/, "").trim();
        return firstLine || null;
      } catch {
        return null;
      }
    }

    const packageJsonPath = join(skillDir, "package.json");
    if (existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
        return pkg.description ?? null;
      } catch {
        return null;
      }
    }

    return null;
  }
}
