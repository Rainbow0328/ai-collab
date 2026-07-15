import { randomUUID } from "node:crypto";
import type {
  CreateWebAgentRuntimeInput,
  UpdateWebAgentRuntimeInput,
  WebAgentRuntime
} from "@loopmarshal/protocol";
import type {
  AgentRepository,
  ModelConfigRepository,
  SessionRepository,
  WebAgentRuntimeRepository
} from "@loopmarshal/store";
import { coreErrors } from "../errors.js";

const now = () => new Date().toISOString();

export class WebAgentRuntimeService {
  public constructor(
    private readonly repository: WebAgentRuntimeRepository,
    private readonly sessions: SessionRepository,
    private readonly agents: AgentRepository,
    private readonly models: ModelConfigRepository
  ) {}

  public createOrUpdate(input: CreateWebAgentRuntimeInput): WebAgentRuntime {
    this.assertValidBinding(input);
    const existing = this.repository.findByAgentId(input.agentId);
    const timestamp = now();
    const runtime: WebAgentRuntime = {
      id: existing?.id ?? randomUUID(),
      sessionId: input.sessionId,
      agentId: input.agentId,
      role: input.role,
      modelConfigId: input.modelConfigId,
      agentProfileId: input.agentProfileId ?? null,
      toolsetId: input.toolsetId,
      status: existing?.status ?? "stopped",
      enabled: true,
      currentStep: existing?.currentStep ?? null,
      lastError: null,
      lastTickAt: existing?.lastTickAt ?? null,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp
    };
    this.repository.upsert(runtime);
    return this.get(runtime.id);
  }

  public list(sessionId: string): WebAgentRuntime[] {
    if (!this.sessions.findById(sessionId)) {
      throw coreErrors.sessionNotFound(sessionId);
    }
    return this.repository.listBySessionId(sessionId);
  }

  public get(id: string): WebAgentRuntime {
    const runtime = this.repository.findById(id);
    if (!runtime) {
      throw coreErrors.agentNotFound(id);
    }
    return runtime;
  }

  public update(id: string, input: UpdateWebAgentRuntimeInput): WebAgentRuntime {
    const existing = this.get(id);
    if (input.modelConfigId && !this.models.findById(input.modelConfigId)) {
      throw coreErrors.agentNotFound(input.modelConfigId);
    }
    this.repository.update(id, {
      ...(input.modelConfigId !== undefined ? { modelConfigId: input.modelConfigId } : {}),
      ...(input.agentProfileId !== undefined ? { agentProfileId: input.agentProfileId } : {}),
      ...(input.toolsetId !== undefined ? { toolsetId: input.toolsetId } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled ? 1 : 0 } : {}),
      ...(input.currentStep !== undefined ? { currentStep: input.currentStep } : {}),
      ...(input.lastError !== undefined ? { lastError: input.lastError } : {}),
      ...(input.lastTickAt !== undefined ? { lastTickAt: input.lastTickAt } : {})
    });
    return this.get(existing.id);
  }

  public setStatus(id: string, status: WebAgentRuntime["status"]): WebAgentRuntime {
    return this.update(id, {
      status,
      lastTickAt: now(),
      ...(status !== "error" ? { lastError: null } : {})
    });
  }

  public delete(id: string): { deleted: boolean } {
    this.get(id);
    this.repository.deleteById(id);
    return { deleted: true };
  }

  private assertValidBinding(input: CreateWebAgentRuntimeInput): void {
    const session = this.sessions.findById(input.sessionId);
    if (!session) {
      throw coreErrors.sessionNotFound(input.sessionId);
    }
    const agent = this.agents.findById(input.agentId);
    if (!agent) {
      throw coreErrors.agentNotFound(input.agentId);
    }
    if (agent.sessionId !== input.sessionId) {
      throw coreErrors.crossSessionAgent(input.agentId, input.sessionId);
    }
    if (agent.role !== input.role) {
      throw coreErrors.invalidInput(
        `Agent role "${agent.role}" cannot be bound as web runtime role "${input.role}".`
      );
    }
    if (input.role !== "host" && input.role !== "knowledge_keeper") {
      throw coreErrors.invalidInput(
        `Web runtime role must be "host" or "knowledge_keeper". Received "${input.role}".`
      );
    }
    if (!this.models.findById(input.modelConfigId)) {
      throw coreErrors.agentNotFound(input.modelConfigId);
    }
  }
}
