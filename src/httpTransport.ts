/**
 * Owns: Express app assembly for MCP HTTP transport, request parsing, request/session validation, JSON-RPC response writers, CORS/origin enforcement, MCP POST handoff, and top-level HTTP error handling.
 * Inputs/dependencies: auth config, YNAB config, serverRuntime, header helpers, request-context helpers, origin-policy helpers, clientProfiles/, and oauthRuntime.
 * Outputs/contracts: startHttpServer(...) plus explicit helper interfaces consumed by route-local wiring.
 */
import type { Server as NodeHttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import express, { type ErrorRequestHandler, type Request, type Response } from "express";
import { decodeJwt } from "jose";
import type { API } from "ynab";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  hostHeaderValidation,
  localhostHostValidation,
} from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import {
  assertYnabConfig,
  validateCloudflareAccessOAuthSettings,
  type RuntimeAuthConfig,
  type YnabConfig,
} from "./config.js";
import { logAppEvent } from "./logger.js";
import { createCloudflareAccessCompatibilityMiddleware } from "./cloudflareCompatibility.js";
import {
  detectInitializeClientProfile,
  detectClientProfile,
  reconcileClientProfile,
} from "./clientProfiles/detectClient.js";
import { getClientProfile } from "./clientProfiles/index.js";
import { getResolvedClientProfile, setResolvedClientProfile } from "./clientProfiles/profileContext.js";
import { logClientProfileEvent } from "./clientProfiles/profileLogger.js";
import type { ClientProfileId, RequestContext as ClientProfileRequestContext } from "./clientProfiles/types.js";
import { applyCorsHeaders, installCorsGuard, normalizeOrigin, resolveOriginPolicy } from "./originPolicy.js";
import { getFirstHeaderValue, isLoopbackHostname } from "./headerUtils.js";
import {
  createRequestContext,
  getCorrelationHeaderName,
  getRequestLogFields,
  hasToolCallStarted,
  runWithRequestContext,
} from "./requestContext.js";
import { createMcpAuthModule, installOAuthRoutes } from "./oauthRuntime.js";
import {
  createServer,
  createFastPathToolCallResults,
  getDiscoveryResourceDocument,
  getDiscoveryResourceSummaries,
  getInitializeResult,
  getResourcesListResult,
  getToolsListResult,
} from "./serverRuntime.js";
import { getRecordValueIfObject, getStringValue, isRecord } from "./typeUtils.js";
import { createYnabApi } from "./ynabApi.js";

type HttpServerOptions = {
  allowedHosts?: string[];
  allowedOrigins?: string[];
  auth?: RuntimeAuthConfig;
  host?: string;
  path?: string;
  port?: number;
  ynab: YnabConfig;
};

type HttpServerDependencies = {
  createApi?: (config: YnabConfig) => API | object;
  createServer?: typeof createServer;
  onManagedRequestCreated?: () => void;
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
  discoveryResources: Array<{ name: string; uri: string }>;
  transport: StreamableHTTPServerTransport;
};

type ManagedRequestRuntime = {
  busy: boolean;
  mcpServer: ReturnType<typeof createServer>;
};

