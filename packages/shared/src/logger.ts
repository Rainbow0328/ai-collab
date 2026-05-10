import pino from "pino";
import type { Logger, Level } from "pino";

import { loadConfig } from "./config.js";

let globalLogger: Logger | null = null;

export const createLogger = (options?: {
  name?: string;
  level?: Level;
  destination?: string;
}): Logger => {
  const config = loadConfig();
  const level = options?.level ?? config.logging.level;

  const transport = config.logging.enableRotation
    ? pino.transport({
        target: "pino/file",
        options: {
          destination: options?.destination ?? config.logging.destination,
          mkdir: true
        }
      })
    : undefined;

  return pino({
    name: options?.name ?? "ai-collab",
    level,
    base: {
      pid: process.pid
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label })
    }
  }, transport);
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
