import { createServer as createNodeServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { createServer } from "./server.js";
import { resetPlanResolutionState } from "./tools/planToolUtils.js";

export type HttpServerOptions = {
  allowedOrigins?: string[];
  host?: string;
  path?: string;
  port?: number;
};

export type StartedHttpServer = {
  close: () => Promise<void>;
  host: string;
  path: string;
  port: number;
  url: string;
};

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "OPTIONS, GET, POST, DELETE",
  "access-control-allow-headers": "content-type, mcp-session-id, mcp-protocol-version, authorization",
  "access-control-expose-headers": "Mcp-Session-Id",
} as const;

const MCP_ROUTE_METHODS = ["GET", "POST", "DELETE"] as const;
const AUTHLESS_MCP_ALLOWED_METHODS = ["POST", "DELETE"] as const;

type MappedRequestPath = "mcp" | "not-found";
type McpRouteMethod = (typeof MCP_ROUTE_METHODS)[number];

function applyCorsHeaders(res: ServerResponse) {
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(name, value);
  }
}

function getRequestPath(req: IncomingMessage) {
  if (!req.url) {
    return "/";
  }

  return new URL(req.url, "http://127.0.0.1").pathname;
}

function getFirstHeaderValue(value: string | string[] | undefined) {
  if (typeof value === "string") {
    return value.split(",")[0]?.trim();
  }

  return value?.[0]?.split(",")[0]?.trim();
}

function parseHostName(host: string | undefined) {
  if (!host) {
    return undefined;
  }

  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return undefined;
  }
}

function isLoopbackHostname(hostname: string | undefined) {
  return hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]" || hostname === "localhost";
}

function getRequestHostName(req: IncomingMessage) {
  const forwardedHost = getFirstHeaderValue(req.headers["x-forwarded-host"]);
  const host = forwardedHost ?? getFirstHeaderValue(req.headers.host);

  return parseHostName(host);
}

function normalizeOrigin(origin: string) {
  return new URL(origin).origin;
}

function isOriginAllowed(req: IncomingMessage, allowedOrigins: Set<string>) {
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
  } catch {
    return false;
  }
}

async function readJsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return undefined;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function writeJson(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  applyCorsHeaders(res);
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function writeJsonRpcError(res: ServerResponse, statusCode: number, message: string) {
  writeJson(res, statusCode, {
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message,
    },
    id: null,
  });
}

function writeMethodNotAllowed(res: ServerResponse, allowedMethods: readonly string[]) {
  res.setHeader("allow", allowedMethods.join(", "));
  writeJsonRpcError(res, 405, "Method not allowed.");
}

function mapRequestPath(requestPath: string, mcpPath: string): MappedRequestPath {
  return requestPath === mcpPath ? "mcp" : "not-found";
}

function isMcpRouteMethod(method: string | undefined): method is McpRouteMethod {
  return Boolean(method && MCP_ROUTE_METHODS.includes(method as McpRouteMethod));
}

function handleMcpRouteMethod(res: ServerResponse, method: McpRouteMethod) {
  if (method === "GET") {
    writeMethodNotAllowed(res, AUTHLESS_MCP_ALLOWED_METHODS);
    return false;
  }

  return true;
}

function writeNotFound(res: ServerResponse) {
  writeJson(res, 404, {
    error: "Not found",
  });
}

function writeForbiddenOrigin(res: ServerResponse) {
  writeJson(res, 403, {
    error: "Forbidden origin",
  });
}

function writeMissingSession(res: ServerResponse) {
  writeJsonRpcError(res, 400, "Bad Request: No valid session ID provided");
}

function writeParseError(res: ServerResponse) {
  writeJson(res, 400, {
    jsonrpc: "2.0",
    error: {
      code: -32700,
      message: "Parse error",
    },
    id: null,
  });
}

function writeInternalServerError(res: ServerResponse) {
  writeJson(res, 500, {
    jsonrpc: "2.0",
    error: {
      code: -32603,
      message: "Internal server error",
    },
    id: null,
  });
}

