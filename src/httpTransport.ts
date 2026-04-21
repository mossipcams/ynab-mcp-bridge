/**
 * Owns: Express app assembly for MCP HTTP transport, request parsing, request/session validation, JSON-RPC response writers, CORS/origin enforcement, MCP POST handoff, and top-level HTTP error handling.
 * Inputs/dependencies: auth config, YNAB config, auth2 route wiring, serverRuntime, header helpers, request-context helpers, and origin-policy helpers.
 * Outputs/contracts: startHttpServer(...) plus explicit helper interfaces consumed by route-local wiring.
 */
import type { Server as NodeHttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import express, { type ErrorRequestHandler, type Request, type Response } from "express";
import type { API } from "ynab";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
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
import type { AuthConfig } from "./auth2/config/schema.js";
import { installAuthV2Routes } from "./auth2/http/routes.js";
import { isPublicMcpBootstrapMethod } from "./authAdmissionPolicy.js";
import { logAppEvent } from "./logger.js";
import { applyCorsHeaders, installCorsGuard, normalizeOrigin, resolveOriginPolicy } from "./originPolicy.js";
import { getFirstHeaderValue, isLoopbackHostname } from "./headerUtils.js";
import {
  createRequestContext,
  getCorrelationHeaderName,
  getRequestLogFields,
  hasToolCallStarted,
  runWithRequestContext,
} from "./requestContext.js";
import {
  createServer,
  type DiscoveryResourceUriMode,
  getDiscoveryResourceDocument,
  getDiscoveryResourceSummaries,
} from "./serverRuntime.js";
import { getRecordValueIfObject, getStringValue, isRecord } from "./typeUtils.js";
import { createYnabApi } from "./ynabApi.js";

type HttpServerOptions = {
  auth2Config?: AuthConfig;
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
  discoveryResources: ManagedRequest["discoveryResources"];
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

type InstallMcpPostRouteOptions = {
  app: express.Express;
  createManagedRequest: () => Promise<ManagedRequest>;
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

function getMcpResourceDocumentsPathPrefix(path: string) {
  return `${path.replace(/\/$/, "")}/resources/`;
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

type JsonRpcTextEntry = {
  text: string;
  type: "text";
};

function logHttpDebug(event: string, details: HttpDebugDetails) {
  logAppEvent("http", event, details);
}

function getSessionId(req: Pick<Request, "headers">) {
  const sessionId = req.headers["mcp-session-id"];

  if (typeof sessionId !== "string") {
    return undefined;
  }

  const rawValue = sessionId.trim();

  if (!rawValue || rawValue.includes(",")) {
    return undefined;
  }

  return rawValue;
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

function hasRequestAuth(req: Request): req is Request & { auth?: AuthInfo } {
  return "auth" in req;
}

function getRequestAuth(req: Request): AuthInfo | undefined {
  return hasRequestAuth(req) ? req.auth : undefined;
}

function getRequestDebugDetails(
  req: Request,
  options: {
    authMode?: "http" | "stdio" | "oauth" | "none";
    authRequired?: boolean;
  } = {},
): HttpDebugDetails {
  const requestAuth = getRequestAuth(req);
  const authSubject = requestAuth?.extra?.["subject"];
  return {
    ...getRequestLogFields(),
    authMode: options.authMode,
    authClientId: requestAuth?.clientId,
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Express response typings widen the end chunk parameter, but it is only forwarded or converted to a Buffer below.
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
        const payloadText = Buffer.concat(chunks).toString("utf8");
        const payload: unknown = JSON.parse(payloadText);

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
        const contentPayload: unknown[] | undefined = Array.isArray(resultPayload?.["content"])
          ? resultPayload["content"]
          : undefined;
        const textEntry = resultPayload?.["isError"] === true
          ? contentPayload?.find((entry): entry is JsonRpcTextEntry => (
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

type RequestDebugOptions = {
  authMode?: "http" | "stdio" | "oauth" | "none";
  authRequired?: boolean;
};

type ManagedRequestLogContext = {
  authDebugOptions: RequestDebugOptions;
  getJsonRpcDebugDetails: (parsedBody: unknown) => Record<string, unknown>;
  getRequestAuthDebugOptions: (req: Pick<Request, "path" | "url">) => RequestDebugOptions;
  getRequestDebugDetails: (req: Request, options?: RequestDebugOptions) => Record<string, unknown>;
  logHttpDebug: (event: string, details: Record<string, unknown>) => void;
  parsedBody: unknown;
  req: Request;
};

function logManagedResourceRequestDetails(
  context: ManagedRequestLogContext & {
    resolution: Extract<RequestResolution, { status: "ready" }>;
  },
) {
  const {
    authDebugOptions,
    getJsonRpcDebugDetails,
    getRequestAuthDebugOptions,
    getRequestDebugDetails,
    logHttpDebug,
    parsedBody,
    req,
    resolution,
  } = context;

  if (isRecord(parsedBody) && getStringValue(parsedBody, "method") === "resources/list") {
    logHttpDebug("resource.list.advertised", {
      ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
      ...getJsonRpcDebugDetails(parsedBody),
      resourceCount: resolution.managedRequest.discoveryResources.length,
      resourceUris: resolution.managedRequest.discoveryResources.map((resource) => resource.uri),
    });
  }

  const resourceReadUri = getResourceReadUri(parsedBody);

  if (!resourceReadUri) {
    return;
  }

  logHttpDebug("resource.read.requested", {
    ...getRequestDebugDetails(req, authDebugOptions),
    ...getJsonRpcDebugDetails(parsedBody),
    resourceUri: resourceReadUri,
  });
}

async function logManagedToolDispatchOutcome(
  context: ManagedRequestLogContext & {
    hasToolCallStarted: () => boolean;
    responseCapture: ReturnType<typeof captureResponseBody> | undefined;
    getToolCallName: (parsedBody: unknown) => string | undefined;
  },
) {
  const {
    authDebugOptions,
    getJsonRpcDebugDetails,
    getRequestDebugDetails,
    getToolCallName,
    hasToolCallStarted,
    logHttpDebug,
    parsedBody,
    req,
    responseCapture,
  } = context;
  const toolName = getToolCallName(parsedBody);

  if (!toolName || hasToolCallStarted()) {
    return;
  }

  await responseCapture?.waitForSettledResponse();
  const errorMessage = responseCapture?.readJsonRpcErrorMessage();
  const logDetails = {
    ...getRequestDebugDetails(req, authDebugOptions),
    ...getJsonRpcDebugDetails(parsedBody),
    errorMessage,
    toolName,
  };

  if (typeof errorMessage === "string" && errorMessage.includes("Input validation error")) {
    logHttpDebug("tool.call.validation_failed", logDetails);
    return;
  }

  logHttpDebug("tool.dispatch.absent", logDetails);
}

function hasInvalidSessionHeaderValue(req: Pick<Request, "headers">) {
  const sessionId = req.headers["mcp-session-id"];

  if (Array.isArray(sessionId)) {
    return sessionId.length !== 1 ||
      typeof sessionId[0] !== "string" ||
      !sessionId[0].trim() ||
      sessionId[0].includes(",");
  }

  if (typeof sessionId !== "string") {
    return false;
  }

  const rawValue = sessionId.trim();
  return !rawValue || rawValue.includes(",");
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
    discoveryResourceUriMode?: DiscoveryResourceUriMode;
  },
  createServerInstance: typeof createServer,
): ManagedRequestRuntimePool {
  const runtimes: ManagedRequestRuntime[] = [];
  const discoveryResources = getDiscoveryResourceSummaries(options).map(({ name, uri }) => ({ name, uri }));

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
    discoveryResources,
  };
}

async function createManagedRequestFromRuntimePool(
  runtimePool: ManagedRequestRuntimePool,
) {
  const runtime = runtimePool.acquire();
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
    discoveryResources: runtimePool.discoveryResources,
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
  if (hasInvalidSessionHeaderValue(req)) {
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
      writeJsonRpcError(res, 400, -32000, "Bad Request: Mcp-Session-Id header must be a single non-empty value");
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
    if (hasInvalidSessionHeaderValue(req)) {
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
      const authDebugOptions = getRequestAuthDebugOptions(req);

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

      logHttpDebug("transport.handoff", {
        ...getRequestDebugDetails(req, authDebugOptions),
        ...getJsonRpcDebugDetails(parsedBody),
        cleanup: Boolean(resolution.cleanup),
      });

      logManagedResourceRequestDetails({
        authDebugOptions,
        getJsonRpcDebugDetails,
        getRequestAuthDebugOptions,
        getRequestDebugDetails,
        logHttpDebug,
        parsedBody,
        req,
        resolution,
      });

      await resolution.managedRequest.transport.handleRequest(req, res, parsedBody);

      await logManagedToolDispatchOutcome({
        authDebugOptions,
        getJsonRpcDebugDetails,
        getRequestAuthDebugOptions,
        getRequestDebugDetails,
        getToolCallName,
        hasToolCallStarted,
        logHttpDebug,
        parsedBody,
        req,
        responseCapture,
      });
    } catch (error) {
      await cleanup();
      next(error);
    }
  });
}

function createAllowedOrigins(
  auth: RuntimeAuthConfig,
  configuredAllowedOrigins: string[] | undefined,
) {
  const allowedOrigins = new Set((configuredAllowedOrigins ?? []).map((origin) => normalizeOrigin(origin)));

  if (auth.mode === "oauth") {
    allowedOrigins.add(new URL(auth.publicUrl).origin);
  }

  return allowedOrigins;
}

function validateHttpServerAuthConfiguration(
  auth: RuntimeAuthConfig,
  auth2Config: AuthConfig | undefined,
) {
  if (auth.mode !== "oauth") {
    return;
  }

  validateCloudflareAccessOAuthSettings({
    authorizationUrl: auth.authorizationUrl,
    issuer: auth.issuer,
    jwksUrl: auth.jwksUrl,
    tokenUrl: auth.tokenUrl,
  });

  if (!auth2Config) {
    throw new Error("OAuth HTTP mode requires auth2Config.");
  }
}

export async function startHttpServer(
  options: HttpServerOptions,
  dependencies: HttpServerDependencies = {},
): Promise<StartedHttpServer> {
  const allowedHosts = options.allowedHosts ?? [];
  const auth = options.auth ?? { deployment: "authless", mode: "none" };
  const allowedOrigins = createAllowedOrigins(auth, options.allowedOrigins);
  const host = options.host ?? "127.0.0.1";
  const path = options.path ?? "/mcp";
  const port = options.port ?? 3000;
  const ynab = assertYnabConfig(options.ynab);
  const sharedApi = dependencies.createApi?.(ynab) ?? createYnabApi(ynab);

  validateHttpServerAuthConfiguration(auth, options.auth2Config);

  const app = express();
  const jsonParser = express.json();
  const urlencodedParser = express.urlencoded({ extended: false });
  let discoveryResourceBaseUrl: string | undefined;
  let discoveryResourceUriMode: DiscoveryResourceUriMode | undefined;
  let runtimePool: ManagedRequestRuntimePool | undefined;
  let resolveStartupReady!: () => void;
  let rejectStartupReady!: (error: unknown) => void;
  const startupReady = new Promise<void>((resolve, reject) => {
    resolveStartupReady = resolve;
    rejectStartupReady = reject;
  });

  function getRequestAuthDebugOptions(
    req: Pick<Request, "path" | "url"> & { body?: unknown },
  ): { authMode?: "http" | "stdio" | "oauth" | "none"; authRequired?: boolean } {
    const requestPath = getRequestPath(req);
    const jsonRpcMethod = getBodyStringValue(req.body, "method");
    const isProtectedMcpRequest = auth.mode === "oauth" && (
      requestPath.startsWith(getMcpResourceDocumentsPathPrefix(path)) ||
      (requestPath === path && !isPublicMcpBootstrapMethod(jsonRpcMethod))
    );

    return {
      authMode: auth.mode,
      ...(isProtectedMcpRequest ? { authRequired: true } : {}),
    };
  }

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use((req, res, next) => {
    const requestContext = createRequestContext(req.headers);

    runWithRequestContext({
      ...requestContext,
      method: req.method,
      path: getRequestPath(req),
    }, () => {
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
    const auth2Config = options.auth2Config!;

    installAuthV2Routes({
      app,
      auth,
      path,
      auth2Config,
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

  app.use((_req, _res, next) => {
    startupReady.then(() => {
      next();
    }, next);
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
      if (!runtimePool) {
        throw new Error("Managed request runtime pool is not initialized.");
      }

      return createManagedRequestFromRuntimePool(runtimePool);
    },
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
  try {
    const resourceOrigin = auth.mode === "oauth"
      ? new URL(auth.publicUrl).origin
      : `http://${host}:${resolvedAddress.port}`;
    discoveryResourceBaseUrl = new URL(`${path.replace(/\/$/, "")}/resources/`, resourceOrigin).toString();
    discoveryResourceUriMode = auth.mode === "oauth"
      ? "compatibility-only"
      : undefined;
    const discoveryRuntimeOptions = {
      discoveryResourceBaseUrl,
      ...(discoveryResourceUriMode ? { discoveryResourceUriMode } : {}),
    };
    runtimePool = createManagedRequestRuntimePool(
      ynab,
      sharedApi,
      discoveryRuntimeOptions,
      dependencies.createServer ?? createServer,
    );

    resolveStartupReady();

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
  } catch (error) {
    rejectStartupReady(error);
    await closeNodeServer(server);
    throw error;
  }
}
