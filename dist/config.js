import { resolveRuntimeConfig } from "./runtimeConfig.js";
import { assertBackendEnvironment, readYnabConfig, } from "./ynabConfig.js";
export { getEffectiveOAuthScopes, resolveRuntimeConfig, validateCloudflareAccessOAuthSettings, } from "./runtimeConfig.js";
export { assertBackendEnvironment, assertYnabConfig, readYnabConfig, } from "./ynabConfig.js";
export function resolveAppConfig(args, env) {
    assertBackendEnvironment(env);
    return {
        runtime: resolveRuntimeConfig(args, env),
        ynab: readYnabConfig(env),
    };
}
