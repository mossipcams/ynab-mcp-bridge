import type { Server as NodeHttpServer } from "node:http";
import type { Request, Response } from "express";
import { decodeJwt } from "jose";

import type { RuntimeAuthConfig } from "./config.js";
import { logAppEvent } from "./logger.js";
import {
  detectInitializeClientProfile,
  reconcileClientProfile,
} from "./clientProfiles/detectClient.js";
import { getClientProfile } from "./clientProfiles/index.js";
import { getResolvedClientProfile, setResolvedClientProfile } from "./clientProfiles/profileContext.js";
import { logClientProfileEvent } from "./clientProfiles/profileLogger.js";
import type { ClientProfileId, RequestContext as ClientProfileRequestContext } from "./clientProfiles/types.js";
import { getFirstHeaderValue } from "./headerUtils.js";
import { getRecordValueIfObject, getStringValue, isRecord } from "./typeUtils.js";

export const HTTP_ALLOWED_METHODS = ["POST", "DELETE"] as const;
const CF_ACCESS_AUTHORIZATION_SOURCE_HEADER = "x-mcp-cf-access-authorization-source";

export type ManagedRequest = {
  close: () => Promise<void>;
  transport: {
    handleRequest: (req: Request, res: Response, body: unknown) => Promise<void>;
    sessionId?: string | undefined;
  };
};

export type StatefulSessionEntry = {
  idleTimeout: NodeJS.Timeout | undefined;
  managedRequest: ManagedRequest;
};

export type RequestResolution =
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

export type HttpDebugDetails = Record<string, unknown>;

type InitializeParamsLike = {
  capabilities?: unknown;
  clientInfo?: unknown;
};

export function getRequestPath(req: Pick<Request, "path" | "url">): string {
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

export function toClientProfileRequestContext(
  req: Pick<Request, "headers" | "method" | "path" | "url">,
): ClientProfileRequestContext {
  return {
    headers: toClientProfileHeaders(req.headers),
    method: req.method ?? "GET",
    path: getRequestPath(req),
  };
}

export function getCanonicalOAuthDiscoveryPath(pathname: string, profileId: ClientProfileId) {
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

export function isDirectUpstreamBearerToken(
  req: Pick<Request, "headers">,
  auth: Extract<RuntimeAuthConfig, { mode: "oauth" }>,
) {
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

export function writeJsonRpcError(res: Response, statusCode: number, code: number, message: string) {
  writeJson(res, statusCode, {
    jsonrpc: "2.0",
    error: {
      code,
      message,
    },
    id: null,
  });
}

export function writeMethodNotAllowed(res: Response, allowedMethods: readonly string[]) {
  res.setHeader("allow", allowedMethods.join(", "));
  writeJsonRpcError(res, 405, -32000, "Method not allowed.");
}

export function writeNotFound(res: Response) {
  writeJson(res, 404, {
    error: "Not found",
  });
}

export function writeForbiddenOrigin(res: Response) {
  writeJson(res, 403, {
    error: "Forbidden origin",
  });
}

export function writeParseError(res: Response) {
  writeJsonRpcError(res, 400, -32700, "Parse error");
}

export function writePayloadTooLarge(res: Response) {
  writeJsonRpcError(res, 413, -32000, "Payload too large");
}

export function writeInternalServerError(res: Response) {
  writeJsonRpcError(res, 500, -32603, "Internal server error");
}

export function logHttpDebug(event: string, details: HttpDebugDetails) {
  logAppEvent("http", event, details);
}

export function getSessionId(req: Pick<Request, "headers">) {
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

export function getRequestDebugDetails(
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

export function getJsonRpcDebugDetails(parsedBody: unknown): HttpDebugDetails {
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

export function getInitializeParams(parsedBody: unknown): InitializeParamsLike | undefined {
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

export function getBodyStringValue(body: unknown, key: string) {
  if (!isRecord(body)) {
    return undefined;
  }

  const value = body[key];
  return typeof value === "string" ? value : undefined;
}

export function getPersistedOAuthProfileReason(profileId: ClientProfileId) {
  return `oauth-client-profile:${profileId}`;
}

export function reconcileResolvedProfile(
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

export function isJsonParseError(error: unknown) {
  return error instanceof SyntaxError || (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === "entity.parse.failed"
  );
}

export function isPayloadTooLargeError(error: unknown) {
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

export async function resolveRequest(
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

export function writeRequestResolution(
  res: Response,
  resolution: Exclude<RequestResolution, {
    cleanup?: () => Promise<void>;
    managedRequest: ManagedRequest;
    status: "ready";
  }>,
) {
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

export async function closeNodeServer(server: NodeHttpServer) {
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

export function allowsOpaqueNullOrigin(
  req: Pick<Request, "method" | "path" | "url">,
  authMode: RuntimeAuthConfig["mode"],
) {
  return authMode === "oauth" &&
    req.method === "POST" &&
    getRequestPath(req) === "/authorize/consent";
}
