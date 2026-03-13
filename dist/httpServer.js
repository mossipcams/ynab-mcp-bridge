import express from "express";
import { hostHeaderValidation, localhostHostValidation, } from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";
import { getOAuthProtectedResourceMetadataUrl, mcpAuthMetadataRouter, } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { assertYnabConfig } from "./config.js";
import { createOAuthTokenVerifier } from "./oauthVerifier.js";
import { createServer } from "./server.js";
const CORS_HEADERS = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "OPTIONS, POST",
    "access-control-allow-headers": "content-type, mcp-session-id, mcp-protocol-version, authorization",
    "access-control-expose-headers": "Mcp-Session-Id",
};
const HTTP_ALLOWED_METHODS = ["POST"];
function applyCorsHeaders(res) {
    for (const [name, value] of Object.entries(CORS_HEADERS)) {
        res.setHeader(name, value);
    }
}
function applyCloudflareAccessAuthorizationHeader(req) {
    const existingAuthorization = getFirstHeaderValue(req.headers.authorization);
    if (existingAuthorization) {
        return;
    }
    const cfAccessJwt = getFirstHeaderValue(req.headers["cf-access-jwt-assertion"]);
    if (!cfAccessJwt) {
        return;
    }
    req.headers.authorization = `Bearer ${cfAccessJwt}`;
}
function getRequestPath(req) {
    if (typeof req.path === "string" && req.path.length > 0) {
        return req.path;
    }
    if (!req.url) {
        return "/";
    }
    return new URL(req.url, "http://127.0.0.1").pathname;
}
function getFirstHeaderValue(value) {
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
function isLoopbackHostname(hostname) {
    return hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]" || hostname === "localhost";
}
function getRequestHostName(req) {
    const forwardedHost = getFirstHeaderValue(req.headers["x-forwarded-host"]);
    const host = forwardedHost ?? getFirstHeaderValue(req.headers.host);
    return parseHostName(host);
}
function normalizeOrigin(origin) {
    return new URL(origin).origin;
}
function isOriginAllowed(req, allowedOrigins) {
    const originHeader = getFirstHeaderValue(req.headers.origin);
    if (!originHeader) {
        return true;
    }
    try {
        const normalizedOrigin = normalizeOrigin(originHeader);
        if (allowedOrigins.has(normalizedOrigin)) {
            return true;
        }
        const requestHostName = getRequestHostName(req);
        const originHostName = new URL(normalizedOrigin).hostname;
        return isLoopbackHostname(requestHostName) && isLoopbackHostname(originHostName);
    }
    catch {
        return false;
    }
}
function writeJson(res, statusCode, body) {
    res.status(statusCode);
    applyCorsHeaders(res);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
}
function writeJsonRpcError(res, statusCode, code, message) {
    writeJson(res, statusCode, {
        jsonrpc: "2.0",
        error: {
            code,
            message,
        },
        id: null,
    });
}
function writeMethodNotAllowed(res, allowedMethods) {
    res.setHeader("allow", allowedMethods.join(", "));
    writeJsonRpcError(res, 405, -32000, "Method not allowed.");
}
function writeNotFound(res) {
    writeJson(res, 404, {
        error: "Not found",
    });
}
function writeForbiddenOrigin(res) {
    writeJson(res, 403, {
        error: "Forbidden origin",
    });
}
function writeParseError(res) {
    writeJsonRpcError(res, 400, -32700, "Parse error");
}
function writePayloadTooLarge(res) {
    writeJsonRpcError(res, 413, -32000, "Payload too large");
}
function writeInternalServerError(res) {
    writeJsonRpcError(res, 500, -32603, "Internal server error");
}
function logHttpDebug(event, details) {
    console.error("[http]", event, details);
}
function getPublicResourceServerUrl(auth) {
    return new URL(auth.publicUrl);
}
function createOAuthMetadata(auth) {
    return {
        authorization_endpoint: auth.authorizationUrl,
        code_challenge_methods_supported: ["S256"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        issuer: auth.issuer,
        jwks_uri: auth.jwksUrl,
        response_types_supported: ["code"],
        scopes_supported: auth.scopes.length > 0 ? auth.scopes : undefined,
        token_endpoint: auth.tokenUrl,
        token_endpoint_auth_methods_supported: ["none"],
    };
}
function getSessionId(req) {
    const sessionId = req.headers["mcp-session-id"];
    if (typeof sessionId !== "string") {
        return undefined;
    }
    const values = sessionId
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    if (values.length !== 1) {
        return undefined;
    }
    return values[0];
}
function getRequestDebugDetails(req) {
    const authSubject = req.auth?.extra?.subject;
    return {
        authClientId: req.auth?.clientId,
        authSubject: typeof authSubject === "string" ? authSubject : undefined,
        method: req.method ?? "UNKNOWN",
        origin: getFirstHeaderValue(req.headers.origin),
        path: getRequestPath(req),
        protocolVersion: getFirstHeaderValue(req.headers["mcp-protocol-version"]),
        sessionId: getSessionId(req),
    };
}
function getJsonRpcDebugDetails(parsedBody) {
    if (!parsedBody || typeof parsedBody !== "object") {
        return {};
    }
    const request = parsedBody;
    const details = {};
    if (typeof request.method === "string") {
        details.jsonRpcMethod = request.method;
    }
    if ("id" in request) {
        details.jsonRpcId = request.id;
    }
    return details;
}
function hasMultipleSessionHeaderValues(req) {
    const sessionId = req.headers["mcp-session-id"];
    if (Array.isArray(sessionId)) {
        return sessionId.length > 1 || sessionId.some((value) => value.includes(","));
    }
    if (typeof sessionId !== "string") {
        return false;
    }
    return sessionId
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean).length > 1;
}
function isJsonParseError(error) {
    return error instanceof SyntaxError || (typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "entity.parse.failed");
}
function isPayloadTooLargeError(error) {
    return typeof error === "object" &&
        error !== null &&
        (("type" in error && error.type === "entity.too.large") ||
            ("status" in error && error.status === 413) ||
            ("statusCode" in error && error.statusCode === 413));
}
/**
 * Creates a fresh McpServer + transport per request. This is intentional:
 * StreamableHTTPServerTransport in stateless mode (sessionIdGenerator: undefined)
 * does not support server reuse across requests. The overhead is low — tool modules
 * are loaded once at startup and registrations iterate a static array. Revisit if
 * the SDK adds support for reusable stateless servers.
 */
