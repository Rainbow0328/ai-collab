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
  IdentityLeaseRepository,
  MessageRepository,
  SessionRepository,
  SessionInsightRepository,
  ModelConfigRepository,
  AgentProfileRepository,
  SkillRepository,
  SessionBindingRepository,
  KnowledgeBuildJudgementRepository,
  MessageTraceRepository
} from "@ai-collab/store";

import type { CoreConfig } from "@ai-collab/shared";
import { loadConfig } from "@ai-collab/shared";
import { createServer } from "./server/create-server.js";
import {
  AgentService,
  GuardService,
  IdentityLeaseService,
  KnowledgeFileStore,
  KnowledgeService,
  MessageService,
  ProgressService,
  SessionConsoleService,
  SessionService,
  SessionInsightService,
  WebSocketService,
  WindowBindingService,
  ModelConfigService,
  AgentProfileService,
  SkillService,
  HostKnowledgeBuildService,
  TraceService,
  AnalyticsService,
  UserProfileService
} from "./services/index.js";

export const startCoreServer = async (
  config: Partial<CoreConfig> = {}
) => {
  const defaultConfig = loadConfig();
  const resolvedConfig: CoreConfig = {
    ...defaultConfig,
    ...config,
    websocket: {
      ...defaultConfig.websocket,
      ...config.websocket
    },
    waitChain: {
      ...defaultConfig.waitChain,
      ...config.waitChain
    },
    logging: {
      ...defaultConfig.logging,
      ...config.logging
    },
    console: {
      ...defaultConfig.console,
      ...config.console
    }
  };

  const databaseManager = new DatabaseManager(resolvedConfig.databasePath);
  databaseManager.migrate();

  const sessionRepository = new SessionRepository(databaseManager.connection);
  const agentRepository = new AgentRepository(databaseManager.connection);
  const messageRepository = new MessageRepository(databaseManager.connection);
  const identityLeaseRepository = new IdentityLeaseRepository(
    databaseManager.connection
  );
  const sessionInsightRepository = new SessionInsightRepository(
    databaseManager.connection
  );
  const modelConfigRepository = new ModelConfigRepository(databaseManager.connection);
  const agentProfileRepository = new AgentProfileRepository(databaseManager.connection);
  const skillRepository = new SkillRepository(databaseManager.connection);
  const sessionBindingRepository = new SessionBindingRepository(databaseManager.connection);
  const knowledgeBuildJudgementRepository = new KnowledgeBuildJudgementRepository(databaseManager.connection);
  const messageTraceRepository = new MessageTraceRepository(databaseManager.connection);

  const traceService = new TraceService(messageTraceRepository);
  const analyticsService = new AnalyticsService(
    messageTraceRepository,
    messageRepository,
    agentRepository
  );

  const sessionService = new SessionService(
    databaseManager.connection,
    sessionRepository,
    agentRepository,
    messageRepository,
    sessionInsightRepository,
    identityLeaseRepository,
    sessionBindingRepository,
    skillRepository,
    agentProfileRepository,
    modelConfigRepository
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
    identityLeaseRepository,
    traceService
  );
  const identityLeaseService = new IdentityLeaseService(identityLeaseRepository);
  const windowBindingService = new WindowBindingService(agentRepository);
  const knowledgeFileStore = new KnowledgeFileStore(process.cwd());
  const knowledgeService = new KnowledgeService(knowledgeFileStore);
  const guardService = new GuardService();

  const modelConfigService = new ModelConfigService(modelConfigRepository);
  const agentProfileService = new AgentProfileService(agentProfileRepository);
  const skillService = new SkillService(skillRepository);
  const hostKnowledgeBuildService = new HostKnowledgeBuildService(knowledgeBuildJudgementRepository);

  const userProfileService = new UserProfileService();

  const websocketService = new WebSocketService();
  const progressService = new ProgressService();
  const sessionConsoleService = new SessionConsoleService(
    sessionService,
    messageService,
    progressService,
    knowledgeService,
    resolvedConfig.console
  );

  const server = await createServer(resolvedConfig, {
    sessionService,
    agentService,
    identityLeaseService,
    messageService,
    sessionInsightService,
    windowBindingService,
    websocketService,
    progressService,
    sessionConsoleService,
    knowledgeService,
    guardService,
    modelConfigService,
    agentProfileService,
    skillService,
    hostKnowledgeBuildService,
    traceService,
    analyticsService,
    userProfileService
  });

  messageService.setWebSocketService(websocketService);

  await server.listen({
    host: resolvedConfig.host,
    port: resolvedConfig.port
  });

  const frontendUrl = `http://${resolvedConfig.host}:${resolvedConfig.port}`;
  console.log(`\nai-collab started\n  URL: ${frontendUrl}\n`);

  return {
    server,
    databaseManager,
    close: async () => {
      await server.close();
      databaseManager.close();
    }
  };
};
