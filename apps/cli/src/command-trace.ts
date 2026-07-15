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
import { randomUUID } from "node:crypto";
import { appendProjectLogEntry, getProjectLogPath } from "@loopmarshal/shared";

export type CommandTraceEvent =
  | "command_start"
  | "window_registry_resolved"
  | "binding_loaded"
  | "binding_validated"
  | "stale_binding_cleared"
  | "local_reset_started"
  | "local_reset_finished"
  | "session_cleanup_started"
  | "session_cleanup_finished"
  | "session_hosted"
  | "session_joined"
  | "message_sent"
  | "message_merged"
  | "dispatch_queue_state"
  | "queue_drain_started"
  | "wait_poll"
  | "wait_claimed"
  | "wait_backlog"
  | "queue_item_selected"
  | "wait_started"
  | "wait_continued"
  | "wait_timeout"
  | "message_completed"
  | "runtime_state_updated"
  | "command_finished"
  | "command_failed";

type CommandTraceEntry = {
  version: 1;
  commandRunId: string;
  commandName: string;
  sessionName: string | null;
  windowName: string | null;
  at: string;
  event: CommandTraceEvent;
  data: unknown;
};

const getCommandTracePath = (projectRoot: string): string => {
  return process.env.LOOPMARSHAL_COMMAND_TRACE_FILE ?? getProjectLogPath(projectRoot);
};

const serializeTraceData = (value: unknown): unknown => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ?? null
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeTraceData(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        serializeTraceData(item)
      ])
    );
  }

  return value;
};

const appendTraceEntry = (
  projectRoot: string,
  entry: CommandTraceEntry
): void => {
  appendProjectLogEntry(
    {
      source: "cli.command_trace",
      ...entry
    },
    projectRoot
  );
};

export const createCommandTrace = (
  projectRoot: string,
  options: {
    commandName: string;
    sessionName?: string;
    windowName?: string;
    input?: unknown;
  }
) => {
  const commandRunId = randomUUID();
  const emit = (event: CommandTraceEvent, data: unknown) => {
    appendTraceEntry(projectRoot, {
      version: 1,
      commandRunId,
      commandName: options.commandName,
      sessionName: options.sessionName ?? null,
      windowName: options.windowName ?? null,
      at: new Date().toISOString(),
      event,
      data: serializeTraceData(data)
    });
  };

  emit("command_start", {
    input: options.input ?? null
  });

  return {
    commandRunId,
    tracePath: getCommandTracePath(projectRoot),
    step(event: CommandTraceEvent, data: unknown) {
      emit(event, data);
    },
    finish(data: unknown) {
      emit("command_finished", data);
    },
    fail(error: unknown) {
      emit("command_failed", error);
    }
  };
};

export const getCommandTraceStorePath = (projectRoot: string): string => {
  return getCommandTracePath(projectRoot);
};
