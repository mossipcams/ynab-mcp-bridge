import { randomUUID } from "node:crypto";
import express from "express";
import { decodeJwt } from "jose";
import { hostHeaderValidation, localhostHostValidation, } from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";
import { getOAuthProtectedResourceMetadataUrl, mcpAuthRouter, } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { assertYnabConfig, validateCloudflareAccessOAuthSettings, } from "./config.js";
import { createOAuthBroker } from "./oauthBroker.js";
import { applyCorsHeaders, normalizeOrigin, resolveOriginPolicy } from "./originPolicy.js";
import { createServer, isPublicToolName } from "./server.js";
import { createYnabApi } from "./ynabApi.js";
const HTTP_ALLOWED_METHODS = ["POST"];
const CF_ACCESS_AUTHORIZATION_SOURCE_HEADER = "x-mcp-cf-access-authorization-source";
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
    req.headers[CF_ACCESS_AUTHORIZATION_SOURCE_HEADER] = "cf-access-jwt-assertion";
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
function getBearerToken(authorizationHeader) {
    if (!authorizationHeader?.startsWith("Bearer ")) {
        return undefined;
    }
    return authorizationHeader.slice("Bearer ".length).trim();
}
function isDirectUpstreamBearerToken(req, auth) {
    const authorizationSource = getFirstHeaderValue(req.headers[CF_ACCESS_AUTHORIZATION_SOURCE_HEADER]);
    if (authorizationSource === "cf-access-jwt-assertion") {
        return false;
    }
    const token = getBearerToken(getFirstHeaderValue(req.headers.authorization));
    if (!token) {
        return false;
    }
    try {
        return decodeJwt(token).iss === auth.issuer;
    }
    catch {
        return false;
    }
}
function isLoopbackHostname(hostname) {
    return hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]" || hostname === "localhost";
}
function writeJson(res, statusCode, body) {
    res.status(statusCode);
    applyCorsHeaders(res, typeof res.locals.corsOrigin === "string" ? res.locals.corsOrigin : undefined);
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
function isPublicJsonRpcRequest(parsedBody) {
    const messages = Array.isArray(parsedBody) ? parsedBody : [parsedBody];
    if (messages.length === 0) {
        return false;
    }
    return messages.every((message) => {
        if (!message || typeof message !== "object") {
            return false;
        }
        const request = message;
        if (request.method === "initialize" || request.method === "notifications/initialized" || request.method === "ping" || request.method === "tools/list") {
            return true;
        }
        if (request.method !== "tools/call") {
            return false;
        }
        const params = request.params;
        return typeof params?.name === "string" && isPublicToolName(params.name);
    });
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
async function createManagedRequest(config, auth) {
    const mcpServer = createServer(config, createYnabApi(config), { auth });
    const transport = new StreamableHTTPServerTransport({
        enableJsonResponse: true,
        sessionIdGenerator: undefined,
    });
    await mcpServer.connect(transport);
    return {
        persistent: false,
        transport,
        close: async () => {
            await transport.close();
            await mcpServer.close();
        },
    };
}
async function createPersistentManagedRequest(config, auth, onSessionInitialized, onSessionClosed) {
    const mcpServer = createServer(config, createYnabApi(config), { auth });
    let cleanedUp = false;
    let currentSessionId;
    const transport = new StreamableHTTPServerTransport({
        enableJsonResponse: true,
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
            currentSessionId = sessionId;
            onSessionInitialized(sessionId, managedRequest);
        },
    });
    const cleanup = async (closeTransport) => {
        if (cleanedUp) {
            return;
        }
        cleanedUp = true;
        if (currentSessionId) {
            onSessionClosed(currentSessionId);
        }
        if (closeTransport) {
            await transport.close();
        }
        await mcpServer.close();
    };
    const managedRequest = {
        persistent: true,
        transport,
        close: async () => {
            await cleanup(true);
        },
    };
    transport.onclose = () => {
        void cleanup(false);
    };
    await mcpServer.connect(transport);
    return managedRequest;
}
function isInitializeBody(parsedBody) {
    if (Array.isArray(parsedBody)) {
        return parsedBody.length === 1 && isInitializeRequest(parsedBody[0]);
    }
    if (!parsedBody || typeof parsedBody !== "object") {
        return false;
    }
    return isInitializeRequest(parsedBody);
}
async function resolveRequest(req, parsedBody, createRequest, options) {
    if (hasMultipleSessionHeaderValues(req)) {
        return {
            status: "invalid-session-header",
        };
    }
    const sessionId = getSessionId(req);
    if (sessionId && options?.persistentRequests) {
        const managedRequest = options?.persistentRequests?.get(sessionId);
        if (!managedRequest) {
            return {
                status: "session-not-found",
            };
        }
        return {
            managedRequest,
            status: "ready",
        };
    }
    if (req.method !== "POST" && options?.createPersistentRequest) {
        return {
            status: "missing-session-header",
        };
    }
    if (options?.createPersistentRequest && req.method === "POST" && isInitializeBody(parsedBody)) {
        const managedRequest = await options.createPersistentRequest();
        return {
            managedRequest,
            status: "ready",
        };
    }
    const managedRequest = await createRequest();
    return {
        cleanup: managedRequest.persistent ? undefined : managedRequest.close,
        managedRequest,
        status: "ready",
    };
}
function writeRequestResolution(res, resolution) {
    switch (resolution.status) {
        case "missing-session-header":
            writeJsonRpcError(res, 400, -32000, "Bad Request: Mcp-Session-Id header is required");
            return;
        case "session-not-found":
            writeJsonRpcError(res, 404, -32001, "Session not found");
            return;
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
    const auth = options.auth ?? { deployment: "authless", mode: "none" };
    const explicitAuthorizationUrl = auth.mode === "oauth" && typeof auth.authorizationUrl === "string"
        ? auth.authorizationUrl
        : undefined;
    const explicitJwksUrl = auth.mode === "oauth" && typeof auth.jwksUrl === "string"
        ? auth.jwksUrl
        : undefined;
    const explicitTokenUrl = auth.mode === "oauth" && typeof auth.tokenUrl === "string"
        ? auth.tokenUrl
        : undefined;
    if (auth.mode === "oauth" && explicitAuthorizationUrl && explicitJwksUrl && explicitTokenUrl) {
        validateCloudflareAccessOAuthSettings({
            authorizationUrl: explicitAuthorizationUrl,
            issuer: auth.issuer,
            jwksUrl: explicitJwksUrl,
            tokenUrl: explicitTokenUrl,
        });
    }
    const allowedOrigins = new Set((options.allowedOrigins ?? []).map((origin) => normalizeOrigin(origin)));
    const host = options.host ?? "127.0.0.1";
    const path = options.path ?? "/mcp";
    const port = options.port ?? 3000;
    const ynab = assertYnabConfig(options.ynab);
    const oauthBroker = auth.mode === "oauth" ? await createOAuthBroker(auth) : undefined;
    const persistentRequests = new Map();
    if (auth.mode === "oauth") {
        allowedOrigins.add(new URL(auth.publicUrl).origin);
    }
    const app = express();
    const jsonParser = express.json();
    const urlencodedParser = express.urlencoded({ extended: false });
    app.disable("x-powered-by");
    app.set("trust proxy", 1);
    app.use((req, _res, next) => {
        logHttpDebug("request.received", getRequestDebugDetails(req));
        next();
    });
    app.use((_req, res, next) => {
        const originalSetHeader = res.setHeader.bind(res);
        res.setHeader = ((name, value) => {
            if (name.toLowerCase() === "access-control-allow-origin" &&
                typeof res.locals.corsOrigin === "string") {
                return originalSetHeader(name, res.locals.corsOrigin);
            }
            return originalSetHeader(name, value);
        });
        next();
    });
    if (allowedHosts.length > 0) {
        app.use(hostHeaderValidation(allowedHosts));
    }
    else if (isLoopbackHostname(host)) {
        app.use(localhostHostValidation());
    }
    app.use((req, res, next) => {
        const resolution = resolveOriginPolicy({
            allowedOrigins,
            headers: req.headers,
            path: getRequestPath(req),
        });
        if (!resolution.allowed) {
            logHttpDebug("request.rejected", {
                ...getRequestDebugDetails(req),
                reason: "forbidden-origin",
            });
            writeForbiddenOrigin(res);
            return;
        }
        res.locals.corsOrigin = resolution.responseOrigin;
        next();
    });
    app.use((_req, res, next) => {
        applyCorsHeaders(res, typeof res.locals.corsOrigin === "string" ? res.locals.corsOrigin : undefined);
        next();
    });
    if (auth.mode === "oauth") {
        const publicServerUrl = getPublicResourceServerUrl(auth);
        app.use(oauthBroker.callbackPath, oauthBroker.handleCallback);
        app.post("/authorize/consent", urlencodedParser, oauthBroker.handleConsent);
        app.use(mcpAuthRouter({
            baseUrl: oauthBroker.getIssuerUrl(),
            issuerUrl: oauthBroker.getIssuerUrl(),
            provider: oauthBroker.provider,
            resourceName: "YNAB MCP Bridge",
            resourceServerUrl: publicServerUrl,
            scopesSupported: auth.scopes.length > 0 ? auth.scopes : undefined,
        }));
    }
    app.use((req, res, next) => {
        if (req.method === "OPTIONS") {
            logHttpDebug("request.preflight", getRequestDebugDetails(req));
            applyCorsHeaders(res, typeof res.locals.corsOrigin === "string" ? res.locals.corsOrigin : undefined);
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
            verifier: oauthBroker.provider,
        });
        app.use((req, res, next) => {
            if (getRequestPath(req) !== path || !["DELETE", "GET", "POST"].includes(req.method)) {
                next();
                return;
            }
            if (isPublicJsonRpcRequest(req.body) || req.method === "GET" || req.method === "DELETE") {
                next();
                return;
            }
            applyCloudflareAccessAuthorizationHeader(req);
            if (getFirstHeaderValue(req.headers[CF_ACCESS_AUTHORIZATION_SOURCE_HEADER]) === "cf-access-jwt-assertion") {
                delete req.headers.authorization;
            }
            if (isDirectUpstreamBearerToken(req, auth)) {
                delete req.headers.authorization;
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
        const allowedMethods = auth.mode === "oauth"
            ? ["DELETE", "GET", "POST"]
            : HTTP_ALLOWED_METHODS;
        if (!allowedMethods.includes(req.method)) {
            logHttpDebug("request.rejected", {
                ...getRequestDebugDetails(req),
                reason: "method-not-allowed",
            });
            writeMethodNotAllowed(res, allowedMethods);
            return;
        }
        const parsedBody = req.body;
        const resolution = await resolveRequest(req, parsedBody, () => createManagedRequest(ynab, auth), auth.mode === "oauth"
            ? {
                createPersistentRequest: () => createPersistentManagedRequest(ynab, auth, (sessionId, managedRequest) => {
                    persistentRequests.set(sessionId, managedRequest);
                }, (sessionId) => {
                    persistentRequests.delete(sessionId);
                }),
                persistentRequests,
            }
            : undefined);
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
            if (resolution.cleanup) {
                res.once("close", () => {
                    void cleanup();
                });
            }
            logHttpDebug("transport.handoff", {
                ...getRequestDebugDetails(req),
                ...getJsonRpcDebugDetails(parsedBody),
                cleanup: Boolean(resolution.cleanup),
            });
            applyCorsHeaders(res, typeof res.locals.corsOrigin === "string" ? res.locals.corsOrigin : undefined);
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
            for (const managedRequest of new Set(persistentRequests.values())) {
                await managedRequest.close();
            }
            await closeNodeServer(server);
        },
    };
}
