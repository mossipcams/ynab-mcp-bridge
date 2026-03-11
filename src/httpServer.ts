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

type ManagedSession = {
  close: () => Promise<void>;
  transport: StreamableHTTPServerTransport;
};

type SessionResolution =
  | {
      cleanup?: () => Promise<void>;
      managedSession: ManagedSession;
      status: "ready";
    }
  | {
      status: "invalid-session-header";
    }
  | {
      status: "method-not-allowed";
    };

type HttpDebugDetails = Record<string, unknown>;

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

function writeJsonRpcError(res: ServerResponse, statusCode: number, code: number, message: string) {
  writeJson(res, statusCode, {
    jsonrpc: "2.0",
    error: {
      code,
      message,
    },
    id: null,
  });
}

function writeMethodNotAllowed(res: ServerResponse, allowedMethods: readonly string[]) {
  res.setHeader("allow", allowedMethods.join(", "));
  writeJsonRpcError(res, 405, -32000, "Method not allowed.");
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

function writeParseError(res: ServerResponse) {
  writeJsonRpcError(res, 400, -32700, "Parse error");
}

function writeInternalServerError(res: ServerResponse) {
  writeJsonRpcError(res, 500, -32603, "Internal server error");
}

function logHttpDebug(event: string, details: HttpDebugDetails) {
  console.error("[http]", event, details);
}

function getSessionId(req: IncomingMessage) {
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

function getRequestDebugDetails(req: IncomingMessage): HttpDebugDetails {
  return {
    method: req.method ?? "UNKNOWN",
    origin: getFirstHeaderValue(req.headers.origin),
    path: getRequestPath(req),
    protocolVersion: getFirstHeaderValue(req.headers["mcp-protocol-version"]),
    sessionId: getSessionId(req),
  };
}

function hasMultipleSessionHeaderValues(req: IncomingMessage) {
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

async function createManagedSession(
  sessions: Map<string, ManagedSession>,
  removeSession: (sessionId: string | undefined) => void,
  onSessionInitialized?: (sessionId: string) => void,
) {
  const mcpServer = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: async (sessionId) => {
      onSessionInitialized?.(sessionId);
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

function getAnyManagedSession(sessions: Map<string, ManagedSession>) {
  return sessions.values().next().value as ManagedSession | undefined;
}

async function resolveSession(
  req: IncomingMessage,
  parsedBody: unknown,
  sessions: Map<string, ManagedSession>,
  createSession: () => Promise<ManagedSession>,
): Promise<SessionResolution> {
  if (req.method === "POST" && isInitializeRequest(parsedBody)) {
    return {
      managedSession: await createSession(),
      status: "ready",
    };
  }

  if (hasMultipleSessionHeaderValues(req)) {
    return {
      status: "invalid-session-header",
    };
  }

  const sessionId = getSessionId(req);

  if (sessionId) {
    const managedSession = sessions.get(sessionId);

    if (!managedSession) {
      const fallbackSession = getAnyManagedSession(sessions);

      if (fallbackSession) {
        return {
          managedSession: fallbackSession,
          status: "ready",
        };
      }

      const ephemeralSession = await createSession();

      return {
        cleanup: ephemeralSession.close,
        managedSession: ephemeralSession,
        status: "ready",
      };
    }

    return {
      managedSession,
      status: "ready",
    };
  }

  const fallbackSession = getAnyManagedSession(sessions);

  if (req.method === "GET" && !fallbackSession) {
    return {
      status: "method-not-allowed",
    };
  }

  if (fallbackSession) {
    return {
      managedSession: fallbackSession,
      status: "ready",
    };
  }

  const ephemeralSession = await createSession();

  return {
    cleanup: ephemeralSession.close,
    managedSession: ephemeralSession,
    status: "ready",
  };
}

function writeSessionResolution(res: ServerResponse, resolution: Exclude<SessionResolution, { cleanup?: () => Promise<void>; managedSession: ManagedSession; status: "ready" }>) {
  switch (resolution.status) {
    case "invalid-session-header":
      writeJsonRpcError(res, 400, -32000, "Bad Request: Mcp-Session-Id header must be a single value");
      return;
    case "method-not-allowed":
      writeMethodNotAllowed(res, AUTHLESS_MCP_ALLOWED_METHODS);
      return;
  }
}

export async function startHttpServer(options: HttpServerOptions = {}): Promise<StartedHttpServer> {
  const allowedOrigins = new Set((options.allowedOrigins ?? []).map((origin) => normalizeOrigin(origin)));
  const host = options.host ?? "127.0.0.1";
  const path = options.path ?? "/mcp";
  const port = options.port ?? 3000;
  const sessions = new Map<string, ManagedSession>();

  function removeSession(sessionId: string | undefined) {
    if (!sessionId || !sessions.has(sessionId)) {
      return;
    }

    logHttpDebug("session.closed", {
      path,
      sessionId,
    });
    sessions.delete(sessionId);

    if (sessions.size === 0) {
      resetPlanResolutionState();
    }
  }

  const server = createNodeServer(async (req, res) => {
    logHttpDebug("request.received", getRequestDebugDetails(req));

    if (!isOriginAllowed(req, allowedOrigins)) {
      logHttpDebug("request.rejected", {
        ...getRequestDebugDetails(req),
        reason: "forbidden-origin",
      });
      writeForbiddenOrigin(res);
      return;
    }

    if (req.method === "OPTIONS") {
      logHttpDebug("request.preflight", getRequestDebugDetails(req));
      applyCorsHeaders(res);
      res.statusCode = 204;
      res.end();
      return;
    }

    if (getRequestPath(req) !== path) {
      logHttpDebug("request.rejected", {
        ...getRequestDebugDetails(req),
        reason: "path-not-found",
      });
      writeNotFound(res);
      return;
    }

    if (!req.method || !MCP_ROUTE_METHODS.includes(req.method as (typeof MCP_ROUTE_METHODS)[number])) {
      logHttpDebug("request.rejected", {
        ...getRequestDebugDetails(req),
        reason: "unsupported-method",
      });
      writeMethodNotAllowed(res, MCP_ROUTE_METHODS);
      return;
    }

    try {
      const parsedBody = req.method === "POST" ? await readJsonBody(req) : undefined;
      const resolution = await resolveSession(
        req,
        parsedBody,
        sessions,
        async () => createManagedSession(sessions, removeSession, (sessionId) => {
          logHttpDebug("session.initialized", {
            path,
            sessionId,
          });
        }),
      );

      if (resolution.status !== "ready") {
        logHttpDebug("session.rejected", {
          ...getRequestDebugDetails(req),
          reason: resolution.status,
        });
        writeSessionResolution(res, resolution);
        return;
      }

      try {
        logHttpDebug("transport.handoff", {
          ...getRequestDebugDetails(req),
          cleanup: Boolean(resolution.cleanup),
        });
        applyCorsHeaders(res);
        await resolution.managedSession.transport.handleRequest(req, res, parsedBody);
      } finally {
        await resolution.cleanup?.();
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        logHttpDebug("request.parse_error", getRequestDebugDetails(req));
        writeParseError(res);
        return;
      }

      console.error("Error handling MCP request:", {
        ...getRequestDebugDetails(req),
        error,
      });

      if (!res.headersSent) {
        writeInternalServerError(res);
      }
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
