export const schemaDDL = `
  -- ============================================
  -- schema_version: 迁移版本追踪
  -- ============================================
  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );

  -- ============================================
  -- sessions: 会话表
  -- ============================================
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    host_agent_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_name 
    ON sessions(name);

  CREATE INDEX IF NOT EXISTS idx_sessions_status 
    ON sessions(status);

  -- ============================================
  -- agents: AI 参与者表
  -- ============================================
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    platform TEXT NOT NULL,
    role TEXT NOT NULL,
    role_description TEXT,
    capabilities_json TEXT NOT NULL,
    connection_mode TEXT NOT NULL,
    status TEXT NOT NULL,
    last_heartbeat_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    default_wait_interval_seconds INTEGER NOT NULL DEFAULT 10,
    default_wait_max_rounds INTEGER NOT NULL DEFAULT 600,
    runtime_active_flow TEXT,
    runtime_current_message_id TEXT,
    runtime_current_correlation_id TEXT,
    runtime_current_message_kind TEXT,
    runtime_wait_chain_id TEXT,
    runtime_wait_chain_status TEXT,
    runtime_last_poll_at TEXT,
    runtime_last_claim_at TEXT,
    runtime_last_submit_at TEXT,
    runtime_pending_inbox_count INTEGER,
    runtime_claimed_inbox_count INTEGER,
    runtime_last_command TEXT,
    runtime_last_status TEXT,
    runtime_last_workflow_step TEXT,
    runtime_last_automation_state TEXT,
    runtime_last_turn_disposition TEXT,
    runtime_updated_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_agents_session_id 
    ON agents(session_id);

  CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_session_agent_name 
    ON agents(session_id, agent_name);

  CREATE INDEX IF NOT EXISTS idx_agents_role 
    ON agents(role);

  CREATE INDEX IF NOT EXISTS idx_agents_status 
    ON agents(status);

  -- ============================================
  -- messages: 消息表
  -- ============================================
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    from_agent_id TEXT NOT NULL,
    to_agent_id TEXT,
    type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    idempotency_key TEXT,
    correlation_id TEXT,
    delivery_status TEXT NOT NULL,
    processing_status TEXT NOT NULL,
    claimed_by_agent_id TEXT,
    claimed_at TEXT,
    processed_at TEXT,
    failed_at TEXT,
    failure_reason TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_session_id 
    ON messages(session_id);

  CREATE INDEX IF NOT EXISTS idx_messages_to_agent_id 
    ON messages(to_agent_id);

  CREATE INDEX IF NOT EXISTS idx_messages_from_agent_id 
    ON messages(from_agent_id);

  CREATE INDEX IF NOT EXISTS idx_messages_processing_status 
    ON messages(processing_status);

  CREATE INDEX IF NOT EXISTS idx_messages_session_to_processing 
    ON messages(session_id, to_agent_id, processing_status);

  CREATE INDEX IF NOT EXISTS idx_messages_correlation_id 
    ON messages(correlation_id);

  CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_session_from_idempotency 
    ON messages(session_id, from_agent_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';

  -- ============================================
  -- tasks: 任务表
  -- ============================================
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    created_by_agent_id TEXT NOT NULL,
    assigned_to_agent_id TEXT,
    status TEXT NOT NULL,
    priority TEXT NOT NULL,
    capability_hint TEXT,
    parent_task_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_session_id 
    ON tasks(session_id);

  CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to 
    ON tasks(assigned_to_agent_id);

  CREATE INDEX IF NOT EXISTS idx_tasks_status 
    ON tasks(status);

  CREATE INDEX IF NOT EXISTS idx_tasks_priority 
    ON tasks(priority);

  -- ============================================
  -- task_events: 任务事件表
  -- ============================================
  CREATE TABLE IF NOT EXISTS task_events (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    actor_agent_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_task_events_task_id 
    ON task_events(task_id);

  -- ============================================
  -- model_configs: Web runtime model presets
  -- ============================================
  CREATE TABLE IF NOT EXISTS model_configs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    model_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- ============================================
  -- web_agent_runtimes: Backend browser-independent agents
  -- ============================================
  CREATE TABLE IF NOT EXISTS web_agent_runtimes (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    agent_id TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL,
    model_config_id TEXT NOT NULL,
    agent_profile_id TEXT,
    toolset_id TEXT NOT NULL,
    status TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    current_step TEXT,
    last_error TEXT,
    last_tick_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_web_agent_runtimes_session_id
    ON web_agent_runtimes(session_id);

  -- ============================================
  -- workflow_definitions: Role workflow templates
  -- ============================================
  CREATE TABLE IF NOT EXISTS workflow_definitions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    role TEXT NOT NULL,
    nodes_json TEXT NOT NULL,
    edges_json TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    builtin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- ============================================
  -- operation_dedup: 操作去重表
  -- ============================================
  CREATE TABLE IF NOT EXISTS operation_dedup (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    operation_type TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    response_snapshot_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_operation_dedup_scope 
    ON operation_dedup(agent_id, operation_type, idempotency_key);

  -- ============================================
  -- identity_leases: 身份租约表
  -- ============================================
  CREATE TABLE IF NOT EXISTS identity_leases (
    identity_key TEXT PRIMARY KEY,
    owner_token TEXT NOT NULL,
    lease_until TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_identity_leases_lease_until 
    ON identity_leases(lease_until);

  -- ============================================
  -- session_insights: 会话洞察表
  -- ============================================
  CREATE TABLE IF NOT EXISTS session_insights (
    session_id TEXT PRIMARY KEY,
    objective TEXT,
    current_project_understanding TEXT,
    project_summary TEXT,
    user_intent_summary TEXT,
    latest_user_input TEXT,
    latest_report_summary TEXT,
    recent_user_inputs_json TEXT NOT NULL DEFAULT '[]',
    unapplied_user_inputs_json TEXT NOT NULL DEFAULT '[]',
    user_preferences_json TEXT NOT NULL DEFAULT '[]',
    acceptance_criteria_json TEXT NOT NULL DEFAULT '[]',
    constraints_json TEXT NOT NULL DEFAULT '[]',
    completed_items_json TEXT NOT NULL DEFAULT '[]',
    pending_items_json TEXT NOT NULL DEFAULT '[]',
    blockers_json TEXT NOT NULL DEFAULT '[]',
    assumptions_json TEXT NOT NULL DEFAULT '[]',
    latest_user_directive_revision INTEGER NOT NULL DEFAULT 0,
    applied_user_directive_revision INTEGER NOT NULL DEFAULT 0,
    current_plan_revision INTEGER NOT NULL DEFAULT 0,
    active_plan_summary TEXT,
    last_dispatch_worker_name TEXT,
    last_dispatch_agent_id TEXT,
    last_dispatch_message_id TEXT,
    last_dispatch_correlation_id TEXT,
    last_dispatch_task_focus TEXT,
    review_status TEXT NOT NULL DEFAULT 'in_progress',
    review_reason TEXT,
    ready_for_review INTEGER NOT NULL DEFAULT 0,
    last_updated_by_agent_id TEXT,
    updated_at TEXT NOT NULL
  );

  -- 记录 schema 版本
  INSERT OR IGNORE INTO schema_version (version, applied_at)
  VALUES (1, datetime('now'));
`;
