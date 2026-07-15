import type { MessageType } from "@loopmarshal/protocol";
import { loadConfig } from "@loopmarshal/shared";

const config = loadConfig();

export const DEFAULT_LOOP_INTERVAL_SECONDS = config.waitChain.defaultIntervalSeconds;
export const DEFAULT_LOOP_MAX_ROUNDS = config.waitChain.defaultMaxRounds;
export const DEFAULT_WINDOW_WAIT_SLICE_ELAPSED_SECONDS = 100;
export const DEFAULT_WINDOW_WAIT_CONTINUATION_BUDGET = 15;
export const DEFAULT_LOOP_CONTINUE_AFTER_MATCH = false;
export const DEFAULT_LOOP_MAX_MATCHES = 1;
export const DEFAULT_HOST_LOOP_ACK_MATCHED = true;
export const DEFAULT_POLL_BACKOFF_GROWTH = config.waitChain.pollBackoffGrowth;
export const DEFAULT_POLL_BACKOFF_MAX_FACTOR = config.waitChain.pollBackoffMaxFactor;
export const DEFAULT_POLL_JITTER_RATIO = config.waitChain.pollJitterRatio;
export const DEFAULT_HOST_REPORT_TYPE: MessageType = "result";
export const DEFAULT_WORKER_TASK_TYPE: MessageType = "instruction";

export const SUPPORTED_MESSAGE_TYPES: MessageType[] = [
  "system",
  "instruction",
  "task",
  "progress",
  "result",
  "heartbeat",
  "ack",
  "error"
];

export const HOST_EXECUTABLE_MESSAGE_TYPES: MessageType[] = ["instruction", "task"];
export const HOST_REPORT_MESSAGE_TYPES: MessageType[] = ["progress", "result", "error"];
export const HOST_RESOLVABLE_MESSAGE_TYPES: MessageType[] = [
  ...HOST_EXECUTABLE_MESSAGE_TYPES,
  ...HOST_REPORT_MESSAGE_TYPES
];

export const FORBIDDEN_PURE_WAIT_COMMANDS = [
  "Start-Sleep",
  "sleep",
  "timeout",
  "ping"
] as const;

export const WINDOW_WAIT_ALIAS_NAMES = [
  "await",
  "listen",
  "watch",
  "standby",
  "hold"
] as const;
