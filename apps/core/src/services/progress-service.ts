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
 * distributed under an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type {
  ListProgressFilter,
  Progress,
  UpsertProgressInput
} from "@ai-collab/protocol";

const DEFAULT_TTL_SECONDS = 3600;

export class ProgressService {
  private readonly progressMap: Map<string, Progress>;

  constructor() {
    this.progressMap = new Map();
  }

  private getKey(sessionId: string, agentId: string): string {
    return `${sessionId}:${agentId}`;
  }

  private nowIso(): string {
    return new Date().toISOString();
  }

  private addSeconds(dateStr: string, seconds: number): string {
    const date = new Date(dateStr);
    date.setSeconds(date.getSeconds() + seconds);
    return date.toISOString();
  }

  upsert(input: UpsertProgressInput): Progress {
    const key = this.getKey(input.sessionId, input.agentId);
    const existing = this.progressMap.get(key);
    const now = this.nowIso();
    const ttl = input.ttlSeconds ?? DEFAULT_TTL_SECONDS;

    const progress: Progress = {
      sessionId: input.sessionId,
      agentId: input.agentId,
      agentName: input.agentName,
      status: input.status ?? existing?.status ?? "in_progress",
      percentage: input.percentage ?? existing?.percentage ?? 0,
      currentStep: input.currentStep ?? existing?.currentStep ?? "",
      message: input.message ?? existing?.message,
      details: input.details ?? existing?.details,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      expiresAt: this.addSeconds(now, ttl)
    };

    this.progressMap.set(key, progress);
    return progress;
  }

  get(sessionId: string, agentId: string): Progress | undefined {
    const key = this.getKey(sessionId, agentId);
    const progress = this.progressMap.get(key);
    if (progress && this.isExpired(progress)) {
      this.progressMap.delete(key);
      return undefined;
    }
    return progress;
  }

  list(filter: ListProgressFilter = {}): Progress[] {
    const now = this.nowIso();
    const results: Progress[] = [];

    for (const progress of this.progressMap.values()) {
      if (progress.expiresAt < now) continue;
      if (filter.sessionId && progress.sessionId !== filter.sessionId) continue;
      if (filter.agentId && progress.agentId !== filter.agentId) continue;
      if (filter.status && progress.status !== filter.status) continue;
      results.push(progress);
    }

    return results;
  }

  clear(sessionId?: string): number {
    if (sessionId) {
      let count = 0;
      for (const key of this.progressMap.keys()) {
        if (key.startsWith(`${sessionId}:`)) {
          this.progressMap.delete(key);
          count++;
        }
      }
      return count;
    }
    const count = this.progressMap.size;
    this.progressMap.clear();
    return count;
  }

  expire(): number {
    const now = this.nowIso();
    let count = 0;
    for (const [key, progress] of this.progressMap.entries()) {
      if (progress.expiresAt < now) {
        this.progressMap.delete(key);
        count++;
      }
    }
    return count;
  }

  private isExpired(progress: Progress): boolean {
    return progress.expiresAt < this.nowIso();
  }
}