async function resolveManagedSession(
  req: IncomingMessage,
  parsedBody: unknown,
  sessions: Map<string, ManagedSession>,
  createManagedSession: () => Promise<ManagedSession>,
) {
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

async function readRequestBody(req: IncomingMessage) {
  return req.method === "POST" ? readJsonBody(req) : undefined;
}

function writeUnsupportedMcpMethod(res: ServerResponse) {
  writeMethodNotAllowed(res, MCP_ROUTE_METHODS);
}

function writeAuthlessMcpGetMethodNotAllowed(res: ServerResponse) {
  writeMethodNotAllowed(res, AUTHLESS_MCP_ALLOWED_METHODS);
}

function handleMcpRoute(res: ServerResponse, method: string | undefined) {
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

function writeRouteResponse(res: ServerResponse, route: MappedRequestPath) {
  if (route === "not-found") {
    writeNotFound(res);
    return false;
  }

  return true;
}

function writeOriginResponse(res: ServerResponse, isAllowed: boolean) {
  if (!isAllowed) {
    writeForbiddenOrigin(res);
    return false;
  }

  return true;
}

function writePreflightResponse(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "OPTIONS") {
    return false;
  }

  applyCorsHeaders(res);
  res.statusCode = 204;
  res.end();
  return true;
}

function isParseError(error: unknown): error is SyntaxError {
  return error instanceof SyntaxError;
}

function logRequestError(error: unknown) {
  console.error("Error handling MCP request:", error);
}

function writeUnhandledRequestError(res: ServerResponse) {
  if (!res.headersSent) {
    writeInternalServerError(res);
  }
}

function writeSessionError(res: ServerResponse, managedSession: ManagedSession | undefined) {
  if (!managedSession) {
    writeMissingSession(res);
    return false;
  }

  return true;
}

function getRouteMethod(req: IncomingMessage) {
  return req.method;
}

function getMappedRoute(req: IncomingMessage, path: string) {
  return mapRequestPath(getRequestPath(req), path);
}

function shouldHandleMcpRoute(req: IncomingMessage, res: ServerResponse, path: string, allowedOrigins: Set<string>) {
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

async function handleTransportRequest(
  req: IncomingMessage,
  res: ServerResponse,
  sessions: Map<string, ManagedSession>,
  createManagedSession: () => Promise<ManagedSession>,
) {
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

function handleRequestError(res: ServerResponse, error: unknown) {
  if (isParseError(error)) {
    writeParseError(res);
    return;
  }

  logRequestError(error);
  writeUnhandledRequestError(res);
}

function getSessionId(req: IncomingMessage) {
  return getFirstHeaderValue(req.headers["mcp-session-id"]);
}

type ManagedSession = {
  close: () => Promise<void>;
  transport: StreamableHTTPServerTransport;
};

export async function startHttpServer(options: HttpServerOptions = {}): Promise<StartedHttpServer> {
  const allowedOrigins = new Set((options.allowedOrigins ?? []).map((origin) => normalizeOrigin(origin)));
  const host = options.host ?? "127.0.0.1";
  const path = options.path ?? "/mcp";
  const port = options.port ?? 3000;
  const sessions = new Map<string, ManagedSession>();

  function removeSession(sessionId: string | undefined) {
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
    } satisfies ManagedSession;
  }

  const server = createNodeServer(async (req, res) => {
    if (!shouldHandleMcpRoute(req, res, path, allowedOrigins)) {
      return;
    }

    try {
      await handleTransportRequest(req, res, sessions, createManagedSession);
    } catch (error) {
      handleRequestError(res, error);
    }
  });

  await new Promise<void>((resolve, reject) => {
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

  const resolvedAddress = address as AddressInfo;

  return {
    host,
    path,
    port: resolvedAddress.port,
    url: `http://${host}:${resolvedAddress.port}${path}`,
    close: async () => {
      const sessionClosures = Array.from(sessions.values(), (session) => session.close());
      sessions.clear();
      resetPlanResolutionState();

      await new Promise<void>((resolve, reject) => {
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
