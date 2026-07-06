import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api-client";

const mcpServersKey = ["mcp", "servers"] as const;

export function McpPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [transport, setTransport] = useState<"stdio" | "sse">("sse");

  const serversQuery = useQuery({
    queryKey: mcpServersKey,
    queryFn: () => api.mcpServers.list(),
  });

  const createServer = useMutation({
    mutationFn: () => api.mcpServers.create({ name: name.trim(), url: url.trim(), transport, enabled: true }),
    onSuccess: () => {
      setName("");
      setUrl("");
      void queryClient.invalidateQueries({ queryKey: mcpServersKey });
    },
  });

  const deleteServer = useMutation({
    mutationFn: (serverId: string) => api.mcpServers.delete(serverId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: mcpServersKey }),
  });

  const servers = serversQuery.data ?? [];

  return (
    <>
      <header className="workbench-topbar">
        <div>
          <div className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>Tools</div>
          <h1 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>MCP Servers</h1>
        </div>
        <button className="btn-secondary rounded-md border px-4 py-2 text-sm" onClick={() => void serversQuery.refetch()}>
          Refresh
        </button>
      </header>
      <main className="workbench-content overflow-auto p-4">
        <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className="panel">
            <div className="panel__header">
              <h2 className="panel__title">Add MCP Server</h2>
            </div>
            <div className="panel__body space-y-4">
              <Field label="Name">
                <input className="control-input w-full" value={name} onChange={(event) => setName(event.target.value)} placeholder="github-mcp" />
              </Field>
              <Field label="URL / Command">
                <input className="control-input w-full" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="http://127.0.0.1:3001/sse" />
              </Field>
              <Field label="Transport">
                <select className="control-input w-full" value={transport} onChange={(event) => setTransport(event.target.value as "stdio" | "sse")}>
                  <option value="sse">SSE</option>
                  <option value="stdio">STDIO</option>
                </select>
              </Field>
              <button
                className="btn-primary rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50"
                disabled={!name.trim() || !url.trim() || createServer.isPending}
                onClick={() => createServer.mutate()}
              >
                {createServer.isPending ? "Adding..." : "Add Server"}
              </button>
              {createServer.error && <ErrorText text={createServer.error.message} />}
            </div>
          </section>

          <section className="panel">
            <div className="panel__header">
              <h2 className="panel__title">Registered Servers</h2>
              <span className="text-sm" style={{ color: "var(--color-text-tertiary)" }}>{servers.length} servers</span>
            </div>
            <div className="panel__body">
              {serversQuery.isLoading ? (
                <EmptyText text="Loading MCP servers..." />
              ) : servers.length === 0 ? (
                <EmptyText text="No MCP server registered." />
              ) : (
                <div className="space-y-3">
                  {servers.map((server) => (
                    <article key={server.id} className="rounded-md border p-4" style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="text-base font-bold" style={{ color: "var(--color-text-primary)" }}>{server.name}</h3>
                          <p className="overflow-wrap-anywhere text-sm" style={{ color: "var(--color-text-secondary)" }}>{server.url}</p>
                          {server.description && <p className="mt-1 text-sm" style={{ color: "var(--color-text-tertiary)" }}>{server.description}</p>}
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-2">
                          <span className={server.enabled ? "badge badge-active" : "badge badge-offline"}>{server.enabled ? "enabled" : "disabled"}</span>
                          <span className="badge badge-working">{server.transport}</span>
                          <button className="btn-secondary rounded-md border px-3 py-1.5 text-xs" onClick={() => deleteServer.mutate(server.id)}>
                            Delete
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              {serversQuery.error && <ErrorText text={serversQuery.error.message} />}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>{label}</span>
      {children}
    </label>
  );
}

function EmptyText({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed p-8 text-center text-sm" style={{ borderColor: "var(--color-border)", color: "var(--color-text-tertiary)" }}>{text}</div>;
}

function ErrorText({ text }: { text: string }) {
  return <p className="mt-3 text-sm" style={{ color: "var(--color-error)" }}>{text}</p>;
}
