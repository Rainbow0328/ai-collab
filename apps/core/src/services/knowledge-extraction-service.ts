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
import { basename } from "node:path";

import type {
  BuildKnowledgePatchInput,
  ExtractFromCodePathsInput,
  ExtractFromWorkerReportInput,
  KnowledgeExtractionResult,
  KnowledgeLevel,
  KnowledgePatch,
  UpsertKnowledgeInput
} from "@ai-collab/protocol";

const DEFAULT_CONTENT_PLACEHOLDER =
  "Draft knowledge patch extracted for follow-up review.";

const STABLE_L2_SLUGS = new Set([
  "graph",
  "frontend-map",
  "protocol",
  "error-handling",
  "performance",
  "observability",
  "security"
]);

const clampConfidence = (value: number | undefined): number => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, value));
};

const normalizeSlug = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "");
};

const inferLevelFromText = (content: string): KnowledgeLevel => {
  const normalized = content.toLowerCase();
  if (
    normalized.includes("l1") ||
    normalized.includes("constitution") ||
    normalized.includes("redline") ||
    normalized.includes("red line")
  ) {
    return "l1";
  }
  if (
    normalized.includes("l2") ||
    normalized.includes("cross-module") ||
    normalized.includes("cross module") ||
    normalized.includes("dependency") ||
    normalized.includes("contract") ||
    normalized.includes("protocol")
  ) {
    return "l2";
  }
  return "l3";
};

const summarizeContent = (content: string): string | null => {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(title|summary|tags|slug|module|level)\s*:/i.test(line));

  if (lines.length === 0) {
    return null;
  }

  const summary = lines[0] ?? null;
  if (summary === null) {
    return null;
  }
  return summary.length > 160 ? `${summary.slice(0, 157)}...` : summary;
};

