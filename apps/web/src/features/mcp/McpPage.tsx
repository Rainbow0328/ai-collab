import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { Badge, Dialog, Field, EmptyState, Loading, pushToast, ConfirmDialog } from "@/components/ui";

const SERVERS_KEY = ["mcp", "servers"] as const;

export function McpPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const serversQuery = useQuery({
    queryKey: SERVERS_KEY,
    queryFn: () => api.mcpServers.list(),
  });

  const deleteServer = useMutation({
    mutationFn: (serverId: string) => api.mcpServers.delete(serverId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SERVERS_KEY });
      pushToast("已删除", "success");
    },
    onError: (e) => pushToast(e.message, "error"),
  });

  const servers = serversQuery.data ?? [];

  return (
    <>
      <PageHeader
        title="MCP 工具服务"
        subtitle={`已注册 ${servers.length} 个 MCP Server`}
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => serversQuery.refetch()}>刷新</button>
            <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              添加
            </button>
          </>
        }
      />
      <PageContainer>
        {serversQuery.isLoading ? (
          <Loading text="加载中…" />
        ) : servers.length === 0 ? (
          <EmptyState
            title="暂无 MCP Server"
            desc="添加外部 MCP Server 以扩展 AI 的工具能力"
            action={<button className="btn btn-primary" onClick={() => setShowAdd(true)}>添加 Server</button>}
          />
        ) : (
          <div style={{ display: "grid", gap: "var(--sp-3)", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))" }}>
            {servers.map((server) => (
              <div key={server.id} className="card card-hover" style={{ padding: "var(--sp-4)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "var(--sp-2)" }}>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ fontSize: "var(--fs-md)", fontWeight: 700, color: "var(--c-text-primary)" }}>{server.name}</h3>
                    <div style={{ display: "flex", gap: "var(--sp-1)", marginTop: "var(--sp-1)" }}>
                      <Badge variant={server.transport === "sse" ? "info" : "neutral"}>{server.transport}</Badge>
                      <Badge variant={server.enabled ? "success" : "neutral"} dot>{server.enabled ? "启用" : "禁用"}</Badge>
                      {server.toolCount > 0 && <Badge variant="accent">{server.toolCount} 工具</Badge>}
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setDeleteId(server.id)} title="删除">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  </button>
                </div>
                <p style={{ fontSize: "var(--fs-sm)", color: "var(--c-text-tertiary)", wordBreak: "break-all" }}>
                  {server.url}
                </p>
                {server.description && (
                  <p style={{ fontSize: "var(--fs-sm)", color: "var(--c-text-secondary)", marginTop: "var(--sp-2)" }}>
                    {server.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </PageContainer>

      <AddServerDialog open={showAdd} onClose={() => setShowAdd(false)} />
      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId) deleteServer.mutate(deleteId); }}
        title="删除 MCP Server"
        message="确定要删除此 MCP Server 吗？"
        confirmText="删除"
        danger
      />
    </>
  );
}

function AddServerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [transport, setTransport] = useState<"stdio" | "sse">("sse");

  const create = useMutation({
    mutationFn: () => api.mcpServers.create({ name: name.trim(), url: url.trim(), description: description.trim() || null, transport, enabled: true }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SERVERS_KEY });
      setName(""); setUrl(""); setDescription(""); setTransport("sse");
      pushToast("MCP Server 已添加", "success");
      onClose();
    },
    onError: (e) => pushToast(e.message, "error"),
  });

  return (
    <Dialog open={open} onClose={onClose} title="添加 MCP Server" width={480}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
        <Field label="名称" required>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="github-mcp" />
        </Field>
        <Field label="URL / 命令" required hint="SSE 填 http://…，STDIO 填命令路径">
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://127.0.0.1:3001/sse" />
        </Field>
        <Field label="传输方式">
          <select className="input" value={transport} onChange={(e) => setTransport(e.target.value as "stdio" | "sse")}>
            <option value="sse">SSE</option>
            <option value="stdio">STDIO</option>
          </select>
        </Field>
        <Field label="描述">
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="GitHub MCP Server" />
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--sp-2)" }}>
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button
            className="btn btn-primary"
            disabled={!name.trim() || !url.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "添加中…" : "添加"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
