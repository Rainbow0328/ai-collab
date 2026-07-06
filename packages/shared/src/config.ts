export type CoreConfig = {
  host: string;
  port: number;
  databasePath: string;
};

export type WebSocketConfig = {
  enabled: boolean;
  heartbeatIntervalSeconds: number;
  disconnectTimeoutSeconds: number;
};

export type WaitChainConfig = {
  defaultIntervalSeconds: number;
  defaultMaxRounds: number;
  pollBackoffGrowth: number;
  pollBackoffMaxFactor: number;
  pollJitterRatio: number;
};

export type LoggingConfig = {
  level: "debug" | "info" | "warn" | "error";
  enableRotation: boolean;
  maxFileSize: string;
  maxFiles: number;
  destination: string;
};

export type AppConfig = {
  core: CoreConfig;
  websocket: WebSocketConfig;
  waitChain: WaitChainConfig;
  logging: LoggingConfig;
};

export const defaultConfig: AppConfig = {
  core: {
    host: "127.0.0.1",
    port: 42688,
    databasePath: ".ai-collab/ai-collab.sqlite"
  },
  websocket: {
    enabled: false,
    heartbeatIntervalSeconds: 30,
    disconnectTimeoutSeconds: 120
  },
  waitChain: {
    defaultIntervalSeconds: 10,
    defaultMaxRounds: 600,
    pollBackoffGrowth: 1.35,
    pollBackoffMaxFactor: 6,
    pollJitterRatio: 0.08
  },
  logging: {
    level: "info",
    enableRotation: true,
    maxFileSize: "10MB",
    maxFiles: 5,
    destination: ".ai-collab/logs/core.log"
  }
};

const parseNumber = (value: string | undefined, defaultValue: number): number => {
  if (!value) return defaultValue;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
};

const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
  if (!value) return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
};

export const loadConfig = (overrides?: Partial<AppConfig>): AppConfig => {
  const env = process.env;

  return {
    core: {
      host: env.AI_COLLAB_HOST ?? defaultConfig.core.host,
      port: parseNumber(env.AI_COLLAB_PORT, defaultConfig.core.port),
      databasePath: env.AI_COLLAB_DATABASE_PATH ?? defaultConfig.core.databasePath
    },
    websocket: {
      enabled: parseBoolean(env.AI_COLLAB_WS_ENABLED, defaultConfig.websocket.enabled),
      heartbeatIntervalSeconds: parseNumber(
        env.AI_COLLAB_WS_HEARTBEAT_INTERVAL,
        defaultConfig.websocket.heartbeatIntervalSeconds
      ),
      disconnectTimeoutSeconds: parseNumber(
        env.AI_COLLAB_WS_DISCONNECT_TIMEOUT,
        defaultConfig.websocket.disconnectTimeoutSeconds
      )
    },
    waitChain: {
      defaultIntervalSeconds: parseNumber(
        env.AI_COLLAB_WAIT_INTERVAL,
        defaultConfig.waitChain.defaultIntervalSeconds
      ),
      defaultMaxRounds: parseNumber(
        env.AI_COLLAB_WAIT_MAX_ROUNDS,
        defaultConfig.waitChain.defaultMaxRounds
      ),
      pollBackoffGrowth: parseNumber(
        env.AI_COLLAB_POLL_BACKOFF_GROWTH,
        defaultConfig.waitChain.pollBackoffGrowth
      ),
      pollBackoffMaxFactor: parseNumber(
        env.AI_COLLAB_POLL_BACKOFF_MAX_FACTOR,
        defaultConfig.waitChain.pollBackoffMaxFactor
      ),
      pollJitterRatio: parseNumber(
        env.AI_COLLAB_POLL_JITTER_RATIO,
        defaultConfig.waitChain.pollJitterRatio
      )
    },
    logging: {
      level: (env.AI_COLLAB_LOG_LEVEL as LoggingConfig["level"]) ?? defaultConfig.logging.level,
      enableRotation: parseBoolean(
        env.AI_COLLAB_LOG_ROTATION,
        defaultConfig.logging.enableRotation
      ),
      maxFileSize: env.AI_COLLAB_LOG_MAX_SIZE ?? defaultConfig.logging.maxFileSize,
      maxFiles: parseNumber(env.AI_COLLAB_LOG_MAX_FILES, defaultConfig.logging.maxFiles),
      destination: env.AI_COLLAB_LOG_DESTINATION ?? defaultConfig.logging.destination
    },
    ...overrides
  };
};
