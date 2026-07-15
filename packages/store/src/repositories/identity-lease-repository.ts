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
import type { DatabaseSync } from "node:sqlite";

import type { IdentityLease } from "@loopmarshal/protocol";

type IdentityLeaseRow = {
  identityKey: string;
  ownerToken: string;
  leaseUntil: string;
  createdAt: string;
  updatedAt: string;
};

export class IdentityLeaseRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public findByIdentityKey(identityKey: string): IdentityLease | null {
    const statement = this.database.prepare(`
      SELECT
        identity_key AS identityKey,
        owner_token AS ownerToken,
        lease_until AS leaseUntil,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM identity_leases
      WHERE identity_key = ?
      LIMIT 1
    `);

    const row = statement.get(identityKey) as IdentityLeaseRow | undefined;
    return row ? this.mapRow(row) : null;
  }

  public acquire(input: {
    identityKey: string;
    ownerToken: string;
    leaseUntil: string;
    now: string;
    takeover?: boolean;
  }): IdentityLease | null {
    const statement = this.database.prepare(`
      INSERT INTO identity_leases (
        identity_key,
        owner_token,
        lease_until,
        created_at,
        updated_at
      ) VALUES (
        @identityKey,
        @ownerToken,
        @leaseUntil,
        @now,
        @now
      )
      ON CONFLICT(identity_key) DO UPDATE SET
        owner_token = excluded.owner_token,
        lease_until = excluded.lease_until,
        updated_at = excluded.updated_at
      WHERE identity_leases.owner_token = excluded.owner_token
         OR identity_leases.lease_until <= @now
         OR @takeover = 1
      RETURNING
        identity_key AS identityKey,
        owner_token AS ownerToken,
        lease_until AS leaseUntil,
        created_at AS createdAt,
        updated_at AS updatedAt
    `);

    const row = statement.get({
      ...input,
      takeover: input.takeover ? 1 : 0
    }) as IdentityLeaseRow | undefined;
    return row ? this.mapRow(row) : null;
  }

  public release(identityKey: string, ownerToken: string): boolean {
    const statement = this.database.prepare(`
      DELETE FROM identity_leases
      WHERE identity_key = @identityKey
        AND owner_token = @ownerToken
    `);

    const result = statement.run({
      identityKey,
      ownerToken
    });
    return Number(result.changes ?? 0) > 0;
  }

  public deleteByIdentity(identity: string): number {
    const statement = this.database.prepare(`
      DELETE FROM identity_leases
      WHERE identity_key IN (@hostIdentityKey, @workerIdentityKey)
    `);

    const result = statement.run({
      hostIdentityKey: `host:${identity}`,
      workerIdentityKey: `worker:${identity}`
    });

    return Number(result.changes ?? 0);
  }

  public deleteBySessionName(sessionName: string): number {
    const statement = this.database.prepare(`
      DELETE FROM identity_leases
      WHERE identity_key LIKE @hostPattern
         OR identity_key LIKE @workerPattern
    `);

    const result = statement.run({
      hostPattern: `host:${sessionName}::%`,
      workerPattern: `worker:${sessionName}::%`
    });

    return Number(result.changes ?? 0);
  }

  private mapRow(row: IdentityLeaseRow): IdentityLease {
    return {
      identityKey: row.identityKey,
      ownerToken: row.ownerToken,
      leaseUntil: row.leaseUntil,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }
}
