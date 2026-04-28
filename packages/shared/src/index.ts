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
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export const createIsoTimestamp = (): string => {
  return new Date().toISOString();
};

export const resolveUserTimeZone = (): string => {
  return process.env.AI_COLLAB_TIMEZONE?.trim() ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "UTC";
};

const toDate = (value: string): Date | null => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const isIsoTimestampString = (value: string): boolean => {
  return /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) && toDate(value) !== null;
};

export const formatTimestampForDisplay = (
  isoTimestamp: string,
  timeZone = resolveUserTimeZone()
): string => {
  const date = toDate(isoTimestamp);
  if (!date) {
    return isoTimestamp;
  }

  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "longOffset"
  });
  const parts = formatter.formatToParts(date);
  const readPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const timeZoneName = readPart("timeZoneName");

  return `${readPart("year")}-${readPart("month")}-${readPart("day")} ${readPart("hour")}:${readPart("minute")}:${readPart("second")}${timeZoneName ? ` ${timeZoneName}` : ` ${timeZone}`}`;
};

const enrichValueWithLocalTimes = (value: unknown, timeZone: string): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => enrichValueWithLocalTimes(item, timeZone));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(record)) {
    next[key] = enrichValueWithLocalTimes(entry, timeZone);

    if (
      typeof entry === "string" &&
      isIsoTimestampString(entry) &&
      !Object.prototype.hasOwnProperty.call(record, `${key}Local`)
    ) {
      next[`${key}Local`] = formatTimestampForDisplay(entry, timeZone);
    }
  }

  return next;
};

export const wrapForDisplay = <T>(
  value: T,
  timeZone = resolveUserTimeZone()
): T | { value: T; displayTimezone: string } => {
  const enriched = enrichValueWithLocalTimes(value, timeZone) as T;

  if (Array.isArray(enriched) || !enriched || typeof enriched !== "object") {
    return {
      value: enriched,
      displayTimezone: timeZone
    };
  }

  return {
    ...(enriched as Record<string, unknown>),
    displayTimezone: timeZone
  } as T;
};

export const createLogTimestampFragment = (
  timeZone = resolveUserTimeZone()
): string => {
  const utcTimestamp = createIsoTimestamp();
  const localTimestamp = formatTimestampForDisplay(utcTimestamp, timeZone);

  return `,"time":"${localTimestamp}","timeUtc":"${utcTimestamp}","timezone":"${timeZone}"`;
};

export const getAiCollabHomePath = (
  projectRoot = process.cwd()
): string => {
  const configuredHome = process.env.AI_COLLAB_HOME?.trim();
  if (configuredHome) {
    return configuredHome;
  }

  return join(projectRoot, ".ai-collab");
};

export const getAiCollabLogDir = (projectRoot = process.cwd()): string => {
  const configuredLogDir = process.env.AI_COLLAB_LOG_DIR?.trim();
  if (configuredLogDir) {
    return configuredLogDir;
  }

  return join(projectRoot, "log");
};

export const getProjectLogPath = (projectRoot = process.cwd()): string => {
  return join(getAiCollabLogDir(projectRoot), "log.txt");
};

export const appendProjectLogEntry = (
  entry: Record<string, unknown>,
  projectRoot = process.cwd()
): void => {
  const logPath = getProjectLogPath(projectRoot);
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, `${JSON.stringify(entry)}\n`, "utf8");
};
