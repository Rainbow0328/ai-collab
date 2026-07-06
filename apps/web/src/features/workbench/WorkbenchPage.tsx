import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ConsoleMember, MessageRecord, WebAgentRuntime } from "@ai-collab/protocol";
import { useWebSocket } from "@/lib/websocket-client";
import { formatJson, formatMessageText, truncateText } from "./text";
import {
  getRuntimeForAgent,
  getSelectedSessionId,
  invalidateSession,
  useAddKnowledgeKeeperMutation,
  useConsoleQuery,
  useCreateHostSessionMutation,
  useEnsureHostRuntimeMutation,
  useMessagesQuery,
  useModelsQuery,
  useRuntimeCommandMutation,
  useRuntimesQuery,
  useSendHostMessageMutation,
  useSessionsQuery,
} from "./workbench-queries";

export function WorkbenchPage() {
  const queryClient = useQueryClient();
  const sessionsQuery = useSessionsQuery();
  const modelsQuery = useModelsQuery();
  const [explicitSessionId, setExplicitSessionId] = useState<string | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<MessageRecord | null>(null);

  const sessions = sessionsQuery.data ?? [];
  const sessionId = getSelectedSessionId(sessions, explicitSessionId);
  const consoleQuery = useConsoleQuery(sessionId);
  const messagesQuery = useMessagesQuery(sessionId);
  const runtimesQuery = useRuntimesQuery(sessionId);

  useWebSocket({
    enabled: Boolean(sessionId),
    sessionId: sessionId ?? undefined,
    onConsoleUpdate: () => invalidateSession(queryClient, sessionId),
    onInboxMessage: () => invalidateSession(queryClient, sessionId),
    onMessageClaimed: () => invalidateSession(queryClient, sessionId),
    onProgressUpdate: () => invalidateSession(queryClient, sessionId),
  });

  const consoleData = consoleQuery.data ?? null;
  const members = consoleData?.members ?? [];
  const messages = messagesQuery.data ?? [];
  const runtimes = runtimesQuery.data ?? [];
  const models = modelsQuery.data ?? [];
  const host = members.find((member) => member.role === "host") ?? null;
  const workers = members.filter((member) => member.role === "worker" || member.role === "knowledge_keeper");
  const selectedWorker = workers.find((member) => member.agentId === selectedWorkerId) ?? workers[0] ?? null;
  const hostRuntime = getRuntimeForAgent(runtimes, host?.agentId);
  const selectedWorkerRuntime = getRuntimeForAgent(runtimes, selectedWorker?.agentId);

  useEffect(() => {
    if (!selectedWorker || selectedWorker.agentId === selectedWorkerId) return;
    setSelectedWorkerId(selectedWorker.agentId);
  }, [selectedWorker, selectedWorkerId]);

  const hostMessages = useMemo(
    () => filterHostMessages(messages, host, members),
    [messages, host, members]
  );
  const workerMessages = useMemo(
    () => selectedWorker ? messages.filter((message) => message.fromAgentId === selectedWorker.agentId || message.toAgentId === selectedWorker.agentId) : [],
    [messages, selectedWorker]
  );

  const loading = sessionsQuery.isLoading || consoleQuery.isLoading || messagesQuery.isLoading;

  return (
    <>
      <header className="workbench-topbar">
        <div className="min-w-0">
          <div className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>Collaborative Session Workbench</div>
          <div className="flex items-center gap-3">
            <strong className="truncate text-xl" style={{ color: "var(--color-text-primary)" }}>
              {consoleData?.session.name ?? sessions.find((session) => session.id === sessionId)?.name ?? "No active session"}
            </strong>
            {hostRuntime && <RuntimeBadge runtime={hostRuntime} />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="control-input min-w-[220px]"
            value={sessionId ?? ""}
            onChange={(event) => setExplicitSessionId(event.target.value || null)}
          >
            {sessions.length === 0 ? <option value="">No sessions</option> : null}
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>{session.name}</option>
            ))}
          </select>
          <CreateHostButton models={models} />
        </div>
      </header>

      <main className="workbench-content">
        {loading && !consoleData ? (
          <CenteredState title="Loading workbench" detail="Reading sessions, members, runtimes, and message history." />
        ) : !sessionId || !consoleData ? (
          <CenteredState title="No session" detail="Create a Web Host session to start the workbench." />
        ) : (
          <div className="workbench-grid">
            <HostPane
              host={host}
              hostRuntime={hostRuntime}
              messages={hostMessages}
              models={models}
              sessionId={sessionId}
              onSelectMessage={setSelectedMessage}
            />
            <WorkersPane
              workers={workers}
              runtimes={runtimes}
              models={models}
              sessionId={sessionId}
              selectedWorkerId={selectedWorker?.agentId ?? null}
              onSelectWorker={setSelectedWorkerId}
            />
            <InspectorPane
              worker={selectedWorker}
              runtime={selectedWorkerRuntime}
              messages={workerMessages}
              selectedMessage={selectedMessage}
              onSelectMessage={setSelectedMessage}
            />
          </div>
        )}
      </main>
    </>
  );
}

