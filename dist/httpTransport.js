import express from "express";
import { decodeJwt } from "jose";
import { hostHeaderValidation, localhostHostValidation, } from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { assertYnabConfig, validateCloudflareAccessOAuthSettings, } from "./config.js";
import { logAppEvent } from "./logger.js";
import { createCloudflareAccessCompatibilityMiddleware } from "./cloudflareCompatibility.js";
import { detectInitializeClientProfile, detectClientProfile, reconcileClientProfile, } from "./clientProfiles/detectClient.js";
import { getClientProfile } from "./clientProfiles/index.js";
import { getResolvedClientProfile, setResolvedClientProfile } from "./clientProfiles/profileContext.js";
import { logClientProfileEvent } from "./clientProfiles/profileLogger.js";
import { applyCorsHeaders, installCorsGuard, normalizeOrigin, resolveOriginPolicy } from "./originPolicy.js";
import { getFirstHeaderValue, isLoopbackHostname } from "./headerUtils.js";
import { createRequestContext, getCorrelationHeaderName, getRequestLogFields, hasToolCallStarted, runWithRequestContext, } from "./requestContext.js";
import { createMcpAuthModule, installOAuthRoutes } from "./oauthRuntime.js";
import { createServer } from "./serverRuntime.js";
const HTTP_ALLOWED_METHODS = ["POST"];
const CF_ACCESS_AUTHORIZATION_SOURCE_HEADER = "x-mcp-cf-access-authorization-source";
function getRequestPath(req) {
    if (typeof req.path === "string" && req.path.length > 0) {
        return req.path;
    }
    if (!req.url) {
        return "/";
    }
    return new URL(req.url, "http://127.0.0.1").pathname;
}
function toClientProfileRequestContext(req) {
    return {
        headers: req.headers,
        method: req.method ?? "GET",
        path: getRequestPath(req),
    };
}
function getCanonicalOAuthDiscoveryPath(pathname, profileId) {
    if (profileId === "chatgpt") {
        return undefined;
    }
    const profile = getClientProfile(profileId);
    const canonicalPath = "/.well-known/oauth-authorization-server";
    if (!profile.oauth.tolerateExtraDiscoveryProbes || pathname === canonicalPath) {
        return undefined;
    }
    return profile.oauth.discoveryPathVariants.includes(pathname)
        ? canonicalPath
        : undefined;
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
function writeJson(res, statusCode, body) {
    res.status(statusCode);
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
    logAppEvent("http", event, details);
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
function getNormalizedUserAgent(req) {
    const userAgent = getFirstHeaderValue(req.headers["user-agent"]);
    if (!userAgent) {
        return undefined;
    }
    if (userAgent.toLowerCase().startsWith("openai-mcp/")) {
        return "chatgpt";
    }
    return userAgent;
}
function hasHeaderValue(value) {
    return Boolean(getFirstHeaderValue(value));
}
function getRequestDebugDetails(req, options = {}) {
    const authSubject = req.auth?.extra?.subject;
    return {
        ...getRequestLogFields(),
        authMode: options.authMode,
        authClientId: req.auth?.clientId,
        authRequired: options.authRequired,
        authSubject: typeof authSubject === "string" ? authSubject : undefined,
        hasAuthorizationHeader: hasHeaderValue(req.headers.authorization),
        hasCfAccessJwtAssertion: hasHeaderValue(req.headers["cf-access-jwt-assertion"]),
        method: req.method ?? "UNKNOWN",
        origin: getFirstHeaderValue(req.headers.origin),
        path: getRequestPath(req),
        protocolVersion: getFirstHeaderValue(req.headers["mcp-protocol-version"]),
        sessionId: getSessionId(req),
        userAgent: getNormalizedUserAgent(req),
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
function getInitializeParams(parsedBody) {
    if (!parsedBody || typeof parsedBody !== "object") {
        return undefined;
    }
    const request = parsedBody;
    if (request.method !== "initialize" || !request.params || typeof request.params !== "object") {
        return undefined;
    }
    return request.params;
}
function getToolCallName(parsedBody) {
    if (!parsedBody || typeof parsedBody !== "object") {
        return undefined;
    }
    const request = parsedBody;
    if (request.method !== "tools/call" || !request.params || typeof request.params !== "object") {
        return undefined;
    }
    const name = request.params.name;
    return typeof name === "string" ? name : undefined;
}
function getBodyStringValue(body, key) {
    if (!body || typeof body !== "object") {
        return undefined;
    }
    const value = body[key];
    return typeof value === "string" ? value : undefined;
}
function getPersistedOAuthProfileReason(profileId) {
    return `oauth-client-profile:${profileId}`;
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
function allowsOpaqueNullOrigin(req, authMode) {
    return authMode === "oauth" &&
        req.method === "POST" &&
        getRequestPath(req) === "/authorize/consent";
}
export function installMcpPostRoute(options) {
    const { app, createManagedRequest, getInitializeParams, getJsonRpcDebugDetails, getRequestAuthDebugOptions, getRequestDebugDetails, getRequestPath, getToolCallName, logHttpDebug, path, resolveRequest, writeMethodNotAllowed, writeRequestResolution, } = options;
    app.use(async (req, res, next) => {
        if (getRequestPath(req) !== path) {
            next();
            return;
        }
        if (req.method !== "POST") {
            logHttpDebug("request.rejected", {
                ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
                reason: "method-not-allowed",
            });
            writeMethodNotAllowed(res, HTTP_ALLOWED_METHODS);
            return;
        }
        const parsedBody = req.body;
        const resolution = await resolveRequest(req, createManagedRequest);
        if (resolution.status === "invalid-session-header") {
            logHttpDebug("request.rejected", {
                ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
                reason: "invalid-session-header",
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
                void cleanup();
            });
            const provisionalProfile = getResolvedClientProfile(res.locals);
            const initializeParams = getInitializeParams(parsedBody);
            if (provisionalProfile && initializeParams) {
                const confirmedProfile = detectInitializeClientProfile({
                    capabilities: initializeParams.capabilities,
                    clientInfo: initializeParams.clientInfo,
                });
                const reconciliation = reconcileClientProfile(provisionalProfile, confirmedProfile);
                setResolvedClientProfile(res.locals, reconciliation.profile);
                if (!reconciliation.mismatch && confirmedProfile) {
                    logClientProfileEvent("profile.detected", {
                        method: req.method ?? "GET",
                        path: getRequestPath(req),
                        profileId: confirmedProfile.profileId,
                        reason: confirmedProfile.reason,
                    });
                }
                else if (reconciliation.mismatch && confirmedProfile) {
                    logClientProfileEvent("profile.reconciled", {
                        confirmedProfileId: confirmedProfile.profileId,
                        method: req.method ?? "GET",
                        path: getRequestPath(req),
                        profileId: reconciliation.profile.profileId,
                        provisionalProfileId: provisionalProfile.profileId,
                        reason: reconciliation.profile.reason,
                    });
                }
            }
            const resolvedProfile = getResolvedClientProfile(res.locals);
            logHttpDebug("transport.handoff", {
                ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
                ...getJsonRpcDebugDetails(parsedBody),
                cleanup: Boolean(resolution.cleanup),
                profileId: resolvedProfile?.profileId,
                profileReason: resolvedProfile?.reason,
            });
            await resolution.managedRequest.transport.handleRequest(req, res, parsedBody);
            const toolName = getToolCallName(parsedBody);
            if (toolName && !hasToolCallStarted()) {
                logHttpDebug("tool.dispatch.absent", {
                    ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
                    ...getJsonRpcDebugDetails(parsedBody),
                    toolName,
                });
            }
        }
        catch (error) {
            await cleanup();
            next(error);
        }
    });
}
export async function startHttpServer(options) {
    const allowedHosts = options.allowedHosts ?? [];
    const auth = options.auth ?? { deployment: "authless", mode: "none" };
    const allowedOrigins = new Set((options.allowedOrigins ?? []).map((origin) => normalizeOrigin(origin)));
    const host = options.host ?? "127.0.0.1";
    const path = options.path ?? "/mcp";
    const port = options.port ?? 3000;
    const ynab = assertYnabConfig(options.ynab);
    if (auth.mode === "oauth") {
        allowedOrigins.add(new URL(auth.publicUrl).origin);
    }
    if (auth.mode === "oauth") {
        validateCloudflareAccessOAuthSettings({
            authorizationUrl: auth.authorizationUrl,
            issuer: auth.issuer,
            jwksUrl: auth.jwksUrl,
            tokenUrl: auth.tokenUrl,
        });
    }
    const mcpAuthModule = auth.mode === "oauth" ? createMcpAuthModule(auth) : undefined;
    const cloudflareCompatibilityMiddleware = auth.mode === "oauth"
        ? createCloudflareAccessCompatibilityMiddleware(auth)
        : undefined;
    const app = express();
    const jsonParser = express.json();
    const urlencodedParser = express.urlencoded({ extended: false });
    function getRequestAuthDebugOptions(req) {
        const isProtectedMcpRequest = auth.mode === "oauth" && getRequestPath(req) === path;
        return {
            authMode: auth.mode,
            authRequired: isProtectedMcpRequest || undefined,
        };
    }
    app.disable("x-powered-by");
    app.set("trust proxy", 1);
    app.use((req, res, next) => {
        const requestContext = createRequestContext(req.headers);
        runWithRequestContext(requestContext, () => {
            res.setHeader(getCorrelationHeaderName(), requestContext.correlationId);
            next();
        });
    });
    app.use((req, _res, next) => {
        logHttpDebug("request.received", getRequestDebugDetails(req, getRequestAuthDebugOptions(req)));
        next();
    });
    app.use((req, res, next) => {
        if (auth.mode === "oauth" && getRequestPath(req) === "/token" && req.method === "POST") {
            urlencodedParser(req, res, next);
            return;
        }
        next();
    });
    app.use((req, res, next) => {
        const tokenClientId = auth.mode === "oauth" &&
            getRequestPath(req) === "/token" &&
            req.method === "POST"
            ? getBodyStringValue(req.body, "client_id")
            : undefined;
        const persistedProfileId = auth.mode === "oauth" && tokenClientId
            ? mcpAuthModule?.getClientCompatibilityProfile(tokenClientId)
            : undefined;
        const requestProfile = detectClientProfile(toClientProfileRequestContext(req));
        const detectedProfile = persistedProfileId && requestProfile.profileId === "generic"
            ? {
                profileId: persistedProfileId,
                reason: getPersistedOAuthProfileReason(persistedProfileId),
            }
            : requestProfile;
        setResolvedClientProfile(res.locals, detectedProfile);
        logClientProfileEvent("profile.detected", {
            method: req.method ?? "GET",
            path: getRequestPath(req),
            profileId: detectedProfile.profileId,
            reason: detectedProfile.reason,
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
            allowOpaqueNullOrigin: allowsOpaqueNullOrigin(req, auth.mode),
            allowedOrigins,
            headers: req.headers,
        });
        if (!resolution.allowed) {
            logHttpDebug("request.rejected", {
                ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
                reason: "forbidden-origin",
            });
            writeForbiddenOrigin(res);
            return;
        }
        applyCorsHeaders(res, resolution.responseOrigin);
        if (resolution.responseOrigin) {
            installCorsGuard(res, resolution.responseOrigin);
        }
        next();
    });
    if (auth.mode === "oauth") {
        installOAuthRoutes({
            app,
            auth,
            cloudflareCompatibilityMiddleware: cloudflareCompatibilityMiddleware,
            getCanonicalOAuthDiscoveryPath,
            getPersistedOAuthProfileReason,
            getRequestAuthDebugOptions,
            getRequestDebugDetails,
            getRequestPath,
            isDirectUpstreamBearerToken,
            jsonParser,
            logHttpDebug,
            mcpAuthModule: mcpAuthModule,
            path,
        });
    }
    app.use((req, res, next) => {
        if (req.method === "OPTIONS") {
            logHttpDebug("request.preflight", getRequestDebugDetails(req));
            res.status(204).end();
            return;
        }
        next();
    });
    app.use((req, res, next) => {
        if (auth.mode !== "oauth" && getRequestPath(req) === path && req.method === "POST") {
            jsonParser(req, res, next);
            return;
        }
        next();
    });
    installMcpPostRoute({
        app,
        createManagedRequest: () => createManagedRequest(ynab),
        getInitializeParams,
        getJsonRpcDebugDetails,
        getRequestAuthDebugOptions,
        getRequestDebugDetails,
        getRequestPath,
        getToolCallName,
        logHttpDebug,
        path,
        resolveRequest,
        writeMethodNotAllowed,
        writeRequestResolution,
    });
    app.use((req, res) => {
        logHttpDebug("request.rejected", {
            ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
            reason: "path-not-found",
        });
        writeNotFound(res);
    });
    const errorHandler = (error, req, res, next) => {
        const requestError = error;
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
        logAppEvent("http", "request.error", {
            ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
            error: requestError,
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