type ManagedRequestRuntimePool = {
  acquire: () => ManagedRequestRuntime;
  close: () => Promise<void>;
  release: (runtime: ManagedRequestRuntime) => void;
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

type InitializeParamsLike = {
  capabilities?: unknown;
  clientInfo?: unknown;
};

type InstallMcpPostRouteOptions = {
  app: express.Express;
  createManagedRequest: () => Promise<ManagedRequest>;
  fastPathResponses: () => {
    initializeResult: ReturnType<typeof getInitializeResult>;
    resourcesListResult?: ReturnType<typeof getResourcesListResult>;
    toolCallResults: Map<string, CallToolResult>;
    toolsListResult: ReturnType<typeof getToolsListResult>;
  } | undefined;
  getInitializeParams: (parsedBody: unknown) => { capabilities?: unknown; clientInfo?: unknown } | undefined;
  getJsonRpcDebugDetails: (parsedBody: unknown) => Record<string, unknown>;
  getRequestAuthDebugOptions: (req: Pick<Request, "path" | "url">) => { authMode?: "http" | "stdio" | "oauth" | "none"; authRequired?: boolean };
  getRequestDebugDetails: (req: Request, options?: { authMode?: "http" | "stdio" | "oauth" | "none"; authRequired?: boolean }) => Record<string, unknown>;
  getRequestPath: (req: Pick<Request, "path" | "url">) => string;
  getToolCallName: (parsedBody: unknown) => string | undefined;
  logHttpDebug: (event: string, details: Record<string, unknown>) => void;
  path: string;
  resolveRequest: (req: Request, createRequest: () => Promise<ManagedRequest>) => Promise<RequestResolution>;
  writeMethodNotAllowed: (res: Response, allowedMethods: readonly string[]) => void;
  writeRequestResolution: (res: Response, resolution: Exclude<RequestResolution, { cleanup?: () => Promise<void>; managedRequest: ManagedRequest; status: "ready" }>) => void;
};

const CF_ACCESS_AUTHORIZATION_SOURCE_HEADER = "x-mcp-cf-access-authorization-source";

class StreamableTransportAdapter implements Transport {
  public onclose: NonNullable<Transport["onclose"]> = () => {};
  public onerror: NonNullable<Transport["onerror"]> = () => {};
  public onmessage: NonNullable<Transport["onmessage"]> = () => {};

  public constructor(private readonly transport: StreamableHTTPServerTransport) {
    this.transport.onclose = () => {
      this.onclose();
    };
    this.transport.onerror = (error) => {
      this.onerror(error);
    };
    this.transport.onmessage = (message, extra) => {
      this.onmessage(message, extra);
    };
  }

  public start(): Promise<void> {
    return this.transport.start();
  }

  public send(...args: Parameters<Transport["send"]>): Promise<void> {
    return this.transport.send(...args);
  }

  public close(): Promise<void> {
    return this.transport.close();
  }
}

function getRequestPath(req: Pick<Request, "path" | "url">) {
  if (typeof req.path === "string" && req.path.length > 0) {
    return req.path;
  }

  if (!req.url) {
    return "/";
  }

  return new URL(req.url, "http://127.0.0.1").pathname;
}

function toClientProfileHeaders(
  headers: Pick<Request, "headers">["headers"],
): ClientProfileRequestContext["headers"] {
  const normalizedHeaders: Record<string, string | string[] | undefined> = {};

  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === "string" || Array.isArray(value)) {
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

function writeJsonRpcResult(res: Response, id: unknown, result: unknown) {
  writeJson(res, 200, {
    jsonrpc: "2.0",
    id,
    result,
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
    authMode?: "http" | "stdio" | "oauth" | "none";
    authRequired?: boolean;
  } = {},
): HttpDebugDetails {
  const authSubject = req.auth?.extra?.["subject"];
  return {
    ...getRequestLogFields(),
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

  if (typeof method === "string") {
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

function getToolCallName(parsedBody: unknown) {
  if (!isRecord(parsedBody)) {
    return undefined;
  }

  if (getStringValue(parsedBody, "method") !== "tools/call") {
    return undefined;
  }

  const params = getRecordValueIfObject(parsedBody, "params");

  return params ? getStringValue(params, "name") : undefined;
}

function getToolCallArguments(parsedBody: unknown) {
  if (!isRecord(parsedBody)) {
    return undefined;
  }

  if (getStringValue(parsedBody, "method") !== "tools/call") {
    return undefined;
  }

  const params = getRecordValueIfObject(parsedBody, "params");
  return params ? getRecordValueIfObject(params, "arguments") : undefined;
}

function getResourceReadUri(parsedBody: unknown) {
  if (!isRecord(parsedBody)) {
    return undefined;
  }

  if (getStringValue(parsedBody, "method") !== "resources/read") {
    return undefined;
  }

  const params = getRecordValueIfObject(parsedBody, "params");

  return params ? getStringValue(params, "uri") : undefined;
}

function getJsonRpcId(parsedBody: unknown) {
  if (!isRecord(parsedBody) || !("id" in parsedBody)) {
    return null;
  }

  return parsedBody["id"];
}

function isEmptyRecord(value: Record<string, unknown> | undefined) {
  return value !== undefined && Object.keys(value).length === 0;
}

function captureResponseBody(res: Response) {
  const chunks: Buffer[] = [];
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);
  type WriteCallback = (error: Error | null | undefined) => void;
  type EndCallback = () => void;
  let settled = res.writableFinished || res.writableEnded;

  const whenSettled = settled
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
      const markSettled = () => {
        if (settled) {
          return;
        }

        settled = true;
        res.off("close", markSettled);
        res.off("finish", markSettled);
        resolve();
      };

      res.once("close", markSettled);
      res.once("finish", markSettled);
    });

  function toCapturedChunk(chunk: unknown) {
    if (typeof chunk === "string") {
      return Buffer.from(chunk);
    }

    if (Buffer.isBuffer(chunk)) {
      return chunk;
    }

    if (ArrayBuffer.isView(chunk)) {
      return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    }

    return undefined;
  }

  function capturedWrite(chunk: Parameters<Response["write"]>[0], cb?: WriteCallback): boolean;
  function capturedWrite(
    chunk: Parameters<Response["write"]>[0],
    encoding: BufferEncoding,
    cb?: WriteCallback,
  ): boolean;
  function capturedWrite(
    chunk: Parameters<Response["write"]>[0],
    encodingOrCallback?: BufferEncoding | WriteCallback,
    callback?: WriteCallback,
  ): boolean {
    const normalizedChunk = toCapturedChunk(chunk);

    if (normalizedChunk) {
      chunks.push(normalizedChunk);
    }

    if (typeof encodingOrCallback === "function") {
      return originalWrite(chunk, encodingOrCallback);
    }

    if (typeof callback === "function" && typeof encodingOrCallback === "string") {
      return originalWrite(chunk, encodingOrCallback, callback);
    }

    if (typeof encodingOrCallback === "string") {
      return originalWrite(chunk, encodingOrCallback);
    }

    return originalWrite(chunk);
  }

  function capturedEnd(cb?: EndCallback): Response;
  function capturedEnd(
    chunk: Parameters<Response["end"]>[0],
    cb?: EndCallback,
  ): Response;
  function capturedEnd(
    chunk: Parameters<Response["end"]>[0],
    encoding: BufferEncoding,
    cb?: EndCallback,
  ): Response;
  function capturedEnd(
    chunkOrCallback?: Parameters<Response["end"]>[0],
    encodingOrCallback?: BufferEncoding | EndCallback,
    callback?: EndCallback,
  ): Response {
    const chunk = typeof chunkOrCallback === "function"
      ? undefined
      : chunkOrCallback;
    const normalizedChunk = toCapturedChunk(chunk);

    if (normalizedChunk) {
      chunks.push(normalizedChunk);
    }

    if (typeof chunkOrCallback === "function") {
      return originalEnd(chunkOrCallback);
    }

    if (typeof encodingOrCallback === "function") {
      return originalEnd(chunk, encodingOrCallback);
    }

    if (typeof callback === "function" && typeof encodingOrCallback === "string") {
      return originalEnd(chunk, encodingOrCallback, callback);
    }

    if (typeof encodingOrCallback === "string") {
      return originalEnd(chunk, encodingOrCallback);
    }

    if (typeof chunk === "undefined") {
      return originalEnd();
    }

    return originalEnd(chunk);
  }

  res.write = capturedWrite;
  res.end = capturedEnd;

  return {
    async waitForSettledResponse() {
      await whenSettled;
    },
    readJsonRpcErrorMessage() {
      if (chunks.length === 0) {
        return undefined;
      }

      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));

        if (!isRecord(payload)) {
          return undefined;
        }

        const errorPayload = getRecordValueIfObject(payload, "error");

        if (errorPayload) {
          const errorMessage = errorPayload["message"];

          if (typeof errorMessage === "string") {
            return errorMessage;
          }
        }

        const resultPayload = getRecordValueIfObject(payload, "result");
        const contentPayload = Array.isArray(resultPayload?.["content"])
          ? resultPayload["content"]
          : undefined;
        const textEntry = resultPayload?.["isError"] === true
          ? contentPayload?.find((entry) => (
            isRecord(entry) &&
            entry["type"] === "text" &&
            typeof entry["text"] === "string"
          ))
          : undefined;
        const textContent = isRecord(textEntry)
          ? textEntry["text"]
          : undefined;

        return typeof textContent === "string"
          ? textContent
          : undefined;
      } catch {
        return undefined;
      }
    },
  };
}