function CreateHostButton({ models }: { models: Array<{ id: string; name: string; modelId: string }> }) {
  const [open, setOpen] = useState(false);
  const [sessionName, setSessionName] = useState(`web-session-${new Date().toISOString().slice(0, 10)}`);
  const [modelConfigId, setModelConfigId] = useState("");
  const createHost = useCreateHostSessionMutation();
  const firstModelId = models[0]?.id ?? "";

  useEffect(() => {
    if (!modelConfigId && firstModelId) setModelConfigId(firstModelId);
  }, [firstModelId, modelConfigId]);

  return (
    <>
      <button type="button" className="btn-primary rounded-md border px-4 py-2 text-sm font-semibold" onClick={() => setOpen(true)}>
        New Host
      </button>
      {open && (
        <Dialog title="Create Web Host" onClose={() => setOpen(false)}>
          <div className="space-y-4">
            <Field label="Session name">
              <input className="control-input w-full" value={sessionName} onChange={(event) => setSessionName(event.target.value)} />
            </Field>
            <Field label="Model">
              <ModelSelect models={models} value={modelConfigId} onChange={setModelConfigId} />
            </Field>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary rounded-md border px-4 py-2 text-sm" type="button" onClick={() => setOpen(false)}>Cancel</button>
              <button
                className="btn-primary rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50"
                type="button"
                disabled={!sessionName.trim() || !modelConfigId || createHost.isPending}
                onClick={() => {
                  createHost.mutate({ sessionName: sessionName.trim(), modelConfigId }, { onSuccess: () => setOpen(false) });
                }}
              >
                {createHost.isPending ? "Creating..." : "Create"}
              </button>
            </div>
            {createHost.error && <p className="text-sm" style={{ color: "var(--color-error)" }}>{createHost.error.message}</p>}
          </div>
        </Dialog>
      )}
    </>
  );
}

