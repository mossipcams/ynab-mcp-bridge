import type { Server as NodeHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";

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
import { logAppEvent } from "./logger.js";
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
import type { ClientProfileId, RequestContext as ClientProfileRequestContext } from "./clientProfiles/types.js";
import { applyCorsHeaders, installCorsGuard, normalizeOrigin, resolveOriginPolicy } from "./originPolicy.js";
import { getFirstHeaderValue, isLoopbackHostname } from "./headerUtils.js";
import { createServer } from "./server.js";
import { getRecordValueIfObject, getStringValue, isRecord } from "./typeUtils.js";

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

const HTTP_ALLOWED_METHODS = ["POST", "DELETE"] as const;
type ManagedRequest = {
  close: () => Promise<void>;
  transport: StreamableHTTPServerTransport;
};

type StatefulSessionEntry = {
  idleTimeout: NodeJS.Timeout | undefined;
  managedRequest: ManagedRequest;
};

type RequestResolution =
  | {
      cleanup?: (() => Promise<void>) | undefined;
      managedRequest: ManagedRequest;
      status: "ready";
    }
  | {
      status: "session-required";
    }
  | {
      status: "session-not-found";
    }
  | {
      status: "invalid-session-header";
    };

type HttpDebugDetails = Record<string, unknown>;

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

function toClientProfileHeaders(headers: Pick<Request, "headers">["headers"]): ClientProfileRequestContext["headers"] {
  const normalizedHeaders: Record<string, string | string[] | undefined> = {};

  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      normalizedHeaders[name] = value;
      continue;
    }

    if (Array.isArray(value)) {
      normalizedHeaders[name] = value;
      continue;
    }

    normalizedHeaders[name] = undefined;
  }

  return normalizedHeaders;
}

function toClientProfileRequestContext(req: Pick<Request, "headers" | "method" | "path" | "url">): ClientProfileRequestContext {
  return {
    headers: toClientProfileHeaders(req.headers),
    method: req.method ?? "GET",
    path: getRequestPath(req),
  };
}

