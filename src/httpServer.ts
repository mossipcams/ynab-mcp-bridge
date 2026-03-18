import type { Server as NodeHttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import express, { type ErrorRequestHandler, type Request, type Response } from "express";
import { decodeJwt } from "jose";
import {
  hostHeaderValidation,
  localhostHostValidation,
} from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import {
  assertYnabConfig,
  validateCloudflareAccessOAuthSettings,
  type RuntimeAuthConfig,
  type YnabConfig,
} from "./config.js";
import { createCloudflareAccessCompatibilityMiddleware } from "./cloudflareCompatibility.js";
import { createMcpAuthModule } from "./mcpAuthServer.js";
import {
  detectClientProfile,
  detectInitializeClientProfile,
  reconcileClientProfile,
} from "./clientProfiles/detectClient.js";
import { getClientProfile } from "./clientProfiles/index.js";
import { getResolvedClientProfile, setResolvedClientProfile } from "./clientProfiles/profileContext.js";
import { logClientProfileEvent } from "./clientProfiles/profileLogger.js";
import type { RequestContext as ClientProfileRequestContext } from "./clientProfiles/types.js";
import { applyCorsHeaders, normalizeOrigin, resolveOriginPolicy } from "./originPolicy.js";
import { createServer } from "./server.js";

type HttpServerOptions = {
  allowedHosts?: string[];
  allowedOrigins?: string[];
  auth?: RuntimeAuthConfig;
  host?: string;
  path?: string;
  port?: number;
  ynab: YnabConfig;
};

type StartedHttpServer = {
  close: () => Promise<void>;
  host: string;
  path: string;
  port: number;
  url: string;
};

const HTTP_ALLOWED_METHODS = ["POST"] as const;
type ManagedRequest = {
  close: () => Promise<void>;
  transport: StreamableHTTPServerTransport;
};

type RequestResolution =
  | {
      cleanup?: () => Promise<void>;
      managedRequest: ManagedRequest;
      status: "ready";
    }
  | {
      status: "invalid-session-header";
    };

type HttpDebugDetails = Record<string, unknown>;

type JsonRpcRequestLike = {
  id?: unknown;
  method?: unknown;
  params?: unknown;
};

type InitializeParamsLike = {
  capabilities?: unknown;
  clientInfo?: unknown;
};

const CF_ACCESS_AUTHORIZATION_SOURCE_HEADER = "x-mcp-cf-access-authorization-source";

function getRequestPath(req: Pick<Request, "path" | "url">) {
  if (typeof req.path === "string" && req.path.length > 0) {
    return req.path;
  }

  if (!req.url) {
    return "/";
  }

  return new URL(req.url, "http://127.0.0.1").pathname;
}

function toClientProfileRequestContext(req: Pick<Request, "headers" | "method" | "path" | "url">): ClientProfileRequestContext {
  return {
    headers: req.headers as Record<string, string | string[] | undefined>,
    method: req.method ?? "GET",
    path: getRequestPath(req),
  };
}

function getCanonicalOAuthDiscoveryPath(pathname: string, profileId: "claude" | "codex" | "generic") {
  const profile = getClientProfile(profileId);
  const canonicalPath = "/.well-known/oauth-authorization-server";

  if (!profile.oauth.tolerateExtraDiscoveryProbes || pathname === canonicalPath) {
    return undefined;
  }

  return profile.oauth.discoveryPathVariants.includes(pathname)
    ? canonicalPath
    : undefined;
}

function getFirstHeaderValue(value: string | string[] | undefined) {
  if (typeof value === "string") {
    return value.split(",")[0]?.trim();
  }

  return value?.[0]?.split(",")[0]?.trim();
}

function getBearerToken(authorizationHeader: string | undefined) {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return undefined;
  }

  return authorizationHeader.slice("Bearer ".length).trim();
}

function isDirectUpstreamBearerToken(req: Pick<Request, "headers">, auth: Extract<RuntimeAuthConfig, { mode: "oauth" }>) {
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
  } catch {
    return false;
  }
}

function isLoopbackHostname(hostname: string | undefined) {
  return hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]" || hostname === "localhost";
}

