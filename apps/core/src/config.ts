import { loadConfig, type CoreConfig } from "@ai-collab/shared";

export { type CoreConfig };

export const getCoreConfig = (): CoreConfig => {
  return loadConfig().core;
};

export const defaultCoreConfig = getCoreConfig();
