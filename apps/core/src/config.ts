import { loadConfig, type CoreConfig, defaultCoreConfig as sharedDefaultCoreConfig } from "@ai-collab/shared";

export { type CoreConfig };

export const getCoreConfig = (): CoreConfig => {
  return loadConfig();
};

export const defaultCoreConfig = sharedDefaultCoreConfig;