const inferTitleFromSlug = (slug: string): string => {
  return slug
    .split(/[/-]/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
};

const toCandidate = (patch: KnowledgePatch): UpsertKnowledgeInput => {
  return {
    level: patch.targetLevel,
    slug: patch.targetSlug,
    title: patch.title,
    content: patch.content,
    summary: patch.summary,
    tags: patch.tags,
    ownerAgentId: patch.source.sourceAgentId,
    sourceKind: patch.source.type,
    sourceAgentId: patch.source.sourceAgentId,
    changeSummary: patch.summary
  };
};

export class KnowledgeExtractionService {
  public extractFromWorkerReport(
    input: ExtractFromWorkerReportInput
  ): KnowledgeExtractionResult {
    const trimmed = input.reportContent.trim();
    if (!trimmed) {
      return {
        accepted: false,
        reason: "empty_report",
        patches: [],
        conflicts: [],
        warnings: ["Worker report content is empty."],
        candidates: []
      };
    }

    const level = input.targetHint?.level ?? inferLevelFromText(trimmed);
    const inferredSlug = this.inferWorkerReportSlug(trimmed, level, input.sourceAgentId);
    const slug = normalizeSlug(input.targetHint?.slug ?? inferredSlug);
    const title =
      input.targetHint?.title ??
      this.extractTaggedValue(trimmed, "title") ??
      inferTitleFromSlug(slug);

    if (!slug) {
      return {
        accepted: false,
        reason: "missing_slug",
        patches: [],
        conflicts: [],
        warnings: ["Could not infer a stable knowledge slug from the worker report."],
        candidates: []
      };
    }

    const warnings: string[] = [];
    const conflicts = [];
    const taggedLevel = this.extractTaggedValue(trimmed, "level");
    if (taggedLevel && taggedLevel.toLowerCase() !== level) {
      warnings.push(
        `Requested level "${taggedLevel}" was normalized to "${level}".`
      );
    }
    if (level === "l2" && !STABLE_L2_SLUGS.has(slug)) {
      conflicts.push({
        code: "UNKNOWN_L2_SLUG",
        message: `L2 slug "${slug}" is not in the stable contract set.`,
        targetLevel: level,
        targetSlug: slug,
        requiresReview: true
      });
    }
    if (level === "l1") {
      warnings.push("L1 extraction remains review-only and must be approved by knowledge-keeper.");
    }

    const patch = this.buildKnowledgePatch({
      level,
      slug,
      title,
      content: trimmed,
      summary:
        this.extractTaggedValue(trimmed, "summary") ?? summarizeContent(trimmed),
      tags: this.extractTags(trimmed, level),
      confidence: this.computeWorkerConfidence(trimmed, {
        hasTargetHint: Boolean(input.targetHint?.level || input.targetHint?.slug),
        conflictCount: conflicts.length
      }),
      requiresReview: true,
      source: {
        type: "worker_report",
        sourceAgentId: input.sourceAgentId,
        messageId: input.messageId,
        correlationId: input.correlationId
      }
    });

    return {
      accepted: true,
      reason: conflicts.length > 0 ? "patch_built_with_conflicts" : "patch_built",
      patches: [patch],
      conflicts,
      warnings,
      candidates: [toCandidate(patch)]
    };
  }

  public extractFromCodePaths(
    input: ExtractFromCodePathsInput
  ): KnowledgeExtractionResult {
    const uniquePaths = [...new Set(input.codePaths.map((path) => path.trim()).filter(Boolean))];
    if (uniquePaths.length === 0) {
      return {
        accepted: false,
        reason: "empty_code_paths",
        patches: [],
        conflicts: [],
        warnings: ["No code paths were supplied for extraction."],
        candidates: []
      };
    }

    const slug = normalizeSlug(
      input.moduleName ?? basename(uniquePaths[0] ?? "", ".ts") ?? "module"
    );
    const dominantLevel = this.inferLevelFromCodePaths(uniquePaths);
    const content = [
      `Draft knowledge extracted from code paths for ${slug}.`,
      "",
      "Observed paths:",
      ...uniquePaths.map((path) => `- ${path}`),
      ...(input.note ? ["", "Note:", input.note] : [])
    ].join("\n");
    const warnings =
      dominantLevel === "l2" && !STABLE_L2_SLUGS.has(slug)
        ? [`Inferred L2 target "${slug}" is outside the stable L2 contract set.`]
        : [];
    const conflicts =
      dominantLevel === "l2" && !STABLE_L2_SLUGS.has(slug)
        ? [{
            code: "UNKNOWN_L2_SLUG",
            message: `Inferred L2 slug "${slug}" is not in the stable contract set.`,
            targetLevel: dominantLevel,
            targetSlug: slug,
            requiresReview: true
          }]
        : [];

    const patch = this.buildKnowledgePatch({
      level: dominantLevel,
      slug,
      title: input.moduleName ?? inferTitleFromSlug(slug),
      content,
      summary: `Observed ${uniquePaths.length} code path(s) for ${slug}.`,
      tags: this.deriveTagsFromPaths(uniquePaths, dominantLevel),
      confidence: this.computeCodePathConfidence(uniquePaths, dominantLevel, conflicts.length),
      requiresReview: true,
      source: {
        type: "system",
        sourceAgentId: input.sourceAgentId ?? null,
        codePaths: uniquePaths,
        note: input.note
      }
    });

    return {
      accepted: true,
      reason:
        conflicts.length > 0
          ? "code_paths_extracted_with_conflicts"
          : "code_paths_extracted",
      patches: [patch],
      conflicts,
      warnings,
      candidates: [toCandidate(patch)]
    };
  }

  public buildKnowledgePatch(input: BuildKnowledgePatchInput): KnowledgePatch {
    return {
      id: randomUUID(),
      targetLevel: input.level,
      targetSlug: normalizeSlug(input.slug),
      action: input.action ?? "update",
      title: input.title.trim() || input.slug,
      content: input.content.trim() || DEFAULT_CONTENT_PLACEHOLDER,
      summary: input.summary ?? null,
      tags: [...new Set((input.tags ?? []).map((tag) => tag.trim()).filter(Boolean))],
      confidence: clampConfidence(input.confidence),
      requiresReview: input.requiresReview ?? true,
      source: input.source
    };
  }

  private extractTaggedValue(content: string, key: string): string | null {
    const match = content.match(new RegExp(`(?:^|\\n)${key}\\s*:\\s*(.+)`, "i"));
    return match?.[1]?.trim() ?? null;
  }

  private extractTags(content: string, level: KnowledgeLevel): string[] {
    const raw = this.extractTaggedValue(content, "tags");
    const tags = raw
      ? raw
          .split(",")
          .map((entry) => normalizeSlug(entry))
          .filter(Boolean)
      : [];
    if (!tags.includes(level)) {
      tags.push(level);
    }
    if (!tags.includes("draft")) {
      tags.push("draft");
    }
    return [...new Set(tags)];
  }

  private inferWorkerReportSlug(
    content: string,
    level: KnowledgeLevel,
    fallbackAgentId: string
  ): string {
    const taggedSlug =
      this.extractTaggedValue(content, "slug") ??
      this.extractTaggedValue(content, "module");
    if (taggedSlug) {
      return taggedSlug;
    }

    if (level === "l1") {
      return "schema";
    }

    if (level === "l2") {
      for (const slug of STABLE_L2_SLUGS) {
        if (content.toLowerCase().includes(slug)) {
          return slug;
        }
      }
    }

    return fallbackAgentId;
  }

  private inferLevelFromCodePaths(paths: string[]): KnowledgeLevel {
    const normalized = paths.map((path) => path.toLowerCase());
    if (normalized.some((path) => path.includes("/rule/") || path.includes("\\rule\\"))) {
      return "l1";
    }
    if (
      normalized.some((path) =>
        ["protocol", "sdk", "shared", "store"].some((segment) =>
          path.includes(`/packages/${segment}/`) || path.includes(`\\packages\\${segment}\\`)
        )
      )
    ) {
      return "l2";
    }
    return "l3";
  }

  private deriveTagsFromPaths(paths: string[], level: KnowledgeLevel): string[] {
    const tags = new Set<string>(["code-paths", "draft", level]);
    for (const path of paths) {
      if (path.includes("protocol")) tags.add("protocol");
      if (path.includes("websocket")) tags.add("websocket");
      if (path.includes("error")) tags.add("error-handling");
      if (path.includes("store")) tags.add("storage");
    }
    return [...tags];
  }

  private computeWorkerConfidence(
    content: string,
    input: {
      hasTargetHint: boolean;
      conflictCount: number;
    }
  ): number {
    let confidence = 0.45;
    if (input.hasTargetHint) confidence += 0.2;
    if (this.extractTaggedValue(content, "title")) confidence += 0.1;
    if (this.extractTaggedValue(content, "summary")) confidence += 0.1;
    if (this.extractTaggedValue(content, "tags")) confidence += 0.05;
    confidence -= input.conflictCount * 0.15;
    return clampConfidence(confidence);
  }

  private computeCodePathConfidence(
    paths: string[],
    level: KnowledgeLevel,
    conflictCount: number
  ): number {
    let confidence = level === "l3" ? 0.55 : 0.5;
    if (paths.length >= 2) confidence += 0.05;
    if (paths.length >= 4) confidence += 0.05;
    confidence -= conflictCount * 0.15;
    return clampConfidence(confidence);
  }
}
