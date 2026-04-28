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
export type LocalLoopLockMetadata = {
  version: 1;
  identity: string;
  flow: string;
  pid: number;
  acquiredAt: string;
};

export type AcquiredLocalLoopLock = {
  status: "acquired";
  path: string;
  metadata: LocalLoopLockMetadata;
};

export type ExistingLocalLoopLock = {
  status: "already_running";
  path: string;
  metadata: LocalLoopLockMetadata | null;
};

export type LocalLoopLockResult =
  | AcquiredLocalLoopLock
  | ExistingLocalLoopLock;

const buildLockPath = (identity: string, flow: string): string => {
  return `db://identity-leases/${flow}/${identity}`;
};

export const tryAcquireLocalLoopLock = (
  projectRoot: string,
  options: {
    identity: string;
    flow: string;
    takeover?: boolean;
  }
): LocalLoopLockResult => {
  void projectRoot;
  void options.takeover;
  return {
    status: "acquired",
    path: buildLockPath(options.identity, options.flow),
    metadata: {
      version: 1,
      identity: options.identity,
      flow: options.flow,
      pid: process.pid,
      acquiredAt: new Date().toISOString()
    }
  };
};

export const releaseLocalLoopLock = (lock: AcquiredLocalLoopLock): void => {
  void lock;
};

export const clearLocalLoopLock = (
  projectRoot: string,
  options: {
    identity: string;
    flow: string;
  }
): string => {
  void projectRoot;
  return buildLockPath(options.identity, options.flow);
};

export const clearLocalLoopLocksForIdentity = (
  projectRoot: string,
  identity: string,
  flows: string[] = ["host-cycle", "worker-cycle"]
): string[] => {
  return flows.map((flow) =>
    clearLocalLoopLock(projectRoot, {
      identity,
      flow
    })
  );
};

export const withLocalLoopLock = async <T>(
  projectRoot: string,
  options: {
    identity: string;
    flow: string;
    takeover?: boolean;
  },
  task: () => Promise<T>
): Promise<
  | {
      status: "acquired";
      value: T;
      lock: AcquiredLocalLoopLock;
    }
  | {
      status: "already_running";
      lock: ExistingLocalLoopLock;
    }
> => {
  const lock = tryAcquireLocalLoopLock(projectRoot, options);
  if (lock.status === "already_running") {
    return {
      status: "already_running",
      lock
    };
  }

  try {
    const value = await task();
    return {
      status: "acquired",
      value,
      lock
    };
  } finally {
    releaseLocalLoopLock(lock);
  }
};
