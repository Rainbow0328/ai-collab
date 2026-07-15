/**
 * 外部 MCP Server 管理服务
 *
 * 支持 SSE 传输方式连接外部 MCP Server，发现工具，代理调用。
 * 配置持久化到 SQLite 数据库，重启后自动恢复。
 */
import { randomUUID } from "node:crypto";
import type { McpServerConfig, CreateMcpServerInput, UpdateMcpServerInput } from "@ai-collab/protocol";
import type { ExternalMcpServerRepository } from "@ai-collab/store";
import { getLogger } from "@ai-collab/shared";

const logger = getLogger();

/** JSON-RPC 请求 */
type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
};

/** JSON-RPC 响应 */
type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

/** 缓存的外部 Server 工具列表 */
type CachedTools = {
  tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
  fetchedAt: number;
};

export class ExternalMcpService {
  private repository: ExternalMcpServerRepository;
  /** 内存中的配置缓存（从数据库加载） */
  private configs: Map<string, McpServerConfig> = new Map();
  /** 工具列表缓存（5分钟有效期） */
  private toolCache: Map<string, CachedTools> = new Map();
  private rpcId = 0;

  public constructor(repository: ExternalMcpServerRepository) {
    this.repository = repository;
    this.loadFromDatabase();
  }

  /** 从数据库加载所有配置到内存缓存 */
  private loadFromDatabase(): void {
    const all = this.repository.list();
    this.configs.clear();
    for (const config of all) {
      this.configs.set(config.id, config);
    }
  }

  /** 列出所有外部 MCP Server */
  list(): McpServerConfig[] {
    return Array.from(this.configs.values());
  }

  /** 获取单个 */
  get(id: string): McpServerConfig | null {
    return this.configs.get(id) ?? null;
  }

  /** 创建外部 MCP Server */
  create(input: CreateMcpServerInput): McpServerConfig {
    const now = new Date().toISOString();
    const config: McpServerConfig = {
      id: randomUUID(),
      name: input.name,
      description: input.description ?? null,
      transport: input.transport,
      url: input.url,
      headers: input.headers ?? null,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    this.repository.insert(config);
    this.configs.set(config.id, config);
    this.toolCache.delete(config.id);
    return config;
  }

  /** 更新外部 MCP Server */
  update(id: string, input: UpdateMcpServerInput): McpServerConfig {
    const existing = this.configs.get(id);
    if (!existing) {
      throw new Error(`MCP Server not found: ${id}`);
    }
    const updated: McpServerConfig = {
      ...existing,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.transport !== undefined ? { transport: input.transport } : {}),
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.headers !== undefined ? { headers: input.headers } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      updatedAt: new Date().toISOString(),
    };
    this.repository.update(updated);
    this.configs.set(id, updated);
    // URL/headers 变更时清除工具缓存
    this.toolCache.delete(id);
    return updated;
  }

  /** 删除外部 MCP Server */
  delete(id: string): { deleted: boolean } {
    this.toolCache.delete(id);
    const deleted = this.repository.delete(id);
    if (deleted) {
      this.configs.delete(id);
    }
    return { deleted };
  }

  /**
   * 获取外部 MCP Server 的工具列表
   * 通过 JSON-RPC `tools/list` 方法获取
   */
  async listTools(serverId: string): Promise<Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>> {
    const server = this.configs.get(serverId);
    if (!server || !server.enabled) {
      return [];
    }

    // 检查缓存（5分钟有效期）
    const cached = this.toolCache.get(serverId);
    if (cached && Date.now() - cached.fetchedAt < 5 * 60 * 1000) {
      return cached.tools;
    }

    try {
      const response = await this.sendRpc(server, "tools/list", {});
      const tools = (response as { tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> })?.tools ?? [];
      this.toolCache.set(serverId, { tools, fetchedAt: Date.now() });
      return tools;
    } catch (error) {
      logger.warn(`Failed to list tools from MCP server ${server.name}: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * 获取所有外部 MCP Server 的工具列表（合并）
   */
  async listAllTools(): Promise<Array<{ name: string; description: string; inputSchema: Record<string, unknown>; serverId: string; serverName: string }>> {
    const allTools: Array<{ name: string; description: string; inputSchema: Record<string, unknown>; serverId: string; serverName: string }> = [];
    for (const [serverId, server] of this.configs) {
      if (!server.enabled) continue;
      try {
        const tools = await this.listTools(serverId);
        for (const tool of tools) {
          allTools.push({
            ...tool,
            serverId,
            serverName: server.name,
          });
        }
      } catch {
        // 跳过失败的 server
      }
    }
    return allTools;
  }

  /**
   * 调用外部 MCP Server 的工具
   * 通过 JSON-RPC `tools/call` 方法执行
   */
  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<{ success: boolean; result: unknown; error?: string }> {
    const server = this.configs.get(serverId);
    if (!server) {
      return { success: false, result: null, error: `MCP Server not found: ${serverId}` };
    }
    if (!server.enabled) {
      return { success: false, result: null, error: `MCP Server is disabled: ${server.name}` };
    }

    try {
      const response = await this.sendRpc(server, "tools/call", {
        name: toolName,
        arguments: args,
      });

      // MCP tools/call 返回 { content: [...], isError?: boolean }
      const result = response as { content?: Array<{ type: string; text?: string }>; isError?: boolean };
      if (result.isError) {
        const errorText = result.content?.map((c) => c.text ?? "").join("\n") ?? "Unknown tool error";
        return { success: false, result: null, error: errorText };
      }

      return {
        success: true,
        result: result.content?.map((c) => c.text ?? "").join("\n") ?? response,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`External MCP tool call failed [${server.name}/${toolName}]: ${msg}`);
      return { success: false, result: null, error: msg };
    }
  }

  /**
   * 通过指定工具名查找所属 Server 并调用
   * 遍历所有启用的 Server 寻找该工具
   */
  async callToolByName(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<{ success: boolean; result: unknown; error?: string }> {
    for (const [serverId, server] of this.configs) {
      if (!server.enabled) continue;
      try {
        const tools = await this.listTools(serverId);
        if (tools.some((t) => t.name === toolName)) {
          return this.callTool(serverId, toolName, args);
        }
      } catch {
        continue;
      }
    }
    return { success: false, result: null, error: `No MCP server provides tool: ${toolName}` };
  }

  /** 发送 JSON-RPC 请求到 MCP Server（SSE/HTTP 传输） */
  private async sendRpc(server: McpServerConfig, method: string, params: Record<string, unknown>): Promise<unknown> {
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: ++this.rpcId,
      method,
      params,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(server.headers ? Object.fromEntries(Object.entries(server.headers)) : {}),
    };

    const response = await fetch(server.url, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`MCP Server returned HTTP ${response.status}: ${await response.text()}`);
    }

    const json = await response.json() as JsonRpcResponse;
    if (json.error) {
      throw new Error(`MCP Server RPC error [${json.error.code}]: ${json.error.message}`);
    }

    return json.result;
  }
}
