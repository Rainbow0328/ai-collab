/*
 * Copyright 2024 Cloud Skill Team
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import type {
  CreateKnowledgePatchRecordInput,
  DeleteKnowledgeInput,
  KnowledgeChangeRecord,
  KnowledgeDocument,
  KnowledgeLevel,
  KnowledgeListItem,
  KnowledgeManifest,
  KnowledgeManifestCounts,
  KnowledgePatchRecord,
  KnowledgePatchReviewRecord,
  KnowledgePersistenceRecord,
  KnowledgeSourceKind,
  ListKnowledgePatchRecordsInput,
  ListKnowledgeChangesInput,
  ListKnowledgeInput,
  UpdateKnowledgePatchRecordInput,
  UpsertKnowledgePatchReviewRecordInput,
  UpsertKnowledgePersistenceRecordInput,
  UpsertKnowledgeInput
} from "@ai-collab/protocol";

type StoredKnowledgeDocument = KnowledgeDocument;

type KnowledgeRootSnapshot = {
  manifest: KnowledgeManifest;
  items: KnowledgeListItem[];
};

const KNOWLEDGE_LEVEL_DIRS: Record<KnowledgeLevel, string> = {
  l1: "l1",
  l2: "l2",
  l3: "l3"
};

const MANIFEST_FILE = "manifest.json";
const HISTORY_DIR = ".history";
const META_DIR = "meta";
const PATCHES_DIR = "patches";
const REVIEWS_DIR = "reviews";
const PERSISTENCE_DIR = "persistence";

const now = (): string => {
  return new Date().toISOString();
};

const sortByUpdatedAtDesc = <T extends { updatedAt: string }>(items: T[]): T[] => {
  return items.slice().sort((left, right) => {
    return right.updatedAt.localeCompare(left.updatedAt);
  });
};

const toSlugFilename = (slug: string): string => {
  return `${slug}.json`;
};

export class KnowledgeFileStore {
  private readonly knowledgeRoot: string;

  public constructor(projectRoot: string) {
    this.knowledgeRoot = process.env.AI_COLLAB_KNOWLEDGE_ROOT
      ? resolve(process.env.AI_COLLAB_KNOWLEDGE_ROOT)
      : resolve(projectRoot, ".knowledge");
    this.ensureRoot();
  }

  public getRootPath(): string {
    return this.knowledgeRoot;
  }

  private resolveSessionRoot(sessionId?: string | null): string {
    if (sessionId) {
      const sessionRoot = resolve(this.knowledgeRoot, sessionId);
      if (!existsSync(sessionRoot)) {
        mkdirSync(sessionRoot, { recursive: true });
        mkdirSync(join(sessionRoot, META_DIR, PATCHES_DIR), { recursive: true });
        mkdirSync(join(sessionRoot, META_DIR, REVIEWS_DIR), { recursive: true });
        mkdirSync(join(sessionRoot, META_DIR, PERSISTENCE_DIR), { recursive: true });
      }
      return sessionRoot;
    }
    return this.knowledgeRoot;
  }

  public list(input: ListKnowledgeInput = {}): KnowledgeListItem[] {
    const documents = this.loadAllDocuments(input.sessionId);
    return sortByUpdatedAtDesc(
      documents
        .filter((document) => {
          if (input.level && document.level !== input.level) {
            return false;
          }
          if (input.tag && !document.tags.includes(input.tag)) {
            return false;
          }
          if (!input.query) {
            return true;
          }
          const query = input.query.toLowerCase();
          return (
            document.slug.toLowerCase().includes(query) ||
            document.title.toLowerCase().includes(query) ||
            (document.summary ?? "").toLowerCase().includes(query) ||
            document.content.toLowerCase().includes(query)
          );
        })
        .map(({ content, ...item }) => item)
    );
  }

  public get(level: KnowledgeLevel, slug: string, sessionId?: string | null): KnowledgeDocument | null {
    const path = this.getDocumentPath(level, slug, sessionId);
    if (!existsSync(path)) {
      return null;
    }

    return this.readJsonFile<StoredKnowledgeDocument>(path);
  }

  public upsert(input: UpsertKnowledgeInput): KnowledgeDocument {
    const sessionId = input.sessionId;
    const path = this.getDocumentPath(input.level, input.slug, sessionId);
    const existing = this.get(input.level, input.slug, sessionId);
    const timestamp = now();

    const next: KnowledgeDocument = {
      id: existing?.id ?? randomUUID(),
      level: input.level,
      slug: input.slug,
      title: input.title,
      summary: input.summary ?? existing?.summary ?? null,
      tags: [...new Set(input.tags ?? existing?.tags ?? [])].sort(),
      path: this.toRelativePath(path),
      content: input.content,
      ownerAgentId: input.ownerAgentId ?? existing?.ownerAgentId ?? null,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      version: (existing?.version ?? 0) + 1
    };

    this.writeAtomically(path, next);
    this.appendChange({
      documentId: next.id,
      level: next.level,
      slug: next.slug,
      kind: existing ? "updated" : "created",
      sourceKind: input.sourceKind ?? "manual",
      sourceAgentId: input.sourceAgentId ?? null,
      summary: input.changeSummary ?? null,
      version: next.version
    }, sessionId);
    this.writeManifest(sessionId);
    return next;
  }

  public delete(input: DeleteKnowledgeInput): boolean {
    const sessionId = input.sessionId;
    const existing = this.get(input.level, input.slug, sessionId);
    if (!existing) {
      return false;
    }

    rmSync(this.getDocumentPath(input.level, input.slug, sessionId), { force: true });
    this.appendChange({
      documentId: existing.id,
      level: existing.level,
      slug: existing.slug,
      kind: "deleted",
      sourceKind: input.sourceKind ?? "manual",
      sourceAgentId: input.sourceAgentId ?? null,
      summary: input.changeSummary ?? null,
      version: existing.version
    }, sessionId);
    this.writeManifest(sessionId);
    return true;
  }

  public getManifest(sessionId?: string | null): KnowledgeManifest {
    const manifestPath = this.getManifestPath(sessionId);
    if (!existsSync(manifestPath)) {
      return this.writeManifest(sessionId);
    }
    return this.readJsonFile<KnowledgeManifest>(manifestPath);
  }

  public listChanges(input: ListKnowledgeChangesInput = {}): KnowledgeChangeRecord[] {
    const historyDir = this.getHistoryDirPath(input.sessionId);
    if (!existsSync(historyDir)) {
      return [];
    }

    const changes = readdirSync(historyDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) =>
        this.readJsonFile<KnowledgeChangeRecord>(join(historyDir, entry.name))
      )
      .filter((record) => {
        if (input.level && record.level !== input.level) {
          return false;
        }
        if (input.slug && record.slug !== input.slug) {
          return false;
        }
        return true;
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    if (!input.limit || input.limit <= 0) {
      return changes;
    }
    return changes.slice(0, input.limit);
  }

  public snapshot(): KnowledgeRootSnapshot {
    return {
      manifest: this.getManifest(),
      items: this.list()
    };
  }

  public createPatchRecord(input: CreateKnowledgePatchRecordInput): KnowledgePatchRecord {
    const timestamp = now();
    const record: KnowledgePatchRecord = {
      patchId: input.patch.id,
      targetLayer: input.patch.targetLevel,
      targetName: input.patch.targetSlug,
      status: input.status ?? "extracted",
      source: input.patch.source,
      payload: input.patch,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.writeAtomically(this.getPatchRecordPath(record.patchId, input.sessionId), record);
    return record;
  }

  public getPatchRecord(patchId: string, sessionId?: string | null): KnowledgePatchRecord | null {
    const path = this.getPatchRecordPath(patchId, sessionId);
    if (!existsSync(path)) {
      return null;
    }
    return this.readJsonFile<KnowledgePatchRecord>(path);
  }

  public listPatchRecords(
    input: ListKnowledgePatchRecordsInput = {}
  ): KnowledgePatchRecord[] {
    const records = this.readMetaCollection<KnowledgePatchRecord>(this.getPatchRecordsDirPath(input.sessionId));
    const filtered = input.status
      ? records.filter((record) => record.status === input.status)
      : records;
    return filtered.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  public updatePatchRecord(input: UpdateKnowledgePatchRecordInput): KnowledgePatchRecord | null {
    const existing = this.getPatchRecord(input.patchId, input.sessionId);
    if (!existing) {
      return null;
    }
    const next: KnowledgePatchRecord = {
      ...existing,
      status: input.status,
      updatedAt: now()
    };
    this.writeAtomically(this.getPatchRecordPath(input.patchId, input.sessionId), next);
    return next;
  }

  public getPatchReviewRecord(patchId: string, sessionId?: string | null): KnowledgePatchReviewRecord | null {
    const path = this.getPatchReviewRecordPath(patchId, sessionId);
    if (!existsSync(path)) {
      return null;
    }
    return this.readJsonFile<KnowledgePatchReviewRecord>(path);
  }

  public upsertPatchReviewRecord(
    input: UpsertKnowledgePatchReviewRecordInput
  ): KnowledgePatchReviewRecord {
    const existing = this.getPatchReviewRecord(input.patchId, input.sessionId);
    const next: KnowledgePatchReviewRecord = {
      patchId: input.patchId,
      validationResult: input.validationResult ?? existing?.validationResult ?? "pending",
      violations: input.violations ?? existing?.violations ?? [],
      warnings: input.warnings ?? existing?.warnings ?? [],
      reviewDecision: input.reviewDecision ?? existing?.reviewDecision ?? "pending",
      reviewedBy: input.reviewedBy ?? existing?.reviewedBy ?? null,
      reviewComment: input.reviewComment ?? existing?.reviewComment ?? null,
      reviewedAt: input.reviewedAt ?? existing?.reviewedAt ?? null
    };
    this.writeAtomically(this.getPatchReviewRecordPath(input.patchId, input.sessionId), next);
    return next;
  }

  public getPersistenceRecord(patchId: string, sessionId?: string | null): KnowledgePersistenceRecord | null {
    const path = this.getPersistenceRecordPath(patchId, sessionId);
    if (!existsSync(path)) {
      return null;
    }
    return this.readJsonFile<KnowledgePersistenceRecord>(path);
  }

  public upsertPersistenceRecord(
    input: UpsertKnowledgePersistenceRecordInput
  ): KnowledgePersistenceRecord {
    const existing = this.getPersistenceRecord(input.patchId, input.sessionId);
    const next: KnowledgePersistenceRecord = {
      patchId: input.patchId,
      targetPath: input.targetPath ?? existing?.targetPath ?? null,
      persistedVersion: input.persistedVersion ?? existing?.persistedVersion ?? null,
      persistResult: input.persistResult ?? existing?.persistResult ?? "pending",
      errorMessage: input.errorMessage ?? existing?.errorMessage ?? null,
      persistedAt: input.persistedAt ?? existing?.persistedAt ?? null
    };
    this.writeAtomically(this.getPersistenceRecordPath(input.patchId, input.sessionId), next);
    return next;
  }

  private ensureRoot(): void {
    mkdirSync(this.knowledgeRoot, { recursive: true });
    for (const dir of Object.values(KNOWLEDGE_LEVEL_DIRS)) {
      mkdirSync(join(this.knowledgeRoot, dir), { recursive: true });
    }
    mkdirSync(this.getHistoryDirPath(), { recursive: true });
    mkdirSync(this.getPatchRecordsDirPath(), { recursive: true });
    mkdirSync(this.getPatchReviewsDirPath(), { recursive: true });
    mkdirSync(this.getPersistenceRecordsDirPath(), { recursive: true });
  }

  private loadAllDocuments(sessionId?: string | null): KnowledgeDocument[] {
    const root = this.resolveSessionRoot(sessionId);
    const documents: KnowledgeDocument[] = [];
    for (const level of Object.keys(KNOWLEDGE_LEVEL_DIRS) as KnowledgeLevel[]) {
      const levelDir = join(root, KNOWLEDGE_LEVEL_DIRS[level]);
      const entries = existsSync(levelDir)
        ? readdirSync(levelDir, { withFileTypes: true })
        : [];
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) {
          continue;
        }
        documents.push(
          this.readJsonFile<StoredKnowledgeDocument>(join(levelDir, entry.name))
        );
      }
    }
    return documents;
  }

  private getLevelDir(level: KnowledgeLevel, sessionId?: string | null): string {
    return join(this.resolveSessionRoot(sessionId), KNOWLEDGE_LEVEL_DIRS[level]);
  }

  private getDocumentPath(level: KnowledgeLevel, slug: string, sessionId?: string | null): string {
    return join(this.getLevelDir(level, sessionId), toSlugFilename(slug));
  }

  private getManifestPath(sessionId?: string | null): string {
    return join(this.resolveSessionRoot(sessionId), MANIFEST_FILE);
  }

  private getHistoryDirPath(sessionId?: string | null): string {
    return join(this.resolveSessionRoot(sessionId), HISTORY_DIR);
  }

  private getMetaDirPath(sessionId?: string | null): string {
    return join(this.resolveSessionRoot(sessionId), META_DIR);
  }

  private getPatchRecordsDirPath(sessionId?: string | null): string {
    return join(this.getMetaDirPath(sessionId), PATCHES_DIR);
  }

  private getPatchReviewsDirPath(sessionId?: string | null): string {
    return join(this.getMetaDirPath(sessionId), REVIEWS_DIR);
  }

  private getPersistenceRecordsDirPath(sessionId?: string | null): string {
    return join(this.getMetaDirPath(sessionId), PERSISTENCE_DIR);
  }

  private getPatchRecordPath(patchId: string, sessionId?: string | null): string {
    return join(this.getPatchRecordsDirPath(sessionId), toSlugFilename(patchId));
  }

  private getPatchReviewRecordPath(patchId: string, sessionId?: string | null): string {
    return join(this.getPatchReviewsDirPath(sessionId), toSlugFilename(patchId));
  }

  private getPersistenceRecordPath(patchId: string, sessionId?: string | null): string {
    return join(this.getPersistenceRecordsDirPath(sessionId), toSlugFilename(patchId));
  }

  private appendChange(
    input: {
      documentId: string;
      level: KnowledgeLevel;
      slug: string;
      kind: "created" | "updated" | "deleted";
      sourceKind: KnowledgeSourceKind;
      sourceAgentId: string | null;
      summary: string | null;
      version: number;
    },
    sessionId?: string | null
  ): void {
    const record: KnowledgeChangeRecord = {
      id: randomUUID(),
      documentId: input.documentId,
      level: input.level,
      slug: input.slug,
      kind: input.kind,
      sourceKind: input.sourceKind,
      sourceAgentId: input.sourceAgentId,
      summary: input.summary,
      createdAt: now(),
      version: input.version
    };
    const historyPath = join(
      this.getHistoryDirPath(sessionId),
      `${record.createdAt.replaceAll(":", "-")}-${record.id}.json`
    );
    this.writeAtomically(historyPath, record);
  }

  private writeManifest(sessionId?: string | null): KnowledgeManifest {
    const counts = {
      l1: 0,
      l2: 0,
      l3: 0
    } satisfies KnowledgeManifestCounts;
    for (const item of this.loadAllDocuments(sessionId)) {
      counts[item.level] += 1;
    }
    const manifest: KnowledgeManifest = {
      rootPath: this.resolveSessionRoot(sessionId),
      counts,
      updatedAt: now()
    };
    this.writeAtomically(this.getManifestPath(sessionId), manifest);
    return manifest;
  }

  private writeAtomically(path: string, value: unknown): void {
    mkdirSync(dirname(path), { recursive: true });
    const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    renameSync(tempPath, path);
  }

  private readJsonFile<T>(path: string): T {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  }

  private readMetaCollection<T>(dirPath: string): T[] {
    if (!existsSync(dirPath)) {
      return [];
    }

    return readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => this.readJsonFile<T>(join(dirPath, entry.name)));
  }

  private toRelativePath(path: string): string {
    return relative(this.knowledgeRoot, path).replaceAll("\\", "/");
  }
}
