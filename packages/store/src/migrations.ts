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
export const initialMigrations = [
  `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    host_agent_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    platform TEXT NOT NULL,
    role TEXT NOT NULL,
    capabilities_json TEXT NOT NULL,
    connection_mode TEXT NOT NULL,
    status TEXT NOT NULL,
    last_heartbeat_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  `,
  `
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
  `,
  `
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
  `,
  `
  CREATE TABLE IF NOT EXISTS task_events (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    actor_agent_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS operation_dedup (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    operation_type TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    response_snapshot_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS identity_leases (
    identity_key TEXT PRIMARY KEY,
    owner_token TEXT NOT NULL,
    lease_until TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS session_insights (
    session_id TEXT PRIMARY KEY,
    objective TEXT,
    current_project_understanding TEXT,
    project_summary TEXT,
    user_intent_summary TEXT,
    latest_user_input TEXT,
    latest_report_summary TEXT,
    recent_user_inputs_json TEXT NOT NULL,
    unapplied_user_inputs_json TEXT NOT NULL,
    user_preferences_json TEXT NOT NULL,
    acceptance_criteria_json TEXT NOT NULL,
    constraints_json TEXT NOT NULL,
    completed_items_json TEXT NOT NULL,
    pending_items_json TEXT NOT NULL,
    blockers_json TEXT NOT NULL,
    assumptions_json TEXT NOT NULL,
    latest_user_directive_revision INTEGER NOT NULL,
    applied_user_directive_revision INTEGER NOT NULL,
    current_plan_revision INTEGER NOT NULL,
    active_plan_summary TEXT,
    last_dispatch_worker_name TEXT,
    last_dispatch_agent_id TEXT,
    last_dispatch_message_id TEXT,
    last_dispatch_correlation_id TEXT,
    last_dispatch_task_focus TEXT,
    review_status TEXT NOT NULL,
    review_reason TEXT,
    ready_for_review INTEGER NOT NULL,
    last_updated_by_agent_id TEXT,
    updated_at TEXT NOT NULL
  );
  `
] as const;