function getBodyStringValue(body: unknown, key: string) {
  if (!isRecord(body)) {
    return undefined;
  }

  return getStringValue(body, key);
}

function getPersistedOAuthProfileReason(profileId: ClientProfileId) {
  return `oauth-client-profile:${profileId}`;
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

function createManagedRequestRuntimePool(
  config: YnabConfig,
  api: API | object,
  options: {
    discoveryResourceBaseUrl?: string;
  },
  createServerInstance: typeof createServer,
): ManagedRequestRuntimePool {
  const runtimes: ManagedRequestRuntime[] = [];

  return {
    acquire() {
      const idleRuntime = runtimes.find((runtime) => !runtime.busy);

      if (idleRuntime) {
        idleRuntime.busy = true;
        return idleRuntime;
      }

      const runtime: ManagedRequestRuntime = {
        busy: true,
        mcpServer: createServerInstance(config, api, options),
      };
      runtimes.push(runtime);
      return runtime;
    },
    release(runtime) {
      runtime.busy = false;
    },
    async close() {
      await Promise.all(runtimes.map(async (runtime) => {
        await runtime.mcpServer.close();
      }));
    },
  };
}

async function createManagedRequestFromRuntimePool(
  runtimePool: ManagedRequestRuntimePool,
  options: {
    discoveryResourceBaseUrl?: string;
  },
) {
  const runtime = runtimePool.acquire();
  const discoveryResources = getDiscoveryResourceSummaries(options);
  const transport = new StreamableHTTPServerTransport({
    enableJsonResponse: true,
  });

  try {
    await runtime.mcpServer.connect(new StreamableTransportAdapter(transport));
  } catch (error) {
    runtimePool.release(runtime);
    throw error;
  }

  return {
    discoveryResources: discoveryResources.map(({ name, uri }) => ({ name, uri })),
    transport,
    close: async () => {
      try {
        await transport.close();
      } finally {
        runtimePool.release(runtime);
      }
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
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ERR_SERVER_NOT_RUNNING"
        ) {
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

export function installMcpPostRoute(options: InstallMcpPostRouteOptions) {
  const {
    app,
    createManagedRequest,
    fastPathResponses,
    getInitializeParams,
    getJsonRpcDebugDetails,
    getRequestAuthDebugOptions,
    getRequestDebugDetails,
    getRequestPath,
    getToolCallName,
    logHttpDebug,
    path,
    resolveRequest,
    writeMethodNotAllowed,
    writeRequestResolution,
  } = options;

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
    if (hasMultipleSessionHeaderValues(req)) {
      logHttpDebug("request.rejected", {
        ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
        reason: "invalid-session-header",
      });
      writeRequestResolution(res, {
        status: "invalid-session-header",
      });
      return;
    }

    let cleanup = async () => {};

    try {
      const provisionalProfile = getResolvedClientProfile(res.locals);
      const initializeParams = getInitializeParams(parsedBody);

      if (provisionalProfile && initializeParams) {
        const confirmedProfile = detectInitializeClientProfile({
          capabilities: initializeParams.capabilities,
          clientInfo: initializeParams.clientInfo,
        });
        const reconciliation = reconcileClientProfile(provisionalProfile, confirmedProfile);

        setResolvedClientProfile(res.locals, reconciliation.profile);

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
      }

      const resolvedProfile = getResolvedClientProfile(res.locals);
      const authDebugOptions = getRequestAuthDebugOptions(req);
      const fastPathCache = fastPathResponses();
      const isSessionlessAuthlessRequest = authDebugOptions.authMode === "none" && !getSessionId(req);
      const jsonRpcMethod = isRecord(parsedBody) ? getStringValue(parsedBody, "method") : undefined;

      if (isSessionlessAuthlessRequest && fastPathCache && typeof jsonRpcMethod === "string") {
        if (jsonRpcMethod === "initialize") {
          logHttpDebug("transport.handoff", {
            ...getRequestDebugDetails(req, authDebugOptions),
            ...getJsonRpcDebugDetails(parsedBody),
            cleanup: false,
            profileId: resolvedProfile?.profileId,
            profileReason: resolvedProfile?.reason,
          });
          writeJsonRpcResult(res, getJsonRpcId(parsedBody), fastPathCache.initializeResult);
          return;
        }

        if (jsonRpcMethod === "tools/list") {
          logHttpDebug("transport.handoff", {
            ...getRequestDebugDetails(req, authDebugOptions),
            ...getJsonRpcDebugDetails(parsedBody),
            cleanup: false,
            profileId: resolvedProfile?.profileId,
            profileReason: resolvedProfile?.reason,
          });
          writeJsonRpcResult(res, getJsonRpcId(parsedBody), fastPathCache.toolsListResult);
          return;
        }

        if (jsonRpcMethod === "resources/list" && fastPathCache.resourcesListResult) {
          logHttpDebug("transport.handoff", {
            ...getRequestDebugDetails(req, authDebugOptions),
            ...getJsonRpcDebugDetails(parsedBody),
            cleanup: false,
            profileId: resolvedProfile?.profileId,
            profileReason: resolvedProfile?.reason,
          });
          logHttpDebug("resource.list.advertised", {
            ...getRequestDebugDetails(req, authDebugOptions),
            ...getJsonRpcDebugDetails(parsedBody),
            resourceCount: fastPathCache.resourcesListResult.resources.length,
            resourceUris: fastPathCache.resourcesListResult.resources.map((resource) => resource.uri),
          });
          writeJsonRpcResult(res, getJsonRpcId(parsedBody), fastPathCache.resourcesListResult);
          return;
        }

        if (jsonRpcMethod === "tools/call") {
          const toolName = getToolCallName(parsedBody);
          const toolArguments = getToolCallArguments(parsedBody);
          const fastPathResult = toolName ? fastPathCache.toolCallResults.get(toolName) : undefined;

          if (fastPathResult && isEmptyRecord(toolArguments)) {
            writeJsonRpcResult(res, getJsonRpcId(parsedBody), fastPathResult);
            return;
          }
        }
      }

      const resolution = await resolveRequest(
        req,
        createManagedRequest,
      );

      if (resolution.status === "invalid-session-header") {
        logHttpDebug("request.rejected", {
          ...getRequestDebugDetails(req, authDebugOptions),
          reason: "invalid-session-header",
        });
        writeRequestResolution(res, resolution);
        return;
      }

      let cleanedUp = false;
      cleanup = async () => {
        if (cleanedUp) {
          return;
        }

        cleanedUp = true;
        await resolution.cleanup?.();
      };

      res.once("close", () => {
        void cleanup();
      });

      const responseCapture = getToolCallName(parsedBody) ? captureResponseBody(res) : undefined;
      const resourceReadUri = getResourceReadUri(parsedBody);

      logHttpDebug("transport.handoff", {
        ...getRequestDebugDetails(req, authDebugOptions),
        ...getJsonRpcDebugDetails(parsedBody),
        cleanup: Boolean(resolution.cleanup),
        profileId: resolvedProfile?.profileId,
        profileReason: resolvedProfile?.reason,
      });

      if (isRecord(parsedBody) && getStringValue(parsedBody, "method") === "resources/list") {
        logHttpDebug("resource.list.advertised", {
          ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
          ...getJsonRpcDebugDetails(parsedBody),
          resourceCount: resolution.managedRequest.discoveryResources.length,
          resourceUris: resolution.managedRequest.discoveryResources.map((resource) => resource.uri),
        });
      }

      if (resourceReadUri) {
        logHttpDebug("resource.read.requested", {
          ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
          ...getJsonRpcDebugDetails(parsedBody),
          resourceUri: resourceReadUri,
        });
      }

      await resolution.managedRequest.transport.handleRequest(req, res, parsedBody);

      const toolName = getToolCallName(parsedBody);

      if (toolName && !hasToolCallStarted()) {
        await responseCapture?.waitForSettledResponse();
        const errorMessage = responseCapture?.readJsonRpcErrorMessage();

        if (typeof errorMessage === "string" && errorMessage.includes("Input validation error")) {
          logHttpDebug("tool.call.validation_failed", {
            ...getRequestDebugDetails(req, authDebugOptions),
            ...getJsonRpcDebugDetails(parsedBody),
            errorMessage,
            toolName,
          });
          return;
        }

        logHttpDebug("tool.dispatch.absent", {
          ...getRequestDebugDetails(req, authDebugOptions),
          ...getJsonRpcDebugDetails(parsedBody),
          errorMessage,
          toolName,
        });
      }
    } catch (error) {
      await cleanup();
      next(error);
    }
  });
}

export async function startHttpServer(
  options: HttpServerOptions,
  dependencies: HttpServerDependencies = {},
): Promise<StartedHttpServer> {
  const allowedHosts = options.allowedHosts ?? [];
  const auth = options.auth ?? { deployment: "authless", mode: "none" };
  const allowedOrigins = new Set((options.allowedOrigins ?? []).map((origin) => normalizeOrigin(origin)));
  const host = options.host ?? "127.0.0.1";
  const path = options.path ?? "/mcp";
  const port = options.port ?? 3000;
  const ynab = assertYnabConfig(options.ynab);
  const sharedApi = dependencies.createApi?.(ynab) ?? createYnabApi(ynab);

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

  function getRequestAuthDebugOptions(
    req: Pick<Request, "path" | "url">,
  ): { authMode?: "http" | "stdio" | "oauth" | "none"; authRequired?: boolean } {
    const isProtectedMcpRequest = auth.mode === "oauth" && getRequestPath(req) === path;

    return {
      authMode: auth.mode,
      ...(isProtectedMcpRequest ? { authRequired: true } : {}),
    };
  }

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use((req, res, next) => {
    const requestContext = createRequestContext(req.headers);

    runWithRequestContext(requestContext, () => {
      res.setHeader(getCorrelationHeaderName(), requestContext.correlationId);
      next();
    });
  });

  app.use((req, _res, next) => {
    logHttpDebug("request.received", getRequestDebugDetails(req, getRequestAuthDebugOptions(req)));
    next();
  });

  app.use((req, res, next) => {
    if (auth.mode === "oauth" && getRequestPath(req) === "/token" && req.method === "POST") {
      urlencodedParser(req, res, next);
      return;
    }

    next();
  });

  app.use((req, res, next) => {
    const tokenClientId = auth.mode === "oauth" &&
      getRequestPath(req) === "/token" &&
      req.method === "POST"
      ? getBodyStringValue(req.body, "client_id")
      : undefined;
    const persistedProfileId = auth.mode === "oauth" && tokenClientId
      ? mcpAuthModule?.getClientCompatibilityProfile(tokenClientId)
      : undefined;
    const requestProfile = detectClientProfile(toClientProfileRequestContext(req));
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
    installOAuthRoutes({
      app,
      auth,
      cloudflareCompatibilityMiddleware: cloudflareCompatibilityMiddleware!,
      getCanonicalOAuthDiscoveryPath,
      getPersistedOAuthProfileReason,
      getRequestAuthDebugOptions,
      getRequestDebugDetails,
      getRequestPath,
      isDirectUpstreamBearerToken,
      jsonParser,
      logHttpDebug,
      mcpAuthModule: mcpAuthModule!,
      path,
    });
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
    if (auth.mode !== "oauth" && getRequestPath(req) === path && req.method === "POST") {
      jsonParser(req, res, next);
      return;
    }

    next();
  });

  app.get(`${path}/resources/:toolName`, (req, res) => {
    const toolName = typeof req.params.toolName === "string"
      ? decodeURIComponent(req.params.toolName)
      : undefined;

    if (!toolName || !discoveryResourceBaseUrl) {
      logHttpDebug("request.rejected", {
        ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
        reason: "resource-not-found",
      });
      writeNotFound(res);
      return;
    }

    try {
      const resourceUri = new URL(encodeURIComponent(toolName), discoveryResourceBaseUrl).toString();
      const document = getDiscoveryResourceDocument(toolName, resourceUri, {
        discoveryResourceBaseUrl,
      });

      logHttpDebug("resource.fetch.direct", {
        ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
        resourceName: toolName,
        resourceUri,
      });
      res.status(200).json(document);
    } catch {
      logHttpDebug("request.rejected", {
        ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
        reason: "resource-not-found",
      });
      writeNotFound(res);
    }
  });

  installMcpPostRoute({
    app,
    createManagedRequest: () => {
      return createManagedRequestFromRuntimePool(
        runtimePool,
        discoveryResourceBaseUrl ? { discoveryResourceBaseUrl } : {},
      );
    },
    fastPathResponses: () => fastPathCache,
    getInitializeParams,
    getJsonRpcDebugDetails,
    getRequestAuthDebugOptions,
    getRequestDebugDetails,
    getRequestPath,
    getToolCallName,
    logHttpDebug,
    path,
    resolveRequest: async (req, createRequest) => {
      const resolution = await resolveRequest(req, createRequest);

      if (resolution.status === "ready") {
        dependencies.onManagedRequestCreated?.();
      }

      return resolution;
    },
    writeMethodNotAllowed,
    writeRequestResolution,
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

  if (!("port" in address) || typeof address.port !== "number") {
    throw new Error("HTTP server did not expose a TCP address");
  }

  const resolvedAddress: AddressInfo = address;
  let closed = false;
  const resourceOrigin = auth.mode === "oauth"
    ? new URL(auth.publicUrl).origin
    : `http://${host}:${resolvedAddress.port}`;
  const discoveryResourceBaseUrl = new URL(`${path.replace(/\/$/, "")}/resources/`, resourceOrigin).toString();
  const fastPathCache = {
    toolCallResults: await createFastPathToolCallResults(),
    initializeResult: getInitializeResult(),
    toolsListResult: getToolsListResult(),
    resourcesListResult: getResourcesListResult({ discoveryResourceBaseUrl }),
  };
  const runtimePool = createManagedRequestRuntimePool(
    ynab,
    sharedApi,
    { discoveryResourceBaseUrl },
    dependencies.createServer ?? createServer,
  );

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
      await runtimePool?.close();
    },
  };
}