function writeJson(res: Response, statusCode: number, body: unknown) {
  res.status(statusCode);
  applyCorsHeaders(res, typeof res.locals.corsOrigin === "string" ? res.locals.corsOrigin : undefined);
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function writeJsonRpcError(res: Response, statusCode: number, code: number, message: string) {
  writeJson(res, statusCode, {
    jsonrpc: "2.0",
    error: {
      code,
      message,
    },
    id: null,
  });
}

function writeMethodNotAllowed(res: Response, allowedMethods: readonly string[]) {
  res.setHeader("allow", allowedMethods.join(", "));
  writeJsonRpcError(res, 405, -32000, "Method not allowed.");
}

function writeNotFound(res: Response) {
  writeJson(res, 404, {
    error: "Not found",
  });
}

function writeForbiddenOrigin(res: Response) {
  writeJson(res, 403, {
    error: "Forbidden origin",
  });
}

function writeParseError(res: Response) {
  writeJsonRpcError(res, 400, -32700, "Parse error");
}

function writePayloadTooLarge(res: Response) {
  writeJsonRpcError(res, 413, -32000, "Payload too large");
}

function writeInternalServerError(res: Response) {
  writeJsonRpcError(res, 500, -32603, "Internal server error");
}

function logHttpDebug(event: string, details: HttpDebugDetails) {
  console.error("[http]", event, details);
}

function getSessionId(req: Pick<Request, "headers">) {
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

function hasHeaderValue(value: string | string[] | undefined) {
  return Boolean(getFirstHeaderValue(value));
}

function getRequestDebugDetails(
  req: Request,
  options: {
    authMode?: RuntimeAuthConfig["mode"];
    authRequired?: boolean;
  } = {},
): HttpDebugDetails {
  const authSubject = req.auth?.extra?.subject;
  return {
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
    userAgent: getFirstHeaderValue(req.headers["user-agent"]),
  };
}

function getJsonRpcDebugDetails(parsedBody: unknown): HttpDebugDetails {
  if (!parsedBody || typeof parsedBody !== "object") {
    return {};
  }

  const request = parsedBody as JsonRpcRequestLike;
  const details: HttpDebugDetails = {};

  if (typeof request.method === "string") {
    details.jsonRpcMethod = request.method;
  }

  if ("id" in request) {
    details.jsonRpcId = request.id;
  }

  return details;
}

function getInitializeParams(parsedBody: unknown) {
  if (!parsedBody || typeof parsedBody !== "object") {
    return undefined;
  }

  const request = parsedBody as JsonRpcRequestLike;

  if (request.method !== "initialize" || !request.params || typeof request.params !== "object") {
    return undefined;
  }

  return request.params as InitializeParamsLike;
}

function hasMultipleSessionHeaderValues(req: Pick<Request, "headers">) {
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

function isJsonParseError(error: unknown) {
  return error instanceof SyntaxError || (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === "entity.parse.failed"
  );
}

function isPayloadTooLargeError(error: unknown) {
  return typeof error === "object" &&
    error !== null &&
    (
      ("type" in error && error.type === "entity.too.large") ||
      ("status" in error && error.status === 413) ||
      ("statusCode" in error && error.statusCode === 413)
    );
}

async function createManagedRequest(config: YnabConfig) {
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
  } satisfies ManagedRequest;
}

async function resolveRequest(
  req: Request,
  createRequest: () => Promise<ManagedRequest>,
): Promise<RequestResolution> {
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

function writeRequestResolution(res: Response, resolution: Exclude<RequestResolution, {
  cleanup?: () => Promise<void>;
  managedRequest: ManagedRequest;
  status: "ready";
}>) {
  switch (resolution.status) {
    case "invalid-session-header":
      writeJsonRpcError(res, 400, -32000, "Bad Request: Mcp-Session-Id header must be a single value");
      return;
  }
}

async function closeNodeServer(server: NodeHttpServer) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        if ((error as NodeJS.ErrnoException).code === "ERR_SERVER_NOT_RUNNING") {
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

function allowsOpaqueNullOrigin(req: Pick<Request, "method" | "path" | "url">, authMode: RuntimeAuthConfig["mode"]) {
  return authMode === "oauth" &&
    req.method === "POST" &&
    getRequestPath(req) === "/authorize/consent";
}

export async function startHttpServer(options: HttpServerOptions): Promise<StartedHttpServer> {
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

  function getRequestAuthDebugOptions(req: Pick<Request, "path" | "url">) {
    const isProtectedMcpRequest = auth.mode === "oauth" && getRequestPath(req) === path;

    return {
      authMode: auth.mode,
      authRequired: isProtectedMcpRequest || undefined,
    };
  }

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use((req, _res, next) => {
    logHttpDebug("request.received", getRequestDebugDetails(req, getRequestAuthDebugOptions(req)));
    next();
  });

  app.use((req, res, next) => {
    const detectedProfile = detectClientProfile(toClientProfileRequestContext(req));

    setResolvedClientProfile(res.locals as Record<string, unknown>, detectedProfile);
    logClientProfileEvent("profile.detected", {
      method: req.method ?? "GET",
      path: getRequestPath(req),
      profileId: detectedProfile.profileId,
      reason: detectedProfile.reason,
    });

    next();
  });

  app.use((_req, res, next) => {
    const originalSetHeader = res.setHeader.bind(res);

    res.setHeader = ((name: string, value: number | string | readonly string[]) => {
      if (
        name.toLowerCase() === "access-control-allow-origin" &&
        typeof res.locals.corsOrigin === "string"
      ) {
        return originalSetHeader(name, res.locals.corsOrigin);
      }

      return originalSetHeader(name, value);
    }) as typeof res.setHeader;

    next();
  });

  if (allowedHosts.length > 0) {
    app.use(hostHeaderValidation(allowedHosts));
  } else if (isLoopbackHostname(host)) {
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

    res.locals.corsOrigin = resolution.responseOrigin;

    next();
  });

  app.use((_req, res, next) => {
    applyCorsHeaders(res, typeof res.locals.corsOrigin === "string" ? res.locals.corsOrigin : undefined);
    next();
  });

  if (auth.mode === "oauth") {
    app.use((req, res, next) => {
      const resolvedProfile = getResolvedClientProfile(res.locals as Record<string, unknown>);
      const canonicalPath = getCanonicalOAuthDiscoveryPath(
        getRequestPath(req),
        resolvedProfile?.profileId ?? "generic",
      );

      if (canonicalPath) {
        req.url = canonicalPath;
      }

      next();
    });

    app.use(mcpAuthModule!.router);
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
        cloudflareCompatibilityMiddleware!(req, res, (error?: unknown) => {
          if (error) {
            next(error);
            return;
          }

          jsonParser(req, res, next);
        });
        return;
      }

      jsonParser(req, res, next);
      return;
    }

    next();
  });

  if (auth.mode === "oauth") {
    app.use((req, res, next) => {
      if (getRequestPath(req) !== path || req.method !== "POST") {
        next();
        return;
      }

      if (isDirectUpstreamBearerToken(req, auth)) {
        delete req.headers.authorization;
      }

      res.once("finish", () => {
        if (req.auth || (res.statusCode !== 401 && res.statusCode !== 403)) {
          return;
        }

        logHttpDebug("request.rejected", {
          ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
          reason: res.statusCode === 401 ? "unauthorized" : "forbidden-scope",
        });
      });

      mcpAuthModule!.authMiddleware(req, res, next);
    });
  }

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

    const parsedBody: unknown = req.body;
    const resolution = await resolveRequest(
      req,
      () => createManagedRequest(ynab),
    );

    if (resolution.status !== "ready") {
      logHttpDebug("request.rejected", {
        ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
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
      res.once("close", () => {
        void cleanup();
      });

      const provisionalProfile = getResolvedClientProfile(res.locals as Record<string, unknown>);
      const initializeParams = getInitializeParams(parsedBody);

      if (provisionalProfile && initializeParams) {
        const confirmedProfile = detectInitializeClientProfile({
          capabilities: initializeParams.capabilities,
          clientInfo: initializeParams.clientInfo,
        });
        const reconciliation = reconcileClientProfile(provisionalProfile, confirmedProfile);

        setResolvedClientProfile(res.locals as Record<string, unknown>, reconciliation.profile);

        if (reconciliation.mismatch && confirmedProfile) {
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

      logHttpDebug("transport.handoff", {
        ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
        ...getJsonRpcDebugDetails(parsedBody),
        cleanup: Boolean(resolution.cleanup),
      });
      applyCorsHeaders(res, typeof res.locals.corsOrigin === "string" ? res.locals.corsOrigin : undefined);
      await resolution.managedRequest.transport.handleRequest(req, res, parsedBody);
    } catch (error) {
      await cleanup();
      next(error);
    }
  });

  app.use((req, res) => {
    logHttpDebug("request.rejected", {
      ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
      reason: "path-not-found",
    });
    writeNotFound(res);
  });

  const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
    const requestError: unknown = error;

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
      ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
      error: requestError,
    });

    writeInternalServerError(res);
  };

  app.use(errorHandler);

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

  const resolvedAddress = address as AddressInfo;
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
