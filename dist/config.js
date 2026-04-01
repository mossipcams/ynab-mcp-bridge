import { readFileSync } from "node:fs";
import { resolveRuntimeConfig } from "./runtimeConfig.js";
import { parseAuthConfig } from "./auth2/config/schema.js";
import { assertBackendEnvironment, readYnabConfig, } from "./ynabConfig.js";
export { getEffectiveOAuthScopes, resolveRuntimeConfig, validateCloudflareAccessOAuthSettings, } from "./runtimeConfig.js";
export { assertBackendEnvironment, assertYnabConfig, readYnabConfig, } from "./ynabConfig.js";
function readOptionalValue(value) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}
function readAuth2ConfigFile(configPath) {
    try {
        return readFileSync(configPath, "utf8");
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Unable to read MCP_AUTH2_CONFIG_PATH at ${configPath}: ${reason}`);
    }
}
function resolveAuth2Config(env) {
    const configPath = readOptionalValue(env["MCP_AUTH2_CONFIG_PATH"]);
    if (!configPath) {
        return undefined;
    }
    const rawConfig = readAuth2ConfigFile(configPath);
    try {
        return parseAuthConfig(JSON.parse(rawConfig));
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid auth2 config in ${configPath}: ${reason}`);
    }
}
export function resolveAppConfig(args, env) {
    assertBackendEnvironment(env);
    const auth2Config = resolveAuth2Config(env);
    return {
        ...(auth2Config ? { auth2Config } : {}),
        runtime: resolveRuntimeConfig(args, env, auth2Config ? { auth2Config } : undefined),
        ynab: readYnabConfig(env),
    };
}
