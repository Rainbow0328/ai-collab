/*
 * stdio-mcp-registry-service
 *
 * Tracks MCP stdio server processes that are connected to this core instance.
 * Used for lifecycle binding: when the core stops, all registered MCP servers
 * are killed so they don't outlive the core service.
 */

export type StdioMcpRegistration = {
  pid: number;
  startedAt: string;
  ideLabel: string | null;
};

type InternalEntry = StdioMcpRegistration & {
  lastSeenAt: string;
};

export class StdioMcpRegistryService {
  private entries = new Map<number, InternalEntry>();

  register(pid: number, ideLabel?: string): StdioMcpRegistration {
    const now = new Date().toISOString();
    const entry: InternalEntry = {
      pid,
      startedAt: now,
      lastSeenAt: now,
      ideLabel: ideLabel ?? null
    };
    this.entries.set(pid, entry);
    return this.toPublic(entry);
  }

  heartbeat(pid: number): boolean {
    const entry = this.entries.get(pid);
    if (!entry) return false;
    entry.lastSeenAt = new Date().toISOString();
    return true;
  }

  unregister(pid: number): boolean {
    return this.entries.delete(pid);
  }

  list(): StdioMcpRegistration[] {
    return Array.from(this.entries.values()).map((e) => this.toPublic(e));
  }

  /** Returns PIDs of all registered MCP servers (for stop-time cleanup). */
  getAllPids(): number[] {
    return Array.from(this.entries.keys());
  }

  /** Remove entries whose process is no longer running. */
  pruneDeadProcesses(isAlive: (pid: number) => boolean): number {
    let pruned = 0;
    for (const pid of this.entries.keys()) {
      if (!isAlive(pid)) {
        this.entries.delete(pid);
        pruned++;
      }
    }
    return pruned;
  }

  private toPublic(entry: InternalEntry): StdioMcpRegistration {
    return {
      pid: entry.pid,
      startedAt: entry.startedAt,
      ideLabel: entry.ideLabel
    };
  }
}
