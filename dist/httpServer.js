import { createServer as createNodeServer } from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { getBackendReadiness } from "./runtimeConfig.js";
import { createServer } from "./server.js";
import { resetPlanResolutionState } from "./tools/planToolUtils.js";
const CORS_HEADERS = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "OPTIONS, GET, POST, DELETE",
    "access-control-allow-headers": "content-type, mcp-session-id, mcp-protocol-version, authorization",
    "access-control-expose-headers": "Mcp-Session-Id",
};
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
function getSessionId(req) {
    const sessionId = req.headers["mcp-session-id"];
    if (typeof sessionId === "string") {
        return sessionId;
    }
    return undefined;
}
export async function startHttpServer(options = {}) {
    const host = options.host ?? "0.0.0.0";
    const path = options.path ?? "/mcp";
    const port = options.port ?? 3000;
    const healthPath = "/health";
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
        const requestPath = getRequestPath(req);
        if (requestPath === healthPath && req.method === "GET") {
            writeJson(res, 200, {
                transport: "http",
                ...getBackendReadiness(process.env),
            });
            return;
        }
        if (requestPath !== path) {
            writeJson(res, 404, {
                error: "Not found",
            });
            return;
        }
        if (req.method === "OPTIONS") {
            applyCorsHeaders(res);
            res.statusCode = 204;
            res.end();
            return;
        }
        if (!req.method || !["GET", "POST", "DELETE"].includes(req.method)) {
            writeJson(res, 405, {
                jsonrpc: "2.0",
                error: {
                    code: -32000,
                    message: "Method not allowed.",
                },
                id: null,
            });
            return;
        }
        try {
            const parsedBody = req.method === "POST" ? await readJsonBody(req) : undefined;
            const sessionId = getSessionId(req);
            let managedSession = sessionId ? sessions.get(sessionId) : undefined;
            if (!managedSession) {
                if (req.method === "POST" && isInitializeRequest(parsedBody)) {
                    managedSession = await createManagedSession();
                }
                else {
                    writeJson(res, 400, {
                        jsonrpc: "2.0",
                        error: {
                            code: -32000,
                            message: "Bad Request: No valid session ID provided",
                        },
                        id: null,
                    });
                    return;
                }
            }
            applyCorsHeaders(res);
            await managedSession.transport.handleRequest(req, res, parsedBody);
        }
        catch (error) {
            if (error instanceof SyntaxError) {
                writeJson(res, 400, {
                    jsonrpc: "2.0",
                    error: {
                        code: -32700,
                        message: "Parse error",
                    },
                    id: null,
                });
                return;
            }
            console.error("Error handling MCP request:", error);
            if (!res.headersSent) {
                writeJson(res, 500, {
                    jsonrpc: "2.0",
                    error: {
                        code: -32603,
                        message: "Internal server error",
                    },
                    id: null,
                });
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
