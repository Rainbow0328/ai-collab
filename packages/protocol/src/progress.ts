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

export const progressStatuses = [
  "pending",
  "in_progress",
  "completed",
  "failed",
  "cancelled"
] as const;
export type ProgressStatus = (typeof progressStatuses)[number];

export type Progress = {
  sessionId: string;
  agentId: string;
  agentName: string;
  status: ProgressStatus;
  percentage: number;
  currentStep: string;
  message?: string | null | undefined;
  details?: Record<string, unknown> | undefined;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export type UpsertProgressInput = {
  sessionId: string;
  agentId: string;
  agentName: string;
  status?: ProgressStatus | undefined;
  percentage?: number | undefined;
  currentStep?: string | undefined;
  message?: string | null | undefined;
  details?: Record<string, unknown> | undefined;
  ttlSeconds?: number | undefined;
};

export type ListProgressFilter = {
  sessionId?: string | undefined;
  agentId?: string | undefined;
  status?: ProgressStatus | undefined;
};
