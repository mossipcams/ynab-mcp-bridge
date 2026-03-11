import { createServer as createNodeServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { TLSSocket } from "node:tls";

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

function getProtectedResourceMetadataPaths(path: string) {
  const basePath = "/.well-known/oauth-protected-resource";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (normalizedPath === "/") {
    return new Set([basePath]);
  }

  return new Set([basePath, `${basePath}${normalizedPath}`]);
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

function getPublicBaseUrl(req: IncomingMessage) {
  const forwardedProto = getFirstHeaderValue(req.headers["x-forwarded-proto"]);
  const forwardedHost = getFirstHeaderValue(req.headers["x-forwarded-host"]);
  const host = forwardedHost ?? getFirstHeaderValue(req.headers.host);
  const socket = req.socket as TLSSocket;
  const protocol = forwardedProto ?? (socket.encrypted ? "https" : "http");

  if (!host) {
    return undefined;
  }

  return `${protocol}://${host}`;
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

function getProtectedResourceMetadata(req: IncomingMessage, path: string, fallbackUrl: string) {
  const baseUrl = getPublicBaseUrl(req) ?? new URL(fallbackUrl).origin;

  return {
    resource: new URL(path, `${baseUrl}/`).href,
  };
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

function getSessionId(req: IncomingMessage) {
  const sessionId = req.headers["mcp-session-id"];

  if (typeof sessionId === "string") {
    return sessionId;
  }

  return undefined;
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
  const protectedResourceMetadataPaths = getProtectedResourceMetadataPaths(path);

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
    const requestPath = getRequestPath(req);

    if (!isOriginAllowed(req, allowedOrigins)) {
      writeJson(res, 403, {
        error: "Forbidden origin",
      });
      return;
    }

    if (req.method === "OPTIONS") {
      applyCorsHeaders(res);
      res.statusCode = 204;
      res.end();
      return;
    }

    if (protectedResourceMetadataPaths.has(requestPath)) {
      writeJson(res, 200, getProtectedResourceMetadata(req, path, `http://${host}:${port}${path}`));
      return;
    }

    if (requestPath !== path) {
      writeJson(res, 404, {
        error: "Not found",
      });
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
        } else {
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
    } catch (error) {
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
