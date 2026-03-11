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
function writeMissingSession(res) {
    writeJsonRpcError(res, 400, -32000, "Bad Request: No valid session ID provided");
}
function writeInvalidSession(res) {
    writeJsonRpcError(res, 404, -32001, "Session not found");
}
function writeParseError(res) {
    writeJsonRpcError(res, 400, -32700, "Parse error");
}
function writeInternalServerError(res) {
    writeJsonRpcError(res, 500, -32603, "Internal server error");
}
function getSessionId(req) {
    return getFirstHeaderValue(req.headers["mcp-session-id"]);
}
function normalizeSessionHeader(req, sessionId) {
    req.headers["mcp-session-id"] = sessionId;
}
async function createManagedSession(sessions, removeSession) {
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
async function resolveSession(req, parsedBody, sessions, createSession) {
    const sessionId = getSessionId(req);
    if (sessionId) {
        const managedSession = sessions.get(sessionId);
        if (!managedSession) {
            return {
                status: "invalid-session",
            };
        }
        normalizeSessionHeader(req, managedSession.transport.sessionId ?? sessionId);
        return {
            managedSession,
            status: "ready",
        };
    }
    if (req.method === "POST" && isInitializeRequest(parsedBody)) {
        return {
            managedSession: await createSession(),
            status: "ready",
        };
    }
    if (req.method === "GET") {
        return {
            status: "method-not-allowed",
        };
    }
    return {
        status: "missing-session",
    };
}
function writeSessionResolution(res, resolution) {
    switch (resolution.status) {
        case "invalid-session":
            writeInvalidSession(res);
            return;
        case "method-not-allowed":
            writeMethodNotAllowed(res, AUTHLESS_MCP_ALLOWED_METHODS);
            return;
        case "missing-session":
            writeMissingSession(res);
            return;
    }
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
    const server = createNodeServer(async (req, res) => {
        if (!isOriginAllowed(req, allowedOrigins)) {
            writeForbiddenOrigin(res);
            return;
        }
        if (req.method === "OPTIONS") {
            applyCorsHeaders(res);
            res.statusCode = 204;
            res.end();
            return;
        }
        if (getRequestPath(req) !== path) {
            writeNotFound(res);
            return;
        }
        if (!req.method || !MCP_ROUTE_METHODS.includes(req.method)) {
            writeMethodNotAllowed(res, MCP_ROUTE_METHODS);
            return;
        }
        try {
            const parsedBody = req.method === "POST" ? await readJsonBody(req) : undefined;
            const resolution = await resolveSession(req, parsedBody, sessions, async () => createManagedSession(sessions, removeSession));
            if (resolution.status !== "ready") {
                writeSessionResolution(res, resolution);
                return;
            }
            applyCorsHeaders(res);
            await resolution.managedSession.transport.handleRequest(req, res, parsedBody);
        }
        catch (error) {
            if (error instanceof SyntaxError) {
                writeParseError(res);
                return;
            }
            console.error("Error handling MCP request:", error);
            if (!res.headersSent) {
                writeInternalServerError(res);
            }
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