async function createManagedRequest(config) {
    const mcpServer = createServer(config);
    const transport = new StreamableHTTPServerTransport({
        enableJsonResponse: true,
        sessionIdGenerator: undefined,
    });
    await mcpServer.connect(transport);
    return {
        transport,
        close: async () => {
            await transport.close();
            await mcpServer.close();
        },
    };
}
async function resolveRequest(req, createRequest) {
    if (hasMultipleSessionHeaderValues(req)) {
        return {
            status: "invalid-session-header",
        };
    }
    const managedRequest = await createRequest();
    return {
        cleanup: managedRequest.close,
        managedRequest,
        status: "ready",
    };
}
function writeRequestResolution(res, resolution) {
    switch (resolution.status) {
        case "invalid-session-header":
            writeJsonRpcError(res, 400, -32000, "Bad Request: Mcp-Session-Id header must be a single value");
            return;
    }
}
async function closeNodeServer(server) {
    await new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) {
                if (error.code === "ERR_SERVER_NOT_RUNNING") {
                    resolve();
                    return;
                }
                reject(error);
                return;
            }
            resolve();
        });
    });
}
export async function startHttpServer(options) {
    const allowedHosts = options.allowedHosts ?? [];
    const allowedOrigins = new Set((options.allowedOrigins ?? []).map((origin) => normalizeOrigin(origin)));
    const auth = options.auth ?? { mode: "none" };
    const host = options.host ?? "127.0.0.1";
    const path = options.path ?? "/mcp";
    const port = options.port ?? 3000;
    const ynab = assertYnabConfig(options.ynab);
    const app = express();
    const jsonParser = express.json();
    app.disable("x-powered-by");
    app.use((req, _res, next) => {
        logHttpDebug("request.received", getRequestDebugDetails(req));
        next();
    });
    if (allowedHosts.length > 0) {
        app.use(hostHeaderValidation(allowedHosts));
    }
    else if (isLoopbackHostname(host)) {
        app.use(localhostHostValidation());
    }
    app.use((req, res, next) => {
        if (!isOriginAllowed(req, allowedOrigins)) {
            logHttpDebug("request.rejected", {
                ...getRequestDebugDetails(req),
                reason: "forbidden-origin",
            });
            writeForbiddenOrigin(res);
            return;
        }
        next();
    });
    app.use((_req, res, next) => {
        applyCorsHeaders(res);
        next();
    });
    if (auth.mode === "oauth") {
        const publicServerUrl = getPublicResourceServerUrl(auth);
        app.use(mcpAuthMetadataRouter({
            oauthMetadata: createOAuthMetadata(auth),
            resourceName: "YNAB MCP Bridge",
            resourceServerUrl: publicServerUrl,
            scopesSupported: auth.scopes.length > 0 ? auth.scopes : undefined,
        }));
    }
    app.use((req, res, next) => {
        if (req.method === "OPTIONS") {
            logHttpDebug("request.preflight", getRequestDebugDetails(req));
            applyCorsHeaders(res);
            res.status(204).end();
            return;
        }
        next();
    });
    app.use((req, res, next) => {
        if (getRequestPath(req) === path && req.method === "POST") {
            if (auth.mode === "oauth") {
                applyCloudflareAccessAuthorizationHeader(req);
            }
            jsonParser(req, res, next);
            return;
        }
        next();
    });
    if (auth.mode === "oauth") {
        const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(getPublicResourceServerUrl(auth));
        const authMiddleware = requireBearerAuth({
            requiredScopes: auth.scopes,
            resourceMetadataUrl,
            verifier: createOAuthTokenVerifier(auth),
        });
        app.use((req, res, next) => {
            if (getRequestPath(req) !== path || req.method !== "POST") {
                next();
                return;
            }
            res.once("finish", () => {
                if (req.auth || (res.statusCode !== 401 && res.statusCode !== 403)) {
                    return;
                }
                logHttpDebug("request.rejected", {
                    ...getRequestDebugDetails(req),
                    reason: res.statusCode === 401 ? "unauthorized" : "forbidden-scope",
                });
            });
            authMiddleware(req, res, next);
        });
    }
    app.use(async (req, res, next) => {
        if (getRequestPath(req) !== path) {
            next();
            return;
        }
        if (req.method !== "POST") {
            logHttpDebug("request.rejected", {
                ...getRequestDebugDetails(req),
                reason: "method-not-allowed",
            });
            writeMethodNotAllowed(res, HTTP_ALLOWED_METHODS);
            return;
        }
        const parsedBody = req.body;
        const resolution = await resolveRequest(req, () => createManagedRequest(ynab));
        if (resolution.status !== "ready") {
            logHttpDebug("request.rejected", {
                ...getRequestDebugDetails(req),
                reason: resolution.status,
            });
            writeRequestResolution(res, resolution);
            return;
        }
        let cleanedUp = false;
        const cleanup = async () => {
            if (cleanedUp) {
                return;
            }
            cleanedUp = true;
            await resolution.cleanup?.();
        };
        try {
            res.once("close", () => {
                cleanup().catch((error) => {
                    logHttpDebug("cleanup.error", { error });
                });
            });
            logHttpDebug("transport.handoff", {
                ...getRequestDebugDetails(req),
                ...getJsonRpcDebugDetails(parsedBody),
                cleanup: Boolean(resolution.cleanup),
            });
            applyCorsHeaders(res);
            await resolution.managedRequest.transport.handleRequest(req, res, parsedBody);
        }
        catch (error) {
            await cleanup();
            next(error);
        }
    });
    app.use((req, res) => {
        logHttpDebug("request.rejected", {
            ...getRequestDebugDetails(req),
            reason: "path-not-found",
        });
        writeNotFound(res);
    });
    const errorHandler = (error, req, res, next) => {
        if (res.headersSent) {
            next(error);
            return;
        }
        if (isJsonParseError(error)) {
            logHttpDebug("request.parse_error", getRequestDebugDetails(req));
            writeParseError(res);
            return;
        }
        if (isPayloadTooLargeError(error)) {
            logHttpDebug("request.payload_too_large", getRequestDebugDetails(req));
            writePayloadTooLarge(res);
            return;
        }
        console.error("Error handling MCP request:", {
            ...getRequestDebugDetails(req),
            error,
        });
        writeInternalServerError(res);
    };
    app.use(errorHandler);
    const server = app.listen(port, host);
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.once("listening", () => {
            server.off("error", reject);
            resolve();
        });
    });
    const address = server.address();
    if (!address || typeof address === "string") {
        throw new Error("HTTP server did not expose a TCP address");
    }
    const resolvedAddress = address;
    let closed = false;
    return {
        host,
        path,
        port: resolvedAddress.port,
        url: `http://${host}:${resolvedAddress.port}${path}`,
        close: async () => {
            if (closed) {
                return;
            }
            closed = true;
            await closeNodeServer(server);
        },
    };
}
