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
import {
  AgentRepository,
  DatabaseManager,
  ExternalMcpServerRepository,
  IdentityLeaseRepository,
  MessageRepository,
  ModelConfigRepository,
  SessionRepository,
  SessionInsightRepository,
  TaskEventRepository,
  TaskRepository,
  WebAgentRuntimeRepository,
  WorkflowDefinitionRepository
} from "@ai-collab/store";

import type { CoreConfig } from "./config.js";
import { defaultCoreConfig } from "./config.js";
import { createServer } from "./server/create-server.js";
import {
  AgentService,
  CollaborationWaitService,
  ExternalMcpService,
  ExtractionService,
  GuardService,
  IdentityLeaseService,
  KnowledgeFileStore,
  KnowledgeService,
  McpToolService,
  MessageService,
  ProgressService,
  SessionConsoleService,
  SessionService,
  SessionInsightService,
  TaskService,
  UserPreferencesService,
  WebAgentRuntimeExecutorService,
  WebAgentRuntimeService,
  WebSocketService,
  WindowBindingService,
  WorkflowDefinitionService,
  StdioMcpRegistryService
} from "./services/index.js";

export const startCoreServer = async (config: CoreConfig = defaultCoreConfig) => {
  const databaseManager = new DatabaseManager(config.databasePath);
  databaseManager.migrate();

  const sessionRepository = new SessionRepository(databaseManager.connection);
  const agentRepository = new AgentRepository(databaseManager.connection);
  const messageRepository = new MessageRepository(databaseManager.connection);
  const identityLeaseRepository = new IdentityLeaseRepository(
    databaseManager.connection
  );
  const taskRepository = new TaskRepository(databaseManager.connection);
  const taskEventRepository = new TaskEventRepository(databaseManager.connection);
  const sessionInsightRepository = new SessionInsightRepository(
    databaseManager.connection
  );
  const modelConfigRepository = new ModelConfigRepository(databaseManager.connection);
  if (modelConfigRepository.list().length === 0) {
    const timestamp = new Date().toISOString();
    modelConfigRepository.upsert({
      id: "default-model",
      name: "Default Model",
      provider: process.env.AI_COLLAB_LLM_PROVIDER ?? "openai",
      modelId: process.env.AI_COLLAB_LLM_MODEL ?? "gpt-4o-mini",
      apiKey: null,
      baseUrl: null,
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  // Load persisted API keys and base URLs into process.env for runtime use.
  // This allows the LLM client to pick up credentials stored via the web UI
  // without requiring manual environment variable configuration.
  for (const config of modelConfigRepository.list()) {
    if (config.apiKey) {
      process.env[`${config.provider.toUpperCase()}_API_KEY`] = config.apiKey;
    }
    if (config.baseUrl) {
      process.env[`${config.provider.toUpperCase()}_BASE_URL`] = config.baseUrl;
    }
  }
  const webAgentRuntimeRepository = new WebAgentRuntimeRepository(
    databaseManager.connection
  );
  const workflowDefinitionRepository = new WorkflowDefinitionRepository(
    databaseManager.connection
  );

  const sessionService = new SessionService(
    databaseManager.connection,
    sessionRepository,
    agentRepository,
    messageRepository,
    taskRepository,
    taskEventRepository,
    sessionInsightRepository,
    identityLeaseRepository
  );
  const agentService = new AgentService(agentRepository, sessionService);
  const sessionInsightService = new SessionInsightService(
    sessionRepository,
    agentRepository,
    sessionInsightRepository
  );

  const messageService = new MessageService(
    sessionRepository,
    agentRepository,
    messageRepository,
    identityLeaseRepository
  );
  const identityLeaseService = new IdentityLeaseService(identityLeaseRepository);
  const windowBindingService = new WindowBindingService(agentRepository);
  const taskService = new TaskService(
    sessionRepository,
    agentRepository,
    taskRepository,
    taskEventRepository
  );
  const knowledgeFileStore = new KnowledgeFileStore(process.cwd());
  const knowledgeService = new KnowledgeService(knowledgeFileStore);
  const userPreferencesService = new UserPreferencesService();
  userPreferencesService.importFromLegacyKnowledgeRoot(
    knowledgeFileStore.getRootPath()
  );
  const extractionService = new ExtractionService();
  const guardService = new GuardService();

  const websocketService = new WebSocketService();
  const progressService = new ProgressService();
  const sessionConsoleService = new SessionConsoleService(
    sessionService,
    messageService,
    progressService,
    knowledgeService
  );
  const collaborationWaitService = new CollaborationWaitService(
    messageService,
    windowBindingService
  );
  const externalMcpService = new ExternalMcpService(
    new ExternalMcpServerRepository(databaseManager.connection)
  );
  const mcpToolService = new McpToolService(webAgentRuntimeRepository);
  const stdioMcpRegistryService = new StdioMcpRegistryService();
  const webAgentRuntimeService = new WebAgentRuntimeService(
    webAgentRuntimeRepository,
    sessionRepository,
    agentRepository,
    modelConfigRepository
  );
  const workflowDefinitionService = new WorkflowDefinitionService(
    workflowDefinitionRepository
  );
  workflowDefinitionService.seedBuiltins();

  let services: Parameters<typeof createServer>[1];
  const webAgentRuntimeExecutorService = new WebAgentRuntimeExecutorService(
    () => services
  );

  services = {
    sessionService,
    agentService,
    identityLeaseService,
    messageService,
    taskService,
    sessionInsightService,
    windowBindingService,
    websocketService,
    progressService,
    sessionConsoleService,
    knowledgeService,
    userPreferencesService,
    extractionService,
    guardService,
    modelConfigService: modelConfigRepository,
    externalMcpService,
    mcpToolService,
    stdioMcpRegistryService,
    collaborationWaitService,
    webAgentRuntimeService,
    webAgentRuntimeExecutorService,
    workflowDefinitionService
  };

  const server = await createServer(config, services);

  messageService.setWebSocketService(websocketService);
  for (const runtime of webAgentRuntimeRepository.listRunningEnabled()) {
    webAgentRuntimeExecutorService.start(runtime);
  }

  await server.listen({
    host: config.host,
    port: config.port
  });

  return {
    server,
    databaseManager,
    stdioMcpRegistryService,
    close: async () => {
      webAgentRuntimeExecutorService.stopAll();
      await server.close();
      databaseManager.close();
    }
  };
};
