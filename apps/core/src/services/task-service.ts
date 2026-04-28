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

import type {
  CompleteTaskInput,
  CreateTaskInput,
  Task,
  TaskEvent
} from "@ai-collab/protocol";
import {
  AgentRepository,
  SessionRepository,
  TaskEventRepository,
  TaskRepository
} from "@ai-collab/store";

import { coreErrors } from "../errors.js";

const now = (): string => {
  return new Date().toISOString();
};

export class TaskService {
  public constructor(
    private readonly sessions: SessionRepository,
    private readonly agents: AgentRepository,
    private readonly tasks: TaskRepository,
    private readonly taskEvents: TaskEventRepository
  ) {}

  public createTask(input: CreateTaskInput): Task {
    const session = this.sessions.findById(input.sessionId);
    if (!session) {
      throw coreErrors.sessionNotFound(input.sessionId);
    }

    const creator = this.agents.findById(input.createdByAgentId);
    if (!creator) {
      throw coreErrors.agentNotFound(input.createdByAgentId);
    }
    if (creator.sessionId !== input.sessionId) {
      throw coreErrors.crossSessionAgent(input.createdByAgentId, input.sessionId);
    }

    if (input.assignedToAgentId) {
      const assignee = this.agents.findById(input.assignedToAgentId);
      if (!assignee) {
        throw coreErrors.agentNotFound(input.assignedToAgentId);
      }
      if (assignee.sessionId !== input.sessionId) {
        throw coreErrors.crossSessionAgent(input.assignedToAgentId, input.sessionId);
      }
    }

    const createdAt = now();
    const task: Task = {
      id: randomUUID(),
      sessionId: input.sessionId,
      title: input.title,
      description: input.description,
      createdByAgentId: input.createdByAgentId,
      status: input.assignedToAgentId ? "assigned" : "created",
      priority: input.priority,
      createdAt,
      updatedAt: createdAt,
      ...(input.assignedToAgentId
        ? { assignedToAgentId: input.assignedToAgentId }
        : {}),
      ...(input.capabilityHint ? { capabilityHint: input.capabilityHint } : {}),
      ...(input.parentTaskId ? { parentTaskId: input.parentTaskId } : {})
    };

    this.tasks.insert(task);
    this.taskEvents.insert({
      id: randomUUID(),
      taskId: task.id,
      eventType: "created",
      actorAgentId: input.createdByAgentId,
      payload: {
        assignedToAgentId: input.assignedToAgentId ?? null,
        priority: input.priority
      },
      createdAt
    });

    return task;
  }

  public listTasks(sessionId: string): Task[] {
    const session = this.sessions.findById(sessionId);
    if (!session) {
      throw coreErrors.sessionNotFound(sessionId);
    }

    return this.tasks.listBySessionId(sessionId);
  }

  public completeTask(taskId: string, input: CompleteTaskInput): Task {
    const task = this.tasks.findById(taskId);
    if (!task) {
      throw coreErrors.taskNotFound(taskId);
    }

    const actor = this.agents.findById(input.completedByAgentId);
    if (!actor) {
      throw coreErrors.agentNotFound(input.completedByAgentId);
    }
    if (actor.sessionId !== task.sessionId) {
      throw coreErrors.crossSessionAgent(input.completedByAgentId, task.sessionId);
    }
    if (task.assignedToAgentId && task.assignedToAgentId !== input.completedByAgentId) {
      throw coreErrors.invalidTaskAssignee(input.completedByAgentId, taskId);
    }

    const updatedAt = now();
    this.tasks.updateStatus(taskId, "completed", updatedAt);

    const event: TaskEvent = {
      id: randomUUID(),
      taskId,
      eventType: "completed",
      actorAgentId: input.completedByAgentId,
      payload: {
        summary: input.summary ?? null
      },
      createdAt: updatedAt
    };
    this.taskEvents.insert(event);

    return {
      ...task,
      status: "completed",
      updatedAt
    };
  }
}
