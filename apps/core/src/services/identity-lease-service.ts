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
  AcquireIdentityLeaseInput,
  IdentityLease,
  ReleaseIdentityLeaseInput
} from "@ai-collab/protocol";
import { IdentityLeaseRepository } from "@ai-collab/store";

import { coreErrors } from "../errors.js";

const now = (): string => {
  return new Date().toISOString();
};

export class IdentityLeaseService {
  public constructor(private readonly leases: IdentityLeaseRepository) {}

  public acquire(input: AcquireIdentityLeaseInput): IdentityLease {
    const identityKey = `${input.flow}:${input.identity}`;
    const lease = this.leases.acquire({
      identityKey,
      ownerToken: input.ownerToken,
      leaseUntil: new Date(Date.now() + input.leaseSeconds * 1000).toISOString(),
      now: now(),
      takeover: input.takeover ?? false
    });
    if (!lease) {
      const existing = this.leases.findByIdentityKey(identityKey);
      throw coreErrors.identityBusy(
        input.identity,
        input.flow,
        existing
          ? {
              ownerToken: existing.ownerToken,
              leaseUntil: existing.leaseUntil
            }
          : undefined
      );
    }

    return lease;
  }

  public release(input: ReleaseIdentityLeaseInput): {
    released: boolean;
    identityKey: string;
  } {
    const identityKey = `${input.flow}:${input.identity}`;
    return {
      released: this.leases.release(identityKey, input.ownerToken),
      identityKey
    };
  }

  public assertCurrentOwner(input: {
    identity: string;
    flow: "host" | "worker";
    ownerToken?: string;
  }): void {
    if (!input.ownerToken) {
      return;
    }

    const identityKey = `${input.flow}:${input.identity}`;
    const existing = this.leases.findByIdentityKey(identityKey);
    if (!existing || existing.ownerToken !== input.ownerToken) {
      throw coreErrors.waitChainSuperseded(input.identity, input.flow);
    }
  }
}
