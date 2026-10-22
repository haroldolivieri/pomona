import { type PromptConfig, v1PromptConfig } from "./v1";
import { deepScanPromptConfig } from "./deep-scan";

export type { PromptConfig };

const registries: Record<string, PromptConfig> = {
  v1: v1PromptConfig,
  deep_scan_v1: deepScanPromptConfig,
};

export function getPromptConfig(version: string = "v1"): PromptConfig {
  const config = registries[version];
  if (!config) {
    return v1PromptConfig;
  }
  return config;
}
