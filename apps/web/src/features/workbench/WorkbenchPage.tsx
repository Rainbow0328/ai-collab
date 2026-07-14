import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  ConsoleMember,
  ConsoleTaskThread,
  MessageRecord,
  WebAgentRuntime,
} from "@ai-collab/protocol";
import { useWebSocket } from "@/lib/websocket-client";
import { formatMessageText, formatJson, formatTime, formatTimeFull, truncateText } from "./text";
import {
  getRuntimeForAgent,
  getSelectedSessionId,
  invalidateSession,
  useAddKnowledgeKeeperMutation,
  useConsoleQuery,
  useCreateHostSessionMutation,
  useDeleteRuntimeMutation,
  useEnsureHostRuntimeMutation,
  useMessagesQuery,
  useModelsQuery,
  useRuntimeCommandMutation,
  useRuntimesQuery,
  useSendHostMessageMutation,
  useSessionsQuery,
} from "./workbench-queries";
import { PageHeader } from "@/components/PageHeader";
import { Badge, StatusBadge, RoleBadge, Dialog, Field, EmptyState, Loading, pushToast, ConfirmDialog } from "@/components/ui";

/* ==================== Workbench Page ==================== */

export function WorkbenchPage() {
  const qc = useQueryClient();
  const sessionsQuery = useSessionsQuery();
  const modelsQuery = useModelsQuery();
  const [explicitSessionId, setExplicitSessionId] = useState<string | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [detailMessage, setDetailMessage] = useState<MessageRecord | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const sessions = sessionsQuery.data ?? [];
  const sessionId = getSelectedSessionId(sessions, explicitSessionId);
  const consoleQuery = useConsoleQuery(sessionId);
  const messagesQuery = useMessagesQuery(sessionId);
  const runtimesQuery = useRuntimesQuery(sessionId);

  useWebSocket({
    enabled: Boolean(sessionId),
    sessionId: sessionId ?? undefined,
    onConsoleUpdate: () => invalidateSession(qc, sessionId),
    onInboxMessage: () => invalidateSession(qc, sessionId),
    onMessageClaimed: () => invalidateSession(qc, sessionId),
    onProgressUpdate: () => invalidateSession(qc, sessionId),
  });

  const consoleData = consoleQuery.data ?? null;
  const messages = messagesQuery.data ?? [];
  const runtimes = runtimesQuery.data ?? [];
  const models = modelsQuery.data ?? [];

  const members = consoleData?.members ?? [];
  const host = members.find((m) => m.role === "host") ?? null;
  const workers = members.filter((m) => m.role === "worker" || m.role === "knowledge_keeper");
  const selectedWorker = workers.find((w) => w.agentId === selectedWorkerId) ?? workers[0] ?? null;
  const hostRuntime = getRuntimeForAgent(runtimes, host?.agentId);
  const selectedWorkerRuntime = getRuntimeForAgent(runtimes, selectedWorker?.agentId);
  const taskThreads = consoleData?.taskThreads ?? [];

  useEffect(() => {
    if (selectedWorker && selectedWorker.agentId !== selectedWorkerId) {
      setSelectedWorkerId(selectedWorker.agentId);
    }
  }, [selectedWorker, selectedWorkerId]);

  const agentMap = useMemo(() => new Map(members.map((m) => [m.agentId, m])), [members]);

  const hostMessages = useMemo(
    () => filterHostMessages(messages, host, members),
    [messages, host, members]
  );
  const workerMessages = useMemo(
    () => selectedWorker
      ? messages.filter((m) => m.fromAgentId === selectedWorker.agentId || m.toAgentId === selectedWorker.agentId)
      : [],
    [messages, selectedWorker]
  );

  const loading = sessionsQuery.isLoading || consoleQuery.isLoading || messagesQuery.isLoading;

  return (
    <>
      <PageHeader
        title={consoleData?.session.name ?? "协作工作台"}
        subtitle={host ? `${host.displayName} · ${members.length} 成员 · ${taskThreads.length} 任务链` : "未选择会话"}
        actions={
          <>
            <select
              className="input"
              style={{ width: 200 }}
              value={sessionId ?? ""}
              onChange={(e) => setExplicitSessionId(e.target.value || null)}
            >
              {sessions.length === 0 && <option value="">暂无会话</option>}
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={() => setShowCreateDialog(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              新建会话
            </button>
          </>
        }
      />

      {loading && !consoleData ? (
        <Loading text="正在加载工作台数据…" />
      ) : !sessionId || !consoleData ? (
        <EmptyState
          icon={<EmptyIcon />}
          title="暂无活跃会话"
          desc="创建一个新的协作会话以开始工作"
          action={
            <button className="btn btn-primary" onClick={() => setShowCreateDialog(true)}>
              新建会话
            </button>
          }
        />
      ) : (
        <div style={{
          flex: 1,
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 300px minmax(0, 1fr)",
          gap: "1px",
          background: "var(--c-border)",
        }}>
          {/* Left: Host Panel */}
          <HostPanel
            host={host}
            hostRuntime={hostRuntime}
            messages={hostMessages}
            models={models}
            sessionId={sessionId}
            onOpenDetail={setDetailMessage}
          />

          {/* Middle: Workers Panel */}
          <WorkersPanel
            workers={workers}
            runtimes={runtimes}
            models={models}
            sessionId={sessionId}
            selectedWorkerId={selectedWorker?.agentId ?? null}
            onSelectWorker={setSelectedWorkerId}
          />

          {/* Right: Inspector Panel */}
          <InspectorPanel
            worker={selectedWorker}
            runtime={selectedWorkerRuntime}
            messages={workerMessages}
            agentMap={agentMap}
            onOpenDetail={setDetailMessage}
          />
        </div>
      )}

      {/* Message Detail Dialog */}
      <MessageDetailDialog
        message={detailMessage}
        allMessages={messages}
        agentMap={agentMap}
        taskThreads={taskThreads}
        onClose={() => setDetailMessage(null)}
      />

      <CreateSessionDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        models={models}
        onCreated={(sid) => setExplicitSessionId(sid)}
      />
    </>
  );
}

/* ==================== Host Panel ==================== */

function HostPanel({
  host,
  hostRuntime,
  messages,
  models,
  sessionId,
  onOpenDetail,
}: {
  host: ConsoleMember | null;
  hostRuntime: WebAgentRuntime | null;
  messages: MessageRecord[];
  models: Array<{ id: string; name: string; modelId: string }>;
  sessionId: string;
  onOpenDetail: (m: MessageRecord) => void;
}) {
  const [draft, setDraft] = useState("");
  const [modelConfigId, setModelConfigId] = useState("");
  const ensureRuntime = useEnsureHostRuntimeMutation(sessionId);
  const runtimeCommand = useRuntimeCommandMutation(sessionId);
  const sendMessage = useSendHostMessageMutation(sessionId);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!modelConfigId && models[0]?.id) setModelConfigId(models[0].id);
  }, [modelConfigId, models]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const hasHost = Boolean(host);
  const hasHostRuntime = Boolean(hostRuntime);

  const handleSend = () => {
    if (!host || !draft.trim()) return;
    sendMessage.mutate(
      { hostAgentId: host.agentId, content: draft.trim() },
      {
        onSuccess: () => { setDraft(""); pushToast("消息已发送", "success"); },
        onError: (e) => pushToast(e.message, "error"),
      }
    );
  };

  return (
    <section style={{ background: "var(--c-bg)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Panel header */}
      <div style={{
        padding: "var(--sp-3) var(--sp-4)",
        borderBottom: "1px solid var(--c-border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
          <RoleBadge role="host" />
          <span style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--c-text-primary)" }}>
            {host?.displayName ?? "Host"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
          {hostRuntime && (
            <>
              <StatusBadge status={hostRuntime.status} label={hostRuntime.status} />
              <RuntimeControls runtime={hostRuntime} onCommand={(c) => runtimeCommand.mutate({ runtimeId: hostRuntime.id, command: c })} compact />
            </>
          )}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: "auto", padding: "var(--sp-3)" }}>
        {!hasHost ? (
          <EmptyState title="暂无 Host" desc="创建会话后将自动出现 Host" />
        ) : !hasHostRuntime ? (
          <div style={{ padding: "var(--sp-4)", textAlign: "center" }}>
            <p style={{ fontSize: "var(--fs-sm)", color: "var(--c-text-tertiary)", marginBottom: "var(--sp-3)" }}>
              Host 已就位，但尚未启用 Web 运行时
            </p>
            <select className="input" style={{ marginBottom: "var(--sp-3)", maxWidth: 300 }} value={modelConfigId} onChange={(e) => setModelConfigId(e.target.value)}>
              {models.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.modelId})</option>)}
            </select>
            <div>
              <button
                className="btn btn-primary"
                disabled={!modelConfigId || ensureRuntime.isPending}
                onClick={() => ensureRuntime.mutate({ host: host!, modelConfigId }, {
                  onSuccess: () => pushToast("Web Host 已启用", "success"),
                  onError: (e) => pushToast(e.message, "error"),
                })}
              >
                {ensureRuntime.isPending ? "启用中…" : "启用 Web Host"}
              </button>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <EmptyState title="暂无消息" desc="在下方输入框中向 Host 发送消息" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
            {messages.map((msg) => (
              <MessageCard
                key={msg.id}
                message={msg}
                role="host"
                onOpenDetail={() => onOpenDetail(msg)}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      {hasHost && hasHostRuntime && (
        <div style={{
          padding: "var(--sp-3)",
          borderTop: "1px solid var(--c-border)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", gap: "var(--sp-2)" }}>
            <textarea
              className="input"
              style={{ minHeight: 60, resize: "none", flex: 1 }}
              placeholder="向 Host 发送消息…  (Enter 发送, Shift+Enter 换行)"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <button
              className="btn btn-primary"
              style={{ alignSelf: "flex-end" }}
              disabled={!draft.trim() || sendMessage.isPending}
              onClick={handleSend}
            >
              {sendMessage.isPending ? "发送中…" : "发送"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ==================== Workers Panel ==================== */

function WorkersPanel({
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
  onSelectWorker: (id: string) => void;
}) {
  const [modelConfigId, setModelConfigId] = useState("");
  const [showDeleteId, setShowDeleteId] = useState<string | null>(null);
  const addKeeper = useAddKnowledgeKeeperMutation(sessionId);
  const runtimeCommand = useRuntimeCommandMutation(sessionId);
  const deleteRuntime = useDeleteRuntimeMutation(sessionId);
  const hasKeeper = workers.some((w) => w.role === "knowledge_keeper");

  useEffect(() => {
    if (!modelConfigId && models[0]?.id) setModelConfigId(models[0].id);
  }, [modelConfigId, models]);

  return (
    <>
      <section style={{ background: "var(--c-bg-elevated)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{
          padding: "var(--sp-3) var(--sp-4)",
          borderBottom: "1px solid var(--c-border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div>
            <span style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--c-text-primary)" }}>
              会话成员
            </span>
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-tertiary)", marginLeft: "var(--sp-2)" }}>
              {workers.length} 人
            </span>
          </div>
        </div>

        {/* Worker list */}
        <div style={{ flex: 1, overflow: "auto", padding: "var(--sp-2)" }}>
          {workers.length === 0 ? (
            <EmptyState title="暂无成员" desc="其他 AI 通过 IDE/CLI 加入会话" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)" }}>
              {workers.map((worker) => {
                const runtime = getRuntimeForAgent(runtimes, worker.agentId);
                const isSelected = selectedWorkerId === worker.agentId;
                return (
                  <div
                    key={worker.agentId}
                    onClick={() => onSelectWorker(worker.agentId)}
                    style={{
                      padding: "var(--sp-3)",
                      borderRadius: "var(--r-md)",
                      border: isSelected ? "1px solid var(--c-accent)" : "1px solid transparent",
                      background: isSelected ? "var(--c-accent-subtle)" : "transparent",
                      cursor: "pointer",
                      transition: "all var(--t-fast)",
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--c-bg-hover)"; }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                  >
                    {/* Top row: name + status */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--sp-1)" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontSize: "var(--fs-sm)", fontWeight: 600,
                          color: "var(--c-text-primary)",
                          display: "flex", alignItems: "center", gap: "var(--sp-2)",
                        }}>
                          <span className="truncate">{worker.displayName || worker.agentName}</span>
                          <RoleBadge role={worker.role} />
                        </div>
                        {worker.duty && (
                          <div style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-tertiary)", marginTop: "2px" }}>
                            {worker.duty}
                          </div>
                        )}
                      </div>
                      <StatusBadge status={worker.status} />
                    </div>

                    {/* Current task / latest report */}
                    {worker.currentTask && (
                      <div style={{
                        marginTop: "var(--sp-2)", padding: "var(--sp-2)",
                        borderRadius: "var(--r-sm)",
                        background: "var(--c-bg-subtle)",
                        fontSize: "var(--fs-xs)", color: "var(--c-text-secondary)",
                      }}>
                        <div style={{ fontWeight: 600, marginBottom: "2px", color: "var(--c-text-tertiary)" }}>当前任务</div>
                        <div className="message-content" style={{ fontSize: "var(--fs-xs)" }}>
                          {truncateText(worker.currentTask.content || worker.currentTask.result || "—", 120)}
                        </div>
                      </div>
                    )}
                    {worker.latestReport && !worker.currentTask && (
                      <div style={{
                        marginTop: "var(--sp-2)", padding: "var(--sp-2)",
                        borderRadius: "var(--r-sm)",
                        background: "var(--c-bg-subtle)",
                        fontSize: "var(--fs-xs)", color: "var(--c-text-secondary)",
                      }}>
                        <div style={{ fontWeight: 600, marginBottom: "2px", color: "var(--c-text-tertiary)" }}>最新回报</div>
                        <div className="message-content" style={{ fontSize: "var(--fs-xs)" }}>
                          {truncateText(worker.latestReport.result || worker.latestReport.content || "—", 120)}
                        </div>
                      </div>
                    )}

                    {/* Stats row */}
                    <div style={{ display: "flex", gap: "var(--sp-3)", marginTop: "var(--sp-2)", fontSize: "var(--fs-xs)", color: "var(--c-text-tertiary)" }}>
                      {worker.pendingCount > 0 && <span>待处理 {worker.pendingCount}</span>}
                      {worker.claimedCount > 0 && <span>已领取 {worker.claimedCount}</span>}
                      {worker.lastHeartbeatAt && <span>{formatTime(worker.lastHeartbeatAt)}</span>}
                    </div>

                    {/* Runtime controls */}
                    {runtime && (
                      <div style={{
                        marginTop: "var(--sp-2)",
                        paddingTop: "var(--sp-2)",
                        borderTop: "1px solid var(--c-border-subtle)",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                      }}>
                        <StatusBadge status={runtime.status} label={`运行时: ${runtime.status}`} />
                        {worker.role === "knowledge_keeper" ? (
                          <div style={{ display: "flex", gap: "var(--sp-1)" }}>
                            <RuntimeControls runtime={runtime} onCommand={(c) => runtimeCommand.mutate({ runtimeId: runtime.id, command: c })} compact />
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={(e) => { e.stopPropagation(); setShowDeleteId(runtime.id); }} title="删除运行时">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-tertiary)" }}>
                            IDE 控制
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add Keeper */}
        <div style={{
          padding: "var(--sp-3)",
          borderTop: "1px solid var(--c-border)",
          flexShrink: 0,
        }}>
          <div style={{ fontSize: "var(--fs-xs)", fontWeight: 600, color: "var(--c-text-tertiary)", marginBottom: "var(--sp-2)" }}>
            添加知识库维护者
          </div>
          <div style={{ display: "flex", gap: "var(--sp-2)" }}>
            <select className="input" value={modelConfigId} onChange={(e) => setModelConfigId(e.target.value)}>
              {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <button
              className="btn btn-secondary"
              disabled={!modelConfigId || addKeeper.isPending || hasKeeper}
              onClick={() => addKeeper.mutate({ modelConfigId }, {
                onSuccess: () => pushToast("Knowledge Keeper 已添加", "success"),
                onError: (e) => pushToast(e.message, "error"),
              })}
            >
              {hasKeeper ? "已添加" : addKeeper.isPending ? "添加中…" : "添加"}
            </button>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={showDeleteId !== null}
        onClose={() => setShowDeleteId(null)}
        onConfirm={() => {
          if (showDeleteId) deleteRuntime.mutate(showDeleteId, {
            onSuccess: () => pushToast("运行时已删除", "success"),
            onError: (e) => pushToast(e.message, "error"),
          });
        }}
        title="删除运行时"
        message="确定要删除此运行时吗？此操作不可撤销。"
        confirmText="删除"
        danger
      />
    </>
  );
}

/* ==================== Inspector Panel ==================== */

function InspectorPanel({
  worker,
  runtime,
  messages,
  agentMap,
  onOpenDetail,
}: {
  worker: ConsoleMember | null;
  runtime: WebAgentRuntime | null;
  messages: MessageRecord[];
  agentMap: Map<string, ConsoleMember>;
  onOpenDetail: (m: MessageRecord) => void;
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <section style={{ background: "var(--c-bg)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "var(--sp-3) var(--sp-4)",
        borderBottom: "1px solid var(--c-border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
          {worker && <RoleBadge role={worker.role} />}
          <span style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--c-text-primary)" }}>
            {worker ? `${worker.displayName || worker.agentName} · 消息历史` : "消息详情"}
          </span>
        </div>
        {runtime && <StatusBadge status={runtime.status} />}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: "auto", padding: "var(--sp-3)" }}>
        {!worker ? (
          <EmptyState title="选择一个成员" desc="点击中间面板的成员以查看消息历史" />
        ) : messages.length === 0 ? (
          <EmptyState title="暂无消息" desc="此成员还没有消息记录" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
            {messages.map((msg) => {
              const fromMember = agentMap.get(msg.fromAgentId);
              return (
                <MessageCard
                  key={msg.id}
                  message={msg}
                  role={worker.role}
                  fromName={fromMember?.displayName ?? msg.fromAgentId}
                  onOpenDetail={() => onOpenDetail(msg)}
                />
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
    </section>
  );
}

/* ==================== Message Card ==================== */

function MessageCard({
  message,
  role,
  fromName,
  onOpenDetail,
}: {
  message: MessageRecord;
  role: string;
  fromName?: string;
  onOpenDetail: () => void;
}) {
  const isError = message.type === "error" || message.processingStatus === "failed";
  const text = formatMessageText(message.payload);

  return (
    <div
      style={{
        padding: "var(--sp-3)",
        borderRadius: "var(--r-md)",
        border: "1px solid var(--c-border-subtle)",
        background: "var(--c-bg-elevated)",
        transition: "border-color var(--t-fast), box-shadow var(--t-fast)",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--c-border)"; e.currentTarget.style.boxShadow = "var(--shadow-xs)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--c-border-subtle)"; e.currentTarget.style.boxShadow = "none"; }}
    >
      {/* Top row */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: "var(--sp-2)",
        marginBottom: "var(--sp-1)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", minWidth: 0 }}>
          {isError ? (
            <Badge variant="error" dot>{message.type}</Badge>
          ) : (
            <Badge variant={role === "host" ? "accent" : role === "knowledge_keeper" ? "success" : "info"} dot>
              {message.type}
            </Badge>
          )}
          {fromName && (
            <span style={{ fontSize: "var(--fs-xs)", fontWeight: 600, color: "var(--c-text-secondary)" }} className="truncate">
              {fromName}
            </span>
          )}
          <span style={{
            fontSize: "var(--fs-xs)", color: "var(--c-text-tertiary)",
            padding: "1px var(--sp-1)", borderRadius: "var(--r-xs)",
            background: "var(--c-bg-subtle)",
          }}>
            {message.processingStatus}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", flexShrink: 0 }}>
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-tertiary)" }}>
            {formatTime(message.createdAt)}
          </span>
          {/* Detail button */}
          <button
            className="btn-link"
            onClick={(e) => { e.stopPropagation(); onOpenDetail(); }}
            title="查看消息详情"
          >
            详情
          </button>
        </div>
      </div>
      {/* Content */}
      <div className="message-content" style={{ color: "var(--c-text-secondary)" }}>
        {text ? truncateText(text, 280) : "无可读内容"}
      </div>
    </div>
  );
}

/* ==================== Message Detail Dialog ==================== */

function MessageDetailDialog({
  message,
  allMessages,
  agentMap,
  taskThreads,
  onClose,
}: {
  message: MessageRecord | null;
  allMessages: MessageRecord[];
  agentMap: Map<string, ConsoleMember>;
  taskThreads: ConsoleTaskThread[];
  onClose: () => void;
}) {
  if (!message) return null;

  const fromMember = agentMap.get(message.fromAgentId);
  const toMember = message.toAgentId ? agentMap.get(message.toAgentId) : null;

  // Find related messages by correlationId
  const related = message.correlationId
    ? allMessages.filter((m) => m.correlationId === message.correlationId && m.id !== message.id)
    : [];

  // Find matching task thread
  const thread = taskThreads.find((t) => t.correlationId === message.correlationId);

  // Build the conversation chain: sort by time
  const chain = [message, ...related].sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const text = formatMessageText(message.payload);

  return (
    <Dialog open={Boolean(message)} onClose={onClose} title="消息详情" width={680}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
        {/* Message meta */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: "var(--sp-3)",
          padding: "var(--sp-3)",
          borderRadius: "var(--r-md)",
          background: "var(--c-bg-subtle)",
          border: "1px solid var(--c-border-subtle)",
        }}>
          <MetaItem label="消息 ID" value={message.id} mono />
          <MetaItem label="类型" value={message.type} />
          <MetaItem label="发送方" value={`${fromMember?.displayName ?? message.fromAgentId} (${fromMember?.role ?? "unknown"})`} />
          {toMember && <MetaItem label="接收方" value={`${toMember.displayName} (${toMember.role})`} />}
          {message.correlationId && <MetaItem label="关联 ID" value={message.correlationId} mono />}
          <MetaItem label="处理状态" value={message.processingStatus} />
          <MetaItem label="投递状态" value={message.deliveryStatus} />
          <MetaItem label="时间" value={formatTimeFull(message.createdAt)} />
        </div>

        {/* Conversation chain */}
        {chain.length > 1 && (
          <div>
            <div style={{
              fontSize: "var(--fs-xs)", fontWeight: 600,
              color: "var(--c-text-secondary)", marginBottom: "var(--sp-2)",
              display: "flex", alignItems: "center", gap: "var(--sp-2)",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              消息链（{chain.length} 条）
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
              {chain.map((cm, idx) => {
                const cmFrom = agentMap.get(cm.fromAgentId);
                const cmTo = cm.toAgentId ? agentMap.get(cm.toAgentId) : null;
                const isCurrent = cm.id === message.id;
                return (
                  <div
                    key={cm.id}
                    style={{
                      padding: "var(--sp-3)",
                      borderRadius: "var(--r-md)",
                      border: isCurrent ? "2px solid var(--c-accent)" : "1px solid var(--c-border-subtle)",
                      background: isCurrent ? "var(--c-accent-subtle)" : "var(--c-bg-elevated)",
                    }}
                  >
                    <div style={{
                      display: "flex", alignItems: "center", gap: "var(--sp-2)",
                      marginBottom: "var(--sp-1)",
                      flexWrap: "wrap",
                    }}>
                      <span style={{
                        width: 20, height: 20, borderRadius: "var(--r-full)",
                        background: "var(--c-bg-subtle)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "var(--fs-xs)", fontWeight: 700,
                        color: "var(--c-text-tertiary)",
                        flexShrink: 0,
                      }}>
                        {idx + 1}
                      </span>
                      <Badge variant={cmFrom?.role === "host" ? "accent" : cmFrom?.role === "knowledge_keeper" ? "success" : "info"} dot>
                        {cmFrom?.role ?? "unknown"}
                      </Badge>
                      <span style={{ fontSize: "var(--fs-xs)", fontWeight: 600, color: "var(--c-text-secondary)" }}>
                        {cmFrom?.displayName ?? cm.fromAgentId}
                      </span>
                      {cmTo && (
                        <span style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-tertiary)" }}>
                          → {cmTo.displayName}
                        </span>
                      )}
                      <Badge variant="neutral">{cm.type}</Badge>
                      {isCurrent && <Badge variant="accent" dot>当前</Badge>}
                      <span style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-tertiary)", marginLeft: "auto" }}>
                        {formatTime(cm.createdAt)}
                      </span>
                    </div>
                    <div className="message-content" style={{ color: "var(--c-text-secondary)" }}>
                      {formatMessageText(cm.payload) || "无可读内容"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Task thread info */}
        {thread && (
          <div style={{
            padding: "var(--sp-3)",
            borderRadius: "var(--r-md)",
            background: "var(--c-bg-subtle)",
            border: "1px solid var(--c-border-subtle)",
          }}>
            <div style={{
              fontSize: "var(--fs-xs)", fontWeight: 600,
              color: "var(--c-text-secondary)", marginBottom: "var(--sp-2)",
            }}>
              任务链状态
            </div>
            <div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap" }}>
              <MetaItem label="Worker" value={thread.workerName ?? "—"} />
              <MetaItem label="状态" value={thread.status} />
            </div>
          </div>
        )}

        {/* Message content */}
        <div>
          <div style={{
            fontSize: "var(--fs-xs)", fontWeight: 600,
            color: "var(--c-text-secondary)", marginBottom: "var(--sp-2)",
          }}>
            消息内容
          </div>
          <div className="message-content" style={{
            padding: "var(--sp-3)",
            borderRadius: "var(--r-md)",
            background: "var(--c-bg-elevated)",
            border: "1px solid var(--c-border)",
            color: "var(--c-text-primary)",
            lineHeight: 1.7,
          }}>
            {text || "无可读内容"}
          </div>
        </div>

        {/* Raw payload */}
        <details>
          <summary style={{
            cursor: "pointer", fontSize: "var(--fs-xs)", fontWeight: 500,
            color: "var(--c-text-secondary)", userSelect: "none",
          }}>
            查看原始数据
          </summary>
          <pre style={{
            marginTop: "var(--sp-2)", padding: "var(--sp-3)",
            background: "var(--c-bg-subtle)", borderRadius: "var(--r-md)",
            fontSize: "var(--fs-xs)", overflow: "auto",
            color: "var(--c-text-secondary)",
            maxHeight: 300,
          }}>
            {formatJson(message.payload)}
          </pre>
        </details>
      </div>
    </Dialog>
  );
}

function MetaItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
      <span style={{ fontSize: "var(--fs-xs)", fontWeight: 600, color: "var(--c-text-tertiary)" }}>{label}</span>
      <span style={{
        fontSize: "var(--fs-xs)", color: "var(--c-text-secondary)",
        fontFamily: mono ? "var(--font-mono)" : "inherit",
        wordBreak: "break-all",
      }}>
        {value}
      </span>
    </div>
  );
}

/* ==================== Runtime Controls ==================== */

function RuntimeControls({
  runtime,
  onCommand,
  compact = false,
}: {
  runtime: WebAgentRuntime;
  onCommand: (command: "start" | "pause" | "stop") => void;
  compact?: boolean;
}) {
  const btnClass = compact ? "btn btn-sm" : "btn";
  return (
    <div style={{ display: "flex", gap: "var(--sp-1)" }}>
      {runtime.status !== "running" ? (
        <button className={`${btnClass} btn-secondary`} onClick={() => onCommand("start")}>启动</button>
      ) : (
        <button className={`${btnClass} btn-secondary`} onClick={() => onCommand("pause")}>暂停</button>
      )}
      <button className={`${btnClass} btn-ghost`} onClick={() => onCommand("stop")}>停止</button>
    </div>
  );
}

/* ==================== Create Session Dialog ==================== */

function CreateSessionDialog({
  open,
  onClose,
  models,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  models: Array<{ id: string; name: string; modelId: string }>;
  onCreated: (sessionId: string) => void;
}) {
  const [sessionName, setSessionName] = useState(`web-session-${new Date().toISOString().slice(0, 10)}`);
  const [modelConfigId, setModelConfigId] = useState("");
  const createHost = useCreateHostSessionMutation();

  useEffect(() => {
    if (open && !modelConfigId && models[0]?.id) setModelConfigId(models[0].id);
  }, [models, modelConfigId, open]);

  useEffect(() => {
    if (open) setSessionName(`web-session-${new Date().toISOString().slice(0, 10)}`);
  }, [open]);

  const handleCreate = () => {
    createHost.mutate(
      { sessionName: sessionName.trim(), modelConfigId },
      {
        onSuccess: (data) => {
          pushToast("会话已创建，Web Host 已启动", "success");
          onCreated(data.session.id);
          onClose();
        },
        onError: (e) => pushToast(e.message, "error"),
      }
    );
  };

  return (
    <Dialog open={open} onClose={onClose} title="创建协作会话" width={460}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
        <Field label="会话名称" required hint="使用有辨识度的名称，如 ecommerce-v2">
          <input
            className="input"
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            placeholder="my-project-session"
            onKeyDown={(e) => {
              if (e.key === "Enter" && sessionName.trim() && modelConfigId) handleCreate();
            }}
          />
        </Field>
        <Field label="模型" required>
          <select className="input" value={modelConfigId} onChange={(e) => setModelConfigId(e.target.value)}>
            <option value="">选择模型…</option>
            {models.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.modelId})</option>)}
          </select>
        </Field>
        {createHost.error && (
          <div style={{
            padding: "var(--sp-2) var(--sp-3)",
            borderRadius: "var(--r-sm)",
            background: "var(--c-error-subtle)",
            border: "1px solid var(--c-error-subtle)",
            fontSize: "var(--fs-sm)", color: "var(--c-error)",
            lineHeight: 1.5,
          }}>
            {createHost.error.message}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--sp-2)", marginTop: "var(--sp-2)" }}>
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button
            className="btn btn-primary"
            disabled={!sessionName.trim() || !modelConfigId || createHost.isPending}
            onClick={handleCreate}
          >
            {createHost.isPending ? "创建中…" : "创建会话"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/* ==================== Helpers ==================== */

function filterHostMessages(messages: MessageRecord[], host: ConsoleMember | null, members: ConsoleMember[]): MessageRecord[] {
  if (!host) return [];
  const roleById = new Map(members.map((m) => [m.agentId, m.role]));
  return messages.filter((msg) => {
    const fromRole = roleById.get(msg.fromAgentId);
    const toRole = msg.toAgentId ? roleById.get(msg.toAgentId) : null;
    return (
      msg.fromAgentId === host.agentId ||
      msg.toAgentId === host.agentId ||
      fromRole === "host" ||
      ((fromRole === "worker" || fromRole === "knowledge_keeper") && (!msg.toAgentId || toRole === "host"))
    );
  });
}

function EmptyIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}
