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
import { AgentRepository } from "@loopmarshal/store";
import type { Agent } from "@loopmarshal/protocol";

import { coreErrors } from "../errors.js";
import type { SessionService } from "./session-service.js";

export class AgentService {
  public constructor(
    private readonly agents: AgentRepository,
    private readonly sessionService: SessionService
  ) {}

  /**
   * 查找 agent by id，不存在返回 null。
   * 用于工具 handler 中的目标验证。
   */
  public getAgent(agentId: string): Agent | null {
    return this.agents.findById(agentId);
  }

  public heartbeat(agentId: string): { agentId: string; heartbeatAt: string } {
    const agent = this.agents.findById(agentId);
    if (!agent) {
      throw coreErrors.agentNotFound(agentId);
    }

    const heartbeatAt = new Date().toISOString();
    this.agents.updateHeartbeat(agentId, heartbeatAt);

    return {
      agentId,
      heartbeatAt
    };
  }

  public leave(agentId: string) {
    const agent = this.agents.findById(agentId);
    if (!agent) {
      throw coreErrors.agentNotFound(agentId);
    }

    return this.sessionService.removeAgent(agentId);
  }
}
