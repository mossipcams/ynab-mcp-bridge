import { createServer as createNodeServer } from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "./server.js";
import { resetPlanResolutionState } from "./tools/planToolUtils.js";
const CORS_HEADERS = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "OPTIONS, GET, POST, DELETE",
    "access-control-allow-headers": "content-type, mcp-session-id, mcp-protocol-version, authorization",
    "access-control-expose-headers": "Mcp-Session-Id",
};
const MCP_ROUTE_METHODS = ["GET", "POST", "DELETE"];
const AUTHLESS_MCP_ALLOWED_METHODS = ["POST", "DELETE"];
function applyCorsHeaders(res) {
    for (const [name, value] of Object.entries(CORS_HEADERS)) {
        res.setHeader(name, value);
    }
}
function getRequestPath(req) {
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
async function readJsonBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    if (chunks.length === 0) {
        return undefined;
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function writeJson(res, statusCode, body) {
    res.statusCode = statusCode;
    applyCorsHeaders(res);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
}
function writeJsonRpcError(res, statusCode, message) {
    writeJson(res, statusCode, {
        jsonrpc: "2.0",
        error: {
            code: -32000,
            message,
        },
        id: null,
    });
}
function writeMethodNotAllowed(res, allowedMethods) {
    res.setHeader("allow", allowedMethods.join(", "));
    writeJsonRpcError(res, 405, "Method not allowed.");
}
function mapRequestPath(requestPath, mcpPath) {
    return requestPath === mcpPath ? "mcp" : "not-found";
}
function isMcpRouteMethod(method) {
    return Boolean(method && MCP_ROUTE_METHODS.includes(method));
}
function handleMcpRouteMethod(res, method) {
    if (method === "GET") {
        writeMethodNotAllowed(res, AUTHLESS_MCP_ALLOWED_METHODS);
        return false;
    }
    return true;
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
function writeMissingSession(res) {
    writeJsonRpcError(res, 400, "Bad Request: No valid session ID provided");
}
function writeParseError(res) {
    writeJson(res, 400, {
        jsonrpc: "2.0",
        error: {
            code: -32700,
            message: "Parse error",
        },
        id: null,
    });
}
function writeInternalServerError(res) {
    writeJson(res, 500, {
        jsonrpc: "2.0",
        error: {
            code: -32603,
            message: "Internal server error",
        },
        id: null,
    });
}
async function resolveManagedSession(req, parsedBody, sessions, createManagedSession) {
    const sessionId = getSessionId(req);
    const managedSession = sessionId ? sessions.get(sessionId) : undefined;
    if (managedSession) {
        return managedSession;
    }
    if (req.method === "POST" && isInitializeRequest(parsedBody)) {
        return createManagedSession();
    }
    return undefined;
}
async function readRequestBody(req) {
    return req.method === "POST" ? readJsonBody(req) : undefined;
}
function writeUnsupportedMcpMethod(res) {
    writeMethodNotAllowed(res, MCP_ROUTE_METHODS);
}
function writeAuthlessMcpGetMethodNotAllowed(res) {
    writeMethodNotAllowed(res, AUTHLESS_MCP_ALLOWED_METHODS);
}
function handleMcpRoute(res, method) {
    if (!isMcpRouteMethod(method)) {
        writeUnsupportedMcpMethod(res);
        return false;
    }
    if (method === "GET") {
        writeAuthlessMcpGetMethodNotAllowed(res);
        return false;
    }
    return true;
}
function writeRouteResponse(res, route) {
    if (route === "not-found") {
        writeNotFound(res);
        return false;
    }
    return true;
}
function writeOriginResponse(res, isAllowed) {
    if (!isAllowed) {
        writeForbiddenOrigin(res);
        return false;
    }
    return true;
}
function writePreflightResponse(req, res) {
    if (req.method !== "OPTIONS") {
        return false;
    }
    applyCorsHeaders(res);
    res.statusCode = 204;
    res.end();
    return true;
}
function isParseError(error) {
    return error instanceof SyntaxError;
}
function logRequestError(error) {
    console.error("Error handling MCP request:", error);
}
function writeUnhandledRequestError(res) {
    if (!res.headersSent) {
        writeInternalServerError(res);
    }
}
function writeSessionError(res, managedSession) {
    if (!managedSession) {
        writeMissingSession(res);
        return false;
    }
    return true;
}
function getRouteMethod(req) {
    return req.method;
}
function getMappedRoute(req, path) {
    return mapRequestPath(getRequestPath(req), path);
}
function shouldHandleMcpRoute(req, res, path, allowedOrigins) {
    if (!writeOriginResponse(res, isOriginAllowed(req, allowedOrigins))) {
        return false;
    }
    if (writePreflightResponse(req, res)) {
        return false;
    }
    if (!writeRouteResponse(res, getMappedRoute(req, path))) {
        return false;
    }
    return handleMcpRoute(res, getRouteMethod(req));
}
async function handleTransportRequest(req, res, sessions, createManagedSession) {
    const parsedBody = await readRequestBody(req);
    const managedSession = await resolveManagedSession(req, parsedBody, sessions, createManagedSession);
    if (!writeSessionError(res, managedSession)) {
        return;
    }
    if (!managedSession) {
        return;
    }
    if (req.method !== "POST" || !isInitializeRequest(parsedBody)) {
        req.headers["mcp-session-id"] = managedSession.transport.sessionId;
    }
    applyCorsHeaders(res);
    await managedSession.transport.handleRequest(req, res, parsedBody);
}
function handleRequestError(res, error) {
    if (isParseError(error)) {
        writeParseError(res);
        return;
    }
    logRequestError(error);
    writeUnhandledRequestError(res);
}
function getSessionId(req) {
    return getFirstHeaderValue(req.headers["mcp-session-id"]);
}
export async function startHttpServer(options = {}) {
    const allowedOrigins = new Set((options.allowedOrigins ?? []).map((origin) => normalizeOrigin(origin)));
    const host = options.host ?? "127.0.0.1";
    const path = options.path ?? "/mcp";
    const port = options.port ?? 3000;
    const sessions = new Map();
    function removeSession(sessionId) {
        if (!sessionId) {
            return;
        }
        sessions.delete(sessionId);
        if (sessions.size === 0) {
            resetPlanResolutionState();
        }
    }
    async function createManagedSession() {
        const mcpServer = createServer();
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: async (sessionId) => {
                sessions.set(sessionId, {
                    transport,
                    close: async () => {
                        await transport.close();
                        await mcpServer.close();
                    },
                });
            },
            onsessionclosed: async (sessionId) => {
                removeSession(sessionId);
                await mcpServer.close();
            },
        });
        transport.onclose = () => {
            removeSession(transport.sessionId);
        };
        await mcpServer.connect(transport);
        return {
            transport,
            close: async () => {
                await transport.close();
                await mcpServer.close();
            },
        };
    }
    const server = createNodeServer(async (req, res) => {
        if (!shouldHandleMcpRoute(req, res, path, allowedOrigins)) {
            return;
        }
        try {
            await handleTransportRequest(req, res, sessions, createManagedSession);
        }
        catch (error) {
            handleRequestError(res, error);
        }
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
            server.off("error", reject);
            resolve();
        });
    });
    const address = server.address();
    if (!address || typeof address === "string") {
        throw new Error("HTTP server did not expose a TCP address");
    }
    const resolvedAddress = address;
    return {
        host,
        path,
        port: resolvedAddress.port,
        url: `http://${host}:${resolvedAddress.port}${path}`,
        close: async () => {
            const sessionClosures = Array.from(sessions.values(), (session) => session.close());
            sessions.clear();
            resetPlanResolutionState();
            await new Promise((resolve, reject) => {
                server.close((error) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve();
                });
            });
            await Promise.allSettled(sessionClosures);
        },
    };
}