function HostPane({
  host,
  hostRuntime,
  messages,
  models,
  sessionId,
  onSelectMessage,
}: {
  host: ConsoleMember | null;
  hostRuntime: WebAgentRuntime | null;
  messages: MessageRecord[];
  models: Array<{ id: string; name: string; modelId: string }>;
  sessionId: string;
  onSelectMessage: (message: MessageRecord) => void;
}) {
  const [draft, setDraft] = useState("");
  const [modelConfigId, setModelConfigId] = useState(models[0]?.id ?? "");
  const ensureRuntime = useEnsureHostRuntimeMutation(sessionId);
  const runtimeCommand = useRuntimeCommandMutation(sessionId);
  const sendMessage = useSendHostMessageMutation(sessionId);

  useEffect(() => {
    if (!modelConfigId && models[0]?.id) setModelConfigId(models[0].id);
  }, [modelConfigId, models]);

  return (
    <section className="workbench-pane">
      <PaneHeader
        title={host ? `${host.displayName} · Host` : "Host"}
        subtitle={hostRuntime ? "Web Host runtime is controlled by the backend." : host ? "Host is present. Create a web runtime to take over from the browser." : "No Host in this session."}
        extra={hostRuntime ? <RuntimeControls runtime={hostRuntime} onCommand={(command) => runtimeCommand.mutate({ runtimeId: hostRuntime.id, command })} /> : null}
      />
      <div className="workbench-pane__body space-y-2">
        {!host ? (
          <EmptyBlock text="Create or select a session with a Host." />
        ) : !hostRuntime ? (
          <div className="space-y-3">
            <EmptyBlock text="This Host is visible, but it is not yet a backend web runtime." />
            <ModelSelect models={models} value={modelConfigId} onChange={setModelConfigId} />
            <button
              type="button"
              className="btn-primary rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50"
              disabled={!modelConfigId || ensureRuntime.isPending}
              onClick={() => ensureRuntime.mutate({ host, modelConfigId })}
            >
              {ensureRuntime.isPending ? "Binding..." : "Enable Web Host"}
            </button>
          </div>
        ) : messages.length === 0 ? (
          <EmptyBlock text="No Host messages yet." />
        ) : (
          messages.map((message) => (
            <MessageCard key={message.id} message={message} members={[host]} onSelect={() => onSelectMessage(message)} />
          ))
        )}
      </div>
      <div className="workbench-pane__footer">
        <div className="flex gap-2">
          <textarea
            className="control-input min-h-[76px] flex-1 resize-none"
            placeholder={hostRuntime ? "Send a message to Host..." : "Enable Web Host before sending messages..."}
            value={draft}
            disabled={!host || !hostRuntime}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (host && draft.trim()) {
                  sendMessage.mutate({ hostAgentId: host.agentId, content: draft.trim() }, { onSuccess: () => setDraft("") });
                }
              }
            }}
          />
          <button
            type="button"
            className="btn-primary self-end rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50"
            disabled={!host || !hostRuntime || !draft.trim() || sendMessage.isPending}
            onClick={() => host && sendMessage.mutate({ hostAgentId: host.agentId, content: draft.trim() }, { onSuccess: () => setDraft("") })}
          >
            Send
          </button>
        </div>
        {sendMessage.error && <p className="mt-2 text-sm" style={{ color: "var(--color-error)" }}>{sendMessage.error.message}</p>}
      </div>
    </section>
  );
}