function getCanonicalOAuthDiscoveryPath(pathname: string, profileId: ClientProfileId) {
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

function writeJson(res: Response, statusCode: number, body: unknown) {
  res.status(statusCode);
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
  logAppEvent("http", event, details);
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

function getNormalizedUserAgent(req: Pick<Request, "headers">) {
  const userAgent = getFirstHeaderValue(req.headers["user-agent"]);

  if (!userAgent) {
    return undefined;
  }

  if (userAgent.toLowerCase().startsWith("openai-mcp/")) {
    return "chatgpt";
  }

  return userAgent;
}

function hasHeaderValue(value: string | string[] | undefined) {
  return Boolean(getFirstHeaderValue(value));
}

function getRequestDebugDetails(
  req: Request,
  options: {
    authMode?: RuntimeAuthConfig["mode"] | undefined;
    authRequired?: boolean | undefined;
  } = {},
): HttpDebugDetails {
  const authSubject = req.auth?.extra?.["subject"];
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
    userAgent: getNormalizedUserAgent(req),
  };
}

function getJsonRpcDebugDetails(parsedBody: unknown): HttpDebugDetails {
  if (!isRecord(parsedBody)) {
    return {};
  }

  const details: HttpDebugDetails = {};
  const method = getStringValue(parsedBody, "method");

  if (method) {
    details["jsonRpcMethod"] = method;
  }

  if ("id" in parsedBody) {
    details["jsonRpcId"] = parsedBody["id"];
  }

  return details;
}

function getInitializeParams(parsedBody: unknown) {
  if (!isRecord(parsedBody)) {
    return undefined;
  }

  if (getStringValue(parsedBody, "method") !== "initialize") {
    return undefined;
  }

  const params = getRecordValueIfObject(parsedBody, "params");

  if (!params) {
    return undefined;
  }

  return {
    capabilities: params["capabilities"],
    clientInfo: params["clientInfo"],
  } satisfies InitializeParamsLike;
}

function getBodyStringValue(body: unknown, key: string) {
  if (!isRecord(body)) {
    return undefined;
  }

  const value = body[key];
  return typeof value === "string" ? value : undefined;
}

function getPersistedOAuthProfileReason(profileId: ClientProfileId) {
  return `oauth-client-profile:${profileId}`;
}

function reconcileResolvedProfile(
  req: Pick<Request, "method" | "path" | "url">,
  locals: Record<string, unknown>,
  parsedBody: unknown,
): ReturnType<typeof getResolvedClientProfile> {
  const provisionalProfile = getResolvedClientProfile(locals);
  const initializeParams = getInitializeParams(parsedBody);

  if (!provisionalProfile || !initializeParams) {
    return provisionalProfile;
  }

  const confirmedProfile = detectInitializeClientProfile({
    capabilities: initializeParams.capabilities,
    clientInfo: initializeParams.clientInfo,
  });
  const reconciliation = reconcileClientProfile(provisionalProfile, confirmedProfile);

  setResolvedClientProfile(locals, reconciliation.profile);

  if (!reconciliation.mismatch && confirmedProfile) {
    logClientProfileEvent("profile.detected", {
      method: req.method ?? "GET",
      path: getRequestPath(req),
      profileId: confirmedProfile.profileId,
      reason: confirmedProfile.reason,
    });
  } else if (reconciliation.mismatch && confirmedProfile) {
    logClientProfileEvent("profile.reconciled", {
      confirmedProfileId: confirmedProfile.profileId,
      method: req.method ?? "GET",
      path: getRequestPath(req),
      profileId: reconciliation.profile.profileId,
      provisionalProfileId: provisionalProfile.profileId,
      reason: reconciliation.profile.reason,
    });
  }

  return getResolvedClientProfile(locals);
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

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return isRecord(error) && typeof error["code"] === "string";
}

async function createManagedRequest(
  config: YnabConfig,
  options: {
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

  if (options.stateful) {
    transportOptions.onsessioninitialized = async (sessionId) => {
      await options.onSessionInitialized?.(sessionId, managedRequest);
    };
    transportOptions.sessionIdGenerator = () => randomUUID();

    if (options.onSessionClosed) {
      transportOptions.onsessionclosed = options.onSessionClosed;
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
    void options.onTransportClosed?.(managedRequest);

    if (!closed) {
      closed = true;
      void mcpServer.close();
    }
  };

  return managedRequest;
}

async function resolveRequest(
  req: Request,
  options: {
    createStatefulRequest: () => Promise<ManagedRequest>;
    createStatelessRequest: () => Promise<ManagedRequest>;
    sessions: Map<string, StatefulSessionEntry>;
    touchSession: (sessionId: string) => void;
  },
  parsedBody: unknown,
): Promise<RequestResolution> {
  if (hasMultipleSessionHeaderValues(req)) {
    return {
      status: "invalid-session-header",
    };
  }

  const sessionId = getSessionId(req);
  const isInitializeRequest = getInitializeParams(parsedBody) !== undefined;

  if (sessionId) {
    const existingSession = options.sessions.get(sessionId);

    if (existingSession) {
      options.touchSession(sessionId);
      return {
        managedRequest: existingSession.managedRequest,
        status: "ready",
      };
    }

    if (!isInitializeRequest) {
      return {
        status: "session-not-found",
      };
    }
  }

  if (req.method === "DELETE") {
    return {
      status: "session-required",
    };
  }

  const managedRequest = isInitializeRequest
    ? await options.createStatefulRequest()
    : await options.createStatelessRequest();

  return {
    cleanup: isInitializeRequest ? undefined : managedRequest.close,
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
    case "session-required":
      writeJsonRpcError(res, 400, -32000, "Bad Request: Mcp-Session-Id header is required");
      return;
    case "session-not-found":
      writeJsonRpcError(res, 404, -32001, "Session not found");
      return;
    case "invalid-session-header":
      writeJsonRpcError(res, 400, -32000, "Bad Request: Mcp-Session-Id header must be a single value");
      return;
  }
}

async function closeNodeServer(server: NodeHttpServer) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        if (isErrnoException(error) && error.code === "ERR_SERVER_NOT_RUNNING") {
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
  const sessionIdleTimeoutMs = options.sessionIdleTimeoutMs ?? 5 * 60_000;
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
  const managedSessions = new Map<string, StatefulSessionEntry>();

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

  function getRequestAuthDebugOptions(req: Pick<Request, "path" | "url">) {
    const isProtectedMcpRequest = auth.mode === "oauth" && getRequestPath(req) === path;

    return isProtectedMcpRequest
      ? { authMode: auth.mode, authRequired: true }
      : { authMode: auth.mode };
  }

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use((req, _res, next) => {
    logHttpDebug("request.received", getRequestDebugDetails(req, getRequestAuthDebugOptions(req)));
    next();
  });

  if (auth.mode === "oauth") {
    app.use((req, res, next) => {
      if (getRequestPath(req) !== "/token" || req.method !== "POST") {
        next();
        return;
      }

      urlencodedParser(req, res, next);
    });
  }

  app.use((req, res, next) => {
    const requestProfile = detectClientProfile(toClientProfileRequestContext(req));
    const tokenClientId = auth.mode === "oauth" &&
      getRequestPath(req) === "/token" &&
      req.method === "POST"
      ? getBodyStringValue(req.body as unknown, "client_id")
      : undefined;
    const persistedProfileId = auth.mode === "oauth" && tokenClientId
      ? mcpAuthModule?.getClientCompatibilityProfile(tokenClientId)
      : undefined;
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

    applyCorsHeaders(res, resolution.responseOrigin);

    if (resolution.responseOrigin) {
      installCorsGuard(res, resolution.responseOrigin);
    }

    next();
  });

  if (auth.mode === "oauth") {
    app.get("/.well-known/oauth-protected-resource", (req, res, next) => {
      const resolvedProfile = getResolvedClientProfile(res.locals);

      if (resolvedProfile?.profileId !== "chatgpt") {
        next();
        return;
      }

      res.status(200).json(mcpAuthModule!.protectedResourceMetadata);
    });

    app.use((req, res, next) => {
      const resolvedProfile = getResolvedClientProfile(res.locals);
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
      if (getRequestPath(req) !== path || (req.method !== "POST" && req.method !== "DELETE")) {
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

    app.use((req, res, next) => {
      if (getRequestPath(req) !== path || req.method !== "POST" || !req.auth?.clientId) {
        next();
        return;
      }

      const persistedProfileId = mcpAuthModule!.getClientCompatibilityProfile(req.auth.clientId);

      if (!persistedProfileId) {
        next();
        return;
      }

      const persistedProfile = {
        profileId: persistedProfileId,
        reason: getPersistedOAuthProfileReason(persistedProfileId),
      };
      const resolvedProfile = getResolvedClientProfile(res.locals);

      if (
        resolvedProfile?.profileId !== persistedProfile.profileId ||
        resolvedProfile.reason !== persistedProfile.reason
      ) {
        setResolvedClientProfile(res.locals, persistedProfile);
        logClientProfileEvent("profile.detected", {
          method: req.method ?? "GET",
          path: getRequestPath(req),
          profileId: persistedProfile.profileId,
          reason: persistedProfile.reason,
        });
      }

      next();
    });
  }

  app.use(async (req, res, next) => {
    if (getRequestPath(req) !== path) {
      next();
      return;
    }

    if (req.method !== "POST" && req.method !== "DELETE") {
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
      {
        createStatefulRequest: () => createManagedRequest(ynab, {
          onSessionClosed: async (sessionId) => {
            removeManagedSession(sessionId);
          },
          onSessionInitialized: async (sessionId, managedRequest) => {
            managedSessions.set(sessionId, {
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
        createStatelessRequest: () => createManagedRequest(ynab),
        sessions: managedSessions,
        touchSession: touchManagedSession,
      },
      parsedBody,
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

      const resolvedProfile = reconcileResolvedProfile(
        req,
        res.locals,
        parsedBody,
      );

      logHttpDebug("transport.handoff", {
        ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
        ...getJsonRpcDebugDetails(parsedBody),
        cleanup: Boolean(resolution.cleanup),
        profileId: resolvedProfile?.profileId,
        profileReason: resolvedProfile?.reason,
      });
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

    logAppEvent("http", "request.error", {
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
