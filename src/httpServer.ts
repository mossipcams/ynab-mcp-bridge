import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import {
  assertYnabConfig,
  validateCloudflareAccessOAuthSettings,
  type RuntimeAuthConfig,
  type YnabConfig,
} from "./config.js";
import { createCloudflareAccessCompatibilityMiddleware } from "./cloudflareCompatibility.js";
import { createMcpAuthModule } from "./mcpAuthServer.js";
import { closeNodeServer, getRequestPath, type ManagedRequest, type StatefulSessionEntry } from "./httpServerShared.js";
import { registerHttpServerIngress } from "./httpServerIngress.js";
import { registerOAuthHttpRoutes } from "./httpServerOAuthRoutes.js";
import { registerMcpTransportRoutes } from "./httpServerTransportRoutes.js";
import { normalizeOrigin } from "./originPolicy.js";
import { createServer } from "./server.js";

type HttpServerOptions = {
  allowedHosts?: string[] | undefined;
  allowedOrigins?: string[] | undefined;
  auth?: RuntimeAuthConfig | undefined;
  host?: string | undefined;
  path?: string | undefined;
  port?: number | undefined;
  sessionIdleTimeoutMs?: number | undefined;
  ynab: YnabConfig;
};

type StartedHttpServer = {
  close: () => Promise<void>;
  host: string;
  path: string;
  port: number;
  url: string;
};

export async function startHttpServer(options: HttpServerOptions): Promise<StartedHttpServer> {
  const allowedHosts = options.allowedHosts ?? [];
  const auth = options.auth ?? { deployment: "authless", mode: "none" };
  const allowedOrigins = new Set((options.allowedOrigins ?? []).map((origin) => normalizeOrigin(origin)));
  const host = options.host ?? "127.0.0.1";
  const path = options.path ?? "/mcp";
  const port = options.port ?? 3000;
  const sessionIdleTimeoutMs = options.sessionIdleTimeoutMs ?? 5 * 60_000;
  const ynab = assertYnabConfig(options.ynab);

  if (auth.mode === "oauth") {
    allowedOrigins.add(new URL(auth.publicUrl).origin);
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
  const managedSessions = new Map<string, StatefulSessionEntry>();

  async function createManagedRequest(
    config: YnabConfig,
    requestOptions: {
      onSessionClosed?: ((sessionId: string) => void | Promise<void>) | undefined;
      onSessionInitialized?: ((sessionId: string, managedRequest: ManagedRequest) => void | Promise<void>) | undefined;
      onTransportClosed?: ((managedRequest: ManagedRequest) => void | Promise<void>) | undefined;
      stateful?: boolean | undefined;
    } = {},
  ) {
    const mcpServer = createServer(config);
    const transportOptions: ConstructorParameters<typeof StreamableHTTPServerTransport>[0] = {
      enableJsonResponse: true,
    };

    if (requestOptions.stateful) {
      transportOptions.onsessioninitialized = async (sessionId) => {
        await requestOptions.onSessionInitialized?.(sessionId, managedRequest);
      };
      transportOptions.sessionIdGenerator = () => randomUUID();

      if (requestOptions.onSessionClosed) {
        transportOptions.onsessionclosed = requestOptions.onSessionClosed;
      }
    }

    const nodeTransport = new StreamableHTTPServerTransport(transportOptions);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore The MCP SDK transport implementation matches the runtime contract,
    // but exactOptionalPropertyTypes rejects its optional callback fields.
    await mcpServer.connect(nodeTransport);

    let closed = false;
    const managedRequest = {
      transport: nodeTransport,
      close: async () => {
        if (closed) {
          return;
        }

        closed = true;
        await nodeTransport.close();
        await mcpServer.close();
      },
    } satisfies ManagedRequest;

    nodeTransport.onclose = () => {
      void requestOptions.onTransportClosed?.(managedRequest);

      if (!closed) {
        closed = true;
        void mcpServer.close();
      }
    };

    return managedRequest;
  }

  function clearSessionIdleTimeout(entry: StatefulSessionEntry) {
    if (entry.idleTimeout) {
      clearTimeout(entry.idleTimeout);
      entry.idleTimeout = undefined;
    }
  }

  function removeManagedSession(sessionId: string) {
    const entry = managedSessions.get(sessionId);

    if (!entry) {
      return undefined;
    }

    clearSessionIdleTimeout(entry);
    managedSessions.delete(sessionId);
    return entry;
  }

  async function closeManagedSession(sessionId: string) {
    const entry = removeManagedSession(sessionId);

    if (!entry) {
      return;
    }

    await entry.managedRequest.close();
  }

  function touchManagedSession(sessionId: string) {
    const entry = managedSessions.get(sessionId);

    if (!entry) {
      return;
    }

    clearSessionIdleTimeout(entry);

    if (sessionIdleTimeoutMs <= 0) {
      return;
    }

    entry.idleTimeout = setTimeout(() => {
      void closeManagedSession(sessionId);
    }, sessionIdleTimeoutMs);
    entry.idleTimeout.unref?.();
  }

  function getRequestAuthDebugOptions(req: Pick<express.Request, "path" | "url">) {
    const isProtectedMcpRequest = auth.mode === "oauth" && getRequestPath(req) === path;

    return isProtectedMcpRequest
      ? { authMode: auth.mode, authRequired: true }
      : { authMode: auth.mode };
  }

  registerHttpServerIngress({
    allowedHosts,
    allowedOrigins,
    app,
    auth,
    cloudflareCompatibilityMiddleware,
    getRequestAuthDebugOptions,
    host,
    mcpAuthModule,
    path,
    jsonParser,
    urlencodedParser,
  });

  if (auth.mode === "oauth" && mcpAuthModule) {
    registerOAuthHttpRoutes({
      app,
      auth,
      getRequestAuthDebugOptions,
      mcpAuthModule,
      path,
    });
  }

  registerMcpTransportRoutes({
    app,
    createStatefulRequest: async (config, sessions) => createManagedRequest(config, {
      onSessionClosed: async (sessionId) => {
        removeManagedSession(sessionId);
      },
      onSessionInitialized: async (sessionId, managedRequest) => {
        sessions.set(sessionId, {
          idleTimeout: undefined,
          managedRequest,
        });
        touchManagedSession(sessionId);
      },
      onTransportClosed: (managedRequest) => {
        const sessionId = managedRequest.transport.sessionId;

        if (!sessionId) {
          return;
        }

        removeManagedSession(sessionId);
      },
      stateful: true,
    }),
    createStatelessRequest: async (config) => createManagedRequest(config),
    getRequestAuthDebugOptions,
    managedSessions,
    path,
    touchManagedSession,
    ynab,
  });

  const server = app.listen(port, host);

  await new Promise<void>((resolve, reject) => {
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

  const resolvedAddress: AddressInfo = address;
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
      await Promise.all(Array.from(managedSessions.keys(), async (sessionId) => {
        await closeManagedSession(sessionId);
      }));
      await closeNodeServer(server);
    },
  };
}
