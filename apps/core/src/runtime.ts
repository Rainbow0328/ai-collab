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
  TaskEventRepository,
  TaskRepository
} from "@ai-collab/store";

import type { CoreConfig } from "./config.js";
import { defaultCoreConfig } from "./config.js";
import { createServer } from "./server/create-server.js";
import {
  AgentService,
  IdentityLeaseService,
  MessageService,
  SessionService,
  SessionInsightService,
  TaskService,
  WindowBindingService
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

  const server = await createServer(config, {
    sessionService,
    agentService,
    identityLeaseService,
    messageService,
    taskService,
    sessionInsightService,
    windowBindingService
  });

  await server.listen({
    host: config.host,
    port: config.port
  });

  return {
    server,
    databaseManager,
    close: async () => {
      await server.close();
      databaseManager.close();
    }
  };
};
