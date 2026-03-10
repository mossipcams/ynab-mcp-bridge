import { createServer as createNodeServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";
const CORS_HEADERS = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "OPTIONS, POST",
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
export async function startHttpServer(options = {}) {
    const host = options.host ?? "0.0.0.0";
    const path = options.path ?? "/mcp";
    const port = options.port ?? 3000;
    const server = createNodeServer(async (req, res) => {
        if (getRequestPath(req) !== path) {
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
        if (req.method !== "POST") {
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
        const mcpServer = createServer();
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
        });
        try {
            const parsedBody = await readJsonBody(req);
            applyCorsHeaders(res);
            await mcpServer.connect(transport);
            await transport.handleRequest(req, res, parsedBody);
        }
        catch (error) {
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
        finally {
            res.on("close", () => {
                void transport.close();
                void mcpServer.close();
            });
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
            await new Promise((resolve, reject) => {
                server.close((error) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve();
                });
            });
        },
    };
}
