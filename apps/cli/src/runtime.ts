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
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";

type RuntimeMetadata = {
  pid: number;
  startedAt: string;
  host: string;
  port: number;
  cwd: string;
};

export type CoreStatus =
  | {
      state: "running";
      metadata: RuntimeMetadata | null;
      reachable: boolean;
    }
  | {
      state: "stopped";
      metadata: RuntimeMetadata | null;
      reachable: boolean;
    };

const defaultHost = "127.0.0.1";
const defaultPort = 42688;
const windowsPowerShellPath =
  "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";

export const getDashboardUrl = (metadata?: RuntimeMetadata | null): string => {
  return `http://${metadata?.host ?? defaultHost}:${metadata?.port ?? defaultPort}/`;
};

const ensureRuntimeDir = (projectRoot: string): string => {
  const runtimeDir = join(projectRoot, ".ai-collab", "runtime");
  mkdirSync(runtimeDir, { recursive: true });
  return runtimeDir;
};

const getRuntimeMetadataPath = (projectRoot: string): string => {
  return join(ensureRuntimeDir(projectRoot), "core.json");
};

const getLogPath = (projectRoot: string): string => {
  return join(ensureRuntimeDir(projectRoot), "core.log");
};

const getConfigPath = (projectRoot: string): string => {
  return join(projectRoot, ".ai-collab", "config.json");
};

const readRuntimeMetadata = (projectRoot: string): RuntimeMetadata | null => {
  const metadataPath = getRuntimeMetadataPath(projectRoot);

  try {
    return JSON.parse(readFileSync(metadataPath, "utf8")) as RuntimeMetadata;
  } catch {
    return null;
  }
};

const writeRuntimeMetadata = (
  projectRoot: string,
  metadata: RuntimeMetadata
): void => {
  writeFileSync(
    getRuntimeMetadataPath(projectRoot),
    JSON.stringify(metadata, null, 2),
    "utf8"
  );
};

const clearRuntimeMetadata = (projectRoot: string): void => {
  rmSync(getRuntimeMetadataPath(projectRoot), {
    force: true
  });
};

const isProcessRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const getCoreEntryPath = (): string => {
  const resolved = import.meta.resolve("@ai-collab/core");
  return fileURLToPath(resolved);
};

const quotePowerShell = (value: string): string => {
  return `'${value.replaceAll("'", "''")}'`;
};

export const initializeConfig = (projectRoot: string): string => {
  const configPath = getConfigPath(projectRoot);
  mkdirSync(dirname(configPath), { recursive: true });

  try {
    readFileSync(configPath, "utf8");
    return configPath;
  } catch {
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          core: {
            host: defaultHost,
            port: defaultPort
          }
        },
        null,
        2
      ),
      "utf8"
    );
    return configPath;
  }
};

export const startCore = async (projectRoot: string): Promise<CoreStatus> => {
  const current = await getCoreStatus(projectRoot);
  if (current.state === "running") {
    return current;
  }

  const coreEntry = getCoreEntryPath();
  let pid = -1;

  if (process.platform === "win32") {
    const command = [
      "$p = Start-Process",
      `-FilePath ${quotePowerShell(process.execPath)}`,
      `-ArgumentList ${quotePowerShell(coreEntry)}`,
      `-WorkingDirectory ${quotePowerShell(projectRoot)}`,
      "-WindowStyle Hidden",
      "-PassThru;",
      "Write-Output $p.Id"
    ].join(" ");

    const child = spawn(windowsPowerShellPath, ["-NoProfile", "-Command", command], {
      cwd: projectRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"]
    });

    pid = await new Promise<number>((resolve, reject) => {
      let output = "";
      child.stdout?.on("data", (chunk: Buffer | string) => {
        output += chunk.toString();
      });
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code !== 0) {
          reject(new Error(`Failed to start core process. Exit code: ${code ?? -1}`));
          return;
        }

        const parsed = Number.parseInt(output.trim(), 10);
        resolve(Number.isNaN(parsed) ? -1 : parsed);
      });
    });
  } else {
    const child = spawn(process.execPath, [coreEntry], {
      cwd: projectRoot,
      detached: true,
      stdio: "ignore"
    });

    child.unref();
    pid = child.pid ?? -1;
  }

  const metadata: RuntimeMetadata = {
    pid,
    startedAt: new Date().toISOString(),
    host: defaultHost,
    port: defaultPort,
    cwd: projectRoot
  };

  writeRuntimeMetadata(projectRoot, metadata);

  // Give the core a short window to bind the port.
  await new Promise((resolve) => setTimeout(resolve, 1200));
  return getCoreStatus(projectRoot);
};

