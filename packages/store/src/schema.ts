export const schemaDDL = `
  -- ============================================
  -- schema_version: Schema version tracking
  -- ============================================
  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );

  -- ============================================
  -- sessions: Sessions table
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
  -- agents: Agents table
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
  -- messages: Messages table
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
  -- operation_dedup: Operation deduplication table
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
  -- identity_leases: Identity leases table
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
  -- session_insights: Session insights table
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

  -- ============================================
  -- model_configs: Model configs table
  -- ============================================
  CREATE TABLE IF NOT EXISTS model_configs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key_encrypted TEXT,
    api_key_hint TEXT,
    model_name TEXT NOT NULL,
    temperature REAL NOT NULL DEFAULT 0.7,
    max_tokens INTEGER NOT NULL DEFAULT 4096,
    top_p REAL NOT NULL DEFAULT 1.0,
    timeout_seconds INTEGER NOT NULL DEFAULT 60,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_model_configs_name
    ON model_configs(name);

  -- ============================================
  -- agent_profiles: Agent profiles table
  -- ============================================
  CREATE TABLE IF NOT EXISTS agent_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    default_model_config_id TEXT,
    default_role TEXT,
    role_description TEXT,
    system_prompt TEXT,
    default_parameters_json TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (default_model_config_id) REFERENCES model_configs(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_profiles_name
    ON agent_profiles(name);

  -- ============================================
  -- skill_definitions: Skill definitions table
  -- ============================================
  CREATE TABLE IF NOT EXISTS skill_definitions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    path TEXT NOT NULL,
    role_scope TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_definitions_name
    ON skill_definitions(name);

  -- ============================================
  -- agent_profile_skills: Agent profile skill bindings
  -- ============================================
  CREATE TABLE IF NOT EXISTS agent_profile_skills (
    agent_profile_id TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (agent_profile_id, skill_id),
    FOREIGN KEY (agent_profile_id) REFERENCES agent_profiles(id),
    FOREIGN KEY (skill_id) REFERENCES skill_definitions(id)
  );

  -- ============================================
  -- session_skill_scopes: Session skill scopes
  -- ============================================
  CREATE TABLE IF NOT EXISTS session_skill_scopes (
    session_id TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    PRIMARY KEY (session_id, skill_id),
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (skill_id) REFERENCES skill_definitions(id)
  );

  -- ============================================
  -- session_member_model_bindings: Session member model bindings
  -- ============================================
  CREATE TABLE IF NOT EXISTS session_member_model_bindings (
    agent_id TEXT PRIMARY KEY,
    model_config_id TEXT,
    agent_profile_id TEXT,
    runtime_parameters_json TEXT,
    system_prompt TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (agent_id) REFERENCES agents(id),
    FOREIGN KEY (model_config_id) REFERENCES model_configs(id),
    FOREIGN KEY (agent_profile_id) REFERENCES agent_profiles(id)
  );

  -- ============================================
  -- knowledge_build_judgements: Knowledge build judgements
  -- ============================================
  CREATE TABLE IF NOT EXISTS knowledge_build_judgements (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    source TEXT NOT NULL,
    source_message_id TEXT,
    host_agent_id TEXT NOT NULL,
    knowledge_build_required INTEGER NOT NULL DEFAULT 0,
    target_levels_json TEXT NOT NULL DEFAULT '[]',
    source_kind TEXT NOT NULL,
    candidate_refs_json TEXT NOT NULL DEFAULT '[]',
    reason TEXT NOT NULL,
    next_action TEXT NOT NULL,
    fulfilled_at TEXT,
    fulfilled_by_change_ids_json TEXT NOT NULL DEFAULT '[]',
    fulfilled_knowledge_refs_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_knowledge_build_judgements_session_id
    ON knowledge_build_judgements(session_id);

  CREATE INDEX IF NOT EXISTS idx_knowledge_build_judgements_source_message_id
    ON knowledge_build_judgements(source_message_id);

  CREATE INDEX IF NOT EXISTS idx_knowledge_build_judgements_host_agent_id
    ON knowledge_build_judgements(host_agent_id);

  CREATE INDEX IF NOT EXISTS idx_knowledge_build_judgements_created_at
    ON knowledge_build_judgements(created_at);

  -- Record schema version
  INSERT OR IGNORE INTO schema_version (version, applied_at)
  VALUES (1, datetime('now'));

  -- ============================================
  -- message_traces: Message traces table
  -- ============================================
  CREATE TABLE IF NOT EXISTS message_traces (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    trace_type TEXT NOT NULL,
    correlation_id TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_message_traces_session_id
    ON message_traces(session_id);

  CREATE INDEX IF NOT EXISTS idx_message_traces_message_id
    ON message_traces(message_id);

  CREATE INDEX IF NOT EXISTS idx_message_traces_agent_id
    ON message_traces(agent_id);

  CREATE INDEX IF NOT EXISTS idx_message_traces_session_created
    ON message_traces(session_id, created_at);
`;
