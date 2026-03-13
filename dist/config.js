function readFlag(args, name) {
    const index = args.indexOf(name);
    if (index === -1) {
        return undefined;
    }
    return args[index + 1];
}
function readOptionalValue(value) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}
function hasValue(value) {
    return readOptionalValue(value) !== undefined;
}
function parseCsv(value) {
    return value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
}
function readCsvFlag(args, name) {
    const value = readFlag(args, name);
    if (!value) {
        return [];
    }
    return parseCsv(value);
}
function readUrlLikeValue(value, name) {
    const normalized = readOptionalValue(value);
    if (!normalized) {
        return undefined;
    }
    try {
        const url = new URL(normalized);
        if (url.pathname === "/" && !url.search && !url.hash) {
            return url.origin;
        }
        return url.toString();
    }
    catch {
        throw new Error(`${name} must be a valid URL.`);
    }
}
function readAuthMode(args, env) {
    const authMode = readOptionalValue(readFlag(args, "--auth-mode")) ?? readOptionalValue(env.MCP_AUTH_MODE) ?? "none";
    if (authMode !== "none" && authMode !== "oauth") {
        throw new Error(`Unsupported auth mode: ${authMode}`);
    }
    return authMode;
}
function resolveRuntimeAuthConfig(args, env) {
    const mode = readAuthMode(args, env);
    if (mode === "none") {
        return {
            mode,
        };
    }
    const issuer = readUrlLikeValue(readFlag(args, "--oauth-issuer") ?? env.MCP_OAUTH_ISSUER, "MCP_OAUTH_ISSUER");
    const authorizationUrl = readUrlLikeValue(readFlag(args, "--oauth-authorization-url") ?? env.MCP_OAUTH_AUTHORIZATION_URL, "MCP_OAUTH_AUTHORIZATION_URL");
    const tokenUrl = readUrlLikeValue(readFlag(args, "--oauth-token-url") ?? env.MCP_OAUTH_TOKEN_URL, "MCP_OAUTH_TOKEN_URL");
    const jwksUrl = readUrlLikeValue(readFlag(args, "--oauth-jwks-url") ?? env.MCP_OAUTH_JWKS_URL, "MCP_OAUTH_JWKS_URL");
    const publicUrl = readUrlLikeValue(readFlag(args, "--public-url") ?? env.MCP_PUBLIC_URL, "MCP_PUBLIC_URL");
    const audience = readOptionalValue(readFlag(args, "--oauth-audience") ?? env.MCP_OAUTH_AUDIENCE);
    if (!issuer || !authorizationUrl || !tokenUrl || !jwksUrl || !audience || !publicUrl) {
        throw new Error("OAuth mode requires MCP_PUBLIC_URL, MCP_OAUTH_ISSUER, MCP_OAUTH_AUTHORIZATION_URL, MCP_OAUTH_TOKEN_URL, MCP_OAUTH_JWKS_URL, and MCP_OAUTH_AUDIENCE.");
    }
    const scopes = parseCsv(readFlag(args, "--oauth-scopes") ?? env.MCP_OAUTH_SCOPES ?? "");
    return {
        audience,
        authorizationUrl,
        issuer,
        jwksUrl,
        mode,
        publicUrl,
        scopes,
        tokenUrl,
    };
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
export function readYnabConfig(env) {
    return {
        apiToken: readOptionalValue(env.YNAB_API_TOKEN) ?? "",
        planId: readOptionalValue(env.YNAB_PLAN_ID),
    };
}
export function assertYnabConfig(config) {
    const apiToken = readOptionalValue(config?.apiToken);
    if (!apiToken) {
        throw new Error("YNAB config is required.");
    }
    return {
        apiToken,
        planId: readOptionalValue(config?.planId),
    };
}
export function resolveRuntimeConfig(args, env) {
    const rawTransport = readFlag(args, "--transport") ?? env.MCP_TRANSPORT ?? "http";
    if (rawTransport !== "http" && rawTransport !== "stdio") {
        throw new Error(`Unsupported transport: ${rawTransport}`);
    }
    const rawPort = readFlag(args, "--port") ?? env.MCP_PORT ?? "3000";
    const port = Number.parseInt(rawPort, 10);
    if (!Number.isInteger(port)) {
        throw new Error(`Invalid port: ${rawPort}`);
    }
    const allowedOrigins = readCsvFlag(args, "--allowed-origins");
    const envAllowedOrigins = env.MCP_ALLOWED_ORIGINS
        ? parseCsv(env.MCP_ALLOWED_ORIGINS)
        : undefined;
    const allowedHosts = readCsvFlag(args, "--allowed-hosts");
    const envAllowedHosts = env.MCP_ALLOWED_HOSTS
        ? parseCsv(env.MCP_ALLOWED_HOSTS)
        : undefined;
    return {
        allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : (envAllowedOrigins ?? []),
        allowedHosts: allowedHosts.length > 0 ? allowedHosts : (envAllowedHosts ?? []),
        auth: resolveRuntimeAuthConfig(args, env),
        transport: rawTransport,
        host: readFlag(args, "--host") ?? env.MCP_HOST ?? "127.0.0.1",
        path: readFlag(args, "--path") ?? env.MCP_PATH ?? "/mcp",
        port,
    };
}
export function resolveAppConfig(args, env) {
    assertBackendEnvironment(env);
    return {
        runtime: resolveRuntimeConfig(args, env),
        ynab: readYnabConfig(env),
    };
}
