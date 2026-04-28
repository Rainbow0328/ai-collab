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
import type {
  UpdateWindowBindingDefaultsInput,
  UpdateWindowRuntimeStateInput,
  WindowBinding
} from "@ai-collab/protocol";
import { AgentRepository } from "@ai-collab/store";

import { coreErrors } from "../errors.js";

const now = (): string => {
  return new Date().toISOString();
};

export class WindowBindingService {
  public constructor(private readonly agents: AgentRepository) {}

  public list(sessionName?: string): WindowBinding[] {
    return this.agents.listWindowBindings(sessionName);
  }

  public get(sessionName: string, windowName: string): WindowBinding {
    const binding = this.agents.findWindowBinding(sessionName, windowName);
    if (!binding) {
      throw coreErrors.sessionNotFound(`${sessionName}::${windowName}`);
    }

    return binding;
  }

  public updateDefaults(
    sessionName: string,
    windowName: string,
    input: UpdateWindowBindingDefaultsInput
  ): WindowBinding {
    const binding = this.get(sessionName, windowName);
    const updated = this.agents.updateWindowBindingDefaults(binding.agentId, input);
    if (!updated) {
      throw coreErrors.agentNotFound(binding.agentId);
    }

    return updated;
  }

  public updateRuntimeState(
    sessionName: string,
    windowName: string,
    input: UpdateWindowRuntimeStateInput
  ): WindowBinding {
    const binding = this.get(sessionName, windowName);
    const updated = this.agents.updateWindowRuntimeState(
      binding.agentId,
      input,
      now()
    );
    if (!updated) {
      throw coreErrors.agentNotFound(binding.agentId);
    }

    return updated;
  }

  public clearRuntimeState(sessionName: string, windowName: string): WindowBinding {
    const binding = this.get(sessionName, windowName);
    const updated = this.agents.clearWindowRuntimeState(binding.agentId, now());
    if (!updated) {
      throw coreErrors.agentNotFound(binding.agentId);
    }

    return updated;
  }
}
