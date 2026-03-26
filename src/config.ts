import { resolveRuntimeConfig, type RuntimeConfig } from "./runtimeConfig.js";
import {
  assertBackendEnvironment,
  assertYnabConfig,
  readYnabConfig,
  type YnabConfig,
} from "./ynabConfig.js";

export {
  getEffectiveOAuthScopes,
  resolveRuntimeConfig,
  validateCloudflareAccessOAuthSettings,
  type DeploymentMode,
  type RuntimeAuthConfig,
  type RuntimeConfig,
  type RuntimeTransport,
} from "./runtimeConfig.js";
export {
  assertBackendEnvironment,
  assertYnabConfig,
  readYnabConfig,
  type YnabConfig,
} from "./ynabConfig.js";

type AppConfig = {
  runtime: RuntimeConfig;
  ynab: YnabConfig;
};

type EnvConfig = Record<string, string | undefined>;

export function resolveAppConfig(args: string[], env: EnvConfig): AppConfig {
  assertBackendEnvironment(env);

  return {
    runtime: resolveRuntimeConfig(args, env),
    ynab: readYnabConfig(env),
  };
}
