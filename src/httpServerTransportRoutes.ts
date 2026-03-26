import type express from "express";
import { type ErrorRequestHandler } from "express";

import type { RuntimeAuthConfig, YnabConfig } from "./config.js";
import { logAppEvent } from "./logger.js";
import { hasToolCallStarted } from "./requestContext.js";
import {
  getJsonRpcDebugDetails,
  type ManagedRequest,
  getRequestDebugDetails,
  getRequestPath,
  HTTP_ALLOWED_METHODS,
  isJsonParseError,
  isPayloadTooLargeError,
  logHttpDebug,
  reconcileResolvedProfile,
  resolveRequest,
  type StatefulSessionEntry,
  writeInternalServerError,
  writeMethodNotAllowed,
  writeNotFound,
  writeParseError,
  writePayloadTooLarge,
  writeRequestResolution,
} from "./httpServerShared.js";
import { getRecordValueIfObject, getStringValue, isRecord } from "./typeUtils.js";

function getToolCallName(parsedBody: unknown) {
  if (!isRecord(parsedBody)) {
    return undefined;
  }

  if (getStringValue(parsedBody, "method") !== "tools/call") {
    return undefined;
  }

  return getStringValue(getRecordValueIfObject(parsedBody, "params") ?? {}, "name");
}

export function registerMcpTransportRoutes(options: {
  app: express.Express;
  createStatefulRequest: (ynab: YnabConfig, managedSessions: Map<string, StatefulSessionEntry>) => Promise<ManagedRequest>;
  createStatelessRequest: (ynab: YnabConfig) => Promise<ManagedRequest>;
  getRequestAuthDebugOptions: (req: Parameters<typeof getRequestDebugDetails>[0]) => {
    authMode?: RuntimeAuthConfig["mode"] | undefined;
    authRequired?: boolean | undefined;
  };
  managedSessions: Map<string, StatefulSessionEntry>;
  path: string;
  touchManagedSession: (sessionId: string) => void;
  ynab: YnabConfig;
}) {
  const {
    app,
    createStatefulRequest,
    createStatelessRequest,
    getRequestAuthDebugOptions,
    managedSessions,
    path,
    touchManagedSession,
    ynab,
  } = options;

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
        createStatefulRequest: () => createStatefulRequest(ynab, managedSessions),
        createStatelessRequest: () => createStatelessRequest(ynab),
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

      const toolName = getToolCallName(parsedBody);

      if (toolName && !hasToolCallStarted()) {
        logHttpDebug("tool.dispatch.absent", {
          ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
          ...getJsonRpcDebugDetails(parsedBody),
          toolName,
        });
      }
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
}
