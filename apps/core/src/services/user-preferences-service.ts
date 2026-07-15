import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { homedir } from "node:os";
import type {
  ListUserPreferencesInput,
  UpsertUserPreferenceInput,
  UserPreference,
  UserPreferencesManifest
} from "@ai-collab/protocol";
import { coreErrors } from "../errors.js";

type UserPreferencesFile = {
  preferences: UserPreference[];
  updatedAt: string;
};

export type ImportLegacyKnowledgePreferencesResult = {
  sourceRoot: string;
  scannedFiles: number;
  imported: number;
  skipped: number;
};

const now = () => new Date().toISOString();

export class UserPreferencesService {
  private readonly filePath: string;

  public constructor(filePath = defaultUserPreferencesPath()) {
    this.filePath = resolve(filePath);
    this.ensureFile();
  }

  public getManifest(): UserPreferencesManifest {
    const data = this.readFile();
    return {
      rootPath: this.filePath,
      count: data.preferences.length,
      updatedAt: data.updatedAt
    };
  }

  public list(input: ListUserPreferencesInput = {}): UserPreference[] {
    const query = input.query?.trim().toLowerCase();
    return this.readFile().preferences
      .filter((item) => {
        if (input.category && item.category !== input.category) return false;
        if (!query) return true;
        return getPreferenceSearchText(item).includes(query);
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  public upsert(input: UpsertUserPreferenceInput): UserPreference {
    const key = input.key.trim();
    const value = input.value.trim();
    if (!key) throw coreErrors.invalidInput("User preference key must not be empty.");
    if (!value) throw coreErrors.invalidInput("User preference value must not be empty.");

    const data = this.readFile();
    const timestamp = now();
    const existing = data.preferences.find((item) => item.key === key);
    const next: UserPreference = {
      id: existing?.id ?? randomUUID(),
      key,
      value,
      category: input.category === undefined ? existing?.category ?? null : input.category,
      source: input.source ?? existing?.source ?? "manual",
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp
    };

    const preferences = existing
      ? data.preferences.map((item) => item.key === key ? next : item)
      : [...data.preferences, next];
    this.writeFile({ preferences, updatedAt: timestamp });
    return next;
  }

  public delete(key: string): { deleted: boolean } {
    const data = this.readFile();
    const preferences = data.preferences.filter((item) => item.key !== key);
    const deleted = preferences.length !== data.preferences.length;
    if (deleted) {
      this.writeFile({ preferences, updatedAt: now() });
    }
    return { deleted };
  }

  public importFromLegacyKnowledgeRoot(
    rootPath: string
  ): ImportLegacyKnowledgePreferencesResult {
    const sourceRoot = resolve(rootPath);
    const result: ImportLegacyKnowledgePreferencesResult = {
      sourceRoot,
      scannedFiles: 0,
      imported: 0,
      skipped: 0
    };
    if (!existsSync(sourceRoot)) {
      return result;
    }

    for (const filePath of findLegacyCurrentKnowledgeFiles(sourceRoot)) {
      result.scannedFiles += 1;
      const sections = readPreferenceSections(filePath);
      for (const section of sections) {
        const key = buildLegacyPreferenceKey(sourceRoot, filePath, section.title);
        if (
          this.insertIfMissing({
            key,
            value: section.content,
            category: "legacy-knowledge",
            source: "system"
          })
        ) {
          result.imported += 1;
        } else {
          result.skipped += 1;
        }
      }
    }
    return result;
  }

  private ensureFile(): void {
    if (existsSync(this.filePath)) return;
    this.writeFile({ preferences: [], updatedAt: now() });
  }

  private readFile(): UserPreferencesFile {
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<UserPreferencesFile>;
      return {
        preferences: Array.isArray(parsed.preferences) ? parsed.preferences : [],
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : now()
      };
    } catch {
      if (existsSync(this.filePath)) {
        renameSync(this.filePath, `${this.filePath}.corrupt.${Date.now()}`);
      }
      const fallback = { preferences: [], updatedAt: now() };
      this.writeFile(fallback);
      return fallback;
    }
  }

  private writeFile(value: UserPreferencesFile): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    renameSync(tempPath, this.filePath);
  }

  private insertIfMissing(input: UpsertUserPreferenceInput): boolean {
    const key = input.key.trim();
    const value = input.value.trim();
    if (!key || !value) return false;
    const data = this.readFile();
    if (data.preferences.some((item) => item.key === key)) {
      return false;
    }
    const timestamp = now();
    this.writeFile({
      preferences: [
        ...data.preferences,
        {
          id: randomUUID(),
          key,
          value,
          category: input.category ?? null,
          source: input.source ?? "system",
          createdAt: timestamp,
          updatedAt: timestamp
        }
      ],
      updatedAt: timestamp
    });
    return true;
  }
}

function defaultUserPreferencesPath(): string {
  return process.env.AI_COLLAB_USER_PREFERENCES_PATH
    ? resolve(process.env.AI_COLLAB_USER_PREFERENCES_PATH)
    : resolve(homedir(), ".ai-collab", "user-preferences.json");
}

function findLegacyCurrentKnowledgeFiles(rootPath: string): string[] {
  const files: string[] = [];
  const visit = (dirPath: string) => {
    for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
      const entryPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".history" || entry.name === "meta") continue;
        visit(entryPath);
        continue;
      }
      if (!entry.isFile() || entry.name !== "current.json") continue;
      const relativePath = relative(rootPath, entryPath).replaceAll("\\", "/");
      if (/^(l1|l2|l3)\//i.test(relativePath)) continue;
      files.push(entryPath);
    }
  };
  if (statSync(rootPath).isDirectory()) {
    visit(rootPath);
  }
  return files.sort();
}