function WorkersPane({
  workers,
  runtimes,
  models,
  sessionId,
  selectedWorkerId,
  onSelectWorker,
}: {
  workers: ConsoleMember[];
  runtimes: WebAgentRuntime[];
  models: Array<{ id: string; name: string; modelId: string }>;
  sessionId: string;
  selectedWorkerId: string | null;
  onSelectWorker: (agentId: string) => void;
}) {
  const [modelConfigId, setModelConfigId] = useState(models[0]?.id ?? "");
  const addKeeper = useAddKnowledgeKeeperMutation(sessionId);
  const runtimeCommand = useRuntimeCommandMutation(sessionId);
  const hasKeeper = workers.some((worker) => worker.role === "knowledge_keeper");

  useEffect(() => {
    if (!modelConfigId && models[0]?.id) setModelConfigId(models[0].id);
  }, [modelConfigId, models]);

  return (
    <section className="workbench-pane">
      <PaneHeader
        title="Session Workers"
        subtitle="AI IDE workers and web workers share one session worker list."
      />
      <div className="workbench-pane__body space-y-2">
        {workers.length === 0 ? (
          <EmptyBlock text="No workers have joined this session." />
        ) : (
          workers.map((worker) => {
            const runtime = getRuntimeForAgent(runtimes, worker.agentId);
            return (
              <button
                key={worker.agentId}
                type="button"
                className={`worker-button ${selectedWorkerId === worker.agentId ? "worker-button--selected" : ""}`}
                onClick={() => onSelectWorker(worker.agentId)}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <strong className="block truncate text-sm">{worker.displayName || worker.agentName}</strong>
                    <span className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>{worker.role}</span>
                  </div>
                  <StatusBadge status={worker.status} />
                </div>
                <div className="message-text text-xs" style={{ color: "var(--color-text-secondary)" }}>
                  {worker.duty || "No role description."}
                </div>
                {runtime && (
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <RuntimeBadge runtime={runtime} />
                    <RuntimeControls runtime={runtime} onCommand={(command) => runtimeCommand.mutate({ runtimeId: runtime.id, command })} compact />
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
      <div className="workbench-pane__footer space-y-2">
        <div className="text-xs font-semibold" style={{ color: "var(--color-text-secondary)" }}>Add Worker</div>
        <div className="flex gap-2">
          <ModelSelect models={models} value={modelConfigId} onChange={setModelConfigId} />
          <button
            type="button"
            className="btn-primary whitespace-nowrap rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50"
            disabled={!modelConfigId || addKeeper.isPending || hasKeeper}
            onClick={() => addKeeper.mutate({ modelConfigId })}
          >
            {hasKeeper ? "Keeper Added" : addKeeper.isPending ? "Adding..." : "Add Keeper"}
          </button>
        </div>
        {addKeeper.error && <p className="text-sm" style={{ color: "var(--color-error)" }}>{addKeeper.error.message}</p>}
      </div>
    </section>
  );
}

function InspectorPane({
  worker,
  runtime,
  messages,
  selectedMessage,
  onSelectMessage,
}: {
  worker: ConsoleMember | null;
  runtime: WebAgentRuntime | null;
  messages: MessageRecord[];
  selectedMessage: MessageRecord | null;
  onSelectMessage: (message: MessageRecord) => void;
}) {
  const inspected = selectedMessage ?? messages[0] ?? null;
  return (
    <section className="workbench-pane">
      <PaneHeader
        title={worker ? `${worker.displayName || worker.agentName} History` : "Worker History"}
        subtitle={runtime?.currentStep || worker?.duty || "Select a worker to inspect messages."}
        extra={runtime ? <RuntimeBadge runtime={runtime} /> : null}
      />
      <div className="workbench-pane__body space-y-3">
        {messages.length === 0 ? (
          <EmptyBlock text="No messages for this worker yet." />
        ) : (
          <div className="space-y-2">
            {messages.map((message) => (
              <MessageCard key={message.id} message={message} members={worker ? [worker] : []} selected={inspected?.id === message.id} onSelect={() => onSelectMessage(message)} />
            ))}
          </div>
        )}
        {inspected && (
          <div className="rounded-md border p-3" style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}>
            <div className="mb-2 text-xs font-bold" style={{ color: "var(--color-text-secondary)" }}>Selected Message</div>
            <div className="message-text">{formatMessageText(inspected.payload) || "No readable content."}</div>
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-semibold" style={{ color: "var(--color-text-secondary)" }}>Raw Payload</summary>
              <pre className="mt-2 overflow-auto rounded-md p-3 text-xs" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
                {formatJson(inspected.payload)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </section>
  );
}

function PaneHeader({ title, subtitle, extra }: { title: string; subtitle: string; extra?: React.ReactNode }) {
  return (
    <div className="workbench-pane__header">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold" style={{ color: "var(--color-text-primary)" }}>{title}</h2>
          <p className="mt-1 line-clamp-2 text-xs" style={{ color: "var(--color-text-secondary)" }}>{subtitle}</p>
        </div>
        {extra && <div className="flex-shrink-0">{extra}</div>}
      </div>
    </div>
  );
}

function MessageCard({ message, members, selected, onSelect }: { message: MessageRecord; members: ConsoleMember[]; selected?: boolean; onSelect: () => void }) {
  const role = members.find((member) => member.agentId === message.fromAgentId)?.role;
  const variant = message.type === "error" || message.processingStatus === "failed"
    ? "message-card--error"
    : role === "host"
      ? "message-card--host"
      : role === "knowledge_keeper"
        ? "message-card--keeper"
        : role === "worker"
          ? "message-card--worker"
          : "";
  const text = formatMessageText(message.payload);
  return (
    <button type="button" className={`message-card ${variant}`} style={selected ? { outline: "2px solid var(--color-accent)" } : undefined} onClick={onSelect}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <StatusBadge status={message.processingStatus === "claimed" ? "working" : message.processingStatus} text={message.type} />
        <span className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>{formatTime(message.createdAt)}</span>
      </div>
      <div className="message-text">{text ? truncateText(text) : "No readable message content."}</div>
    </button>
  );
}

function RuntimeBadge({ runtime }: { runtime: WebAgentRuntime }) {
  return <StatusBadge status={runtime.status === "running" ? "working" : runtime.status} text={runtime.status} />;
}

function StatusBadge({ status, text }: { status: string; text?: string }) {
  const variant = getStatusVariant(status);
  return (
    <span className={`badge ${variant}`}>
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: "currentColor" }}
      />
      {text || status}
    </span>
  );
}

function getStatusVariant(status: string): string {
  if (["active", "online", "completed", "processed"].includes(status)) return "badge-active";
  if (["working", "running", "claimed"].includes(status)) return "badge-working";
  if (["waiting", "pending", "idle", "paused", "stopped"].includes(status)) return "badge-warning";
  if (["error", "failed", "offline"].includes(status)) return "badge-error";
  return "badge-offline";
}

function RuntimeControls({ runtime, onCommand, compact = false }: { runtime: WebAgentRuntime; onCommand: (command: "start" | "pause" | "stop") => void; compact?: boolean }) {
  const buttonClass = compact ? "rounded border px-2 py-1 text-xs" : "rounded-md border px-3 py-1.5 text-xs font-semibold";
  return (
    <div className="flex items-center gap-1">
      {runtime.status !== "running" ? (
        <button type="button" className={`btn-primary ${buttonClass}`} onClick={() => onCommand("start")}>Start</button>
      ) : (
        <button type="button" className={`btn-secondary ${buttonClass}`} onClick={() => onCommand("pause")}>Pause</button>
      )}
      <button type="button" className={`btn-secondary ${buttonClass}`} onClick={() => onCommand("stop")}>Stop</button>
    </div>
  );
}

function ModelSelect({ models, value, onChange }: { models: Array<{ id: string; name: string; modelId: string }>; value: string; onChange: (value: string) => void }) {
  return (
    <select className="control-input min-w-0 flex-1" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Select model...</option>
      {models.map((model) => (
        <option key={model.id} value={model.id}>{model.name} ({model.modelId})</option>
      ))}
    </select>
  );
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 460 }} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b p-4" style={{ borderColor: "var(--color-border)" }}>
          <h2 className="text-base font-bold">{title}</h2>
          <button type="button" className="btn-secondary rounded-md border px-2 py-1 text-sm" onClick={onClose}>Close</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
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

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed p-6 text-center text-sm" style={{ borderColor: "var(--color-border)", color: "var(--color-text-tertiary)" }}>
      {text}
    </div>
  );
}

function CenteredState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>{title}</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>{detail}</p>
      </div>
    </div>
  );
}

function filterHostMessages(messages: MessageRecord[], host: ConsoleMember | null, members: ConsoleMember[]): MessageRecord[] {
  if (!host) return [];
  const roleById = new Map(members.map((member) => [member.agentId, member.role]));
  return messages.filter((message) => {
    const fromRole = roleById.get(message.fromAgentId);
    const toRole = message.toAgentId ? roleById.get(message.toAgentId) : null;
    return (
      message.fromAgentId === host.agentId ||
      message.toAgentId === host.agentId ||
      fromRole === "host" ||
      ((fromRole === "worker" || fromRole === "knowledge_keeper") && (!message.toAgentId || toRole === "host"))
    );
  });
}

function formatTime(value?: string | null): string {
  return value ? new Date(value).toLocaleString("zh-CN") : "-";
}
