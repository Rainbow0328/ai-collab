import { randomUUID } from "node:crypto";

import type {
  CompleteTaskInput,
  CreateTaskInput,
  Task,
  TaskEvent
} from "@ai-collab/protocol";
import type {
  AgentRepository,
  SessionRepository,
  TaskEventRepository,
  TaskRepository
} from "@ai-collab/store";

import { coreErrors } from "../errors.js";

const now = (): string => new Date().toISOString();

export class TaskService {
  public constructor(
    private readonly sessions: SessionRepository,
    private readonly agents: AgentRepository,
    private readonly tasks: TaskRepository,
    private readonly taskEvents: TaskEventRepository
  ) {}

  public createTask(input: CreateTaskInput): { task: Task; event: TaskEvent } {
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

    const timestamp = now();
    const task: Task = {
      id: randomUUID(),
      sessionId: input.sessionId,
      title: input.title,
      description: input.description,
      createdByAgentId: input.createdByAgentId,
      status: input.assignedToAgentId ? "assigned" : "created",
      priority: input.priority,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(input.assignedToAgentId ? { assignedToAgentId: input.assignedToAgentId } : {}),
      ...(input.capabilityHint ? { capabilityHint: input.capabilityHint } : {}),
      ...(input.parentTaskId ? { parentTaskId: input.parentTaskId } : {})
    };
    const event: TaskEvent = {
      id: randomUUID(),
      taskId: task.id,
      eventType: "created",
      actorAgentId: input.createdByAgentId,
      payload: {
        title: input.title,
        assignedToAgentId: input.assignedToAgentId ?? null
      },
      createdAt: timestamp
    };

    this.tasks.insert(task);
    this.taskEvents.insert(event);

    return { task, event };
  }

  public listTasks(sessionId: string): Task[] {
    const session = this.sessions.findById(sessionId);
    if (!session) {
      throw coreErrors.sessionNotFound(sessionId);
    }

    return this.tasks.listBySessionId(sessionId);
  }

  public completeTask(
    taskId: string,
    input: CompleteTaskInput
  ): { task: Task; event: TaskEvent } {
    const task = this.tasks.findById(taskId);
    if (!task) {
      throw coreErrors.invalidInput(`Task "${taskId}" was not found.`);
    }

    const actor = this.agents.findById(input.completedByAgentId);
    if (!actor) {
      throw coreErrors.agentNotFound(input.completedByAgentId);
    }
    if (actor.sessionId !== task.sessionId) {
      throw coreErrors.crossSessionAgent(input.completedByAgentId, task.sessionId);
    }

    const timestamp = now();
    const completed = this.tasks.updateStatus({
      taskId,
      status: "completed",
      updatedAt: timestamp
    });
    if (!completed) {
      throw coreErrors.invalidInput(`Task "${taskId}" was not found.`);
    }

    const event: TaskEvent = {
      id: randomUUID(),
      taskId,
      eventType: "completed",
      actorAgentId: input.completedByAgentId,
      payload: {
        summary: input.summary ?? null
      },
      createdAt: timestamp
    };
    this.taskEvents.insert(event);

    return { task: completed, event };
  }
}
