function readFlag(args, name) {
    const index = args.indexOf(name);
    if (index === -1) {
        return undefined;
    }
    return args[index + 1];
}
function hasValue(value) {
    return Boolean(value?.trim());
}
function getBackendReadiness(env) {
    const ynabApiToken = hasValue(env.YNAB_API_TOKEN);
    const ynabPlanIdConfigured = hasValue(env.YNAB_PLAN_ID);
    return {
        status: ynabApiToken ? "ok" : "misconfigured",
        planResolution: ynabPlanIdConfigured ? "configured" : "dynamic",
        checks: {
            ynabApiToken,
            ynabPlanIdConfigured,
        },
    };
}
export function assertBackendEnvironment(env) {
    const readiness = getBackendReadiness(env);
    if (!readiness.checks.ynabApiToken) {
        throw new Error("YNAB_API_TOKEN is required.");
    }
    return readiness;
}
export function resolveRuntimeConfig(args, env) {
    const rawTransport = readFlag(args, "--transport") ?? env.MCP_TRANSPORT ?? "stdio";
    if (rawTransport !== "http" && rawTransport !== "stdio") {
        throw new Error(`Unsupported transport: ${rawTransport}`);
    }
    const rawPort = readFlag(args, "--port") ?? env.MCP_PORT ?? "3000";
    const port = Number.parseInt(rawPort, 10);
    if (!Number.isInteger(port)) {
        throw new Error(`Invalid port: ${rawPort}`);
    }
    return {
        transport: rawTransport,
        host: readFlag(args, "--host") ?? env.MCP_HOST ?? "0.0.0.0",
        path: readFlag(args, "--path") ?? env.MCP_PATH ?? "/mcp",
        port,
    };
}
