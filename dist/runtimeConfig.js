import { assertBackendEnvironment as assertBackendEnvironmentFromConfig, resolveRuntimeConfig as resolveRuntimeConfigFromConfig, } from "./config.js";
export function assertBackendEnvironment(env) {
    return assertBackendEnvironmentFromConfig(env);
}
export function resolveRuntimeConfig(args, env) {
    return resolveRuntimeConfigFromConfig(args, env);
}
