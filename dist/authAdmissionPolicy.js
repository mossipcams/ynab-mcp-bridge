const PUBLIC_OAUTH_ROUTE_PATHS = new Set([
    "/.well-known/oauth-authorization-server",
    "/.well-known/openid-configuration",
    "/.well-known/oauth-protected-resource",
    "/authorize",
    "/authorize/consent",
    "/oauth/callback",
    "/register",
    "/token",
]);
const PUBLIC_MCP_BOOTSTRAP_METHODS = new Set([
    "initialize",
    "notifications/initialized",
    "tools/list",
    "resources/list",
]);
function isPublicOAuthRoute(path) {
    if (PUBLIC_OAUTH_ROUTE_PATHS.has(path)) {
        return true;
    }
    return path.startsWith("/.well-known/oauth-protected-resource/");
}
function getMcpResourceDocumentsPathPrefix(mcpPath) {
    return `${mcpPath.replace(/\/$/, "")}/resources/`;
}
export function isPublicMcpBootstrapMethod(jsonRpcMethod) {
    return typeof jsonRpcMethod === "string" && PUBLIC_MCP_BOOTSTRAP_METHODS.has(jsonRpcMethod);
}
function getProtectedMcpAdmission(input) {
    if (input.hasCfAccessJwtAssertion) {
        return {
            action: "translate_cf_assertion_then_require_bearer",
            reason: "cf-access-jwt-assertion",
        };
    }
    if (input.isDirectUpstreamBearerToken) {
        return {
            action: "reject_direct_upstream_bearer",
            reason: "direct-upstream-bearer",
        };
    }
    return {
        action: "require_bridge_bearer",
        reason: "protected-mcp-request",
    };
}
export function decideAuthAdmission(input) {
    if (isPublicOAuthRoute(input.path)) {
        return {
            action: "allow_public",
            reason: "public-oauth-route",
        };
    }
    if (input.path.startsWith(getMcpResourceDocumentsPathPrefix(input.mcpPath))) {
        return getProtectedMcpAdmission(input);
    }
    if (input.path !== input.mcpPath || input.method !== "POST") {
        return {
            action: "allow_public",
            reason: "public-oauth-route",
        };
    }
    if (input.hasAuthorizationHeader || input.hasCfAccessJwtAssertion) {
        return getProtectedMcpAdmission(input);
    }
    if (isPublicMcpBootstrapMethod(input.jsonRpcMethod)) {
        return {
            action: "allow_public",
            reason: "public-oauth-route",
        };
    }
    return getProtectedMcpAdmission(input);
}
