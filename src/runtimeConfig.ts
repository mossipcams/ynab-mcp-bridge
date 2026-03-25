import {
  assertBackendEnvironment as assertBackendEnvironmentFromConfig,
  resolveRuntimeConfig as resolveRuntimeConfigFromConfig,
} from "./config.js";

export function assertBackendEnvironment(env: Record<string, string | undefined>) {
  return assertBackendEnvironmentFromConfig(env);
}

export function resolveRuntimeConfig(args: string[], env: Record<string, string | undefined>) {
  return resolveRuntimeConfigFromConfig(args, env);
}
