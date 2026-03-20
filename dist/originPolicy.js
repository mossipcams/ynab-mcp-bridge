import { getFirstHeaderValue, isLoopbackHostname } from "./headerUtils.js";
const CORS_HEADERS = {
    "access-control-allow-headers": "content-type, mcp-session-id, mcp-protocol-version, authorization",
    "access-control-allow-methods": "OPTIONS, POST",
    "access-control-expose-headers": "Mcp-Session-Id",
};
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
function getRequestHostName(headers) {
    const forwardedHost = getFirstHeaderValue(headers["x-forwarded-host"]);
    const host = forwardedHost ?? getFirstHeaderValue(headers["host"]);
    return parseHostName(host);
}
export function normalizeOrigin(origin) {
    return new URL(origin).origin;
}
export function resolveOriginPolicy(input) {
    const originHeader = getFirstHeaderValue(input.headers["origin"]);
    if (!originHeader) {
        return {
            allowed: true,
            responseOrigin: undefined,
        };
    }
    if (originHeader === "null") {
        return {
            allowed: Boolean(input.allowOpaqueNullOrigin),
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
export function installCorsGuard(res, resolvedOrigin) {
    const originalSetHeader = res.setHeader.bind(res);
    const guardedSetHeader = (name, value) => {
        if (name.toLowerCase() === "access-control-allow-origin") {
            return originalSetHeader(name, resolvedOrigin);
        }
        return originalSetHeader(name, value);
    };
    res.setHeader = guardedSetHeader;
}
export function applyCorsHeaders(res, responseOrigin) {
    for (const [name, value] of Object.entries(CORS_HEADERS)) {
        res.setHeader(name, value);
    }
    if (!responseOrigin) {
        return;
    }
    res.setHeader("access-control-allow-origin", responseOrigin);
    res.append("vary", "Origin");
}
