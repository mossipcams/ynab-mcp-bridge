import { readFileSync } from "node:fs";

import { resolveRuntimeConfig, type RuntimeConfig } from "./runtimeConfig.js";
import { parseAuthConfig, type AuthConfig } from "./auth2/config/schema.js";
import {
  assertBackendEnvironment,
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
  auth2Config?: AuthConfig;
  runtime: RuntimeConfig;
  ynab: YnabConfig;
};

type EnvConfig = Record<string, string | undefined>;

function readOptionalValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readAuth2ConfigFile(configPath: string) {
  try {
    return readFileSync(configPath, "utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read MCP_AUTH2_CONFIG_PATH at ${configPath}: ${reason}`);
  }
}

function resolveAuth2Config(env: EnvConfig) {
  const configPath = readOptionalValue(env["MCP_AUTH2_CONFIG_PATH"]);

  if (!configPath) {
    return undefined;
  }

  const rawConfig = readAuth2ConfigFile(configPath);

  try {
    return parseAuthConfig(JSON.parse(rawConfig));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid auth2 config in ${configPath}: ${reason}`);
  }
}

export function resolveAppConfig(args: string[], env: EnvConfig): AppConfig {
  assertBackendEnvironment(env);
  const auth2Config = resolveAuth2Config(env);

  return {
    ...(auth2Config ? { auth2Config } : {}),
    runtime: resolveRuntimeConfig(args, env),
    ynab: readYnabConfig(env),
  };
}