function readPreferenceSections(filePath: string): Array<{
  title: string;
  content: string;
}> {
  try {
    const document = JSON.parse(readFileSync(filePath, "utf8")) as {
      content?: unknown;
      title?: unknown;
      slug?: unknown;
    };
    if (typeof document.content !== "string") return [];
    return extractPreferenceSections(
      document.content,
      String(document.title ?? document.slug ?? "legacy preference")
    );
  } catch {
    return [];
  }
}

function extractPreferenceSections(
  markdown: string,
  fallbackTitle: string
): Array<{ title: string; content: string }> {
  const sections: Array<{ title: string; content: string }> = [];
  let currentTitle = fallbackTitle;
  let currentLines: string[] = [];
  const flush = () => {
    const content = currentLines.join("\n").trim();
    if (content && isPreferenceContent(`${currentTitle}\n${content}`)) {
      sections.push({
        title: currentTitle,
        content: `# ${currentTitle}\n\n${content}`
      });
    }
  };

  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      flush();
      currentTitle = heading[2] ?? fallbackTitle;
      currentLines = [];
      continue;
    }
    currentLines.push(line);
  }
  flush();
  return sections;
}

function isPreferenceContent(value: string): boolean {
  return /current user preference|user preferences?|用户偏好|用户习惯/i.test(value);
}

function buildLegacyPreferenceKey(
  rootPath: string,
  filePath: string,
  title: string
): string {
  const source = relative(rootPath, dirname(filePath)).replaceAll("\\", ".");
  return sanitizePreferenceKey(`legacy-knowledge.${source}.${title}`);
}

function sanitizePreferenceKey(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.+/g, ".");
  return normalized.slice(0, 180);
}

function getPreferenceSearchText(item: UserPreference): string {
  return [
    item.key,
    item.value,
    item.category ?? "",
    item.source,
    "user preference",
    "user preferences",
    "global preference",
    "global preferences",
    "用户习惯",
    "用户偏好",
    "全局习惯",
    "全局偏好",
    item.category === "legacy-knowledge" ? "历史知识库 旧知识库 legacy knowledge" : ""
  ]
    .join("\n")
    .toLowerCase();
}
