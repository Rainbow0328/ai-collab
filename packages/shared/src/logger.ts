import { existsSync, statSync, renameSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import pino from "pino";
import type { Logger, Level } from "pino";

import { loadConfig } from "./config.js";

let globalLogger: Logger | null = null;

// ---------------------------------------------------------------------------
// Size-based log rotation (no external dependencies)
// ---------------------------------------------------------------------------

const parseMaxSize = (value: string): number => {
  const match = /^(\d+)\s*(b|kb|mb|gb)?$/i.exec(value.trim());
  if (!match) return 10 * 1024 * 1024; // default 10MB
  const num = Number.parseInt(match[1] ?? "10", 10);
  const unit = (match[2] ?? "mb").toLowerCase();
  const multipliers: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024
  };
  const multiplier = multipliers[unit] ?? multipliers["mb"] ?? 1024 * 1024;
  return num * multiplier;
};

const rotateLogFile = (
  filePath: string,
  maxSize: number,
  maxFiles: number
): void => {
  if (!existsSync(filePath)) return;

  let size: number;
  try {
    size = statSync(filePath).size;
  } catch {
    return;
  }

  if (size < maxSize) return;

  // Shift existing rotated files: .4 → deleted, .3 → .4, .2 → .3, .1 → .2
  for (let i = maxFiles - 1; i >= 1; i -= 1) {
    const older = `${filePath}.${i}`;
    const newer = `${filePath}.${i - 1 > 0 ? i - 1 : ""}`.replace(/\.$/, "");
    if (i === 1) {
      // Current log → .1
      try {
        renameSync(filePath, `${filePath}.1`);
      } catch {
        // ignore rotation errors
      }
    } else if (existsSync(older)) {
      try {
        renameSync(older, `${filePath}.${i}`);
      } catch {
        // ignore rotation errors
      }
    }
  }

  // Final fallback: just rename current to .1
  if (existsSync(filePath)) {
    try {
      renameSync(filePath, `${filePath}.1`);
    } catch {
      // ignore rotation errors
    }
  }
};

const ensureLogDir = (filePath: string): void => {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
};

// ---------------------------------------------------------------------------
// Logger factory
// ---------------------------------------------------------------------------

export const createLogger = (options?: {
  name?: string;
  level?: Level;
  destination?: string;
}): Logger => {
  const config = loadConfig();
  const level = options?.level ?? config.logging.level;
  const destination = options?.destination ?? config.logging.destination;

  // Pre-rotation: check if the log file is already too large
  ensureLogDir(destination);
  if (config.logging.enableRotation) {
    const maxSize = parseMaxSize(config.logging.maxFileSize);
    rotateLogFile(destination, maxSize, config.logging.maxFiles);
  }

  // Use pino/file transport for writing
  const transport = config.logging.enableRotation
    ? pino.transport({
        target: "pino/file",
        options: {
          destination,
          mkdir: true
        }
      })
    : undefined;

  const logger = pino(
    {
      name: options?.name ?? "ai-collab",
      level,
      base: {
        pid: process.pid
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ level: label })
      }
    },
    transport
  );

  // Set up periodic rotation check (every 60 seconds)
  if (config.logging.enableRotation) {
    const maxSize = parseMaxSize(config.logging.maxFileSize);
    const interval = setInterval(() => {
      try {
        rotateLogFile(destination, maxSize, config.logging.maxFiles);
      } catch {
        // silently ignore rotation errors during periodic check
      }
    }, 60_000);

    // Don't keep the process alive just for rotation
    if (interval.unref) {
      interval.unref();
    }
  }

  return logger;
};

export const getLogger = (): Logger => {
  if (!globalLogger) {
    globalLogger = createLogger();
  }
  return globalLogger;
};

export const setLogger = (logger: Logger): void => {
  globalLogger = logger;
};

export type { Logger, Level };