export const runCoreForeground = async (
  projectRoot: string,
  webDir?: string
): Promise<void> => {
  initializeConfig(projectRoot);

  const running = await isCoreReachable();
  if (running) {
    throw new Error("ai-collab core is already running on 127.0.0.1:42688.");
  }

  // Spawn the web dev server (vite) if a web directory is provided.
  let webChild: ReturnType<typeof spawn> | null = null;
  if (webDir) {
    const pkgManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    webChild = spawn(pkgManager, ["dev"], {
      cwd: webDir,
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    });

    webChild.stdout?.on("data", (chunk: Buffer | string) => {
      const msg = chunk.toString().trim();
      if (msg) {
        console.log(`\x1b[36m[web]\x1b[0m ${msg}`);
      }
    });

    webChild.stderr?.on("data", (chunk: Buffer | string) => {
      const msg = chunk.toString().trim();
      if (msg) {
        console.log(`\x1b[36m[web]\x1b[0m ${msg}`);
      }
    });

    webChild.on("error", (err: Error) => {
      console.error(`\x1b[31m[web] Failed to start: ${err.message}\x1b[0m`);
    });
  }

  const { startCoreServer } = await import("@ai-collab/core");
  const instance = await startCoreServer();
  const metadata: RuntimeMetadata = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    host: defaultHost,
    port: defaultPort,
    cwd: projectRoot
  };
  writeRuntimeMetadata(projectRoot, metadata);

  const shutdown = async () => {
    clearRuntimeMetadata(projectRoot);
    if (webChild) {
      try { webChild.kill(); } catch { /* ignore */ }
    }
    await instance.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });

  await new Promise<void>(() => {});
};

export const stopCore = async (projectRoot: string): Promise<CoreStatus> => {
  const metadata = readRuntimeMetadata(projectRoot);

  // --- Kill registered MCP stdio servers before stopping core ---
  // This ensures MCP servers don't outlive the core service.
  if (metadata?.pid && isProcessRunning(metadata.pid)) {
    await killRegisteredMcpServers(metadata.host, metadata.port);
  }

  if (metadata?.pid && isProcessRunning(metadata.pid)) {
    process.kill(metadata.pid);
  }

  clearRuntimeMetadata(projectRoot);
  await new Promise((resolve) => setTimeout(resolve, 300));
  return getCoreStatus(projectRoot);
};

export const getCoreStatus = async (projectRoot: string): Promise<CoreStatus> => {
  const metadata = readRuntimeMetadata(projectRoot);
  const pidRunning = metadata?.pid ? isProcessRunning(metadata.pid) : false;
  const reachable = await isCoreReachable();

  if (pidRunning || reachable) {
    return {
      state: "running",
      metadata,
      reachable
    };
  }

  return {
    state: "stopped",
    metadata,
    reachable
  };
};

export const isCoreReachable = async (): Promise<boolean> => {
  try {
    const response = await fetch(`http://${defaultHost}:${defaultPort}/health`);
    return response.ok;
  } catch {
    return false;
  }
};

/**
 * Fetch the list of registered MCP stdio servers from the core service.
 */
export const getRegisteredMcpServers = async (
  host = defaultHost,
  port = defaultPort
): Promise<Array<{ pid: number; startedAt: string; ideLabel: string | null }>> => {
  try {
    const response = await fetch(`http://${host}:${port}/api/mcp-stdio/list`);
    if (!response.ok) return [];
    const data = (await response.json()) as { data?: { servers?: unknown[] } };
    const servers = data?.data?.servers;
    if (!Array.isArray(servers)) return [];
    return servers.map((s) => {
      const entry = s as { pid: number; startedAt: string; ideLabel: string | null };
      return {
        pid: entry.pid,
        startedAt: entry.startedAt,
        ideLabel: entry.ideLabel
      };
    });
  } catch {
    return [];
  }
};

/**
 * Kill all MCP stdio servers registered with the core service.
 * Called during `ai-collab stop` to ensure MCP servers don't outlive the core.
 */
const killRegisteredMcpServers = async (
  host = defaultHost,
  port = defaultPort
): Promise<{ killed: number[]; failed: number[] }> => {
  const servers = await getRegisteredMcpServers(host, port);
  const killed: number[] = [];
  const failed: number[] = [];

  for (const server of servers) {
    try {
      process.kill(server.pid);
      killed.push(server.pid);
    } catch {
      // Process may already be dead
      failed.push(server.pid);
    }
  }

  return { killed, failed };
};

export const runDoctor = async (projectRoot: string) => {
  const metadata = readRuntimeMetadata(projectRoot);
  const coreEntry = (() => {
    try {
      return getCoreEntryPath();
    } catch {
      return null;
    }
  })();

  return {
    nodeVersion: process.version,
    projectRoot,
    runtimeDir: ensureRuntimeDir(projectRoot),
    configPath: getConfigPath(projectRoot),
    coreEntry,
    pidKnown: metadata?.pid ?? null,
    coreReachable: await isCoreReachable()
  };
};

export const readLogs = (projectRoot: string, lines = 100): string => {
  const logPath = getLogPath(projectRoot);

  try {
    const content = readFileSync(logPath, "utf8");
    return content.split(/\r?\n/).slice(-lines).join("\n");
  } catch {
    return "";
  }
};
