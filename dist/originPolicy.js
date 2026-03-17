const CORS_ALLOWED_HEADERS = "content-type, mcp-session-id, mcp-protocol-version, authorization";
const CORS_EXPOSE_HEADERS = "Mcp-Session-Id";
export function getFirstHeaderValue(value) {
    if (typeof value === "string") {
        return value.split(",")[0]?.trim();
    }
    return value?.[0]?.split(",")[0]?.trim();
}
function parseHostName(host) {
    if (!host) {
        return undefined;
    }
    try {
        return new URL(`http://${host}`).hostname;
    }
    catch {
        return undefined;
    }
}
export function isLoopbackHostname(hostname) {
    return hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]" || hostname === "localhost";
}
function getRequestHostName(headers) {
    const forwardedHost = getFirstHeaderValue(headers["x-forwarded-host"]);
    const host = forwardedHost ?? getFirstHeaderValue(headers.host);
    return parseHostName(host);
}
export function normalizeOrigin(origin) {
    return new URL(origin).origin;
}
export function resolveOriginPolicy(input) {
    const originHeader = getFirstHeaderValue(input.headers.origin);
    if (!originHeader) {
        return {
            allowed: true,
            responseOrigin: undefined,
        };
    }
    if (originHeader === "null" && input.path === "/authorize/consent") {
        return {
            allowed: true,
            responseOrigin: undefined,
        };
    }
    try {
        const normalizedOrigin = normalizeOrigin(originHeader);
        if (input.allowedOrigins.has(normalizedOrigin)) {
            return {
                allowed: true,
                responseOrigin: normalizedOrigin,
            };
        }
        const requestHostName = getRequestHostName(input.headers);
        const originHostName = new URL(normalizedOrigin).hostname;
        if (isLoopbackHostname(requestHostName) && isLoopbackHostname(originHostName)) {
            return {
                allowed: true,
                responseOrigin: normalizedOrigin,
            };
        }
    }
    catch {
        return {
            allowed: false,
            responseOrigin: undefined,
        };
    }
    return {
        allowed: false,
        responseOrigin: undefined,
    };
}
export function applyCorsHeaders(res, responseOrigin, allowedMethods = ["OPTIONS", "POST"]) {
    res.setHeader("access-control-allow-headers", CORS_ALLOWED_HEADERS);
    res.setHeader("access-control-allow-methods", allowedMethods.join(", "));
    res.setHeader("access-control-expose-headers", CORS_EXPOSE_HEADERS);
    if (!responseOrigin) {
        return;
    }
    res.setHeader("access-control-allow-origin", responseOrigin);
    res.append("vary", "Origin");
}
