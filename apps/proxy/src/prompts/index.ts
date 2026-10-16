import { type PromptConfig, v1PromptConfig } from "./v1";

export type { PromptConfig };

const registries: Record<string, PromptConfig> = {
  v1: v1PromptConfig,
};

export function getPromptConfig(version: string = "v1"): PromptConfig {
  const config = registries[version];
  if (!config) {
    return v1PromptConfig;
  }
  return config;
}
